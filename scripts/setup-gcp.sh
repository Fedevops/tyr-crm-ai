#!/bin/bash
# Script de setup inicial do GCP
# Execute este script após instalar o Google Cloud SDK

set -e

PROJECT_ID=${1:-tyr-crm-ai}
REGION=${2:-us-central1}

echo "🚀 Configurando GCP para TYR CRM AI"
echo "📋 Projeto: ${PROJECT_ID}"
echo "🌍 Região: ${REGION}"
echo ""

# Verificar se gcloud está instalado
if ! command -v gcloud &> /dev/null; then
    echo "❌ Google Cloud SDK não está instalado!"
    echo "📥 Instale com: brew install google-cloud-sdk"
    echo "   Ou acesse: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

echo "✅ Google Cloud SDK encontrado"
echo ""

# Verificar autenticação
echo "🔐 Verificando autenticação..."
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
    echo "⚠️  Você não está autenticado. Executando login..."
    gcloud auth login
    gcloud auth application-default login
fi

echo "✅ Autenticação OK"
echo ""

# Criar projeto (se não existir)
echo "📦 Criando projeto no GCP..."
if gcloud projects describe ${PROJECT_ID} &>/dev/null; then
    echo "ℹ️  Projeto ${PROJECT_ID} já existe"
else
    echo "🆕 Criando novo projeto: ${PROJECT_ID}"
    gcloud projects create ${PROJECT_ID} --name="TYR CRM AI"
    echo "⏳ Aguardando criação do projeto..."
    sleep 5
fi

gcloud config set project ${PROJECT_ID}
echo "✅ Projeto configurado: ${PROJECT_ID}"
echo ""

# Verificar billing
echo "💳 Verificando billing..."
BILLING_ACCOUNT=$(gcloud beta billing projects describe ${PROJECT_ID} --format="value(billingAccountName)" 2>/dev/null || echo "")
if [ -z "$BILLING_ACCOUNT" ]; then
    echo ""
    echo "⚠️  ⚠️  ⚠️  BILLING NÃO ESTÁ CONFIGURADO! ⚠️  ⚠️  ⚠️"
    echo ""
    echo "📝 Para continuar, você precisa:"
    echo "   1. Acessar: https://console.cloud.google.com/billing?project=${PROJECT_ID}"
    echo "   2. Vincular uma conta de billing ao projeto"
    echo ""
    echo "💡 Dica: Se você não tem uma conta de billing, crie uma em:"
    echo "   https://console.cloud.google.com/billing/create"
    echo ""
    echo "⏸️  O script será interrompido aqui."
    echo "    Após configurar o billing, execute novamente:"
    echo "    ./scripts/setup-gcp.sh ${PROJECT_ID} ${REGION}"
    echo ""
    echo "🔗 Link direto para billing: https://console.cloud.google.com/billing?project=${PROJECT_ID}"
    echo ""
    exit 0
else
    echo "✅ Billing configurado: ${BILLING_ACCOUNT}"
fi
echo ""

# Habilitar APIs
echo "🔌 Habilitando APIs necessárias..."
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  sqladmin.googleapis.com \
  containerregistry.googleapis.com \
  secretmanager.googleapis.com \
  --project=${PROJECT_ID}

echo "✅ APIs habilitadas"
echo ""

# Criar Cloud SQL instances
echo "🗄️  Criando instâncias Cloud SQL..."
echo ""
echo "⚠️  IMPORTANTE: Você precisará fornecer senhas seguras para os bancos!"
echo ""

# Dev
read -sp "Digite a senha para o banco DEV: " DEV_PASSWORD
echo ""
gcloud sql instances create tyr-crm-db-dev \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=${REGION} \
  --root-password="${DEV_PASSWORD}" \
  --project=${PROJECT_ID} || echo "⚠️  Instância dev pode já existir"

# HML
read -sp "Digite a senha para o banco HML: " HML_PASSWORD
echo ""
gcloud sql instances create tyr-crm-db-hml \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=${REGION} \
  --root-password="${HML_PASSWORD}" \
  --project=${PROJECT_ID} || echo "⚠️  Instância hml pode já existir"

# PRD
read -sp "Digite a senha para o banco PRD: " PRD_PASSWORD
echo ""
gcloud sql instances create tyr-crm-db-prd \
  --database-version=POSTGRES_15 \
  --tier=db-n1-standard-1 \
  --region=${REGION} \
  --root-password="${PRD_PASSWORD}" \
  --project=${PROJECT_ID} || echo "⚠️  Instância prd pode já existir"

echo ""
echo "✅ Instâncias Cloud SQL criadas"
echo ""

# Criar databases
echo "📊 Criando databases..."
gcloud sql databases create tyr_crm --instance=tyr-crm-db-dev --project=${PROJECT_ID} || echo "Database dev pode já existir"
gcloud sql databases create tyr_crm --instance=tyr-crm-db-hml --project=${PROJECT_ID} || echo "Database hml pode já existir"
gcloud sql databases create tyr_crm --instance=tyr-crm-db-prd --project=${PROJECT_ID} || echo "Database prd pode já existir"

echo "✅ Databases criados"
echo ""

# Obter connection names
echo "🔗 Obtendo connection strings..."
DEV_CONNECTION=$(gcloud sql instances describe tyr-crm-db-dev --format="value(connectionName)" --project=${PROJECT_ID})
HML_CONNECTION=$(gcloud sql instances describe tyr-crm-db-hml --format="value(connectionName)" --project=${PROJECT_ID})
PRD_CONNECTION=$(gcloud sql instances describe tyr-crm-db-prd --format="value(connectionName)" --project=${PROJECT_ID})

echo ""
echo "📝 Connection Names:"
echo "  Dev: ${DEV_CONNECTION}"
echo "  HML: ${HML_CONNECTION}"
echo "  PRD: ${PRD_CONNECTION}"
echo ""

# Criar secrets (opcional - pode ser feito manualmente depois)
echo "🔐 Configuração de Secrets"
echo "⚠️  Você precisará criar os secrets manualmente com valores reais"
echo ""
echo "Para criar os secrets, execute:"
echo ""
echo "# Dev"
echo "echo -n 'sua-secret-key-dev' | gcloud secrets create secret-key-dev --data-file=- --project=${PROJECT_ID}"
echo "echo -n 'postgresql://postgres:${DEV_PASSWORD}@/tyr_crm?host=/cloudsql/${DEV_CONNECTION}' | gcloud secrets create database-url-dev --data-file=- --project=${PROJECT_ID}"
echo "echo -n 'sua-openai-key' | gcloud secrets create openai-api-key-dev --data-file=- --project=${PROJECT_ID}"
echo ""
echo "# HML (similar com hml)"
echo "# PRD (similar com prd)"
echo ""

echo "✅ Setup inicial concluído!"
echo ""
echo "📋 Próximos passos:"
echo "1. Configure os secrets no Secret Manager"
echo "2. Execute: cd backend && ./deploy-gcp.sh dev"
echo "3. Configure o Vercel com as URLs do Cloud Run"

