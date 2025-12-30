# Troubleshooting - RapidAPI LinkedIn

## Erro: "Erro HTTP None na API RapidAPI LinkedIn"

Este erro indica que a requisição não conseguiu obter uma resposta HTTP válida do servidor RapidAPI. Isso pode acontecer por várias razões:

### 🔍 Diagnóstico Passo a Passo

#### 1. Verificar se a API Key está correta

```bash
# No terminal do backend, verifique:
echo $RAPIDAPI_KEY
```

Ou verifique no arquivo `.env`:
```env
RAPIDAPI_KEY=sua-chave-aqui
```

**Importante:** A chave deve ter pelo menos 50 caracteres. Se tiver menos, está incorreta.

#### 2. Verificar se você está inscrito na API

1. Acesse https://rapidapi.com
2. Faça login
3. Vá em "My Apps" > "Subscriptions"
4. Verifique se você está inscrito na API do LinkedIn que escolheu
5. Algumas APIs requerem assinatura de um plano (mesmo que gratuito)

#### 3. Verificar o Host correto

O host pode variar dependendo da API escolhida. Exemplos comuns:

- `linkedin-api8.p.rapidapi.com`
- `linkedin-data-scraper.p.rapidapi.com`
- `linkedin-profile-scraper.p.rapidapi.com`
- `linkedin-api.p.rapidapi.com`

**Como encontrar o host correto:**

1. Acesse https://rapidapi.com
2. Busque por "LinkedIn" nas APIs
3. Escolha a API que você quer usar
4. Na página da API, veja a seção "Code Snippets"
5. O host estará no header `X-RapidAPI-Host`

#### 4. Verificar o Endpoint correto

Diferentes APIs têm endpoints diferentes. Exemplos:

**API 1:**
```
GET https://linkedin-api8.p.rapidapi.com/profile/{username}
```

**API 2:**
```
POST https://linkedin-data-scraper.p.rapidapi.com/profile
Body: {"url": "https://www.linkedin.com/in/username"}
```

**API 3:**
```
GET https://linkedin-api.p.rapidapi.com/v1/profile/{username}
```

**Como encontrar o endpoint correto:**

1. Na página da API no RapidAPI, veja a seção "Endpoints"
2. Copie o endpoint exato mostrado na documentação
3. Ajuste o código em `researcher_agent.py` se necessário

#### 5. Testar a API diretamente

Use o Postman ou cURL para testar:

```bash
curl -X GET "https://linkedin-api8.p.rapidapi.com/profile/nome-do-perfil" \
  -H "X-RapidAPI-Key: SUA_CHAVE_AQUI" \
  -H "X-RapidAPI-Host: linkedin-api8.p.rapidapi.com"
```

Se funcionar no Postman/cURL mas não no código, o problema está na implementação.

### 🔧 Soluções Comuns

#### Solução 1: Verificar se a API requer POST ao invés de GET

Algumas APIs do RapidAPI usam POST. O código já tenta ambos, mas você pode verificar na documentação da API.

#### Solução 2: Verificar se precisa de parâmetros adicionais

Algumas APIs podem precisar de parâmetros no body ou query string. Verifique a documentação.

#### Solução 3: Verificar Rate Limits

Se você excedeu o limite de requisições:
- Aguarde alguns minutos
- Verifique seu plano no RapidAPI
- Considere fazer upgrade

#### Solução 4: Verificar se o perfil é público

A API só pode acessar perfis públicos do LinkedIn. Perfis privados retornarão erro.

### 📝 Exemplo de Configuração Correta

```env
# .env
RAPIDAPI_KEY=abc123def456ghi789jkl012mno345pqr678stu901vwx234yz
RAPIDAPI_LINKEDIN_HOST=linkedin-api8.p.rapidapi.com
```

### 🧪 Teste Rápido

Use o endpoint de debug para testar:

```bash
curl -X POST "http://localhost:8000/api/debug/test-linkedin-enrichment" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SEU_TOKEN" \
  -d '{
    "linkedin_url": "https://www.linkedin.com/in/nome-do-perfil"
  }'
```

### 📊 Verificar Logs Detalhados

Os logs agora mostram:
- URL da API sendo chamada
- Headers enviados
- Status da resposta
- Conteúdo da resposta (primeiros 500 caracteres)
- Tipo de exceção

Verifique os logs do backend:
```bash
docker-compose logs -f backend | grep RAPIDAPI
```

### ⚠️ Problemas Específicos

#### "Connection Error"
- Verifique sua conexão com a internet
- Verifique se o host está correto
- Tente fazer ping no host: `ping linkedin-api8.p.rapidapi.com`

#### "Timeout"
- A requisição demorou mais de 15 segundos
- Pode ser problema de rede ou API lenta
- Tente aumentar o timeout no código

#### "404 Not Found"
- Endpoint incorreto
- Username do LinkedIn inválido
- Verifique a URL do perfil

#### "401 Unauthorized"
- API key inválida ou expirada
- Verifique a chave no RapidAPI

#### "403 Forbidden"
- Você não está inscrito na API
- Você não tem permissão para usar a API
- Verifique sua assinatura no RapidAPI

### 🔗 Links Úteis

- [RapidAPI Dashboard](https://rapidapi.com/developer/dashboard)
- [RapidAPI LinkedIn APIs](https://rapidapi.com/search/linkedin)
- [RapidAPI Documentation](https://docs.rapidapi.com/)

### 💡 Dica Final

Se nada funcionar, tente uma API diferente do RapidAPI. Existem várias APIs de LinkedIn disponíveis, e algumas podem ser mais confiáveis que outras.





