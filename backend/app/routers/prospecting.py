"""
Router para módulo de prospecção usando API da Casa dos Dados
Permite buscar empresas por critérios e gerar leads automaticamente
"""
import logging
import json
from typing import Optional, List, Dict, Any
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query, BackgroundTasks
from fastapi.responses import JSONResponse
from sqlmodel import Session, select, and_
from pydantic import BaseModel, Field
import httpx
import pandas as pd
import io

from app.database import get_session
from app.models import Lead, User
from app.dependencies import get_current_active_user
from app.config import settings
from app.services.enrichment_service import enrich_lead

logger = logging.getLogger(__name__)
router = APIRouter()


class ProspectingParams(BaseModel):
    """Parâmetros para busca de prospecção na Casa dos Dados"""
    # Filtros básicos
    uf: Optional[str] = Field(None, description="Estado (ex: SP, RJ)")
    municipio: Optional[str] = Field(None, description="Município")
    cnae: Optional[str] = Field(None, description="CNAE principal (código)")
    cnae_descricao: Optional[str] = Field(None, description="Descrição do CNAE")
    porte: Optional[str] = Field(None, description="Porte da empresa (ME, EPP, Grande)")
    natureza_juridica: Optional[str] = Field(None, description="Natureza jurídica")
    situacao_cadastral: Optional[str] = Field(None, description="Situação cadastral (ATIVA, BAIXADA, INAPTA, NULA, SUSPENSA)")
    
    # Filtros numéricos
    capital_social_min: Optional[float] = Field(None, description="Capital social mínimo")
    capital_social_max: Optional[float] = Field(None, description="Capital social máximo")
    
    # Filtros de data
    data_abertura_inicio: Optional[str] = Field(None, description="Data de abertura início (YYYY-MM-DD)")
    data_abertura_fim: Optional[str] = Field(None, description="Data de abertura fim (YYYY-MM-DD)")
    
    # Outros filtros
    simples_nacional: Optional[bool] = Field(None, description="Optante do Simples Nacional")
    razao_social_contem: Optional[str] = Field(None, description="Razão social contém")
    nome_fantasia_contem: Optional[str] = Field(None, description="Nome fantasia contém")
    
    # Filtros de contato (mais_filtros)
    com_email: Optional[bool] = Field(None, description="Apenas empresas com e-mail")
    com_telefone: Optional[bool] = Field(None, description="Apenas empresas com telefone")
    somente_celular: Optional[bool] = Field(None, description="Apenas empresas com celular (não fixo)")
    
    # Limites
    limite: int = Field(100, ge=1, le=1000, description="Limite de resultados (máx 1000)")
    pagina: int = Field(1, ge=1, description="Página de resultados")
    tipo_resultado: str = Field("completo", description="Tipo de resultado: 'simples' ou 'completo'")
    auto_import: bool = Field(False, description="Importar automaticamente como leads")


