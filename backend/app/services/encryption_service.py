"""
Serviço de criptografia para credenciais de integrações
Usa Fernet (symmetric encryption) do cryptography
"""
import os
import base64
from typing import Dict, Any
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
import logging

logger = logging.getLogger(__name__)


def get_encryption_key() -> bytes:
    """
    Obtém ou gera chave de criptografia baseada em ENCRYPTION_KEY
    Se não existir, gera uma nova (apenas para desenvolvimento)
    """
    encryption_key_env = os.getenv("ENCRYPTION_KEY")
    
    if encryption_key_env:
        # Se for uma chave base64, decodifica
        try:
            return base64.urlsafe_b64decode(encryption_key_env.encode())
        except:
            # Se não for base64, usa como salt para derivar chave
            salt = encryption_key_env.encode()[:16]  # Primeiros 16 bytes como salt
            kdf = PBKDF2HMAC(
                algorithm=hashes.SHA256(),
                length=32,
                salt=salt,
                iterations=100000,
            )
            return base64.urlsafe_b64encode(kdf.derive(encryption_key_env.encode()))
    else:
        # Para desenvolvimento: gera uma chave fixa baseada em um valor padrão
        # EM PRODUÇÃO, SEMPRE defina ENCRYPTION_KEY
        logger.warning("ENCRYPTION_KEY não definida. Usando chave de desenvolvimento.")
        default_key = "tyr-crm-default-encryption-key-change-in-production"
        salt = default_key.encode()[:16]
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=100000,
        )
        return base64.urlsafe_b64encode(kdf.derive(default_key.encode()))


def get_fernet() -> Fernet:
    """Retorna instância Fernet com a chave de criptografia"""
    key = get_encryption_key()
    # Garantir que a chave tem 32 bytes (Fernet requer)
    if len(key) != 44:  # Base64 de 32 bytes = 44 caracteres
        # Se não for base64 válido, derivar novamente
        key = base64.urlsafe_b64encode(key[:32].ljust(32, b'0'))
    return Fernet(key)


def encrypt_credentials(credentials: Dict[str, Any]) -> str:
    """
    Criptografa um dicionário de credenciais
    
    Args:
        credentials: Dicionário com credenciais (ex: {"api_key": "...", "secret": "..."})
    
    Returns:
        String base64 com credenciais criptografadas
    """
    try:
        import json
        # Serializar para JSON
        credentials_json = json.dumps(credentials)
        # Criptografar
        fernet = get_fernet()
        encrypted = fernet.encrypt(credentials_json.encode())
        # Retornar como string base64
        return encrypted.decode()
    except Exception as e:
        logger.error(f"Erro ao criptografar credenciais: {e}")
        raise ValueError(f"Falha ao criptografar credenciais: {str(e)}")


def decrypt_credentials(encrypted_credentials: str) -> Dict[str, Any]:
    """
    Descriptografa credenciais
    
    Args:
        encrypted_credentials: String base64 com credenciais criptografadas
    
    Returns:
        Dicionário com credenciais descriptografadas
    """
    try:
        import json
        # Descriptografar
        fernet = get_fernet()
        decrypted = fernet.decrypt(encrypted_credentials.encode())
        # Deserializar JSON
        return json.loads(decrypted.decode())
    except Exception as e:
        logger.error(f"Erro ao descriptografar credenciais: {e}")
        raise ValueError(f"Falha ao descriptografar credenciais: {str(e)}")




