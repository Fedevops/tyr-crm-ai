#!/bin/sh
set -e

echo "🔍 Verificando dependências do npm..."

# Verificar se node_modules existe e se react-leaflet está instalado
if [ ! -d "node_modules" ] || [ ! -d "node_modules/react-leaflet" ]; then
  echo "📦 Instalando dependências do npm..."
  npm install
  echo "✅ Dependências instaladas com sucesso!"
else
  echo "✅ Dependências já instaladas."
fi

echo "🚀 Iniciando servidor de desenvolvimento..."
exec "$@"