async def search_casadosdados_api(params: ProspectingParams) -> Dict[str, Any]:
    """
    Busca empresas na API da Casa dos Dados com os parâmetros fornecidos
    Endpoint oficial: POST /v5/cnpj/pesquisa
    Documentação: https://docs.casadosdados.com.br/pesquisa-avan%C3%A7ada-de-empresas-16579062e0
    """
    if not settings.casadosdados_api_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="API key da Casa dos Dados não configurada. Configure CASADOSDADOS_API_KEY no .env"
        )
    
    # Endpoint oficial conforme documentação
    api_url = "https://api.casadosdados.com.br/v5/cnpj/pesquisa"
    
    # Construir body JSON conforme especificação OpenAPI
    body: Dict[str, Any] = {
        "limite": params.limite,
        "pagina": params.pagina
    }
    
    # UF (array conforme documentação)
    if params.uf:
        body["uf"] = [params.uf.lower()]
    
    # Município (array)
    if params.municipio:
        body["municipio"] = [params.municipio.lower()]
    
    # CNAE Principal (array)
    if params.cnae:
        body["codigo_atividade_principal"] = [params.cnae]
    
    # Situação Cadastral (array)
    if params.situacao_cadastral:
        situacao_upper = params.situacao_cadastral.upper()
        if situacao_upper in ["ATIVA", "BAIXADA", "INAPTA", "NULA", "SUSPENSA"]:
            body["situacao_cadastral"] = [situacao_upper]
    
    # Natureza Jurídica (array)
    if params.natureza_juridica:
        body["codigo_natureza_juridica"] = [params.natureza_juridica]
    
    # Capital Social (objeto com minimo e maximo)
    if params.capital_social_min or params.capital_social_max:
        body["capital_social"] = {}
        if params.capital_social_min:
            body["capital_social"]["minimo"] = int(params.capital_social_min)
        if params.capital_social_max:
            body["capital_social"]["maximo"] = int(params.capital_social_max)
    
    # Data de Abertura (objeto com inicio e fim)
    if params.data_abertura_inicio or params.data_abertura_fim:
        body["data_abertura"] = {}
        if params.data_abertura_inicio:
            body["data_abertura"]["inicio"] = params.data_abertura_inicio
        if params.data_abertura_fim:
            body["data_abertura"]["fim"] = params.data_abertura_fim
    
        # Simples Nacional (objeto)
        if params.simples_nacional is not None:
            body["simples"] = {
                "optante": params.simples_nacional
            }
        
        # Mais Filtros (contato)
        mais_filtros = {}
        if params.com_email is not None:
            mais_filtros["com_email"] = params.com_email
        if params.com_telefone is not None:
            mais_filtros["com_telefone"] = params.com_telefone
        if params.somente_celular is not None:
            mais_filtros["somente_celular"] = params.somente_celular
        
        if mais_filtros:
            body["mais_filtros"] = mais_filtros
        
        # Busca Textual (razão social ou nome fantasia)
    if params.razao_social_contem or params.nome_fantasia_contem:
        busca_textual = {
            "texto": [],
            "tipo_busca": "radical",  # ou "exata"
            "razao_social": False,
            "nome_fantasia": False,
            "nome_socio": False
        }
        
        if params.razao_social_contem:
            busca_textual["texto"].append(params.razao_social_contem)
            busca_textual["razao_social"] = True
        
        if params.nome_fantasia_contem:
            if not busca_textual["texto"]:
                busca_textual["texto"].append(params.nome_fantasia_contem)
            busca_textual["nome_fantasia"] = True
        
        if busca_textual["texto"]:
            body["busca_textual"] = [busca_textual]
    
    # Query parameter para tipo de resultado
    query_params = {
        "tipo_resultado": params.tipo_resultado
    }
    
    # Headers conforme documentação oficial
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "api-key": settings.casadosdados_api_key  # Autenticação via header api-key
    }
    
    try:
        async with httpx.AsyncClient(
            timeout=60.0,
            follow_redirects=True
        ) as client:
            logger.info(f"🔍 [PROSPECTING] Buscando empresas na Casa dos Dados (v5)")
            logger.debug(f"📋 [PROSPECTING] URL: {api_url}")
            logger.debug(f"📋 [PROSPECTING] Body: {json.dumps(body, indent=2, ensure_ascii=False)}")
            logger.debug(f"📋 [PROSPECTING] Query params: {query_params}")
            
            response = await client.post(
                api_url,
                json=body,
                params=query_params,
                headers=headers
            )
            
            # Verificar se a resposta é HTML (indica bloqueio do Cloudflare)
            content_type = response.headers.get("content-type", "").lower()
            if "text/html" in content_type:
                error_text = response.text[:500]
                logger.error(f"❌ [PROSPECTING] Resposta HTML recebida (possível bloqueio). Status: {response.status_code}")
                logger.error(f"❌ [PROSPECTING] Resposta: {error_text}")
                
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Acesso bloqueado pela API da Casa dos Dados. Verifique: 1) API key válida, 2) Saldo disponível na conta, 3) Permissões da conta."
                )
            
            response.raise_for_status()
            
            data = response.json()
            cnpjs = data.get('cnpjs', [])
            total = data.get('total', len(cnpjs))
            
            logger.info(f"✅ [PROSPECTING] Resposta recebida: {total} total, {len(cnpjs)} empresas nesta página")
            
            # Log da primeira empresa para debug (verificar campos disponíveis)
            if cnpjs and len(cnpjs) > 0:
                primeira_empresa = cnpjs[0]
                logger.debug(f"📋 [PROSPECTING] Exemplo de empresa retornada (campos disponíveis): {list(primeira_empresa.keys())}")
                # Verificar campos de contato (API v5 usa contato_telefonico e contato_email)
                contato_tel = primeira_empresa.get('contato_telefonico')
                contato_email = primeira_empresa.get('contato_email')
                if contato_tel or contato_email:
                    logger.debug(f"📋 [PROSPECTING] Primeira empresa tem contato: telefone={contato_tel}, email={contato_email}")
                else:
                    logger.warning(f"⚠️ [PROSPECTING] Primeira empresa NÃO tem telefone/email. Campos disponíveis: {list(primeira_empresa.keys())}")
            
            return {
                "success": True,
                "total": total,
                "data": cnpjs,
                "params_used": body,
                "endpoint_used": api_url,
                "pagina": params.pagina,
                "limite": params.limite
            }
            
    except httpx.HTTPStatusError as e:
        error_msg = f"Erro HTTP {e.response.status_code} ao buscar na Casa dos Dados"
        error_text = e.response.text[:500] if e.response.text else "Sem detalhes"
        logger.error(f"❌ [PROSPECTING] {error_msg}")
        logger.error(f"❌ [PROSPECTING] Resposta: {error_text}")
        
        # Mensagens específicas por código de erro
        if e.response.status_code == 401:
            detail_msg = "API key inválida (401). Verifique se CASADOSDADOS_API_KEY está correto no .env"
        elif e.response.status_code == 403:
            detail_msg = "Sem saldo para a operação (403). Verifique o saldo da sua conta na Casa dos Dados"
        elif e.response.status_code == 400:
            detail_msg = f"Solicitação inválida (400). Verifique os parâmetros enviados: {error_text}"
        else:
            detail_msg = f"{error_msg}: {error_text}"
        
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=detail_msg
        )
    except Exception as e:
        error_msg = f"Erro ao buscar na Casa dos Dados: {str(e)}"
        logger.error(f"❌ [PROSPECTING] {error_msg}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=error_msg
        )


