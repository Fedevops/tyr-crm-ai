#!/bin/bash
# Script de deploy para GCP Cloud Run
# Uso: ./deploy-gcp.sh [dev|hml|prd]

set -e

ENVIRONMENT=${1:-dev}
PROJECT_ID=${GCP_PROJECT_ID:-tyr-crm-ai}
REGION=${GCP_REGION:-us-central1}
IMAGE_NAME="gcr.io/${PROJECT_ID}/tyr-crm-backend"

echo "🚀 Deploying to GCP Cloud Run - Environment: ${ENVIRONMENT}"

# Configurar projeto
gcloud config set project ${PROJECT_ID}

# Autenticar Docker no GCP
echo "🔐 Autenticando Docker no GCP..."
gcloud auth configure-docker --quiet

# Build da imagem para amd64/linux (Cloud Run requer esta arquitetura)
echo "📦 Building Docker image para amd64/linux..."
echo "⚠️  Nota: Se você estiver em Mac M1/M2, isso pode demorar mais (emulação)"
docker buildx build --platform linux/amd64 \
  -t ${IMAGE_NAME}:latest \
  -t ${IMAGE_NAME}:${ENVIRONMENT} \
  --load \
  . || docker build --platform linux/amd64 -t ${IMAGE_NAME}:latest -t ${IMAGE_NAME}:${ENVIRONMENT} .

# Push para Container Registry
echo "📤 Pushing image to Container Registry..."
docker push ${IMAGE_NAME}:latest
docker push ${IMAGE_NAME}:${ENVIRONMENT}

# Configurações por ambiente
case ${ENVIRONMENT} in
  dev)
    SERVICE_NAME="tyr-crm-backend-dev"
    MEMORY="512Mi"
    CPU="1"
    MIN_INSTANCES="0"
    MAX_INSTANCES="10"
    DB_INSTANCE="${PROJECT_ID}:${REGION}:tyr-crm-db-dev"
    SECRET_DB="database-url-dev"
    SECRET_KEY="secret-key-dev"
    SECRET_OPENAI="openai-api-key-dev"
    ;;
  hml)
    SERVICE_NAME="tyr-crm-backend-hml"
    MEMORY="1Gi"
    CPU="2"
    MIN_INSTANCES="1"
    MAX_INSTANCES="20"
    DB_INSTANCE="${PROJECT_ID}:${REGION}:tyr-crm-db-hml"
    SECRET_DB="database-url-hml"
    SECRET_KEY="secret-key-hml"
    SECRET_OPENAI="openai-api-key-hml"
    ;;
  prd)
    SERVICE_NAME="tyr-crm-backend-prd"
    MEMORY="2Gi"
    CPU="2"
    MIN_INSTANCES="1"
    MAX_INSTANCES="100"
    DB_INSTANCE="${PROJECT_ID}:${REGION}:tyr-crm-db-prd"
    SECRET_DB="database-url-prd"
    SECRET_KEY="secret-key-prd"
    SECRET_OPENAI="openai-api-key-prd"
    ;;
  *)
    echo "❌ Ambiente inválido. Use: dev, hml ou prd"
    exit 1
    ;;
esac

# Obter número do projeto e service account do Cloud Run
PROJECT_NUMBER=$(gcloud projects describe ${PROJECT_ID} --format="value(projectNumber)")
COMPUTE_SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# Conceder permissão para acessar secrets
echo "🔐 Configurando permissões para acessar secrets..."
echo "👤 Service Account: ${COMPUTE_SERVICE_ACCOUNT}"
echo ""

