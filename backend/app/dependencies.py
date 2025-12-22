from fastapi import Depends, HTTPException, status, Request
from typing import Optional
from sqlmodel import Session, select
from app.database import get_session
from app.models import User
from app.auth import decode_access_token


def get_current_user(
    request: Request,
    session: Session = Depends(get_session)
) -> User:
    """Get current authenticated user from JWT token"""
    import logging
    logger = logging.getLogger(__name__)
    
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    # Ler o header Authorization diretamente do request
    authorization = request.headers.get("Authorization") or request.headers.get("authorization")
    
    # Debug: listar todos os headers
    logger.info(f"Request headers: {dict(request.headers)}")
    logger.info(f"Authorization header: {authorization}")
    
    if not authorization:
        logger.error("No Authorization header provided")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Extrair o token do header "Bearer <token>"
    try:
        scheme, token = authorization.split(maxsplit=1)
        if scheme.lower() != "bearer":
            logger.error(f"Invalid authorization scheme: {scheme}")
            raise credentials_exception
    except ValueError:
        logger.error("Invalid Authorization header format")
        raise credentials_exception
    
    if not token:
        logger.error("No token provided in Authorization header")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    logger.info(f"Validating token: {token[:20] if len(token) > 20 else token}...")
    
    payload = decode_access_token(token)
    if payload is None:
        logger.error("Token decode failed - invalid token or signature")
        raise credentials_exception
    
    user_id_str = payload.get("sub")
    if user_id_str is None:
        logger.error("No user_id in token payload")
        raise credentials_exception
    
    # Converter user_id de string para int (já que JWT requer string)
    try:
        user_id = int(user_id_str)
    except (ValueError, TypeError):
        logger.error(f"Invalid user_id format in token: {user_id_str}")
        raise credentials_exception
    
    logger.info(f"Token valid, user_id: {user_id}")
    
    user = session.get(User, user_id)
    if user is None:
        logger.error(f"User {user_id} not found in database")
        raise credentials_exception
    
    if not user.is_active:
        logger.warning(f"User {user_id} is inactive")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is inactive"
        )
    
    logger.info(f"User authenticated: {user.email}")
    return user


def get_current_active_user(
    current_user: User = Depends(get_current_user)
) -> User:
    """Get current active user"""
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is inactive"
        )
    return current_user

