# Guia de Configuração - TYR CRM AI

## 🚀 Inicialização Rápida

### Opção 1: Docker Compose (Recomendado)

1. **Clone o repositório e navegue até o diretório:**
```bash
cd tyr-crm-ai
```

2. **Configure as variáveis de ambiente (opcional):**
```bash
# Backend - crie o arquivo .env
cd backend
cat > .env << EOF
# Configuração do LLM
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://host.docker.internal:11434
OLLAMA_MODEL=llama3

# Ou use OpenAI:
# LLM_PROVIDER=openai
# OPENAI_API_KEY=sua-chave-aqui
EOF
cd ..
```

3. **Inicie todos os serviços:**
```bash
docker-compose up -d
```

4. **Acesse a aplicação:**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000
   - API Docs: http://localhost:8000/docs

5. **Ver logs:**
```bash
docker-compose logs -f
```

6. **Parar serviços:**
```bash
docker-compose down
```

### Opção 2: Desenvolvimento Local

#### Backend

1. **Navegue até o diretório backend:**
```bash
cd backend
```

2. **Crie um ambiente virtual:**
```bash
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
```

3. **Instale as dependências:**
```bash
pip install -r requirements.txt
```

4. **Configure as variáveis de ambiente:**
```bash
cp .env.example .env
# Edite .env com suas configurações
```

5. **Certifique-se de que o PostgreSQL está rodando:**
```bash
# Ou use Docker apenas para o banco:
docker run -d --name tyr-postgres \
  -e POSTGRES_USER=tyr_user \
  -e POSTGRES_PASSWORD=tyr_password \
  -e POSTGRES_DB=tyr_crm \
  -p 5432:5432 \
  postgres:15-alpine
```

6. **Inicie o servidor:**
```bash
uvicorn app.main:app --reload
```

#### Frontend

1. **Navegue até o diretório frontend:**
```bash
cd frontend
```

2. **Instale as dependências:**
```bash
npm install
```

3. **Configure a URL da API (opcional):**
```bash
# Crie um arquivo .env.local
echo "VITE_API_URL=http://localhost:8000" > .env.local
```

4. **Inicie o servidor de desenvolvimento:**
```bash
npm run dev
```

## 📋 Primeiros Passos

1. **Registre uma nova conta:**
   - Acesse http://localhost:3000/register
   - Preencha os dados (nome, email, senha, nome da empresa)
   - O sistema criará automaticamente um tenant para você

2. **Faça login:**
   - Acesse http://localhost:3000/login
   - Use as credenciais criadas

3. **Configure seu perfil (Opcional):**
   - Acesse /onboarding para configurar perfil da empresa, ICP e chaves de API

4. **Crie seu primeiro Playbook:**
   - Acesse /playbooks
   - Clique em "Criar Novo Playbook"
   - Preencha nome, descrição e conteúdo do playbook
   - O playbook será usado pelo agente SDR para gerar sugestões

5. **Teste o Agente:**
   - Use a API para processar um lead
   - POST /api/agents/process-lead
   - O agente pesquisará sobre o lead e sugerirá uma abordagem

## 🔧 Configuração Avançada

### Variáveis de Ambiente do Backend

- `DATABASE_URL`: URL de conexão do PostgreSQL
- `SECRET_KEY`: Chave secreta para JWT (mude em produção!)
- `ALGORITHM`: Algoritmo JWT (padrão: HS256)
- `ACCESS_TOKEN_EXPIRE_MINUTES`: Tempo de expiração do token (padrão: 30)
- `OPENAI_API_KEY`: Chave da API OpenAI (opcional, para IA real)
- `LLM_PROVIDER`: Provedor de LLM - "openai" ou "ollama" (padrão: "openai")
- `OLLAMA_BASE_URL`: URL base do Ollama (padrão: "http://localhost:11434")
  - **Em ambiente Docker**: Use `http://host.docker.internal:11434` se o Ollama estiver rodando no host
  - **Em ambiente local**: Use `http://localhost:11434`
- `OLLAMA_MODEL`: Modelo do Ollama a ser usado (padrão: "llama3")

### Variáveis de Ambiente do Frontend

- `VITE_API_URL`: URL da API backend (padrão: http://localhost:8000)

## 🐛 Troubleshooting

### Erro de conexão com o banco de dados
- Verifique se o PostgreSQL está rodando
- Confirme as credenciais no arquivo .env
- Verifique se a porta 5432 está disponível

### Erro ao iniciar o frontend
- Certifique-se de que o Node.js 18+ está instalado
- Delete node_modules e reinstale: `rm -rf node_modules && npm install`

### Erro ao iniciar o backend
- Verifique se o Python 3.11+ está instalado
- Certifique-se de que todas as dependências foram instaladas
- Verifique se o banco de dados está acessível

### Erro "Connection refused" ao processar PDF do LinkedIn
Este erro ocorre quando o sistema tenta usar o Ollama mas não consegue se conectar. Soluções:

**Opção 1: Usar OpenAI (Recomendado para produção)**
```bash
# No arquivo backend/.env
LLM_PROVIDER=openai
OPENAI_API_KEY=sua-chave-aqui
```

**Opção 2: Configurar Ollama em Docker (RECOMENDADO - já configurado por padrão)**
1. Certifique-se de que o Ollama está rodando no seu computador (não dentro do container)
2. Crie o arquivo `backend/.env` com:
```bash
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://host.docker.internal:11434
OLLAMA_MODEL=llama3
```

**Nota**: O `docker-compose.yml` já está configurado para usar `host.docker.internal:11434` por padrão. Você só precisa criar o arquivo `.env` se quiser sobrescrever essas configurações.

**Opção 3: Rodar Ollama em Docker também**
Adicione ao `docker-compose.yml`:
```yaml
  ollama:
    image: ollama/ollama:latest
    container_name: tyr-ollama
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama
```

E configure no `backend/.env`:
```bash
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_MODEL=llama3
```

**Nota**: Se usar a Opção 3, adicione `ollama` aos `depends_on` do serviço `backend` no docker-compose.yml

## 📚 Estrutura do Projeto

```
tyr-crm-ai/
├── backend/
│   ├── app/
│   │   ├── agents/          # Agentes LangGraph
│   │   ├── routers/         # Rotas da API
│   │   ├── models.py        # Modelos SQLModel
│   │   ├── auth.py          # Autenticação JWT
│   │   └── main.py          # Aplicação FastAPI
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/      # Componentes React
│   │   ├── pages/           # Páginas
│   │   ├── contexts/        # Contextos (Auth, Theme)
│   │   ├── i18n/            # Internacionalização
│   │   └── lib/             # Utilitários
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
└── README.md
```

## 🔐 Segurança

⚠️ **IMPORTANTE**: Em produção:
- Altere o `SECRET_KEY` para um valor seguro e aleatório
- Use variáveis de ambiente para todas as credenciais
- Configure HTTPS
- Implemente rate limiting
- Adicione validação de entrada mais rigorosa
- Configure CORS adequadamente

## 📝 Notas

- O agente SDR funciona sem OpenAI API key, mas retornará respostas simuladas
- Para usar IA real, configure a `OPENAI_API_KEY` no backend
- O sistema suporta multi-tenancy: cada usuário só vê dados do seu tenant
- Todos os dados são isolados por `tenant_id`

