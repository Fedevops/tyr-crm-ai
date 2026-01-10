#!/bin/bash
# Script completo de diagnóstico para conexão Cloud SQL
# Uso: ./diagnostico-db-completo.sh dev

set -e

ENVIRONMENT=${1:-dev}
PROJECT_ID=${GCP_PROJECT_ID:-tyr-crm-ai}
REGION=${GCP_REGION:-us-central1}
INSTANCE_NAME="tyr-crm-db-${ENVIRONMENT}"
SERVICE_NAME="tyr-crm-backend-${ENVIRONMENT}"
SECRET_NAME="database-url-${ENVIRONMENT}"

echo "🔬 DIAGNÓSTICO COMPLETO - Conexão Cloud SQL"
echo "============================================"
echo "Ambiente: ${ENVIRONMENT}"
echo "Projeto: ${PROJECT_ID}"
echo "Região: ${REGION}"
echo ""

ERRORS=0
WARNINGS=0

# 1. Verificar instância Cloud SQL
echo "1️⃣ Verificando instância Cloud SQL..."
echo "   Nome: ${INSTANCE_NAME}"
if gcloud sql instances describe ${INSTANCE_NAME} --project=${PROJECT_ID} &>/dev/null; then
    STATE=$(gcloud sql instances describe ${INSTANCE_NAME} --project=${PROJECT_ID} --format="value(state)" 2>/dev/null || echo "UNKNOWN")
    CONNECTION_NAME=$(gcloud sql instances describe ${INSTANCE_NAME} --project=${PROJECT_ID} --format="value(connectionName)" 2>/dev/null || echo "")
    
    echo "   ✅ Instância existe"
    echo "   📊 Estado: ${STATE}"
    echo "   🔗 Connection Name: ${CONNECTION_NAME}"
    
    if [ "$STATE" != "RUNNABLE" ]; then
        echo "   ⚠️  ATENÇÃO: Instância não está RUNNABLE!"
        WARNINGS=$((WARNINGS + 1))
    fi
    
    if [ -z "$CONNECTION_NAME" ]; then
        echo "   ❌ Connection Name não encontrado!"
        ERRORS=$((ERRORS + 1))
    fi
else
    echo "   ❌ Instância NÃO EXISTE!"
    echo "   Execute: ./scripts/setup-gcp-continue.sh ${PROJECT_ID} ${REGION}"
    ERRORS=$((ERRORS + 1))
    CONNECTION_NAME=""
fi
echo ""

# 2. Verificar DATABASE_URL
echo "2️⃣ Verificando DATABASE_URL no Secret Manager..."
echo "   Secret: ${SECRET_NAME}"
if gcloud secrets describe ${SECRET_NAME} --project=${PROJECT_ID} &>/dev/null; then
    echo "   ✅ Secret existe"
    
    CURRENT_URL=$(gcloud secrets versions access latest --secret=${SECRET_NAME} --project=${PROJECT_ID} 2>/dev/null || echo "")
    
    if [ -z "$CURRENT_URL" ]; then
        echo "   ❌ Não foi possível ler o secret"
        ERRORS=$((ERRORS + 1))
    else
        MASKED_URL=$(echo "$CURRENT_URL" | sed 's/:\/\/[^:]*:[^@]*@/:\/\/***:***@/')
        echo "   📝 URL: ${MASKED_URL}"
        
        # Verificar formato
        if [ -n "$CONNECTION_NAME" ]; then
            if echo "$CURRENT_URL" | grep -q "/cloudsql/${CONNECTION_NAME}"; then
                echo "   ✅ Formato correto (usa Unix socket)"
            else
                echo "   ❌ Formato INCORRETO!"
                echo "      Esperado: postgresql://postgres:PASSWORD@/tyr_crm?host=/cloudsql/${CONNECTION_NAME}"
                ERRORS=$((ERRORS + 1))
            fi
            
            if echo "$CURRENT_URL" | grep -q "@/tyr_crm"; then
                echo "   ✅ Nome do banco correto"
            else
                echo "   ⚠️  Nome do banco pode estar incorreto (esperado: @/tyr_crm)"
                WARNINGS=$((WARNINGS + 1))
            fi
        fi
    fi
else
    echo "   ❌ Secret NÃO EXISTE!"
    echo "   Execute: ./scripts/create-secrets.sh ${ENVIRONMENT}"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# 3. Verificar Cloud Run
