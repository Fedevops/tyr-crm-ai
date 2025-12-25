# Como Encontrar o Endpoint Correto da API do RapidAPI

## 🔍 Problema

Se você está recebendo erros como:
```
{"message":"Endpoint '/profile' does not exist"}
```

Isso significa que o endpoint que estamos tentando não existe nessa API específica do RapidAPI.

## 📋 Passo a Passo para Encontrar o Endpoint Correto

### 1. Acesse a Página da API no RapidAPI

1. Vá para https://rapidapi.com
2. Faça login na sua conta
3. Vá em "My Apps" > "Subscriptions"
4. Encontre a API do LinkedIn que você está usando
5. Clique na API para abrir a página dela

### 2. Encontre a Seção "Endpoints"

Na página da API, procure por:
- **"Endpoints"** ou **"API Endpoints"**
- **"Code Snippets"** (geralmente mostra o endpoint)
- **"Documentation"** ou **"Docs"**

### 3. Identifique o Endpoint Correto

Procure por endpoints relacionados a "profile" ou "perfil". Exemplos comuns:

- `/v1/profile`
- `/api/profile`
- `/profile/get`
- `/linkedin/profile`
- `/v2/profile`
- `/get-profile`
- `/profile-data`

### 4. Verifique o Método HTTP

Veja se é:
- **GET** - geralmente com o username no path ou query parameter
- **POST** - geralmente com a URL ou username no body

### 5. Verifique os Parâmetros

Veja quais parâmetros são necessários:
- `url` - URL completa do LinkedIn
- `linkedin_url` - URL completa do LinkedIn (formato alternativo)
- `username` - apenas o username (ex: `marcelo-celebre`)
- `profile_url` - URL completa do perfil

### 6. Configure no .env

Depois de encontrar o endpoint correto, adicione ao `.env`:

```env
# Exemplo 1: Se o endpoint for /v1/profile
RAPIDAPI_LINKEDIN_ENDPOINT=/v1/profile

# Exemplo 2: Se o endpoint for /api/profile
RAPIDAPI_LINKEDIN_ENDPOINT=/api/profile

# Exemplo 3: Se o endpoint for /get-profile
RAPIDAPI_LINKEDIN_ENDPOINT=/get-profile
```

**Importante:** Inclua a barra inicial (`/`) no endpoint.

## 🧪 Teste Rápido

Depois de configurar, teste novamente:

```bash
curl -X POST "http://localhost:8000/api/debug/test-linkedin-enrichment" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SEU_TOKEN" \
  -d '{
    "linkedin_url": "https://www.linkedin.com/in/marcelo-celebre/"
  }'
```

## 📝 Exemplo de Documentação da API

Geralmente a documentação mostra algo assim:

```
POST /v1/profile
Body: {
  "url": "https://www.linkedin.com/in/username"
}
```

Ou:

```
GET /api/profile/{username}
```

## ⚠️ Se Nenhum Endpoint Funcionar

1. **Verifique se você está inscrito na API**
   - Vá em "My Apps" > "Subscriptions"
   - Certifique-se de que está inscrito (mesmo que no plano gratuito)

2. **Verifique se a API está ativa**
   - Algumas APIs podem estar temporariamente indisponíveis

3. **Tente uma API diferente**
   - Existem várias APIs de LinkedIn no RapidAPI
   - Algumas podem ser mais confiáveis que outras

4. **Entre em contato com o suporte do RapidAPI**
   - Se a documentação não estiver clara
   - Ou se nenhum endpoint funcionar

## 🔗 Links Úteis

- [RapidAPI Dashboard](https://rapidapi.com/developer/dashboard)
- [RapidAPI LinkedIn APIs](https://rapidapi.com/search/linkedin)
- [RapidAPI Support](https://rapidapi.com/support)



