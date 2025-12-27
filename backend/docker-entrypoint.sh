#!/bin/sh
set -e

echo "🔍 Verificando dependências do Python..."

# Verificar se requirements.txt existe
if [ ! -f "requirements.txt" ]; then
  echo "⚠️  Arquivo requirements.txt não encontrado!"
  exit 1
fi

# Verificar se beautifulsoup4 está instalado (como exemplo de dependência crítica)
if ! python -c "import bs4" 2>/dev/null; then
  echo "📦 Instalando dependências do Python..."
  pip install --no-cache-dir -r requirements.txt
  echo "✅ Dependências instaladas com sucesso!"
else
  echo "✅ Dependências já instaladas."
fi

echo "🚀 Iniciando servidor FastAPI..."
exec "$@"