echo "3️⃣ Verificando serviço Cloud Run..."
echo "   Nome: ${SERVICE_NAME}"
if gcloud run services describe ${SERVICE_NAME} --region ${REGION} --project=${PROJECT_ID} &>/dev/null; then
    echo "   ✅ Serviço existe"
    
    # Verificar Cloud SQL connection
    CLOUDSQL_JSON=$(gcloud run services describe ${SERVICE_NAME} \
      --region ${REGION} \
      --project=${PROJECT_ID} \
      --format="json" 2>/dev/null || echo "{}")
    
    if echo "$CLOUDSQL_JSON" | grep -q "${CONNECTION_NAME}"; then
        echo "   ✅ Cloud SQL configurado no Cloud Run"
        echo "   🔗 Connection: ${CONNECTION_NAME}"
    else
        echo "   ❌ Cloud SQL NÃO está configurado no Cloud Run!"
        echo "      Execute: cd backend && ./deploy-gcp.sh ${ENVIRONMENT}"
        ERRORS=$((ERRORS + 1))
    fi
    
    # Verificar se DATABASE_URL está configurado como secret
    if echo "$CLOUDSQL_JSON" | grep -q "DATABASE_URL"; then
        echo "   ✅ DATABASE_URL configurado como secret"
    else
        echo "   ⚠️  DATABASE_URL pode não estar configurado"
        WARNINGS=$((WARNINGS + 1))
    fi
    
    # Verificar status do serviço
    READY=$(echo "$CLOUDSQL_JSON" | grep -o '"ready":\s*[^,}]*' | head -1 || echo "")
    if echo "$READY" | grep -q "true"; then
        echo "   ✅ Serviço está pronto"
    else
        echo "   ⚠️  Serviço pode não estar pronto"
        WARNINGS=$((WARNINGS + 1))
    fi
else
    echo "   ❌ Serviço NÃO EXISTE!"
    echo "   Execute: cd backend && ./deploy-gcp.sh ${ENVIRONMENT}"
    ERRORS=$((ERRORS + 1))
fi
echo ""

# 4. Verificar permissões
echo "4️⃣ Verificando permissões..."
PROJECT_NUMBER=$(gcloud projects describe ${PROJECT_ID} --format="value(projectNumber)" 2>/dev/null || echo "")
COMPUTE_SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

if [ -n "$PROJECT_NUMBER" ]; then
    echo "   👤 Service Account: ${COMPUTE_SERVICE_ACCOUNT}"
    
    # Verificar permissão no secret
    if gcloud secrets get-iam-policy ${SECRET_NAME} --project=${PROJECT_ID} 2>/dev/null | grep -q "${COMPUTE_SERVICE_ACCOUNT}"; then
        echo "   ✅ Service Account tem acesso ao secret"
    else
        echo "   ❌ Service Account NÃO tem acesso ao secret!"
        echo "      Execute: ./scripts/fix-secrets-permissions.sh ${ENVIRONMENT}"
        ERRORS=$((ERRORS + 1))
    fi
else
    echo "   ⚠️  Não foi possível obter número do projeto"
    WARNINGS=$((WARNINGS + 1))
fi
echo ""

# 5. Resumo
echo "============================================"
echo "📊 RESUMO DO DIAGNÓSTICO"
echo "============================================"
if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo "✅ Tudo parece estar configurado corretamente!"
    echo ""
    echo "💡 Se ainda houver erro de conexão:"
    echo "   1. Aguarde 2-3 minutos após o último deploy"
    echo "   2. Verifique os logs:"
    echo "      gcloud logging read \"resource.type=cloud_run_revision AND resource.labels.service_name=${SERVICE_NAME}\" --limit=20 --project=${PROJECT_ID}"
    echo "   3. Faça um novo deploy:"
    echo "      cd backend && ./deploy-gcp.sh ${ENVIRONMENT}"
elif [ $ERRORS -eq 0 ]; then
    echo "⚠️  Encontrados ${WARNINGS} avisos (não críticos)"
    echo "   Revise os avisos acima"
else
    echo "❌ Encontrados ${ERRORS} erro(s) e ${WARNINGS} aviso(s)"
    echo ""
    echo "🔧 AÇÕES NECESSÁRIAS:"
    echo "   1. Corrija os erros listados acima"
    echo "   2. Execute novamente este diagnóstico"
    echo "   3. Faça um novo deploy:"
    echo "      cd backend && ./deploy-gcp.sh ${ENVIRONMENT}"
fi
echo ""

