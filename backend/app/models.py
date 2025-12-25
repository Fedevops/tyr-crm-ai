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
    assigned_to: Optional[int] = Field(foreign_key="user.id", default=None)  # DEPRECATED: usar owner_id
    owner_id: Optional[int] = Field(foreign_key="user.id", index=True, default=None)  # OBRIGATÓRIO: dono do registro (opcional temporariamente para compatibilidade com leads existentes)
    created_by_id: Optional[int] = Field(foreign_key="user.id", index=True, default=None)  # OBRIGATÓRIO: quem criou (opcional temporariamente para compatibilidade com leads existentes)
    account_id: Optional[int] = Field(foreign_key="account.id", default=None)  # Opcional: empresa relacionada
    contact_id: Optional[int] = Field(foreign_key="contact.id", default=None)  # Opcional: contato relacionado
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
    assigned_to: Optional[int] = None  # DEPRECATED: usar owner_id
    owner_id: Optional[int] = None  # Se não especificado, será preenchido com created_by_id
    account_id: Optional[int] = None  # Opcional: empresa relacionada
    contact_id: Optional[int] = None  # Opcional: contato relacionado
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
    assigned_to: Optional[int]  # DEPRECATED
    owner_id: int
    created_by_id: int
    account_id: Optional[int]
    contact_id: Optional[int]
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
    assigned_to: Optional[int] = Field(foreign_key="user.id", default=None)  # DEPRECATED: usar owner_id
    owner_id: Optional[int] = Field(foreign_key="user.id", index=True, default=None)  # OBRIGATÓRIO: dono do registro (opcional temporariamente para compatibilidade)
    created_by_id: Optional[int] = Field(foreign_key="user.id", index=True, default=None)  # OBRIGATÓRIO: quem criou (opcional temporariamente para compatibilidade)
    type: TaskType
    title: str
    description: Optional[str] = None
    status: TaskStatus = TaskStatus.PENDING
    due_date: datetime
    completed_at: Optional[datetime] = None
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Relationships
    comments: List["TaskComment"] = Relationship(back_populates="task")


class TaskCreate(SQLModel):
    lead_id: int
    sequence_id: Optional[int] = None
    assigned_to: Optional[int] = None  # DEPRECATED: usar owner_id
    owner_id: Optional[int] = None  # Se não especificado, será preenchido com created_by_id
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
    assigned_to: Optional[int]  # DEPRECATED
    owner_id: int
    created_by_id: int
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


