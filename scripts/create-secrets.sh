#!/bin/bash
# Script para criar secrets no GCP Secret Manager
# Uso: ./create-secrets.sh [dev|hml|prd]

set -e

ENVIRONMENT=${1:-dev}
PROJECT_ID=${GCP_PROJECT_ID:-tyr-crm-ai}

if [ -z "$ENVIRONMENT" ] || [[ ! "$ENVIRONMENT" =~ ^(dev|hml|prd)$ ]]; then
    echo "❌ Ambiente inválido. Use: dev, hml ou prd"
    exit 1
fi

echo "🔐 Criando secrets para ambiente: ${ENVIRONMENT}"
echo ""

# Obter connection name
CONNECTION_NAME=$(gcloud sql instances describe tyr-crm-db-${ENVIRONMENT} --format="value(connectionName)" --project=${PROJECT_ID} 2>/dev/null || echo "")

if [ -z "$CONNECTION_NAME" ]; then
    echo "❌ Instância Cloud SQL não encontrada: tyr-crm-db-${ENVIRONMENT}"
    exit 1
fi

echo "📝 Connection Name: ${CONNECTION_NAME}"
echo ""

# Solicitar valores
read -sp "Digite a SECRET_KEY para ${ENVIRONMENT}: " SECRET_KEY
echo ""
read -sp "Digite a senha do banco de dados: " DB_PASSWORD
echo ""
read -sp "Digite a OPENAI_API_KEY: " OPENAI_KEY
echo ""

# Criar DATABASE_URL
# Formato: postgresql://postgres:PASSWORD@/tyr_crm?host=/cloudsql/CONNECTION_NAME
DATABASE_URL="postgresql://postgres:${DB_PASSWORD}@/tyr_crm?host=/cloudsql/${CONNECTION_NAME}"

echo ""
echo "📦 Criando/atualizando secrets..."

# Secret Key
if gcloud secrets describe secret-key-${ENVIRONMENT} --project=${PROJECT_ID} &>/dev/null; then
    echo "  Atualizando secret-key-${ENVIRONMENT}..."
    echo -n "${SECRET_KEY}" | gcloud secrets versions add secret-key-${ENVIRONMENT} --data-file=- --project=${PROJECT_ID}
else
    echo "  Criando secret-key-${ENVIRONMENT}..."
    echo -n "${SECRET_KEY}" | gcloud secrets create secret-key-${ENVIRONMENT} --data-file=- --project=${PROJECT_ID}
fi

# Database URL
if gcloud secrets describe database-url-${ENVIRONMENT} --project=${PROJECT_ID} &>/dev/null; then
    echo "  Atualizando database-url-${ENVIRONMENT}..."
    echo -n "${DATABASE_URL}" | gcloud secrets versions add database-url-${ENVIRONMENT} --data-file=- --project=${PROJECT_ID}
else
    echo "  Criando database-url-${ENVIRONMENT}..."
    echo -n "${DATABASE_URL}" | gcloud secrets create database-url-${ENVIRONMENT} --data-file=- --project=${PROJECT_ID}
fi

# OpenAI API Key
if gcloud secrets describe openai-api-key-${ENVIRONMENT} --project=${PROJECT_ID} &>/dev/null; then
    echo "  Atualizando openai-api-key-${ENVIRONMENT}..."
    echo -n "${OPENAI_KEY}" | gcloud secrets versions add openai-api-key-${ENVIRONMENT} --data-file=- --project=${PROJECT_ID}
else
    echo "  Criando openai-api-key-${ENVIRONMENT}..."
    echo -n "${OPENAI_KEY}" | gcloud secrets create openai-api-key-${ENVIRONMENT} --data-file=- --project=${PROJECT_ID}
fi

echo ""
echo "✅ Secrets criados para ${ENVIRONMENT}!"
echo ""
echo "📋 Secrets criados:"
echo "  - secret-key-${ENVIRONMENT}"
echo "  - database-url-${ENVIRONMENT}"
echo "  - openai-api-key-${ENVIRONMENT}"

