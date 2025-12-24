# Sistema de Enriquecimento de Leads com Fallback Automático

Este documento explica como funciona o sistema de enriquecimento automático de leads e como configurar as APIs opcionais para melhorar a taxa de sucesso.

## 🎯 Como Funciona

Quando uma tarefa do tipo **"Pesquisa"** é marcada como concluída, o sistema automaticamente tenta enriquecer os dados do lead usando múltiplas estratégias em cascata:

### Estratégia 1: Scraping Direto (Sempre Ativo)
- Acessa diretamente o website do lead
- Extrai informações de contato, endereço, telefone, etc.
- Usa LLM para analisar o conteúdo e extrair contexto

### Estratégia 2: Serper.dev API (Recomendado - Mais Confiável)
- API oficial do Google Search extremamente rápida e confiável
- Nunca é bloqueada porque é uma API oficial para desenvolvedores
- Retorna Knowledge Graph automaticamente (dados estruturados da empresa)
- Usa LLM para analisar snippets e extrair informações adicionais
- **Requer**: `SERPER_API_KEY` configurada
- **Plano gratuito**: 2.500 requisições/mês
- **Custo**: Muito mais barato que Google Custom Search API

### Estratégia 2.5: RapidAPI LinkedIn (Enriquecimento Profissional)
- Extrai dados profissionais diretamente do LinkedIn
- Informações sobre cargo atual, empresa, experiência profissional, educação
- Localização, habilidades, resumo profissional
- **Requer**: `RAPIDAPI_KEY` configurada e `linkedin_url` no lead
- **Requer**: URL do LinkedIn do lead cadastrada
- **Vantagem**: Dados profissionais atualizados e confiáveis
- **Nota**: Depende da API específica escolhida no RapidAPI (ex: linkedin-api8)

### Estratégia 3: Google Search + LLM (Fallback Gratuito)
- Se o scraping direto falhar (ex: bloqueio 403), busca informações no Google
- Usa LLM para analisar os resultados e extrair dados estruturados
- **Requer**: `OPENAI_API_KEY` ou `OLLAMA_MODEL` configurado
- **Limitação**: Pode ser bloqueado pelo Google (rate limiting)

### Estratégia 4: Hunter.io API (Opcional)
- Busca emails e informações por domínio
- Ideal para encontrar contatos profissionais
- **Requer**: `HUNTER_API_KEY` configurada
- **Plano gratuito**: 25 requisições/mês

### Estratégia 5: Clearbit API (Opcional)
- Enriquecimento empresarial completo
- Informações sobre indústria, tamanho, localização
- **Requer**: `CLEARBIT_API_KEY` configurada
- **Plano gratuito**: 50 requisições/mês

## 📋 Configuração

### 1. Configuração Básica (Mínima)

Adicione ao seu arquivo `.env`:

```env
# OpenAI (obrigatório para análise com LLM)
OPENAI_API_KEY=sk-your-openai-api-key-here
```

### 2. Serper.dev (Recomendado - Mais Confiável)

1. Crie uma conta em https://serper.dev
2. Obtenha sua API key no dashboard
3. Adicione ao `.env`:

```env
SERPER_API_KEY=sua-serper-api-key-aqui
```

**Vantagens:**
- Nunca é bloqueado (API oficial)
- Extremamente rápido
- Retorna Knowledge Graph automaticamente
- Muito mais barato que Google Custom Search API
- 2.500 requisições gratuitas/mês

### 2.5. RapidAPI LinkedIn (Enriquecimento Profissional)

1. Crie uma conta em https://rapidapi.com
2. Escolha uma API do LinkedIn (ex: "LinkedIn API" ou "LinkedIn Profile Scraper")
3. Obtenha sua API key no dashboard do RapidAPI
4. Adicione ao `.env`:

```env
RAPIDAPI_KEY=sua-rapidapi-key-aqui
RAPIDAPI_LINKEDIN_HOST=linkedin-api8.p.rapidapi.com
```

**Nota:** O `RAPIDAPI_LINKEDIN_HOST` pode variar dependendo da API específica escolhida no RapidAPI. Verifique a documentação da API escolhida.

**Vantagens:**
- Dados profissionais atualizados do LinkedIn
- Informações sobre cargo, empresa, experiência
- Localização e habilidades
- Ideal para enriquecer leads B2B

**Importante:** O lead precisa ter a URL do LinkedIn cadastrada (`linkedin_url`) para esta estratégia funcionar.

### 3. Google Search (Fallback Gratuito)

A biblioteca `googlesearch-python` já está incluída no `requirements.txt`. Ela funciona sem configuração adicional, mas pode ter limitações de rate limit.

