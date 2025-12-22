from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from app.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash"""
    # Bcrypt has a 72 byte limit, so we need to truncate if necessary
    password_bytes = plain_password.encode('utf-8')
    if len(password_bytes) > 72:
        password_bytes = password_bytes[:72]
        plain_password = password_bytes.decode('utf-8', errors='ignore')
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hash a password"""
    # Bcrypt has a 72 byte limit, so we need to truncate if necessary
    # Convert to bytes and truncate to 72 bytes max
    password_bytes = password.encode('utf-8')
    if len(password_bytes) > 72:
        password_bytes = password_bytes[:72]
        password = password_bytes.decode('utf-8', errors='ignore')
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)
    return encoded_jwt


def decode_access_token(token: str) -> Optional[dict]:
    """Decode and verify a JWT token"""
    import logging
    logger = logging.getLogger(__name__)
    
    try:
        logger.info(f"Attempting to decode token with algorithm: {settings.algorithm}")
        logger.info(f"Token length: {len(token)}")
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        logger.info(f"Token decoded successfully. Payload keys: {payload.keys()}")
        return payload
    except JWTError as e:
        logger.error(f"JWT decode error: {type(e).__name__}: {str(e)}")
        # Log mais detalhes sobre o erro
        if "expired" in str(e).lower():
            logger.error("Token has expired")
        elif "signature" in str(e).lower():
            logger.error("Token signature verification failed - secret_key may be incorrect")
        return None
    except Exception as e:
        logger.error(f"Unexpected error decoding token: {type(e).__name__}: {str(e)}")
        return None