async def process_empresa_to_lead(
    empresa_data: Dict[str, Any],
    tenant_id: int,
    session: Session
) -> Optional[Lead]:
    """
    Processa dados de uma empresa da Casa dos Dados (formato API v5) e cria/atualiza um lead
    """
    try:
        # Extrair CNPJ (formato API v5)
        cnpj = empresa_data.get('cnpj', '').replace('.', '').replace('/', '').replace('-', '')
        if not cnpj or len(cnpj) != 14:
            logger.warning(f"⚠️ [PROSPECTING] CNPJ inválido: {empresa_data.get('cnpj')}")
            return None
        
        # Verificar se lead já existe
        existing_lead = session.exec(
            select(Lead).where(
                and_(
                    Lead.tenant_id == tenant_id,
                    Lead.cnpj == cnpj
                )
            )
        ).first()
        
        if existing_lead:
            logger.info(f"📋 [PROSPECTING] Lead com CNPJ {cnpj} já existe. Atualizando...")
            lead = existing_lead
        else:
            # Criar novo lead
            razao_social = empresa_data.get('razao_social', '')
            nome_fantasia = empresa_data.get('nome_fantasia', '')
            name = nome_fantasia or razao_social or f"Empresa {cnpj}"
            
            lead = Lead(
                tenant_id=tenant_id,
                name=name,
                cnpj=cnpj,
                source='Prospecção - Casa dos Dados'
            )
            session.add(lead)
            session.flush()
        
        # Preencher campos da empresa (formato API v5)
        if 'razao_social' in empresa_data:
            lead.razao_social = empresa_data.get('razao_social')
            if not lead.company:
                lead.company = empresa_data.get('razao_social')
        
        if 'nome_fantasia' in empresa_data:
            lead.nome_fantasia = empresa_data.get('nome_fantasia')
        
        # Data de abertura (formato API v5: "data_abertura" como string YYYY-MM-DD)
        if 'data_abertura' in empresa_data:
            try:
                data_str = empresa_data.get('data_abertura')
                if data_str:
                    lead.data_abertura = datetime.strptime(data_str, '%Y-%m-%d')
            except Exception:
                pass
        
        # Capital social (formato API v5: integer)
        if 'capital_social' in empresa_data:
            try:
                capital = empresa_data.get('capital_social')
                if capital is not None:
                    lead.capital_social = float(capital)
            except (ValueError, TypeError):
                pass
        
        # Situação cadastral (formato API v5: objeto com situacao_cadastral, motivo, data)
        if 'situacao_cadastral' in empresa_data:
            situacao_obj = empresa_data.get('situacao_cadastral', {})
            if isinstance(situacao_obj, dict):
                lead.situacao_cadastral = situacao_obj.get('situacao_cadastral', '')
                lead.motivo_situacao_cadastral = situacao_obj.get('motivo', '')
                if situacao_obj.get('data'):
                    try:
                        lead.data_situacao_cadastral = datetime.strptime(situacao_obj.get('data'), '%Y-%m-%d')
                    except Exception:
                        pass
            elif isinstance(situacao_obj, str):
                lead.situacao_cadastral = situacao_obj
        
        # Endereço (formato API v5)
        if 'endereco' in empresa_data:
            endereco = empresa_data.get('endereco', {})
            lead.logradouro = endereco.get('logradouro')
            lead.numero = endereco.get('numero')
            lead.bairro = endereco.get('bairro')
            lead.cep = endereco.get('cep')
            lead.municipio = endereco.get('municipio')
            lead.uf = endereco.get('uf')
            lead.complemento = endereco.get('complemento')
            
            # Montar endereço completo
            endereco_parts = []
            if lead.logradouro:
                endereco_parts.append(lead.logradouro)
            if lead.numero:
                endereco_parts.append(lead.numero)
            if lead.complemento:
                endereco_parts.append(lead.complemento)
            if lead.bairro:
                endereco_parts.append(lead.bairro)
            if lead.municipio:
                endereco_parts.append(lead.municipio)
            if lead.uf:
                endereco_parts.append(lead.uf)
            if lead.cep:
                endereco_parts.append(f"CEP: {lead.cep}")
            
            if endereco_parts:
                lead.address = ', '.join(endereco_parts)
            
            lead.city = lead.municipio
            lead.state = lead.uf
            lead.zip_code = lead.cep
        
        # CNAE (formato API v5 não retorna diretamente, mas pode estar em outras partes)
        # Nota: A API v5 pode não retornar CNAE no resultado "simples"
        # Se tipo_resultado for "completo", pode ter mais campos
        
        # Natureza jurídica (formato API v5)
        if 'codigo_natureza_juridica' in empresa_data:
            lead.natureza_juridica = str(empresa_data.get('codigo_natureza_juridica', ''))
        if 'descricao_natureza_juridica' in empresa_data:
            # Pode usar a descrição também se necessário
            pass
        
        # Porte (formato API v5: objeto porte_empresa com codigo e descricao)
        if 'porte_empresa' in empresa_data:
            porte_obj = empresa_data.get('porte_empresa', {})
            if isinstance(porte_obj, dict):
                lead.porte = porte_obj.get('descricao', '') or porte_obj.get('codigo', '')
            elif isinstance(porte_obj, str):
                lead.porte = porte_obj
        
        # Sócios (formato API v5: quadro_societario)
        if 'quadro_societario' in empresa_data:
            socios = empresa_data.get('quadro_societario', [])
            if socios:
                socios_data = []
                for socio in socios:
                    socios_data.append({
                        'nome': socio.get('nome', ''),
                        'qualificacao': socio.get('qualificacao_socio', ''),
                        'cpf_cnpj': socio.get('documento', ''),
                        'data_entrada': socio.get('data_entrada_sociedade', ''),
                        'qualificacao_codigo': socio.get('qualificacao_socio_codigo', ''),
                        'pais': socio.get('pais_socio', ''),
                        'representante_legal': socio.get('nome_representante_legal', ''),
                        'cpf_representante': socio.get('cpf_representante_legal', '')
                    })
                lead.socios_json = json.dumps(socios_data, ensure_ascii=False)
        
        # Telefone e Email (formato API v5 - campos: contato_telefonico e contato_email)
        # A API v5 retorna contato_telefonico como objeto {completo, ddd, numero, tipo} ou array/string
        if 'contato_telefonico' in empresa_data:
            telefone_data = empresa_data.get('contato_telefonico')
            telefone = None
            
            if telefone_data:
                # Pode ser objeto, array ou string
                if isinstance(telefone_data, dict):
                    # É um objeto com {completo, ddd, numero, tipo}
                    telefone = telefone_data.get('completo')
                    if not telefone and telefone_data.get('ddd') and telefone_data.get('numero'):
                        telefone = f"({telefone_data.get('ddd')}) {telefone_data.get('numero')}"
                    elif not telefone:
                        telefone = telefone_data.get('numero')
                elif isinstance(telefone_data, list) and len(telefone_data) > 0:
                    # É um array - pegar o primeiro e verificar se é objeto
                    primeiro = telefone_data[0]
                    if isinstance(primeiro, dict):
                        telefone = primeiro.get('completo')
                        if not telefone and primeiro.get('ddd') and primeiro.get('numero'):
                            telefone = f"({primeiro.get('ddd')}) {primeiro.get('numero')}"
                        elif not telefone:
                            telefone = primeiro.get('numero')
                    else:
                        telefone = primeiro
                elif isinstance(telefone_data, str):
                    telefone = telefone_data
                
                if telefone:
                    lead.telefone_empresa = str(telefone)
                    # Também preencher o campo phone principal se estiver vazio
                    if not lead.phone:
                        lead.phone = str(telefone)
        
        # Email (formato API v5 - campo: contato_email)
        # A API v5 retorna contato_email como objeto {email, valido, dominio} ou array/string
        if 'contato_email' in empresa_data:
            email_data = empresa_data.get('contato_email')
            email = None
            
            if email_data:
                # Pode ser objeto, array ou string
                if isinstance(email_data, dict):
                    # É um objeto com {email, valido, dominio}
                    email = email_data.get('email')
                elif isinstance(email_data, list) and len(email_data) > 0:
                    # É um array - pegar o primeiro e verificar se é objeto
                    primeiro = email_data[0]
                    if isinstance(primeiro, dict):
                        email = primeiro.get('email')
                    else:
                        email = primeiro
                elif isinstance(email_data, str):
                    email = email_data
                
                if email:
                    lead.email_empresa = str(email)
                    # Também preencher o campo email principal se estiver vazio
                    if not lead.email:
                        lead.email = str(email)
        
        # Fallback: verificar campos antigos caso a API mude
        if not lead.telefone_empresa:
            if 'telefone' in empresa_data:
                telefone = empresa_data.get('telefone')
                if telefone:
                    if isinstance(telefone, list) and len(telefone) > 0:
                        telefone = telefone[0]
                    lead.telefone_empresa = str(telefone)
                    if not lead.phone:
                        lead.phone = str(telefone)
        
        if not lead.email_empresa:
            if 'email' in empresa_data:
                email = empresa_data.get('email')
                if email:
                    if isinstance(email, list) and len(email) > 0:
                        email = email[0]
                    lead.email_empresa = str(email)
                    if not lead.email:
                        lead.email = str(email)
        
        lead.updated_at = datetime.utcnow()
        session.add(lead)
        session.flush()
        
        return lead
        
    except Exception as e:
        logger.error(f"❌ [PROSPECTING] Erro ao processar empresa: {e}")
        import traceback
        traceback.print_exc()
        return None