**Instalação:**
```bash
pip install googlesearch-python
```

**Nota:** Recomendamos usar Serper.dev para maior confiabilidade.

### 4. Hunter.io (Opcional - Busca de Emails)

1. Crie uma conta em https://hunter.io
2. Obtenha sua API key em https://hunter.io/api-keys
3. Adicione ao `.env`:

```env
HUNTER_API_KEY=your-hunter-api-key-here
```

**Planos:**
- Free: 25 requisições/mês
- Starter: $49/mês - 1.000 requisições

### 6. Clearbit (Opcional - Enriquecimento Empresarial)

1. Crie uma conta em https://clearbit.com
2. Obtenha sua API key em https://dashboard.clearbit.com/api
3. Adicione ao `.env`:

```env
CLEARBIT_API_KEY=your-clearbit-api-key-here
```

**Planos:**
- Free: 50 requisições/mês
- Growth: $99/mês - 1.000 requisições

## 🚀 Como Usar

1. **Crie uma tarefa do tipo "Pesquisa"** associada a um lead
2. **Certifique-se de que o lead tem um website cadastrado**
3. **Marque a tarefa como concluída**
4. O sistema automaticamente tentará enriquecer o lead usando as estratégias configuradas

## 📊 Campos Enriquecidos

O sistema pode preencher automaticamente os seguintes campos do lead:

- ✅ Telefone
- ✅ Email
- ✅ Endereço completo
- ✅ Cidade
- ✅ Estado
- ✅ CEP
- ✅ País
- ✅ Indústria
- ✅ Tamanho da empresa
- ✅ Contexto (resumo detalhado da empresa, produtos, dores, oportunidades)

**Nota**: Campos já preenchidos não serão sobrescritos. O sistema apenas preenche campos vazios.

## 🔍 Logs e Debugging

O sistema gera logs detalhados no console do backend:

```
🔍 [RESEARCHER] Iniciando pesquisa com fallback para: https://example.com
📋 [ESTRATÉGIA 1] Tentando scraping direto...
⚠️ [ESTRATÉGIA 1] Falhou. Status: 403. Tentando estratégias alternativas...
📋 [ESTRATÉGIA 2] Tentando Google Search + LLM...
✅ [ESTRATÉGIA 2] Google Search bem-sucedido!
```

## ⚠️ Tratamento de Erros

### Site Bloqueia Acesso (403 Forbidden)

Se o site bloquear o acesso automatizado:

1. **Com APIs configuradas**: O sistema tentará automaticamente as estratégias alternativas
2. **Sem APIs configuradas**: A tarefa receberá uma nota explicando o problema e sugerindo configuração das APIs

### Limites de Rate Limit

- **Google Search**: Pode ter limitações se muitas requisições forem feitas rapidamente
- **Hunter.io**: 25 requisições/mês no plano gratuito
- **Clearbit**: 50 requisições/mês no plano gratuito

O sistema trata esses erros graciosamente e informa na nota da tarefa.

## 💡 Dicas

1. **Configure pelo menos uma API alternativa** para aumentar a taxa de sucesso
2. **RapidAPI LinkedIn é ideal** se você tem URLs do LinkedIn dos leads e precisa de dados profissionais
3. **Hunter.io é ideal** se você precisa encontrar emails de contato
4. **Clearbit é ideal** se você precisa de informações empresariais completas
5. **Google Search funciona sem configuração** mas pode ter limitações
6. **Monitore os logs** para entender qual estratégia está sendo usada
7. **Cadastre URLs do LinkedIn** nos leads para habilitar o enriquecimento via RapidAPI

## 🔧 Instalação de Dependências

```bash
cd backend
pip install -r requirements.txt
```

As seguintes bibliotecas são necessárias:
- `beautifulsoup4` - Scraping de websites
- `requests` - Requisições HTTP
- `googlesearch-python` - Busca no Google
- `langchain-openai` - Integração com LLM

## 📝 Exemplo de Nota Gerada na Tarefa

Quando a pesquisa é bem-sucedida:

```
✅ Pesquisa automática concluída em 22/12/2025 13:30 usando Google Search + LLM.
Campos enriquecidos: telefone, endereço, cidade, estado, contexto
```

Quando todas as estratégias falham:

```
❌ Pesquisa automática falhou após tentar múltiplas estratégias.

Estratégia 1 (Scraping Direto): Bloqueado (403 Forbidden)

⚠️ Nenhuma estratégia alternativa configurada.
Configure Google Search API ou Hunter.io/Clearbit para fallback automático.
```