# Comentários para Opportunities
class OpportunityComment(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    opportunity_id: int = Field(foreign_key="opportunity.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    comment: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    opportunity: Optional["Opportunity"] = Relationship(back_populates="comments")
    user: Optional[User] = Relationship()


class OpportunityCommentCreate(SQLModel):
    comment: str


class OpportunityCommentResponse(SQLModel):
    id: int
    tenant_id: int
    opportunity_id: int
    user_id: int
    comment: str
    created_at: datetime
    updated_at: datetime
    user_name: Optional[str] = None
    user_email: Optional[str] = None


# Comentários para Tasks
class TaskComment(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    task_id: int = Field(foreign_key="task.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    comment: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    task: Optional["Task"] = Relationship(back_populates="comments")
    user: Optional[User] = Relationship()


class TaskCommentCreate(SQLModel):
    comment: str


class TaskCommentResponse(SQLModel):
    id: int
    tenant_id: int
    task_id: int
    user_id: int
    comment: str
    created_at: datetime
    updated_at: datetime
    user_name: Optional[str] = None
    user_email: Optional[str] = None


# Comentários para Proposals
class ProposalComment(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    proposal_id: int = Field(foreign_key="proposal.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    comment: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    proposal: Optional["Proposal"] = Relationship(back_populates="comments")
    user: Optional[User] = Relationship()


class ProposalCommentCreate(SQLModel):
    comment: str


class ProposalCommentResponse(SQLModel):
    id: int
    tenant_id: int
    proposal_id: int
    user_id: int
    comment: str
    created_at: datetime
    updated_at: datetime
    user_name: Optional[str] = None
    user_email: Optional[str] = None


# ==================== NOVOS MODELOS CRM ====================

class Account(SQLModel, table=True):
    """Empresas/Organizações"""
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    name: str  # Nome da empresa
    website: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    industry: Optional[str] = None
    company_size: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    country: Optional[str] = None
    description: Optional[str] = None
    # Campos Casa dos Dados (opcional, pode ser preenchido via enriquecimento)
    cnpj: Optional[str] = Field(default=None, unique=True, index=True)
    razao_social: Optional[str] = None
    nome_fantasia: Optional[str] = None
    # Ownership
    owner_id: int = Field(foreign_key="user.id", index=True)
    created_by_id: int = Field(foreign_key="user.id", index=True)
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Relationships
    contacts: List["Contact"] = Relationship(back_populates="account")
    opportunities: List["Opportunity"] = Relationship(back_populates="account")


class AccountCreate(SQLModel):
    name: str
    website: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    industry: Optional[str] = None
    company_size: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    country: Optional[str] = None
    description: Optional[str] = None
    cnpj: Optional[str] = None
    razao_social: Optional[str] = None
    nome_fantasia: Optional[str] = None
    owner_id: Optional[int] = None  # Se não especificado, será preenchido com created_by_id


class AccountResponse(SQLModel):
    id: int
    tenant_id: int
    name: str
    website: Optional[str]
    phone: Optional[str]
    email: Optional[str]
    industry: Optional[str]
    company_size: Optional[str]
    address: Optional[str]
    city: Optional[str]
    state: Optional[str]
    zip_code: Optional[str]
    country: Optional[str]
    description: Optional[str]
    cnpj: Optional[str]
    razao_social: Optional[str]
    nome_fantasia: Optional[str]
    owner_id: int
    created_by_id: int
    created_at: datetime
    updated_at: datetime


class Contact(SQLModel, table=True):
    """Contatos/Pessoas"""
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    account_id: Optional[int] = Field(foreign_key="account.id", default=None)  # Opcional
    first_name: str
    last_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    mobile: Optional[str] = None
    position: Optional[str] = None
    department: Optional[str] = None
    linkedin_url: Optional[str] = None
    notes: Optional[str] = None
    # Ownership
    owner_id: int = Field(foreign_key="user.id", index=True)
    created_by_id: int = Field(foreign_key="user.id", index=True)
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Relationships
    account: Optional["Account"] = Relationship(back_populates="contacts")
    opportunities: List["Opportunity"] = Relationship(back_populates="contact")


class ContactCreate(SQLModel):
    account_id: Optional[int] = None
    first_name: str
    last_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    mobile: Optional[str] = None
    position: Optional[str] = None
    department: Optional[str] = None
    linkedin_url: Optional[str] = None
    notes: Optional[str] = None
    owner_id: Optional[int] = None  # Se não especificado, será preenchido com created_by_id


class ContactResponse(SQLModel):
    id: int
    tenant_id: int
    account_id: Optional[int]
    first_name: str
    last_name: str
    email: Optional[str]
    phone: Optional[str]
    mobile: Optional[str]
    position: Optional[str]
    department: Optional[str]
    linkedin_url: Optional[str]
    notes: Optional[str]
    owner_id: int
    created_by_id: int
    created_at: datetime
    updated_at: datetime


class SalesFunnel(SQLModel, table=True):
    """Funil de Vendas Parametrizável"""
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    name: str
    description: Optional[str] = None
    is_default: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Relationships
    stages: List["SalesStage"] = Relationship(back_populates="funnel")


class SalesFunnelCreate(SQLModel):
    name: str
    description: Optional[str] = None
    is_default: Optional[bool] = False


class SalesFunnelResponse(SQLModel):
    id: int
    tenant_id: int
    name: str
    description: Optional[str]
    is_default: bool
    created_at: datetime
    updated_at: datetime


class SalesStage(SQLModel, table=True):
    """Estágios do Funil de Vendas"""
    id: Optional[int] = Field(default=None, primary_key=True)
    funnel_id: int = Field(foreign_key="salesfunnel.id", index=True)
    name: str
    description: Optional[str] = None
    order: int  # Ordem no funil (1, 2, 3, ...)
    probability: int = Field(default=0, ge=0, le=100)  # Probabilidade de fechamento (0-100)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Relationships
    funnel: Optional["SalesFunnel"] = Relationship(back_populates="stages")
    opportunities: List["Opportunity"] = Relationship(back_populates="stage")


class SalesStageCreate(SQLModel):
    funnel_id: Optional[int] = None  # Opcional: vem do path parameter
    name: str
    description: Optional[str] = None
    order: int
    probability: int = Field(default=0, ge=0, le=100)


class SalesStageResponse(SQLModel):
    id: int
    funnel_id: int
    name: str
    description: Optional[str]
    order: int
    probability: int
    created_at: datetime
    updated_at: datetime


class OpportunityStatus(str, Enum):
    OPEN = "open"
    WON = "won"
    LOST = "lost"
    ON_HOLD = "on_hold"


class Opportunity(SQLModel, table=True):
    """Oportunidades de Negócio"""
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    account_id: int = Field(foreign_key="account.id", index=True)
    contact_id: Optional[int] = Field(foreign_key="contact.id", default=None)
    stage_id: int = Field(foreign_key="salesstage.id", index=True)
    name: str  # Nome da oportunidade
    description: Optional[str] = None
    amount: Optional[float] = None  # Valor da oportunidade
    currency: str = Field(default="BRL")
    expected_close_date: Optional[datetime] = None
    actual_close_date: Optional[datetime] = None
    status: OpportunityStatus = OpportunityStatus.OPEN
    probability: Optional[int] = Field(default=None, ge=0, le=100)  # Pode sobrescrever a do stage
    notes: Optional[str] = None
    # Ownership
    owner_id: int = Field(foreign_key="user.id", index=True)
    created_by_id: int = Field(foreign_key="user.id", index=True)
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Relationships
    account: Optional["Account"] = Relationship(back_populates="opportunities")
    contact: Optional["Contact"] = Relationship(back_populates="opportunities")
    stage: Optional["SalesStage"] = Relationship(back_populates="opportunities")
    proposals: List["Proposal"] = Relationship(back_populates="opportunity")
    comments: List["OpportunityComment"] = Relationship(back_populates="opportunity")


class OpportunityCreate(SQLModel):
    account_id: int
    contact_id: Optional[int] = None
    stage_id: int
    name: str
    description: Optional[str] = None
    amount: Optional[float] = None
    currency: Optional[str] = "BRL"
    expected_close_date: Optional[datetime] = None
    probability: Optional[int] = Field(default=None, ge=0, le=100)
    notes: Optional[str] = None
    owner_id: Optional[int] = None  # Se não especificado, será preenchido com created_by_id


class OpportunityResponse(SQLModel):
    id: int
    tenant_id: int
    account_id: int
    contact_id: Optional[int]
    stage_id: int
    name: str
    description: Optional[str]
    amount: Optional[float]
    currency: str
    expected_close_date: Optional[datetime]
    actual_close_date: Optional[datetime]
    status: OpportunityStatus
    probability: Optional[int]
    notes: Optional[str]
    owner_id: int
    created_by_id: int
    created_at: datetime
    updated_at: datetime


class ProposalStatus(str, Enum):
    DRAFT = "draft"
    SENT = "sent"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    EXPIRED = "expired"


class Proposal(SQLModel, table=True):
    """Propostas Comerciais"""
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    opportunity_id: int = Field(foreign_key="opportunity.id", index=True)
    title: str
    content: str  # Conteúdo da proposta (texto ou HTML)
    amount: float
    currency: str = Field(default="BRL")
    valid_until: Optional[datetime] = None
    status: ProposalStatus = ProposalStatus.DRAFT
    sent_at: Optional[datetime] = None
    accepted_at: Optional[datetime] = None
    rejected_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    notes: Optional[str] = None
    # Ownership
    owner_id: int = Field(foreign_key="user.id", index=True)
    created_by_id: int = Field(foreign_key="user.id", index=True)
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Relationships
    opportunity: Optional["Opportunity"] = Relationship(back_populates="proposals")
    comments: List["ProposalComment"] = Relationship(back_populates="proposal")


class ProposalCreate(SQLModel):
    opportunity_id: int
    title: str
    content: str
    amount: float
    currency: Optional[str] = "BRL"
    valid_until: Optional[datetime] = None
    notes: Optional[str] = None
    owner_id: Optional[int] = None  # Se não especificado, será preenchido com created_by_id


class ProposalResponse(SQLModel):
    id: int
    tenant_id: int
    opportunity_id: int
    title: str
    content: str
    amount: float
    currency: str
    valid_until: Optional[datetime]
    status: ProposalStatus
    sent_at: Optional[datetime]
    accepted_at: Optional[datetime]
    rejected_at: Optional[datetime]
    rejection_reason: Optional[str]
    notes: Optional[str]
    owner_id: int
    created_by_id: int
    created_at: datetime
    updated_at: datetime


class AuditAction(str, Enum):
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"
    ASSIGN = "assign"
    STATUS_CHANGE = "status_change"
    STAGE_CHANGE = "stage_change"
    CONVERT = "convert"


class AuditLog(SQLModel, table=True):
    """Sistema de Auditoria"""
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)  # Quem fez a ação
    entity_type: str  # Lead, Account, Contact, Opportunity, Proposal, Task, etc.
    entity_id: int
    action: AuditAction
    field_name: Optional[str] = None  # Campo alterado (para UPDATE)
    old_value: Optional[str] = None  # Valor antigo
    new_value: Optional[str] = None  # Valor novo
    metadata_json: Optional[str] = Field(default=None, description="JSON string com dados adicionais")  # Renomeado para evitar conflito com SQLAlchemy.metadata
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Relationships
    user: Optional[User] = Relationship()


class AuditLogResponse(SQLModel):
    id: int
    tenant_id: int
    user_id: int
    entity_type: str
    entity_id: int
    action: AuditAction
    field_name: Optional[str]
    old_value: Optional[str]
    new_value: Optional[str]
    metadata_json: Optional[str]
    created_at: datetime
    user_name: Optional[str] = None
    user_email: Optional[str] = None


# ==================== KPI / GOALS MODELS ====================

class GoalMetricType(str, Enum):
    TASKS_COMPLETED = "tasks_completed"
    LEADS_CREATED = "leads_created"
    REVENUE_GENERATED = "revenue_generated"
    CALLS_MADE = "calls_made"


class GoalPeriod(str, Enum):
    MONTHLY = "monthly"
    WEEKLY = "weekly"


class GoalStatus(str, Enum):
    ON_TRACK = "on_track"
    AT_RISK = "at_risk"
    COMPLETED = "completed"


class Goal(SQLModel, table=True):
    """Metas de Performance (KPIs)"""
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    title: str
    metric_type: GoalMetricType
    target_value: float
    current_value: float = Field(default=0.0)
    period: GoalPeriod
    status: GoalStatus = Field(default=GoalStatus.ON_TRACK)
    is_visible_on_wallboard: bool = Field(default=False)
    period_start: datetime
    period_end: datetime
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class GoalCreate(SQLModel):
    title: str
    metric_type: GoalMetricType
    target_value: float
    period: GoalPeriod
    is_visible_on_wallboard: bool = False


class GoalUpdate(SQLModel):
    title: Optional[str] = None
    target_value: Optional[float] = None
    period: Optional[GoalPeriod] = None
    is_visible_on_wallboard: Optional[bool] = None


class GoalResponse(SQLModel):
    id: int
    tenant_id: int
    user_id: int
    title: str
    metric_type: str
    target_value: float
    current_value: float
    period: str
    status: str
    is_visible_on_wallboard: bool
    period_start: datetime
    period_end: datetime
    created_at: datetime
    updated_at: datetime


class ActivityLog(SQLModel, table=True):
    """Log de Atividades para Rastreamento de KPIs"""
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    metric_type: GoalMetricType
    value: float
    entity_type: Optional[str] = None  # 'Task', 'Opportunity', 'Lead', etc.
    entity_id: Optional[int] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ActivityLogResponse(SQLModel):
    id: int
    tenant_id: int
    user_id: int
    metric_type: str
    value: float
    entity_type: Optional[str]
    entity_id: Optional[int]
    created_at: datetime


class TrackActivityRequest(SQLModel):
    metric_type: GoalMetricType
    value: float
    entity_type: Optional[str] = None
    entity_id: Optional[int] = None