async def enrich_empresa_with_cnpj_details(empresa_data: Dict[str, Any], cnpj: str) -> Dict[str, Any]:
    """
    Enriquece dados da empresa consultando o CNPJ específico na API Casa dos Dados
    Isso é necessário porque a busca pode não retornar telefone/email
    """
    if not settings.casadosdados_api_key:
        return empresa_data
    
    try:
        cnpj_clean = cnpj.replace('.', '').replace('/', '').replace('-', '')
        if len(cnpj_clean) != 14:
            return empresa_data
            
        api_url = f"https://api.casadosdados.com.br/v1/cnpj/{cnpj_clean}"
        
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "api-key": settings.casadosdados_api_key
        }
        
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(api_url, headers=headers)
            if response.status_code == 200:
                cnpj_data = response.json()
                data_dict = cnpj_data.get('data', {})
                
                # Adicionar telefone se não existir
                if 'telefone' not in empresa_data or not empresa_data.get('telefone'):
                    if 'telefone' in data_dict:
                        telefone = data_dict.get('telefone')
                        empresa_data['telefone'] = telefone if isinstance(telefone, str) else (telefone[0] if isinstance(telefone, list) and telefone else None)
                    if 'ddd' in data_dict and 'telefone' in data_dict:
                        empresa_data['ddd'] = data_dict.get('ddd')
                        if not empresa_data.get('telefone'):
                            telefone = data_dict.get('telefone')
                            empresa_data['telefone'] = telefone if isinstance(telefone, str) else (telefone[0] if isinstance(telefone, list) and telefone else None)
                
                # Adicionar email se não existir
                if 'email' not in empresa_data or not empresa_data.get('email'):
                    if 'email' in data_dict:
                        email = data_dict.get('email')
                        empresa_data['email'] = email if isinstance(email, str) else (email[0] if isinstance(email, list) and email else None)
                
                logger.debug(f"✅ [PROSPECTING] CNPJ {cnpj_clean} enriquecido: telefone={empresa_data.get('telefone')}, email={empresa_data.get('email')}")
            else:
                logger.debug(f"⚠️ [PROSPECTING] Não foi possível enriquecer CNPJ {cnpj_clean}: HTTP {response.status_code}")
    except Exception as e:
        logger.debug(f"⚠️ [PROSPECTING] Erro ao enriquecer CNPJ {cnpj}: {str(e)}")
    
    return empresa_data


