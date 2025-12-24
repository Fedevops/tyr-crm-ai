# TYR CRM AI - CRM Agêntico Multi-tenant para SDRs

Sistema CRM com agentes de IA para Sales Development Representatives (SDRs), construído com FastAPI, LangGraph, React e PostgreSQL.

## 🚀 Stack Tecnológica

- **Backend**: FastAPI (Python)
- **IA/Agentes**: LangGraph
- **Frontend**: React (Vite) + Tailwind CSS + Shadcn/UI
- **i18n**: i18next (PT-BR e EN)
- **Banco de Dados**: PostgreSQL com multi-tenancy
- **Containerização**: Docker + Docker Compose

## 📋 Pré-requisitos

- Docker e Docker Compose instalados
- Node.js 18+ (para desenvolvimento local do frontend)
- Python 3.11+ (para desenvolvimento local do backend)

## 🏃 Inicialização

### Usando Docker Compose (Recomendado)

```bash
# Subir todos os serviços
docker-compose up -d

# Ver logs
docker-compose logs -f

# Parar serviços
docker-compose down
```

### Desenvolvimento Local

#### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

#### Frontend
```bash
cd frontend
npm install
npm run dev
```

## 📁 Estrutura do Projeto

```
tyr-crm-ai/
├── backend/          # API FastAPI
├── frontend/         # Aplicação React
├── docker-compose.yml
└── README.md
```

## 🔐 Autenticação

O sistema utiliza JWT para autenticação. Cada usuário está associado a um tenant e só pode acessar dados do seu próprio tenant.

## 🤖 Agentes

O sistema utiliza LangGraph para orquestrar agentes SDR que:
- Recebem leads
- Pesquisam informações sobre o lead
- Sugerem abordagens de venda baseadas em Playbooks

## 📝 Licença

MIT






