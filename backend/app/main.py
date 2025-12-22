from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, init_db
from app.routers import auth, users, playbooks, agents, company_profile, debug, leads, sequences, tasks

app = FastAPI(
    title="TYR CRM AI",
    description="CRM Agêntico Multi-tenant para SDRs",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://frontend:3000",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Total-Count"],
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
app.include_router(debug.router, prefix="/api/debug", tags=["debug"])


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

