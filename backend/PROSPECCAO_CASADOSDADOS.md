# Módulo de Prospecção - Casa dos Dados

## 📋 Visão Geral

O módulo de prospecção permite buscar empresas na API da Casa dos Dados usando critérios personalizados e gerar leads automaticamente.

## 🔧 Configuração

### 1. Obter API Key

1. Acesse https://casadosdados.com.br
2. Crie uma conta ou faça login
3. Acesse a área de API/Desenvolvedor
4. Gere ou copie sua API key

### 2. Configurar no .env

```env
CASADOSDADOS_API_KEY=sua-chave-api-aqui
```

## 🚨 Solução de Problemas

### Erro 403 Forbidden

Se você receber erro 403, pode ser devido a:

1. **API Key Inválida ou Expirada**
   - Verifique se a chave está correta no `.env`
   - Confirme se a chave não expirou
   - Gere uma nova chave se necessário

2. **Bloqueio pelo Cloudflare**
   - A API pode estar protegida por Cloudflare
   - Requisições podem ser bloqueadas como bot
   - Solução: Entre em contato com o suporte da Casa dos Dados

3. **Endpoint Incorreto**
   - A URL da API pode ter mudado
   - Verifique a documentação oficial: https://docs.casadosdados.com.br
   - O endpoint atual configurado é: `https://api.casadosdados.com.br/v1/empresas`

4. **Método de Autenticação**
   - A API pode usar header `Authorization` ao invés de query param `token`
   - O código tenta ambos os métodos automaticamente

### Verificar Documentação Oficial

A documentação oficial da API da Casa dos Dados está disponível em:
- https://docs.casadosdados.com.br
- https://portal.casadosdados.com.br/docs/api

### Endpoints Alternativos

Se o endpoint `/v1/empresas` não funcionar, tente:

- `https://api.casadosdados.com.br/v2/empresas`
- `https://api.casadosdados.com.br/empresas`
- `https://casadosdados.com.br/api/v1/empresas`

### Formato de Autenticação

A API pode aceitar autenticação de diferentes formas:

1. **Query Parameter**: `?token=SUA_CHAVE`
2. **Header Authorization**: `Authorization: Bearer SUA_CHAVE`
3. **Header X-API-Key**: `X-API-Key: SUA_CHAVE`

O código atual tenta automaticamente header `Authorization` e query param `token`.

## 📝 Parâmetros de Busca Disponíveis

- `uf`: Estado (ex: SP, RJ)
- `municipio`: Município
- `cnae`: Código CNAE
- `cnae_descricao`: Descrição do CNAE
- `porte`: ME, EPP, Grande
- `situacao_cadastral`: ATIVA, BAIXADA, INAPTA
- `capital_social_min`: Capital social mínimo
- `capital_social_max`: Capital social máximo
- `data_abertura_inicio`: Data início (YYYY-MM-DD)
- `data_abertura_fim`: Data fim (YYYY-MM-DD)
- `simples_nacional`: true/false
- `razao_social_contem`: Texto a buscar na razão social
- `nome_fantasia_contem`: Texto a buscar no nome fantasia
- `limite`: Número máximo de resultados (1-1000)

## 🔄 Próximos Passos

Se o erro 403 persistir:

1. Verifique a documentação oficial da API
2. Entre em contato com o suporte da Casa dos Dados
3. Verifique se sua conta tem permissões para usar a API de busca
4. Confirme se há restrições de IP ou rate limiting