# Verificar se secrets existem e conceder permissões
for secret_name in ${SECRET_DB} ${SECRET_KEY} ${SECRET_OPENAI}; do
    echo -n "  Configurando ${secret_name}... "
    if gcloud secrets describe ${secret_name} --project=${PROJECT_ID} &>/dev/null; then
        if gcloud secrets add-iam-policy-binding ${secret_name} \
          --member="serviceAccount:${COMPUTE_SERVICE_ACCOUNT}" \
          --role="roles/secretmanager.secretAccessor" \
          --project=${PROJECT_ID} &>/dev/null; then
            echo "✅"
        else
            # Tentar verificar se já tem a permissão
            if gcloud secrets get-iam-policy ${secret_name} --project=${PROJECT_ID} 2>/dev/null | grep -q "${COMPUTE_SERVICE_ACCOUNT}"; then
                echo "✅ (já configurado)"
            else
                echo "⚠️  (erro ao configurar, tentando novamente...)"
                gcloud secrets add-iam-policy-binding ${secret_name} \
                  --member="serviceAccount:${COMPUTE_SERVICE_ACCOUNT}" \
                  --role="roles/secretmanager.secretAccessor" \
                  --project=${PROJECT_ID}
            fi
        fi
    else
        echo "❌ (secret não existe!)"
        echo "   Crie o secret primeiro: ./scripts/create-secrets.sh ${ENVIRONMENT}"
    fi
done
echo ""

# Conceder permissão Cloud SQL Client ao service account no nível do projeto
echo "🔐 Configurando permissões Cloud SQL..."
INSTANCE_SHORT="tyr-crm-db-${ENVIRONMENT}"

if gcloud sql instances describe ${INSTANCE_SHORT} --project=${PROJECT_ID} &>/dev/null; then
    echo -n "  Concedendo acesso ao Cloud SQL (${INSTANCE_SHORT})... "
    if gcloud projects add-iam-policy-binding ${PROJECT_ID} \
      --member="serviceAccount:${COMPUTE_SERVICE_ACCOUNT}" \
      --role="roles/cloudsql.client" \
      --condition=None \
      &>/dev/null; then
        echo "✅"
    else
        # Verificar se já tem a permissão
        if gcloud projects get-iam-policy ${PROJECT_ID} \
          --flatten="bindings[].members" \
          --filter="bindings.members:${COMPUTE_SERVICE_ACCOUNT}" \
          --format="value(bindings.role)" 2>/dev/null | grep -q "roles/cloudsql.client"; then
            echo "✅ (já configurado)"
        else
            echo "⚠️  (tentando novamente...)"
            gcloud projects add-iam-policy-binding ${PROJECT_ID} \
              --member="serviceAccount:${COMPUTE_SERVICE_ACCOUNT}" \
              --role="roles/cloudsql.client" \
              --condition=None
        fi
    fi
else
    echo "⚠️  Instância Cloud SQL não encontrada (${INSTANCE_SHORT})"
    echo "   Execute: ./scripts/setup-gcp-continue.sh ${PROJECT_ID} ${REGION}"
fi
echo ""

    # Deploy no Cloud Run
    echo "🚀 Deploying to Cloud Run: ${SERVICE_NAME}..."
    gcloud run deploy ${SERVICE_NAME} \
      --image ${IMAGE_NAME}:${ENVIRONMENT} \
      --platform managed \
      --region ${REGION} \
      --allow-unauthenticated \
      --port 8000 \
      --memory ${MEMORY} \
      --cpu ${CPU} \
      --min-instances ${MIN_INSTANCES} \
      --max-instances ${MAX_INSTANCES} \
      --set-env-vars "LLM_PROVIDER=openai" \
      --set-secrets "DATABASE_URL=${SECRET_DB}:latest,SECRET_KEY=${SECRET_KEY}:latest,OPENAI_API_KEY=${SECRET_OPENAI}:latest" \
      --add-cloudsql-instances ${DB_INSTANCE} \
      --timeout 300 \
      --cpu-throttling

# Configurar IAM para permitir acesso público (se necessário)
echo "🔐 Configurando permissões IAM públicas..."
gcloud run services add-iam-policy-binding ${SERVICE_NAME} \
  --region ${REGION} \
  --member="allUsers" \
  --role="roles/run.invoker" \
  2>/dev/null || echo "ℹ️  Permissões IAM públicas já configuradas"

# Obter URL do serviço
SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} --region ${REGION} --format="value(status.url)")

echo "✅ Deploy concluído!"
echo "🌐 URL do serviço: ${SERVICE_URL}"
echo "📝 Atualize a variável VITE_API_URL no Vercel com: ${SERVICE_URL}"

