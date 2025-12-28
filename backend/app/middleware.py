from fastapi import Request, status
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
from sqlmodel import Session, select
from app.database import engine
from app.models import ApiCallLog, User
from app.auth import decode_access_token
from typing import Optional
import logging

logger = logging.getLogger(__name__)


async def get_tenant_id_from_request(request: Request) -> Optional[int]:
    """Extract tenant_id from JWT token in request"""
    try:
        authorization = request.headers.get("Authorization") or request.headers.get("authorization")
        if not authorization:
            return None
        
        scheme, token = authorization.split(maxsplit=1)
        if scheme.lower() != "bearer":
            return None
        
        payload = decode_access_token(token)
        if not payload:
            return None
        
        user_id_str = payload.get("sub")
        if not user_id_str:
            return None
        
        user_id = int(user_id_str)
        
        # Get user from database to extract tenant_id
        with Session(engine) as session:
            user = session.get(User, user_id)
            if user:
                return user.tenant_id
        
        return None
    except Exception as e:
        logger.debug(f"Error extracting tenant_id from request: {e}")
        return None


async def get_user_id_from_request(request: Request) -> Optional[int]:
    """Extract user_id from JWT token in request"""
    try:
        authorization = request.headers.get("Authorization") or request.headers.get("authorization")
        if not authorization:
            return None
        
        scheme, token = authorization.split(maxsplit=1)
        if scheme.lower() != "bearer":
            return None
        
        payload = decode_access_token(token)
        if not payload:
            return None
        
        user_id_str = payload.get("sub")
        if not user_id_str:
            return None
        
        return int(user_id_str)
    except Exception as e:
        logger.debug(f"Error extracting user_id from request: {e}")
        return None


class ApiCallTrackingMiddleware(BaseHTTPMiddleware):
    """Middleware to track API calls for usage limits"""
    
    async def dispatch(self, request: Request, call_next):
        # Only track API calls (not static files, health checks, etc.)
        if not request.url.path.startswith("/api/"):
            return await call_next(request)
        
        # Skip tracking for certain endpoints
        skip_paths = ["/api/health", "/api/docs", "/api/openapi.json", "/api/redoc", "/api/auth/login", "/api/auth/register"]
        if any(request.url.path.startswith(path) for path in skip_paths):
            return await call_next(request)
        
        # Extract tenant_id and user_id
        tenant_id = await get_tenant_id_from_request(request)
        user_id = await get_user_id_from_request(request)
        
        # Execute the request
        response = await call_next(request)
        
        # Track the API call (async, don't block response)
        if tenant_id:
            try:
                with Session(engine) as session:
                    api_call = ApiCallLog(
                        tenant_id=tenant_id,
                        endpoint=request.url.path,
                        method=request.method,
                        user_id=user_id
                    )
                    session.add(api_call)
                    session.commit()
            except Exception as e:
                logger.error(f"Error tracking API call: {e}")
                # Don't fail the request if tracking fails
        
        return response

