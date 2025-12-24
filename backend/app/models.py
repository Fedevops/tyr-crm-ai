from sqlmodel import SQLModel, Field, Relationship
from typing import Optional, List
from datetime import datetime
from enum import Enum
from pydantic import field_validator


class UserRole(str, Enum):
    ADMIN = "admin"
    SDR = "sdr"
    MANAGER = "manager"


class UserBase(SQLModel):
    email: str = Field(unique=True, index=True)
    full_name: str
    is_active: bool = True
    role: UserRole = UserRole.SDR


class User(UserBase, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    hashed_password: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    tenant: Optional["Tenant"] = Relationship(back_populates="users")


class UserCreate(SQLModel):
    email: str
    password: str
    full_name: str
    tenant_name: str  # Para criar tenant junto
    
    @field_validator('password')
    @classmethod
    def validate_password(cls, v: str) -> str:
        if not v:
            raise ValueError('Password cannot be empty')
        # Bcrypt has a 72 byte limit
        password_bytes = v.encode('utf-8')
        if len(password_bytes) > 72:
            raise ValueError('Password is too long. Maximum length is 72 characters.')
        if len(v) < 6:
            raise ValueError('Password must be at least 6 characters long')
        return v


class UserLogin(SQLModel):
    email: str
    password: str


class UserResponse(SQLModel):
    id: int
    email: str
    full_name: str
    role: UserRole
    tenant_id: int
    is_active: bool


class Tenant(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(unique=True, index=True)
    company_name: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    users: List[User] = Relationship(back_populates="tenant")
    company_profile: Optional["CompanyProfile"] = Relationship(back_populates="tenant")
    playbooks: List["Playbook"] = Relationship(back_populates="tenant")


class CompanyProfile(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", unique=True, index=True)
    industry: Optional[str] = None
    company_size: Optional[str] = None
    icp_description: Optional[str] = None
    target_market: Optional[str] = None
    api_keys: Optional[str] = None  # JSON string com chaves de API
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    tenant: Optional[Tenant] = Relationship(back_populates="company_profile")


class CompanyProfileCreate(SQLModel):
    industry: Optional[str] = None
    company_size: Optional[str] = None
    icp_description: Optional[str] = None
    target_market: Optional[str] = None
    api_keys: Optional[str] = None


class CompanyProfileResponse(SQLModel):
    id: int
    tenant_id: int
    industry: Optional[str]
    company_size: Optional[str]
    icp_description: Optional[str]
    target_market: Optional[str]


class Playbook(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    name: str
    description: Optional[str] = None
    content: str  # Conteúdo do playbook em markdown ou texto
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    tenant: Optional[Tenant] = Relationship(back_populates="playbooks")


class PlaybookCreate(SQLModel):
    name: str
    description: Optional[str] = None
    content: str


class PlaybookResponse(SQLModel):
    id: int
    tenant_id: int
    name: str
    description: Optional[str]
    content: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class LeadStatus(str, Enum):
    NEW = "new"
    CONTACTED = "contacted"
    QUALIFIED = "qualified"
    MEETING_SCHEDULED = "meeting_scheduled"
    PROPOSAL_SENT = "proposal_sent"
    NEGOTIATION = "negotiation"
    WON = "won"
    LOST = "lost"
    NURTURING = "nurturing"


class Lead(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    position: Optional[str] = None
    website: Optional[str] = None
    linkedin_url: Optional[str] = None
    status: LeadStatus = LeadStatus.NEW
    source: Optional[str] = None  # origem do lead (website, linkedin, referral, etc)
    score: Optional[int] = Field(default=0)  # score de qualificação (0-100)
    assigned_to: Optional[int] = Field(foreign_key="user.id", default=None)  # SDR/comercial responsável
    notes: Optional[str] = None
    tags: Optional[str] = None  # JSON string com tags
    last_contact: Optional[datetime] = None
    next_followup: Optional[datetime] = None
    # Campos de enriquecimento automático
    address: Optional[str] = None  # Endereço completo
    city: Optional[str] = None  # Cidade
    state: Optional[str] = None  # Estado (sigla)
    zip_code: Optional[str] = None  # CEP
    country: Optional[str] = None  # País
    industry: Optional[str] = None  # Setor/Indústria
    company_size: Optional[str] = None  # Tamanho da empresa (ex: "50-200 funcionários")
    context: Optional[str] = None  # Contexto/resumo da empresa, dores, oportunidades
    # Campos Casa dos Dados
    razao_social: Optional[str] = None
    nome_fantasia: Optional[str] = None
    cnpj: Optional[str] = Field(default=None, unique=True, index=True)  # CNPJ único
    data_abertura: Optional[datetime] = None
    capital_social: Optional[float] = None
    situacao_cadastral: Optional[str] = None
    data_situacao_cadastral: Optional[datetime] = None
    motivo_situacao_cadastral: Optional[str] = None
    natureza_juridica: Optional[str] = None
    porte: Optional[str] = None  # ME, EPP, Grande, etc
    logradouro: Optional[str] = None
    numero: Optional[str] = None
    bairro: Optional[str] = None
    cep: Optional[str] = None
    municipio: Optional[str] = None
    uf: Optional[str] = None
    complemento: Optional[str] = None
    cnae_principal_codigo: Optional[str] = None
    cnae_principal_descricao: Optional[str] = None
    cnaes_secundarios_json: Optional[str] = None  # JSON string com lista de CNAEs secundários
    telefone_empresa: Optional[str] = None
    email_empresa: Optional[str] = None
    socios_json: Optional[str] = None  # JSON string com lista de sócios e qualificações
    simples_nacional: Optional[bool] = None  # Se está no Simples Nacional
    data_opcao_simples: Optional[datetime] = None
    data_exclusao_simples: Optional[datetime] = None
    agent_suggestion: Optional[str] = None  # Sugestão de abordagem gerada pelo agente
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    comments: List["LeadComment"] = Relationship(back_populates="lead")


class LeadCreate(SQLModel):
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    position: Optional[str] = None
    website: Optional[str] = None
    linkedin_url: Optional[str] = None
    status: Optional[LeadStatus] = LeadStatus.NEW
    source: Optional[str] = None
    score: Optional[int] = 0
    assigned_to: Optional[int] = None
    notes: Optional[str] = None
    tags: Optional[str] = None
    last_contact: Optional[datetime] = None
    next_followup: Optional[datetime] = None
    # Campos de enriquecimento automático
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    country: Optional[str] = None
    industry: Optional[str] = None
    company_size: Optional[str] = None
    context: Optional[str] = None
    # Campos Casa dos Dados
    razao_social: Optional[str] = None
    nome_fantasia: Optional[str] = None
    cnpj: Optional[str] = None
    data_abertura: Optional[datetime] = None
    capital_social: Optional[float] = None
    situacao_cadastral: Optional[str] = None
    data_situacao_cadastral: Optional[datetime] = None
    motivo_situacao_cadastral: Optional[str] = None
    natureza_juridica: Optional[str] = None
    porte: Optional[str] = None
    logradouro: Optional[str] = None
    numero: Optional[str] = None
    bairro: Optional[str] = None
    cep: Optional[str] = None
    municipio: Optional[str] = None
    uf: Optional[str] = None
    complemento: Optional[str] = None
    cnae_principal_codigo: Optional[str] = None
    cnae_principal_descricao: Optional[str] = None
    cnaes_secundarios_json: Optional[str] = None
    telefone_empresa: Optional[str] = None
    email_empresa: Optional[str] = None
    socios_json: Optional[str] = None
    simples_nacional: Optional[bool] = None
    data_opcao_simples: Optional[datetime] = None
    data_exclusao_simples: Optional[datetime] = None
    agent_suggestion: Optional[str] = None


class LeadResponse(SQLModel):
    id: int
    tenant_id: int
    name: str
    email: Optional[str]
    phone: Optional[str]
    company: Optional[str]
    position: Optional[str]
    website: Optional[str]
    linkedin_url: Optional[str]
    status: LeadStatus
    source: Optional[str]
    score: Optional[int]
    assigned_to: Optional[int]
    notes: Optional[str]
    tags: Optional[str]
    last_contact: Optional[datetime]
    next_followup: Optional[datetime]
    # Campos de enriquecimento automático
    address: Optional[str]
    city: Optional[str]
    state: Optional[str]
    zip_code: Optional[str]
    country: Optional[str]
    industry: Optional[str]
    company_size: Optional[str]
    context: Optional[str]
    # Campos Casa dos Dados
    razao_social: Optional[str]
    nome_fantasia: Optional[str]
    cnpj: Optional[str]
    data_abertura: Optional[datetime]
    capital_social: Optional[float]
    situacao_cadastral: Optional[str]
    data_situacao_cadastral: Optional[datetime]
    motivo_situacao_cadastral: Optional[str]
    natureza_juridica: Optional[str]
    porte: Optional[str]
    logradouro: Optional[str]
    numero: Optional[str]
    bairro: Optional[str]
    cep: Optional[str]
    municipio: Optional[str]
    uf: Optional[str]
    complemento: Optional[str]
    cnae_principal_codigo: Optional[str]
    cnae_principal_descricao: Optional[str]
    cnaes_secundarios_json: Optional[str]
    telefone_empresa: Optional[str]
    email_empresa: Optional[str]
    socios_json: Optional[str]
    simples_nacional: Optional[bool]
    data_opcao_simples: Optional[datetime]
    data_exclusao_simples: Optional[datetime]
    agent_suggestion: Optional[str]
    created_at: datetime
    updated_at: datetime


class AgentSuggestion(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    lead_id: Optional[int] = None
    research_data: Optional[str] = None  # JSON string
    suggested_approach: str
    playbook_used: Optional[int] = Field(foreign_key="playbook.id", default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class TaskType(str, Enum):
    EMAIL = "email"
    CALL = "call"
    LINKEDIN = "linkedin"
    MEETING = "meeting"
    FOLLOW_UP = "follow_up"
    RESEARCH = "research"
    OTHER = "other"


class TaskStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class Sequence(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    name: str
    description: Optional[str] = None
    is_active: bool = True
    steps: str  # JSON string com array de steps: [{"type": "email", "delay_days": 0, "template": "..."}, ...]
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class SequenceCreate(SQLModel):
    name: str
    description: Optional[str] = None
    is_active: bool = True
    steps: str  # JSON string


class SequenceResponse(SQLModel):
    id: int
    tenant_id: int
    name: str
    description: Optional[str]
    is_active: bool
    steps: str
    created_at: datetime
    updated_at: datetime


class Task(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    lead_id: int = Field(foreign_key="lead.id", index=True)
    sequence_id: Optional[int] = Field(foreign_key="sequence.id", default=None)
    assigned_to: Optional[int] = Field(foreign_key="user.id", default=None)
    type: TaskType
    title: str
    description: Optional[str] = None
    status: TaskStatus = TaskStatus.PENDING
    due_date: datetime
    completed_at: Optional[datetime] = None
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class TaskCreate(SQLModel):
    lead_id: int
    sequence_id: Optional[int] = None
    assigned_to: Optional[int] = None
    type: TaskType
    title: str
    description: Optional[str] = None
    due_date: datetime
    notes: Optional[str] = None


class TaskUpdate(SQLModel):
    status: Optional[TaskStatus] = None
    completed_at: Optional[datetime] = None
    notes: Optional[str] = None
    assigned_to: Optional[int] = None


class TaskResponse(SQLModel):
    id: int
    tenant_id: int
    lead_id: int
    sequence_id: Optional[int]
    assigned_to: Optional[int]
    type: TaskType
    title: str
    description: Optional[str]
    status: TaskStatus
    due_date: datetime
    completed_at: Optional[datetime]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime


class LeadComment(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    lead_id: int = Field(foreign_key="lead.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    comment: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    lead: Optional[Lead] = Relationship(back_populates="comments")
    user: Optional[User] = Relationship()


class LeadCommentCreate(SQLModel):
    comment: str


class LeadCommentResponse(SQLModel):
    id: int
    tenant_id: int
    lead_id: int
    user_id: int
    comment: str
    created_at: datetime
    updated_at: datetime
    user_name: Optional[str] = None
    user_email: Optional[str] = None