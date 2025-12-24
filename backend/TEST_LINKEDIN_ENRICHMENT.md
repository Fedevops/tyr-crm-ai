# Guia de Teste - Enriquecimento via RapidAPI LinkedIn

Este guia explica como testar a integração com RapidAPI para enriquecer leads usando dados do LinkedIn.

## 📋 Pré-requisitos

1. **RapidAPI Key configurada** no arquivo `.env`:
   ```env
   RAPIDAPI_KEY=sua-chave-rapidapi-aqui
   RAPIDAPI_LINKEDIN_HOST=linkedin-api8.p.rapidapi.com
   ```

2. **Backend rodando** (Docker ou localmente)

3. **Token de autenticação** (para usar o endpoint de teste)

## 🧪 Método 1: Teste via Endpoint de Debug (Recomendado)

### Passo 1: Obter Token de Autenticação

Faça login e obtenha o token:

```bash
curl -X POST "http://localhost:8000/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "seu-email@exemplo.com",
    "password": "sua-senha"
  }'
```

Copie o `access_token` da resposta.

### Passo 2: Testar Enriquecimento do LinkedIn

```bash
curl -X POST "http://localhost:8000/api/debug/test-linkedin-enrichment" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SEU_TOKEN_AQUI" \
  -d '{
    "linkedin_url": "https://www.linkedin.com/in/nome-do-perfil",
    "name": "Nome do Lead",
    "company": "Nome da Empresa",
    "position": "Cargo",
    "email": "email@exemplo.com"
  }'
```

### Exemplo de Resposta de Sucesso

```json
{
  "success": true,
  "enriched_data": {
    "position": "CEO",
    "company": "Empresa XYZ",
    "city": "São Paulo",
    "state": "SP",
    "industry": "Tecnologia",
    "context": "Informações do LinkedIn:\nResumo profissional..."
  },
  "method": "rapidapi_linkedin",
  "sources": ["https://www.linkedin.com/in/nome-do-perfil"],
  "config": {
    "rapidapi_key_configured": true,
    "rapidapi_key_length": 50,
    "rapidapi_linkedin_host": "linkedin-api8.p.rapidapi.com"
  }
}
```

### Exemplo de Resposta de Erro

```json
{
  "success": false,
  "error": "Erro HTTP 401 na API RapidAPI LinkedIn",
  "config": {
    "rapidapi_key_configured": true,
    "rapidapi_key_length": 50,
    "rapidapi_linkedin_host": "linkedin-api8.p.rapidapi.com"
  }
}
```

## 🧪 Método 2: Teste via Swagger UI

1. Acesse `http://localhost:8000/docs`
2. Faça login primeiro (endpoint `/api/auth/login`)
3. Clique em "Authorize" e cole o token
4. Navegue até `/api/debug/test-linkedin-enrichment`
5. Clique em "Try it out"
6. Preencha o JSON com a URL do LinkedIn
7. Clique em "Execute"

## 🧪 Método 3: Teste Real (via Tarefa de Pesquisa)

1. **Crie ou edite um lead** e adicione a URL do LinkedIn:
   - Campo: `linkedin_url`
   - Exemplo: `https://www.linkedin.com/in/nome-do-perfil`

2. **Crie uma tarefa do tipo "Pesquisa"** associada a esse lead

3. **Marque a tarefa como concluída**

4. **Verifique os logs do backend** para ver o processo:
   ```bash
   docker-compose logs -f backend
   ```

5. **Verifique os dados do lead** - os campos devem estar preenchidos

## 🔍 Verificando os Logs

Os logs detalhados mostrarão:

```
🔍 [RAPIDAPI LINKEDIN] Função chamada. URL: https://www.linkedin.com/in/...
🔍 [RAPIDAPI LINKEDIN] RapidAPI key presente: True
🔍 [RAPIDAPI LINKEDIN] Host configurado: linkedin-api8.p.rapidapi.com
📋 [RAPIDAPI LINKEDIN] Username extraído: nome-do-perfil
📋 [RAPIDAPI LINKEDIN] URL da API: https://linkedin-api8.p.rapidapi.com/profile/nome-do-perfil
📋 [RAPIDAPI LINKEDIN] Fazendo requisição GET para: ...
📡 [RAPIDAPI LINKEDIN] Resposta recebida. Status: 200
✅ [RAPIDAPI LINKEDIN] JSON parseado com sucesso. Keys: [...]
```

## ⚠️ Problemas Comuns

### 1. "RAPIDAPI_KEY não configurada"

**Solução:** Adicione a chave no arquivo `.env`:
```env
RAPIDAPI_KEY=sua-chave-aqui
```

### 2. "Erro HTTP 401"

**Causa:** API key inválida ou expirada

**Solução:** 
- Verifique se a chave está correta
- Verifique se a chave não expirou
- Obtenha uma nova chave no RapidAPI

### 3. "Erro HTTP 404"

**Causa:** Perfil do LinkedIn não encontrado ou URL inválida

**Solução:**
- Verifique se a URL do LinkedIn está correta
- Verifique se o perfil existe e é público
- Tente com outro perfil

### 4. "Erro HTTP 429"

**Causa:** Limite de requisições excedido

**Solução:**
- Aguarde alguns minutos
- Verifique seu plano no RapidAPI
- Considere fazer upgrade do plano

### 5. "URL do LinkedIn inválida"

**Causa:** Formato da URL não reconhecido

**Solução:**
- Use URLs no formato: `https://www.linkedin.com/in/username`
- Ou: `https://www.linkedin.com/company/company-name`
- Evite URLs com parâmetros extras

### 6. "Host não encontrado" ou "Connection Error"

**Causa:** Host da API incorreto ou API não disponível

**Solução:**
- Verifique se o `RAPIDAPI_LINKEDIN_HOST` está correto
- Verifique no RapidAPI qual é o host correto da API escolhida
- Algumas APIs podem ter hosts diferentes

## 📝 Notas Importantes

1. **Diferentes APIs do RapidAPI têm endpoints diferentes**
   - O endpoint atual usa: `/profile/{username}`
   - Algumas APIs podem usar: `/v1/profile`, `/api/profile`, etc.
   - Verifique a documentação da API específica no RapidAPI

2. **Estrutura de resposta pode variar**
   - Diferentes APIs retornam dados em formatos diferentes
   - A função tenta adaptar-se, mas pode precisar de ajustes

3. **Rate Limits**
   - Verifique os limites do seu plano no RapidAPI
   - O plano gratuito geralmente tem limites baixos

4. **Dados Públicos Apenas**
   - A API só pode acessar perfis públicos do LinkedIn
   - Perfis privados não retornarão dados

## 🔧 Ajustando para Outras APIs do RapidAPI

Se você estiver usando uma API diferente do RapidAPI, pode precisar ajustar:

1. **Endpoint**: Modifique a linha em `researcher_agent.py`:
   ```python
   api_url = f"https://{settings.rapidapi_linkedin_host}/seu-endpoint/{linkedin_username}"
   ```

2. **Estrutura de Dados**: Ajuste a extração de dados conforme a resposta da API

3. **Parâmetros**: Algumas APIs podem precisar de parâmetros adicionais no payload

## 📊 Campos Enriquecidos

A função tenta preencher:
- ✅ `position` - Cargo atual
- ✅ `company` - Empresa atual
- ✅ `city` - Cidade
- ✅ `state` - Estado
- ✅ `industry` - Indústria
- ✅ `company_size` - Tamanho da empresa
- ✅ `context` - Resumo profissional, habilidades, experiência

Campos já preenchidos não serão sobrescritos.