async def process_enrichment_background(lead_id: int, cnpj: str):
    """Processa enriquecimento em background"""
    try:
        from app.database import engine
        from sqlmodel import Session as SQLSession
        with SQLSession(engine) as db:
            lead = db.get(Lead, lead_id)
            if lead and cnpj:
                enriched_lead = await enrich_lead(lead, cnpj)
                db.add(enriched_lead)
                db.commit()
                logger.info(f"✅ [PROSPECTING] Lead {lead_id} enriquecido com sucesso")
    except Exception as e:
        logger.error(f"❌ [PROSPECTING] Erro ao enriquecer lead {lead_id}: {e}")


@router.post("/search")
async def search_companies(
    params: ProspectingParams,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """
    Busca empresas na API da Casa dos Dados com os parâmetros fornecidos
    Se auto_import=True, cria leads automaticamente
    """
    try:
        # Buscar empresas na API
        result = await search_casadosdados_api(params)
        
        if not result.get('success'):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Erro ao buscar empresas na API"
            )
        
        empresas = result.get('data', [])
        total_found = result.get('total', len(empresas))
        leads_created = []
        leads_updated = []
        errors = []
        
        # Verificar se precisa enriquecer empresas (API v5 usa contato_telefonico e contato_email)
        # Apenas enriquecer se os filtros exigirem e os dados não estiverem presentes
        precisa_enriquecer = False
        empresas_sem_contato = 0
        
        for empresa in empresas[:10]:  # Verificar primeiras 10
            tem_telefone = bool(empresa.get('contato_telefonico'))
            tem_email = bool(empresa.get('contato_email'))
            
            if not tem_telefone or not tem_email:
                empresas_sem_contato += 1
                if (params.com_telefone and not tem_telefone) or (params.com_email and not tem_email):
                    precisa_enriquecer = True
                    break
        
        if precisa_enriquecer and empresas_sem_contato > 0:
            logger.info(f"🔍 [PROSPECTING] Enriquecendo {len(empresas)} empresas com dados de telefone/email...")
            empresas_enriquecidas = []
            for idx, empresa in enumerate(empresas):
                cnpj_empresa = empresa.get('cnpj', '').replace('.', '').replace('/', '').replace('-', '')
                tem_telefone = bool(empresa.get('contato_telefonico'))
                tem_email = bool(empresa.get('contato_email'))
                
                # Se não tem telefone nem email, ou se os filtros exigem, tentar enriquecer
                if (not tem_telefone and not tem_email) or \
                   (params.com_telefone and not tem_telefone) or \
                   (params.com_email and not tem_email):
                    if cnpj_empresa and len(cnpj_empresa) == 14:
                        empresa_enriquecida = await enrich_empresa_with_cnpj_details(empresa.copy(), cnpj_empresa)
                        empresas_enriquecidas.append(empresa_enriquecida)
                    else:
                        empresas_enriquecidas.append(empresa)
                else:
                    empresas_enriquecidas.append(empresa)
                
                # Log a cada 20 empresas para não sobrecarregar
                if (idx + 1) % 20 == 0:
                    logger.info(f"📊 [PROSPECTING] Processadas {idx + 1}/{len(empresas)} empresas...")
            
            empresas = empresas_enriquecidas
            logger.info(f"✅ [PROSPECTING] Enriquecimento concluído")
        else:
            logger.info(f"✅ [PROSPECTING] Empresas já têm dados de contato ou enriquecimento não necessário")
        
        # Se auto_import está ativado, processar empresas e criar leads
        if params.auto_import:
            logger.info(f"🚀 [PROSPECTING] Processando {len(empresas)} empresas para criar leads...")
            
            for empresa in empresas:
                try:
                    cnpj_empresa = empresa.get('cnpj', '').replace('.', '').replace('/', '').replace('-', '')
                    
                    # Verificar se já existe antes de processar
                    existing_lead = session.exec(
                        select(Lead).where(
                            and_(
                                Lead.tenant_id == current_user.tenant_id,
                                Lead.cnpj == cnpj_empresa
                            )
                        )
                    ).first()
                    
                    lead = await process_empresa_to_lead(empresa, current_user.tenant_id, session)
                    if lead:
                        if existing_lead:
                            # Lead existente foi atualizado
                            if lead.id not in [l.id for l in leads_updated]:
                                leads_updated.append(lead)
                        else:
                            # Novo lead
                            if lead.id not in [l.id for l in leads_created]:
                                leads_created.append(lead)
                        
                        # Agendar enriquecimento em background
                        if lead.cnpj:
                            background_tasks.add_task(process_enrichment_background, lead.id, lead.cnpj)
                            
                except Exception as e:
                    errors.append(f"Erro ao processar empresa {empresa.get('cnpj', 'N/A')}: {str(e)}")
                    logger.error(f"❌ [PROSPECTING] {errors[-1]}")
            
            session.commit()
            
            logger.info(f"✅ [PROSPECTING] {len(leads_created)} leads criados, {len(leads_updated)} atualizados")
        
        return {
            "success": True,
            "total_found": total_found,
            "total_this_page": len(empresas),
            "pagina": result.get('pagina', params.pagina),
            "limite": result.get('limite', params.limite),
            "leads_created": len(leads_created) if params.auto_import else 0,
            "leads_updated": len(leads_updated) if params.auto_import else 0,
            "errors": errors if errors else None,
            "empresas": empresas[:100],  # Retornar apenas primeiras 100 para preview
            "params_used": result.get('params_used', {})
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ [PROSPECTING] Erro geral: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao processar busca: {str(e)}"
        )


