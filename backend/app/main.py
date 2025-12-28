import logging
import sys
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException
from pathlib import Path
from app.database import engine, init_db
from app.routers import auth, users, playbooks, agents, company_profile, debug, leads, sequences, tasks, prospecting, audit, sales_funnel, opportunities, proposals, proposal_templates, accounts, contacts, dashboard, settings, kpi, live_pulse, widgets, items, orders, integrations, forms
from app.middleware import ApiCallTrackingMiddleware

# Configurar logging para garantir que todos os logs apareçam
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)

# Configurar nível de log para SQLAlchemy (reduzir verbosidade)
logging.getLogger('sqlalchemy.engine').setLevel(logging.WARNING)

# Configurar nível de log para researcher_agent (mostrar DEBUG também)
logging.getLogger('app.agents.researcher_agent').setLevel(logging.DEBUG)

app = FastAPI(
    title="TYR CRM AI",
    description="CRM Agêntico Multi-tenant para SDRs",
    version="1.0.0"
)

# CORS middleware - DEVE SER ADICIONADO ANTES DE QUALQUER OUTRO MIDDLEWARE
# Permitir origens específicas para requisições com credenciais
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://frontend:3000",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://localhost:8080",  # Para testar widgets
        "http://127.0.0.1:8080",  # Para testar widgets
        "http://127.0.0.1:5500",  # Para testar widgets (Live Server)
        "http://localhost:5500",  # Para testar widgets (Live Server)
        "file://",  # Para arquivos HTML locais
    ],
    allow_credentials=True,  # Permitir credenciais para o frontend autenticado
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Total-Count"],
)

# API Call Tracking Middleware - Adicionado após CORS para rastrear chamadas de API
app.add_middleware(ApiCallTrackingMiddleware)

# Exception handlers para garantir que CORS seja aplicado mesmo em erros
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers={
            "Access-Control-Allow-Origin": request.headers.get("origin", "*"),
            "Access-Control-Allow-Credentials": "true",
        }
    )

@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    logger = logging.getLogger(__name__)
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": f"Internal server error: {str(exc)}"},
        headers={
            "Access-Control-Allow-Origin": request.headers.get("origin", "*"),
            "Access-Control-Allow-Credentials": "true",
        }
    )

# Include routers
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(playbooks.router, prefix="/api/playbooks", tags=["playbooks"])
app.include_router(agents.router, prefix="/api/agents", tags=["agents"])
app.include_router(company_profile.router, prefix="/api/company-profile", tags=["company-profile"])
app.include_router(leads.router, prefix="/api/leads", tags=["leads"])
app.include_router(sequences.router, prefix="/api/sequences", tags=["sequences"])
app.include_router(tasks.router, prefix="/api/tasks", tags=["tasks"])
app.include_router(prospecting.router, prefix="/api/prospecting", tags=["prospecting"])
app.include_router(audit.router, prefix="/api/audit", tags=["audit"])
app.include_router(sales_funnel.router, prefix="/api/sales-funnels", tags=["sales-funnels"])
app.include_router(opportunities.router, prefix="/api/opportunities", tags=["opportunities"])
app.include_router(proposals.router, prefix="/api/proposals", tags=["proposals"])
app.include_router(proposal_templates.router, prefix="/api/proposal-templates", tags=["proposal-templates"])
app.include_router(accounts.router, prefix="/api/accounts", tags=["accounts"])
app.include_router(contacts.router, prefix="/api/contacts", tags=["contacts"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["dashboard"])
app.include_router(debug.router, prefix="/api/debug", tags=["debug"])
app.include_router(settings.router, prefix="/api/settings", tags=["settings"])
app.include_router(kpi.router, prefix="/api/kpi", tags=["kpi"])
app.include_router(live_pulse.router, prefix="/api/live-pulse", tags=["live-pulse"])
app.include_router(widgets.router, prefix="/api", tags=["widgets"])
app.include_router(items.router, prefix="/api/items", tags=["items"])
app.include_router(orders.router, prefix="/api/orders", tags=["orders"])
app.include_router(integrations.router, prefix="/api/integrations", tags=["integrations"])
app.include_router(forms.router, prefix="/api/forms", tags=["forms"])

# Servir arquivos estáticos (imagens)
from pathlib import Path
uploads_dir = Path("uploads")
uploads_dir.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


@app.on_event("startup")
async def startup_event():
    """Initialize database on startup"""
    init_db()


@app.get("/")
async def root():
    return {"message": "TYR CRM AI API", "version": "1.0.0"}


@app.get("/health")
async def health():
    return {"status": "healthy"}

