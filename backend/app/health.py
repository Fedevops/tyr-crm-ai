"""
Health check endpoint for Cloud Run
"""
from fastapi import APIRouter, status
from fastapi.responses import JSONResponse
from app.database import engine
from sqlalchemy import text

router = APIRouter()


@router.get("/health")
@router.get("/api/health")
async def health_check():
    """Health check endpoint"""
    try:
        # Verificar conexão com banco de dados
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={
                "status": "healthy",
                "database": "connected"
            }
        )
    except Exception as e:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "status": "unhealthy",
                "database": "disconnected",
                "error": str(e)
            }
        )