@router.post("/import-results")
async def import_prospecting_results(
    empresas: List[Dict[str, Any]],
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_active_user)
):
    """
    Importa resultados de prospecção como leads
    Recebe lista de empresas e cria leads
    """
    leads_created = []
    leads_updated = []
    errors = []
    
    try:
        for empresa in empresas:
            try:
                lead = await process_empresa_to_lead(empresa, current_user.tenant_id, session)
                if lead:
                    if lead.id and not any(l.id == lead.id for l in leads_created + leads_updated):
                        if session.get(Lead, lead.id) == lead:
                            leads_updated.append(lead)
                        else:
                            leads_created.append(lead)
                    
                    # Agendar enriquecimento
                    if lead.cnpj:
                        background_tasks.add_task(process_enrichment_background, lead.id, lead.cnpj)
                        
            except Exception as e:
                errors.append(f"Erro ao processar empresa {empresa.get('cnpj', 'N/A')}: {str(e)}")
        
        session.commit()
        
        return {
            "success": True,
            "leads_created": len(leads_created),
            "leads_updated": len(leads_updated),
            "errors": errors if errors else None
        }
        
    except Exception as e:
        logger.error(f"❌ [PROSPECTING] Erro ao importar resultados: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao importar resultados: {str(e)}"
        )

