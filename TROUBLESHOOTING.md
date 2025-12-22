# Troubleshooting - TYR CRM AI

## Problema: "Tenant name already exists" na primeira tentativa de registro

### Causa
O banco de dados pode ter dados de tentativas anteriores. O Docker Compose mantém os dados em um volume persistente, então mesmo após parar os containers, os dados permanecem.

### Soluções

#### Solução 1: Limpar o banco de dados (Recomendado para desenvolvimento)

```bash
# Parar os containers
docker-compose down

# Remover o volume do banco de dados
docker volume rm tyr-crm-ai_postgres_data

# Ou remover todos os volumes não utilizados
docker volume prune

# Iniciar novamente
docker-compose up -d
```

#### Solução 2: Usar rotas de debug para limpar tenants órfãos

1. Acesse a documentação da API: http://localhost:8000/docs
2. Vá até a rota `GET /api/debug/tenants` para ver todos os tenants
3. Use `DELETE /api/debug/cleanup-orphan-tenants` para remover tenants sem usuários

#### Solução 3: Escolher um nome diferente

O sistema agora detecta tenants órfãos (sem usuários) e automaticamente adiciona um sufixo único ao nome. Mas se o tenant já tiver usuários, você precisará escolher um nome diferente.

### Verificar o estado do banco

```bash
# Conectar ao banco de dados
docker exec -it tyr-postgres psql -U tyr_user -d tyr_crm

# Ver todos os tenants
SELECT id, name, company_name FROM tenant;

# Ver todos os usuários
SELECT id, email, tenant_id FROM "user";

# Limpar manualmente (CUIDADO!)
DELETE FROM "user" WHERE tenant_id = 1;
DELETE FROM tenant WHERE id = 1;
```

## Problema: "password cannot be longer than 72 bytes"

### Causa
O bcrypt (usado para hash de senhas) tem uma limitação de 72 bytes. Se uma senha exceder esse limite, ocorrerá um erro.

### Solução
O sistema agora:
- ✅ Valida que a senha não exceda 72 caracteres no registro
- ✅ Trunca automaticamente senhas muito longas (mas mostra erro de validação primeiro)
- ✅ Mensagem de erro clara: "Password is too long. Maximum length is 72 characters."

### Requisitos de senha
- Mínimo: 6 caracteres
- Máximo: 72 caracteres (limitação do bcrypt)
- Recomendado: 8-16 caracteres para segurança

### Prevenção

O código agora inclui:
- ✅ Tratamento de erros com rollback automático
- ✅ Detecção de tenants órfãos
- ✅ Rotas de debug para inspeção

**Nota**: As rotas de debug (`/api/debug/*`) devem ser removidas ou protegidas em produção!

## Problema: "AttributeError: module 'bcrypt' has no attribute '__about__'"

### Causa
Incompatibilidade entre a versão do `passlib` e a versão do `bcrypt`. Versões mais recentes do bcrypt (4.x) mudaram a estrutura interna e não são compatíveis com passlib 1.7.4.

### Solução

1. **Reconstruir o container do backend:**
```bash
# Parar os containers
docker-compose down

# Reconstruir o backend com as dependências atualizadas
docker-compose build --no-cache backend

# Iniciar novamente
docker-compose up -d
```

2. **Se estiver rodando localmente:**
```bash
cd backend
pip install --upgrade --force-reinstall 'bcrypt<4.0.0' 'passlib[bcrypt]==1.7.4'
```

### Versões compatíveis
- `passlib[bcrypt]==1.7.4` com `bcrypt<4.0.0` (recomendado: bcrypt 3.2.2)

O arquivo `requirements.txt` já foi atualizado para usar `bcrypt<4.0.0` para garantir compatibilidade.

