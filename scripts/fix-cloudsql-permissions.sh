#!/bin/bash
# Script para corrigir permissões do Cloud Run para acessar Cloud SQL
# Uso: ./fix-cloudsql-permissions.sh [dev|hml|prd]

set -e

ENVIRONMENT=${1:-dev}
PROJECT_ID=${GCP_PROJECT_ID:-tyr-crm-ai}
REGION=${GCP_REGION:-us-central1}
INSTANCE_NAME="tyr-crm-db-${ENVIRONMENT}"

echo "🔐 Corrigindo permissões Cloud SQL para: ${ENVIRONMENT}"
echo ""

# Obter número do projeto e service account
PROJECT_NUMBER=$(gcloud projects describe ${PROJECT_ID} --format="value(projectNumber)")
COMPUTE_SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

echo "📋 Configuração:"
echo "   Projeto: ${PROJECT_ID}"
echo "   Número do Projeto: ${PROJECT_NUMBER}"
echo "   Service Account: ${COMPUTE_SERVICE_ACCOUNT}"
echo "   Instância Cloud SQL: ${INSTANCE_NAME}"
echo ""

# Verificar se instância existe
if ! gcloud sql instances describe ${INSTANCE_NAME} --project=${PROJECT_ID} &>/dev/null; then
    echo "❌ Instância Cloud SQL não encontrada: ${INSTANCE_NAME}"
    exit 1
fi

echo "✅ Instância Cloud SQL encontrada"
echo ""

# Conceder permissão Cloud SQL Client ao service account no nível do projeto
echo "🔧 Concedendo permissão 'Cloud SQL Client' ao service account..."
echo "   Role: roles/cloudsql.client"
echo "   Service Account: ${COMPUTE_SERVICE_ACCOUNT}"
echo "   Projeto: ${PROJECT_ID}"
echo ""

gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${COMPUTE_SERVICE_ACCOUNT}" \
  --role="roles/cloudsql.client" \
  --condition=None

echo ""
echo "✅ Permissão concedida!"
echo ""
echo "⏱️  Aguarde 1-2 minutos e teste novamente."
echo ""
echo "💡 Para verificar:"
echo "   gcloud projects get-iam-policy ${PROJECT_ID} --flatten=\"bindings[].members\" --filter=\"bindings.members:${COMPUTE_SERVICE_ACCOUNT}\" --format=\"table(bindings.role)\""

