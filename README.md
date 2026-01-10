# TYR CRM AI - CRM Agêntico Multi-tenant para SDRs

Sistema CRM com agentes de IA para Sales Development Representatives (SDRs), construído com FastAPI, LangGraph, React e PostgreSQL.

## 🚀 Stack Tecnológica

- **Backend**: FastAPI (Python) + PostgreSQL
- **IA/Agentes**: LangGraph
- **Frontend**: React (Vite) + Tailwind CSS + Shadcn/UI
- **i18n**: i18next (PT-BR e EN)
- **Banco de Dados**: PostgreSQL com multi-tenancy
- **Deploy**: GCP Cloud Run (Backend) + Vercel (Frontend)

## 📋 Pré-requisitos

- Docker e Docker Compose (para desenvolvimento local)
- Node.js 18+ (para desenvolvimento local do frontend)
- Python 3.11+ (para desenvolvimento local do backend)
- Google Cloud SDK (para deploy)

## 🏃 Desenvolvimento Local

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

## 🚀 Deploy

### Setup Inicial GCP

1. **Instalar Google Cloud SDK**
```bash
# macOS
brew install google-cloud-sdk

# Ou baixe de: https://cloud.google.com/sdk/docs/install
```

2. **Autenticação**
```bash
gcloud auth login
gcloud auth application-default login
```

3. **Configuração Inicial**
```bash
# Criar projeto (se não existir)
gcloud projects create tyr-crm-ai --name="TYR CRM AI"
gcloud config set project tyr-crm-ai

# Habilitar billing (necessário)
# Acesse: https://console.cloud.google.com/billing

# Executar setup automatizado
./scripts/setup-gcp.sh tyr-crm-ai us-central1
```

4. **Criar Secrets**
```bash
./scripts/create-secrets.sh dev
./scripts/create-secrets.sh hml
./scripts/create-secrets.sh prd
```

5. **Deploy Backend**
```bash
cd backend
./deploy-gcp.sh dev   # Para desenvolvimento
./deploy-gcp.sh hml   # Para homologação
./deploy-gcp.sh prd   # Para produção
```

6. **Deploy Frontend (Vercel)**
   - Conecte o repositório ao Vercel
   - Configure a variável de ambiente `VITE_API_URL` com a URL do Cloud Run
   - O Vercel fará deploy automático

### Obter URLs dos Serviços

```bash
# Backend
gcloud run services describe tyr-crm-backend-dev \
  --region us-central1 \
  --project tyr-crm-ai \
  --format="value(status.url)"
```

Use essa URL no Vercel como `VITE_API_URL`.

## 📁 Estrutura do Projeto

```
tyr-crm-ai/
├── backend/              # API FastAPI
│   ├── app/             # Código da aplicação
│   ├── deploy-gcp.sh    # Script de deploy
│   ├── Dockerfile       # Imagem Docker
│   └── requirements.txt # Dependências Python
├── frontend/            # Aplicação React
│   ├── src/            # Código fonte
│   ├── package.json     # Dependências Node
│   └── vite.config.ts   # Configuração Vite
├── scripts/             # Scripts de automação
│   ├── setup-gcp.sh     # Setup inicial GCP
│   ├── create-secrets.sh # Criar secrets
│   └── fix-cloudsql-permissions.sh # Corrigir permissões
└── docker-compose.yml   # Desenvolvimento local
```

## 🔧 Scripts Úteis

### Setup e Configuração
- `scripts/setup-gcp.sh` - Setup inicial do GCP
- `scripts/create-secrets.sh` - Criar secrets no Secret Manager
- `scripts/fix-cloudsql-permissions.sh` - Corrigir permissões Cloud SQL

### Deploy
- `backend/deploy-gcp.sh` - Deploy do backend no Cloud Run

### Diagnóstico
- `scripts/diagnostico-db-completo.sh` - Diagnóstico completo do banco de dados

## 🔐 Autenticação

O sistema utiliza JWT para autenticação. Cada usuário está associado a um tenant e só pode acessar dados do seu próprio tenant.

## 🤖 Agentes

O sistema utiliza LangGraph para orquestrar agentes SDR que:
- Recebem leads
- Pesquisam informações sobre o lead
- Sugerem abordagens de venda baseadas em Playbooks

## 📝 Licença

MIT
