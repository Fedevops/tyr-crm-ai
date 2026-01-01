"""
Script para popular a base de conhecimento com informações sobre funcionalidades do sistema
"""
from sqlmodel import Session, select
from app.database import engine
from app.models import KnowledgeBaseEntry

# Base de conhecimento sobre funcionalidades do TYR CRM AI
KNOWLEDGE_BASE = [
    {
        "title": "Gerenciamento de Leads",
        "content": """O módulo de Leads permite gerenciar todos os contatos potenciais do seu negócio. Você pode:
- Criar novos leads manualmente ou importar via CSV
- Enriquecer leads automaticamente com dados do LinkedIn e outras fontes
- Filtrar leads por status, origem, responsável e outros critérios
- Realizar ações em massa (atualizar, deletar, atribuir responsável)
- Visualizar score de cada lead baseado em enriquecimento e interações
- Adicionar campos customizados específicos para leads
- Ver histórico completo de interações, tarefas e agendamentos relacionados""",
        "category": "leads",
        "keywords": "lead, leads, contato, prospect, cliente potencial, enriquecimento, score, filtros"
    },
    {
        "title": "Tarefas e Atividades",
        "content": """O módulo de Tarefas ajuda a organizar suas atividades diárias:
- Criar tarefas de diferentes tipos: email, ligação, LinkedIn, reunião
- Definir prazos e prioridades
- Associar tarefas a leads específicos
- Gerar mensagens personalizadas do LinkedIn com IA
- Visualizar tarefas pendentes, em progresso e concluídas
- Realizar ações em massa (deletar múltiplas tarefas)
- Filtrar tarefas por tipo, status, responsável e data""",
        "category": "tasks",
        "keywords": "tarefa, tarefas, atividade, atividades, to-do, pendente, prazo, deadline"
    },
    {
        "title": "Agendamentos e Reuniões",
        "content": """O módulo de Agendamentos permite gerenciar reuniões com leads:
- Agendar reuniões com leads específicos
- Definir data, hora, duração e local
- Adicionar notas e resultados após a reunião
- Visualizar agendamentos em lista ou calendário
- Filtrar por status (agendado, concluído, cancelado)
- Ver estatísticas de reuniões agendadas e concluídas
- Os agendamentos são automaticamente rastreados nos KPIs""",
        "category": "appointments",
        "keywords": "agendamento, agendamentos, reunião, reuniões, meeting, calendário, schedule"
    },
    {
        "title": "Sequências de Atividades",
        "content": """As Sequências permitem automatizar uma série de atividades:
- Criar sequências com múltiplos passos (tarefas, emails, etc.)
- Definir intervalos entre cada passo
- Associar sequências a múltiplos leads de uma vez
- Usar placeholders dinâmicos nas mensagens (ex: {Nome do lead})
- Gerar templates de mensagens do LinkedIn com IA
- Visualizar progresso de cada sequência
- Pausar ou reativar sequências""",
        "category": "sequences",
        "keywords": "sequência, sequências, automação, workflow, campanha, email marketing"
    },
    {
        "title": "Prospecção",
        "content": """O módulo de Prospecção integra com fontes externas para encontrar novos leads:
- Buscar empresas e contatos em bases de dados externas
- Filtrar por localização, setor, tamanho da empresa
- Importar resultados diretamente como leads
- Enriquecer automaticamente os dados importados
- Criar leads apenas com nomes de sócios (evita duplicação)""",
        "category": "prospecting",
        "keywords": "prospecção, prospectar, buscar leads, encontrar clientes, importar, base de dados"
    },
    {
        "title": "KPIs e Metas",
        "content": """O módulo de KPIs permite acompanhar seu desempenho:
- Definir metas mensais ou semanais
- Acompanhar métricas como: tarefas completadas, leads criados, receita gerada, reuniões agendadas
- Visualizar progresso em tempo real
- Ver gráficos e estatísticas
- Comparar desempenho entre períodos""",
        "category": "kpi",
        "keywords": "kpi, kpis, meta, metas, desempenho, performance, métricas, estatísticas"
    },
    {
        "title": "Campos e Módulos Customizados",
        "content": """Você pode criar campos e módulos personalizados:
- Criar campos customizados para Leads, Contas, Contatos
- Criar módulos completamente novos com seus próprios campos
- Definir tipos de campo: texto, número, data, seleção
- Visualizar registros em formato de cards ou lista
- Filtrar e buscar em módulos customizados""",
        "category": "custom",
        "keywords": "campo customizado, módulo customizado, personalização, campos adicionais"
    },
    {
        "title": "Enriquecimento de Leads",
        "content": """O sistema pode enriquecer automaticamente dados de leads:
- Buscar informações do LinkedIn via API
- Preencher campos como cargo, empresa, experiência profissional
- Gerar insights estratégicos com IA
- Processar PDFs de perfis do LinkedIn
- Atualizar score do lead baseado em dados enriquecidos""",
        "category": "enrichment",
        "keywords": "enriquecimento, enriquecer, linkedin, dados, informações, insight, ia"
    },
    {
        "title": "Mensagens do LinkedIn com IA",
        "content": """O sistema pode gerar mensagens personalizadas do LinkedIn:
- Gerar notas de conexão personalizadas
- Criar mensagens de follow-up contextualizadas
- Considerar insights do lead e produtos do catálogo
- Usar placeholders dinâmicos em sequências
- Limitar mensagens a 200 caracteres (notas de conexão)
- Gerar templates para uso em sequências""",
        "category": "linkedin",
        "keywords": "linkedin, mensagem, nota de conexão, follow-up, ia, inteligência artificial"
    },
    {
        "title": "Notificações",
        "content": """O sistema envia notificações automáticas:
- Tarefas a vencer hoje
- Tarefas vencidas
- Agendamentos hoje
- Agendamentos próximos (próximas 2 horas)
- Avisos de limites de uso (80% ou mais)
- Limites excedidos
- Acesse pelo ícone de sino no header""",
        "category": "notifications",
        "keywords": "notificação, notificações, alerta, aviso, sino, lembrete"
    },
    {
        "title": "Limites e Uso",
        "content": """Acompanhe o uso dos recursos do sistema:
- Visualizar uso de leads, usuários, itens, chamadas de API
- Acompanhar uso de tokens LLM
- Ver limites do seu plano
- Receber avisos quando próximo dos limites
- Acesse em Configurações > Limites e Uso""",
        "category": "limits",
        "keywords": "limite, limites, uso, consumo, tokens, plano, quota"
    }
]


def populate_knowledge_base(tenant_id: int = 1):
    """Popula a base de conhecimento para um tenant"""
    with Session(engine) as session:
        try:
            # Verificar se já existe conteúdo
            existing = session.exec(
                select(KnowledgeBaseEntry).where(
                    KnowledgeBaseEntry.tenant_id == tenant_id
                )
            ).first()
            
            if existing:
                print(f"✓ Base de conhecimento já populada para tenant {tenant_id}")
                return
            
            # Criar entradas
            for entry_data in KNOWLEDGE_BASE:
                entry = KnowledgeBaseEntry(
                    tenant_id=tenant_id,
                    **entry_data
                )
                session.add(entry)
            
            session.commit()
            print(f"✅ Base de conhecimento populada com {len(KNOWLEDGE_BASE)} entradas para tenant {tenant_id}")
            
        except Exception as e:
            print(f"❌ Erro ao popular base de conhecimento: {e}")
            session.rollback()


if __name__ == "__main__":
    # Popular para todos os tenants ou tenant específico
    populate_knowledge_base(tenant_id=1)

