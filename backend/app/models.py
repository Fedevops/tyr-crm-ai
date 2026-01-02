from sqlmodel import SQLModel, Field, Relationship, Column, JSON
from typing import Optional, List, Dict
from datetime import datetime
from enum import Enum
from pydantic import field_validator
import uuid


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
    # Campos do LinkedIn para enriquecimento e geração de notas customizadas
    linkedin_headline: Optional[str] = None  # Título profissional (ex: "Especialista Backend | 10+ anos | Python, Django, FastAPI")
    linkedin_about: Optional[str] = None  # Texto completo do "Sobre"
    linkedin_experience_json: Optional[str] = None  # JSON com histórico profissional
    linkedin_education_json: Optional[str] = None  # JSON com histórico educacional
    linkedin_certifications_json: Optional[str] = None  # JSON com certificações
    linkedin_skills: Optional[str] = None  # Lista de habilidades (string separada por vírgula ou JSON)
    linkedin_articles_json: Optional[str] = None  # JSON com artigos/publicações
    linkedin_recent_activity: Optional[str] = None  # Texto resumido das atividades recentes
    linkedin_connections_count: Optional[int] = None  # Número de conexões
    linkedin_followers_count: Optional[int] = None  # Número de seguidores
    linkedin_summary: Optional[str] = None  # Resumo gerado pela IA com insights principais
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
    # Campos de Qualificação ICP (Ideal Customer Profile)
    tech_stack: Optional[str] = None  # Stack tecnológico usado pela empresa
    is_hiring: Optional[bool] = Field(default=False)  # Se a empresa está contratando
    is_advertising: Optional[bool] = Field(default=False)  # Se a empresa está fazendo publicidade
    icp_score: Optional[int] = Field(default=0)  # Score de qualificação ICP (0-5)
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
    custom_attributes: Optional[Dict] = Field(default=None, sa_column=Column(JSON))  # Campos customizados
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
    # Campos do LinkedIn
    linkedin_headline: Optional[str] = None
    linkedin_about: Optional[str] = None
    linkedin_experience_json: Optional[str] = None
    linkedin_education_json: Optional[str] = None
    linkedin_certifications_json: Optional[str] = None
    linkedin_skills: Optional[str] = None
    linkedin_articles_json: Optional[str] = None
    linkedin_recent_activity: Optional[str] = None
    linkedin_connections_count: Optional[int] = None
    linkedin_followers_count: Optional[int] = None
    linkedin_summary: Optional[str] = None
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
    # Campos de Qualificação ICP
    tech_stack: Optional[str] = None
    is_hiring: Optional[bool] = False
    is_advertising: Optional[bool] = False
    icp_score: Optional[int] = 0
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
    # Campos do LinkedIn
    linkedin_headline: Optional[str]
    linkedin_about: Optional[str]
    linkedin_experience_json: Optional[str]
    linkedin_education_json: Optional[str]
    linkedin_certifications_json: Optional[str]
    linkedin_skills: Optional[str]
    linkedin_articles_json: Optional[str]
    linkedin_recent_activity: Optional[str]
    linkedin_connections_count: Optional[int]
    linkedin_followers_count: Optional[int]
    linkedin_summary: Optional[str]
    status: LeadStatus
    source: Optional[str]
    score: Optional[int]
    assigned_to: Optional[int]  # DEPRECATED
    owner_id: Optional[int]
    created_by_id: Optional[int]
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
    # Campos de Qualificação ICP
    tech_stack: Optional[str]
    is_hiring: Optional[bool]
    is_advertising: Optional[bool]
    icp_score: Optional[int]
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
    custom_attributes: Optional[Dict] = None
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
    default_start_date: Optional[datetime] = None  # Data de início padrão para a primeira tarefa
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class SequenceCreate(SQLModel):
    name: str
    description: Optional[str] = None
    is_active: bool = True
    steps: str  # JSON string
    default_start_date: Optional[datetime] = None  # Data de início padrão para a primeira tarefa


class SequenceResponse(SQLModel):
    id: int
    tenant_id: int
    name: str
    description: Optional[str]
    is_active: bool
    steps: str
    default_start_date: Optional[datetime] = None
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
    owner_id: Optional[int]
    created_by_id: Optional[int]
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
    orders: List["Order"] = Relationship()


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
    custom_attributes: Optional[Dict] = None
    owner_id: int
    created_by_id: int
    created_at: datetime
    updated_at: datetime
    # Estatísticas
    orders_count: Optional[int] = 0
    total_orders_value: Optional[float] = 0.0


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
    custom_attributes: Optional[Dict] = None
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
    custom_attributes: Optional[Dict] = None
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


class ProposalTemplate(SQLModel, table=True):
    """Templates de Proposta Comercial"""
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    name: str
    description: Optional[str] = None
    html_content: str = Field(description="HTML do template com placeholders (ex: {{company_name}}, {{amount}})")
    available_fields: Optional[str] = Field(default=None, description="JSON string com lista de campos disponíveis")
    is_active: bool = Field(default=True)
    # Ownership
    owner_id: int = Field(foreign_key="user.id", index=True)
    created_by_id: int = Field(foreign_key="user.id", index=True)
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Relationships
    proposals: List["Proposal"] = Relationship(back_populates="template")


class ProposalTemplateCreate(SQLModel):
    name: str
    description: Optional[str] = None
    html_content: str
    available_fields: Optional[str] = None  # JSON string
    is_active: Optional[bool] = True
    owner_id: Optional[int] = None


class ProposalTemplateUpdate(SQLModel):
    name: Optional[str] = None
    description: Optional[str] = None
    html_content: Optional[str] = None
    available_fields: Optional[str] = None
    is_active: Optional[bool] = None


class ProposalTemplateResponse(SQLModel):
    id: int
    tenant_id: int
    name: str
    description: Optional[str]
    html_content: str
    available_fields: Optional[str]
    is_active: bool
    owner_id: int
    created_by_id: int
    created_at: datetime
    updated_at: datetime


class Proposal(SQLModel, table=True):
    """Propostas Comerciais"""
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    opportunity_id: int = Field(foreign_key="opportunity.id", index=True)
    template_id: Optional[int] = Field(foreign_key="proposaltemplate.id", default=None, index=True)
    title: str
    content: str  # Conteúdo da proposta (texto ou HTML) - gerado a partir do template
    template_data: Optional[str] = Field(default=None, description="JSON string com dados usados para preencher o template")
    items: Optional[str] = Field(default=None, description="JSON string com array de itens da proposta")
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
    template: Optional["ProposalTemplate"] = Relationship(back_populates="proposals")
    comments: List["ProposalComment"] = Relationship(back_populates="proposal")
    orders: List["Order"] = Relationship(back_populates="proposal")


class ProposalCreate(SQLModel):
    opportunity_id: int
    template_id: Optional[int] = None
    title: str
    content: Optional[str] = None  # Opcional: será gerado do template se template_id for fornecido
    template_data: Optional[str] = None  # JSON string com dados para preencher o template
    items: Optional[str] = None  # JSON string com array de itens: [{item_id, quantity, unit_price, subtotal}]
    amount: float
    currency: Optional[str] = "BRL"
    valid_until: Optional[datetime] = None
    notes: Optional[str] = None
    owner_id: Optional[int] = None  # Se não especificado, será preenchido com created_by_id


class ProposalUpdate(SQLModel):
    title: Optional[str] = None
    content: Optional[str] = None
    template_data: Optional[str] = None
    items: Optional[str] = None  # JSON string com array de itens
    amount: Optional[float] = None
    currency: Optional[str] = None
    valid_until: Optional[datetime] = None
    status: Optional[ProposalStatus] = None
    notes: Optional[str] = None


class ProposalResponse(SQLModel):
    id: int
    tenant_id: int
    opportunity_id: int
    template_id: Optional[int]
    title: str
    content: str
    template_data: Optional[str]
    items: Optional[str]  # JSON string com array de itens
    amount: float
    currency: str
    valid_until: Optional[datetime]
    status: ProposalStatus
    sent_at: Optional[datetime]
    accepted_at: Optional[datetime]
    rejected_at: Optional[datetime]
    rejection_reason: Optional[str]
    notes: Optional[str]
    custom_attributes: Optional[Dict] = None
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
    MEETINGS_SCHEDULED = "meetings_scheduled"
    MEETINGS_COMPLETED = "meetings_completed"


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


# ==================== LIVE PULSE MODELS ====================

class VisitorStatus(str, Enum):
    NAVIGATING = "navigating"
    IN_CHAT = "in_chat"
    IDLE = "idle"


class Visitor(SQLModel, table=True):
    """Visitantes rastreados em tempo real"""
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    visitor_id: str = Field(unique=True, index=True)  # UUID único do visitante
    ip: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    city: Optional[str] = None
    country: Optional[str] = None
    current_page: Optional[str] = None
    duration: int = Field(default=0)  # Tempo em segundos
    status: VisitorStatus = Field(default=VisitorStatus.NAVIGATING)
    name: Optional[str] = None
    email: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    last_activity_at: datetime = Field(default_factory=datetime.utcnow)


class VisitorCreate(SQLModel):
    visitor_id: Optional[str] = None  # Se não fornecido, será gerado
    ip: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    city: Optional[str] = None
    country: Optional[str] = None
    current_page: Optional[str] = None


class VisitorUpdate(SQLModel):
    current_page: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    name: Optional[str] = None
    email: Optional[str] = None


class VisitorResponse(SQLModel):
    id: int
    tenant_id: int
    visitor_id: str
    ip: Optional[str]
    latitude: Optional[float]
    longitude: Optional[float]
    city: Optional[str]
    country: Optional[str]
    current_page: Optional[str]
    duration: int
    status: str
    name: Optional[str]
    email: Optional[str]
    created_at: datetime
    updated_at: datetime
    last_activity_at: datetime


class ChatMessageSenderType(str, Enum):
    VISITOR = "visitor"
    OPERATOR = "operator"


class ChatMessage(SQLModel, table=True):
    """Mensagens do chat em tempo real"""
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    visitor_id: str = Field(foreign_key="visitor.visitor_id", index=True)
    sender_type: ChatMessageSenderType
    user_id: Optional[int] = Field(foreign_key="user.id", default=None)  # Se operador
    message: str
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ChatMessageCreate(SQLModel):
    message: str


class ChatMessageResponse(SQLModel):
    id: int
    tenant_id: int
    visitor_id: str
    sender_type: str
    user_id: Optional[int]
    message: str
    created_at: datetime
    user_name: Optional[str] = None
    user_email: Optional[str] = None


class ConvertToLeadRequest(SQLModel):
    name: str
    email: str
    phone: Optional[str] = None
    company: Optional[str] = None
    notes: Optional[str] = None


# ==================== VISIT REPORTS ====================

class VisitReport(SQLModel, table=True):
    """Relatório de visita após o visitante sair do site"""
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    visitor_id: str = Field(index=True)  # Referência ao visitor_id (não FK para permitir histórico)
    ip: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    city: Optional[str] = None
    country: Optional[str] = None
    name: Optional[str] = None
    email: Optional[str] = None
    pages_visited: List[str] = Field(default_factory=list, sa_column=Column(JSON))  # Lista de páginas visitadas
    total_duration: int = Field(default=0)  # Duração total em segundos
    chat_initiated: bool = Field(default=False)  # Se iniciou chat
    messages_count: int = Field(default=0)  # Número de mensagens trocadas
    converted_to_lead: bool = Field(default=False)  # Se foi convertido em lead
    lead_id: Optional[int] = Field(foreign_key="lead.id", default=None)
    started_at: datetime = Field(default_factory=datetime.utcnow)
    ended_at: datetime = Field(default_factory=datetime.utcnow)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class VisitReportCreate(SQLModel):
    visitor_id: str
    pages_visited: List[str] = Field(default_factory=list)
    total_duration: int
    chat_initiated: bool = False
    messages_count: int = 0
    converted_to_lead: bool = False
    lead_id: Optional[int] = None


class VisitReportResponse(SQLModel):
    id: int
    tenant_id: int
    visitor_id: str
    ip: Optional[str]
    latitude: Optional[float]
    longitude: Optional[float]
    city: Optional[str]
    country: Optional[str]
    name: Optional[str]
    email: Optional[str]
    pages_visited: List[str]
    total_duration: int
    chat_initiated: bool
    messages_count: int
    converted_to_lead: bool
    lead_id: Optional[int]
    started_at: datetime
    ended_at: datetime
    created_at: datetime


# ==================== CATALOG MODELS ====================

class ItemType(str, Enum):
    PRODUCT = "product"
    SERVICE = "service"


class StockTransactionType(str, Enum):
    IN = "in"  # Entrada de estoque
    OUT = "out"  # Saída de estoque
    ADJUSTMENT = "adjustment"  # Ajuste manual
    SALE = "sale"  # Venda (saída por proposta)
    RETURN = "return"  # Devolução


class Item(SQLModel, table=True):
    """Produtos e Serviços do Catálogo"""
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    name: str
    sku: Optional[str] = None  # Código único por tenant
    description: Optional[str] = None
    image_url: Optional[str] = None  # URL da imagem do produto
    type: ItemType
    cost_price: Optional[float] = None  # Preço de custo
    unit_price: float  # Preço de venda
    currency: str = Field(default="BRL")
    track_stock: bool = Field(default=False)
    stock_quantity: Optional[int] = None  # null para serviços
    low_stock_threshold: Optional[int] = None  # Limite para alerta de estoque baixo
    # Ownership
    owner_id: int = Field(foreign_key="user.id", index=True)
    created_by_id: int = Field(foreign_key="user.id", index=True)
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Relationships
    stock_transactions: List["StockTransaction"] = Relationship(back_populates="item")


class ItemCreate(SQLModel):
    name: str
    sku: Optional[str] = None
    description: Optional[str] = None
    image_url: Optional[str] = None
    type: ItemType
    cost_price: Optional[float] = None
    unit_price: float
    currency: Optional[str] = "BRL"
    track_stock: Optional[bool] = False
    stock_quantity: Optional[int] = None
    low_stock_threshold: Optional[int] = None
    owner_id: Optional[int] = None


class ItemUpdate(SQLModel):
    name: Optional[str] = None
    sku: Optional[str] = None
    description: Optional[str] = None
    image_url: Optional[str] = None
    type: Optional[ItemType] = None
    cost_price: Optional[float] = None
    unit_price: Optional[float] = None
    currency: Optional[str] = None
    track_stock: Optional[bool] = None
    stock_quantity: Optional[int] = None
    low_stock_threshold: Optional[int] = None


class ItemResponse(SQLModel):
    id: int
    tenant_id: int
    name: str
    sku: Optional[str]
    description: Optional[str]
    image_url: Optional[str]
    type: ItemType
    cost_price: Optional[float]
    unit_price: float
    currency: str
    track_stock: bool
    stock_quantity: Optional[int]
    low_stock_threshold: Optional[int]
    custom_attributes: Optional[Dict] = None
    owner_id: int
    created_by_id: int
    created_at: datetime
    updated_at: datetime
    margin_percentage: Optional[float] = None  # Calculado: ((unit_price - cost_price) / cost_price * 100) se cost_price disponível


class StockTransaction(SQLModel, table=True):
    """Log de transações de estoque"""
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    item_id: int = Field(foreign_key="item.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)  # Quem alterou
    transaction_type: StockTransactionType
    quantity_change: int  # Positivo para entrada, negativo para saída
    previous_quantity: int
    new_quantity: int
    reason: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Relationships
    item: Optional[Item] = Relationship(back_populates="stock_transactions")
    user: Optional[User] = Relationship()


class StockTransactionCreate(SQLModel):
    quantity_change: int
    transaction_type: StockTransactionType
    reason: Optional[str] = None


class StockTransactionResponse(SQLModel):
    id: int
    tenant_id: int
    item_id: int
    user_id: int
    transaction_type: StockTransactionType
    quantity_change: int
    previous_quantity: int
    new_quantity: int
    reason: Optional[str]
    created_at: datetime
    user_name: Optional[str] = None
    user_email: Optional[str] = None


# ==================== USAGE & LIMITS MODELS ====================

class PlanType(str, Enum):
    STARTER = "starter"
    PROFESSIONAL = "professional"
    ENTERPRISE = "enterprise"


class PlanLimitDefaults(SQLModel, table=True):
    """Limites padrão por tipo de plano (configurável)"""
    id: Optional[int] = Field(default=None, primary_key=True)
    plan_type: PlanType = Field(unique=True, index=True)
    max_leads: int = Field(default=100)
    max_users: int = Field(default=3)
    max_items: int = Field(default=50)
    max_api_calls: int = Field(default=1000)  # Por mês
    max_tokens: int = Field(default=100000)  # Tokens LLM por mês
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class TenantLimit(SQLModel, table=True):
    """Limites de uso por Tenant"""
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", unique=True, index=True)
    plan_type: PlanType = Field(default=PlanType.STARTER)
    max_leads: int = Field(default=100)
    max_users: int = Field(default=3)
    max_items: int = Field(default=50)
    max_api_calls: int = Field(default=1000)  # Por mês
    max_tokens: int = Field(default=100000)  # Tokens LLM por mês
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class ApiCallLog(SQLModel, table=True):
    """Log de chamadas de API para tracking de uso"""
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    endpoint: str
    method: str  # GET, POST, PUT, DELETE, etc.
    user_id: Optional[int] = Field(foreign_key="user.id", default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)


class LLMTokenUsage(SQLModel, table=True):
    """Log de uso de tokens LLM para tracking"""
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    user_id: Optional[int] = Field(foreign_key="user.id", default=None, index=True)
    provider: str  # "openai" ou "ollama"
    model: str  # Nome do modelo usado
    prompt_tokens: int = Field(default=0)  # Tokens do prompt
    completion_tokens: int = Field(default=0)  # Tokens da resposta
    total_tokens: int = Field(default=0)  # Total de tokens
    endpoint: Optional[str] = None  # Endpoint que gerou o uso (ex: /api/leads/generate-insight)
    feature: Optional[str] = None  # Feature usada (ex: "insight_generation", "linkedin_message")
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)


# ==================== NOTIFICATIONS MODELS ====================

class NotificationType(str, Enum):
    """Tipos de notificação"""
    TASK_DUE_TODAY = "task_due_today"
    TASK_OVERDUE = "task_overdue"
    APPOINTMENT_TODAY = "appointment_today"
    APPOINTMENT_UPCOMING = "appointment_upcoming"
    LIMIT_WARNING = "limit_warning"
    LIMIT_EXCEEDED = "limit_exceeded"
    EMAIL_RECEIVED = "email_received"
    SYSTEM_ALERT = "system_alert"


class Notification(SQLModel, table=True):
    """Notificações para usuários"""
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    type: NotificationType
    title: str
    message: str
    is_read: bool = Field(default=False, index=True)
    action_url: Optional[str] = None  # URL para ação relacionada (ex: /tasks/123)
    metadata_json: Optional[Dict] = Field(default=None, sa_column=Column(JSON))  # Dados extras (ex: task_id, appointment_id)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    read_at: Optional[datetime] = None


class NotificationResponse(SQLModel):
    id: int
    tenant_id: int
    user_id: int
    type: str
    title: str
    message: str
    is_read: bool
    action_url: Optional[str] = None
    metadata_json: Optional[Dict] = None
    created_at: datetime
    read_at: Optional[datetime] = None


# ==================== CHAT & KNOWLEDGE BASE MODELS ====================

class KnowledgeBaseEntry(SQLModel, table=True):
    """Entradas da base de conhecimento sobre funcionalidades"""
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    title: str  # Título da funcionalidade
    content: str  # Descrição detalhada
    category: str  # Categoria (ex: "leads", "tasks", "appointments")
    keywords: Optional[str] = None  # Palavras-chave para busca
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class AssistantChatMessage(SQLModel, table=True):
    """Mensagens do chat com o assistente virtual"""
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    user_id: int = Field(foreign_key="user.id", index=True)
    message: str  # Mensagem do usuário
    response: str  # Resposta do assistente
    context_used_json: Optional[Dict] = Field(default=None, sa_column=Column(JSON))  # Contexto RAG usado
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)


class AssistantChatMessageCreate(SQLModel):
    message: str


class AssistantChatMessageResponse(SQLModel):
    id: int
    message: str
    response: str
    context_used_json: Optional[Dict] = None
    created_at: datetime


# ==================== ORDERS MODELS ====================

class OrderStatus(str, Enum):
    PENDING = "pending"        # Aguardando processamento
    PROCESSING = "processing"   # Em processamento
    COMPLETED = "completed"    # Finalizado (estoque decrementado)
    CANCELLED = "cancelled"    # Cancelado
    SHIPPED = "shipped"        # Enviado (opcional)


class Order(SQLModel, table=True):
    """Pedidos de Venda"""
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    proposal_id: Optional[int] = Field(foreign_key="proposal.id", default=None, index=True)
    contact_id: Optional[int] = Field(foreign_key="contact.id", default=None, index=True)  # Contato principal
    account_id: Optional[int] = Field(foreign_key="account.id", default=None, index=True)  # Conta/Empresa
    customer_name: str  # Nome completo do cliente (backup/display)
    customer_email: Optional[str] = None  # Email (backup/display)
    customer_phone: Optional[str] = None  # Telefone (backup/display)
    status: OrderStatus = Field(default=OrderStatus.PENDING)
    total_amount: float
    currency: str = Field(default="BRL")
    notes: Optional[str] = None
    # Ownership
    owner_id: int = Field(foreign_key="user.id", index=True)
    created_by_id: int = Field(foreign_key="user.id", index=True)
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Relationships
    items: List["OrderItem"] = Relationship(back_populates="order")
    status_history: List["OrderStatusHistory"] = Relationship(back_populates="order")
    proposal: Optional["Proposal"] = Relationship(back_populates="orders")
    contact: Optional["Contact"] = Relationship()
    account: Optional["Account"] = Relationship()


class OrderItem(SQLModel, table=True):
    """Itens de um Pedido"""
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    order_id: int = Field(foreign_key="order.id", index=True)
    item_id: int = Field(foreign_key="item.id", index=True)
    quantity: int
    unit_price: float  # Preço no momento da venda
    subtotal: float  # quantity * unit_price
    
    # Relationships
    order: Optional[Order] = Relationship(back_populates="items")
    item: Optional[Item] = Relationship()


class OrderStatusHistory(SQLModel, table=True):
    """Histórico de mudanças de status de pedidos"""
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    order_id: int = Field(foreign_key="order.id", index=True)
    status: OrderStatus
    notes: Optional[str] = None  # Notas sobre a mudança
    changed_by_id: int = Field(foreign_key="user.id", index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Relationships
    order: Optional[Order] = Relationship(back_populates="status_history")
    changed_by: Optional[User] = Relationship()


# Pydantic Models for Orders

class OrderItemCreate(SQLModel):
    item_id: int
    quantity: int
    unit_price: Optional[float] = None  # Se não fornecido, usa preço do item


class OrderCreate(SQLModel):
    contact_id: Optional[int] = None  # ID do contato (prioritário)
    account_id: Optional[int] = None  # ID da conta (opcional, pode vir do contato)
    customer_name: Optional[str] = None  # Nome completo (backup se não tiver contato)
    customer_email: Optional[str] = None
    customer_phone: Optional[str] = None
    proposal_id: Optional[int] = None
    items: List[OrderItemCreate]
    notes: Optional[str] = None
    currency: str = Field(default="BRL")
    owner_id: Optional[int] = None  # Se não especificado, será preenchido com created_by_id


class OrderUpdate(SQLModel):
    status: Optional[OrderStatus] = None
    notes: Optional[str] = None


class OrderItemResponse(SQLModel):
    id: int
    tenant_id: int
    order_id: int
    item_id: int
    quantity: int
    unit_price: float
    subtotal: float
    # Item details
    item_name: Optional[str] = None
    item_sku: Optional[str] = None
    item_type: Optional[str] = None


class OrderStatusHistoryResponse(SQLModel):
    id: int
    tenant_id: int
    order_id: int
    status: str
    notes: Optional[str]
    changed_by_id: int
    created_at: datetime
    # User details
    changed_by_name: Optional[str] = None
    changed_by_email: Optional[str] = None


class OrderResponse(SQLModel):
    id: int
    tenant_id: int
    proposal_id: Optional[int]
    contact_id: Optional[int]
    account_id: Optional[int]
    customer_name: str
    customer_email: Optional[str]
    customer_phone: Optional[str]
    status: str
    total_amount: float
    currency: str
    notes: Optional[str]
    owner_id: int
    created_by_id: int
    created_at: datetime
    updated_at: datetime
    # Relationships
    items: List[OrderItemResponse] = []
    status_history: List[OrderStatusHistoryResponse] = []
    # Dados relacionados
    contact_name: Optional[str] = None
    account_name: Optional[str] = None


# ==================== FINANCE MODELS ====================

class TransactionCategory(str, Enum):
    """Categorias de transações"""
    SALES = "sales"                    # Vendas
    SERVICES = "services"              # Serviços
    SUPPLIERS = "suppliers"           # Fornecedores
    SALARY = "salary"                  # Salários
    RENT = "rent"                      # Aluguel
    UTILITIES = "utilities"            # Utilidades
    MARKETING = "marketing"            # Marketing
    TAXES = "taxes"                    # Impostos
    OTHER = "other"                    # Outros


class TransactionType(str, Enum):
    """Tipo de transação"""
    INCOME = "income"      # Contas a Receber
    EXPENSE = "expense"    # Contas a Pagar


class TransactionStatus(str, Enum):
    """Status da transação"""
    PENDING = "pending"    # Pendente
    PAID = "paid"          # Paga/Recebida
    OVERDUE = "overdue"    # Vencida


class RecurrenceInterval(str, Enum):
    """Intervalo de recorrência"""
    WEEKLY = "weekly"      # Semanal
    MONTHLY = "monthly"    # Mensal
    QUARTERLY = "quarterly"  # Trimestral
    YEARLY = "yearly"      # Anual


class FinancialAccount(SQLModel, table=True):
    """Contas/Caixas Financeiras"""
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    name: str  # Nome da conta (ex: "Conta Principal", "Caixa Pequeno")
    description: Optional[str] = None
    is_active: bool = Field(default=True)
    # Ownership
    owner_id: int = Field(foreign_key="user.id", index=True)
    created_by_id: int = Field(foreign_key="user.id", index=True)
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Relationships
    transactions: List["Transaction"] = Relationship(back_populates="account")


class Transaction(SQLModel, table=True):
    """Transações Financeiras (Contas a Pagar e Receber)"""
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    account_id: int = Field(foreign_key="financialaccount.id", index=True)
    description: str
    amount: float
    type: TransactionType
    status: TransactionStatus = Field(default=TransactionStatus.PENDING)
    category: TransactionCategory
    due_date: datetime
    payment_date: Optional[datetime] = None
    order_id: Optional[int] = Field(foreign_key="order.id", default=None, index=True)  # Opcional: vinculado a um pedido
    # Recorrência
    is_recurring: bool = Field(default=False, index=True)
    recurrence_interval: Optional[RecurrenceInterval] = None  # Intervalo de recorrência
    recurrence_start: Optional[datetime] = None  # Data de início da recorrência
    recurrence_end: Optional[datetime] = None  # Data de término da recorrência
    parent_transaction_id: Optional[int] = Field(foreign_key="transaction.id", default=None, index=True)  # ID da transação pai (se for gerada automaticamente)
    # Ownership
    owner_id: int = Field(foreign_key="user.id", index=True)
    created_by_id: int = Field(foreign_key="user.id", index=True)
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Relationships
    account: Optional[FinancialAccount] = Relationship(back_populates="transactions")
    order: Optional[Order] = Relationship()
    parent_transaction: Optional["Transaction"] = Relationship(
        sa_relationship_kwargs={"remote_side": "Transaction.id"}
    )


# Pydantic Schemas
class FinancialAccountCreate(SQLModel):
    name: str
    description: Optional[str] = None
    is_active: Optional[bool] = True
    owner_id: Optional[int] = None


class FinancialAccountUpdate(SQLModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class FinancialAccountResponse(SQLModel):
    id: int
    tenant_id: int
    name: str
    description: Optional[str]
    is_active: bool
    owner_id: int
    created_by_id: int
    created_at: datetime
    updated_at: datetime
    # Saldo calculado (não armazenado)
    balance: float = 0.0


class TransactionCreate(SQLModel):
    account_id: int
    description: str
    amount: float
    type: TransactionType
    category: TransactionCategory
    due_date: datetime
    payment_date: Optional[datetime] = None
    order_id: Optional[int] = None
    is_recurring: Optional[bool] = False
    recurrence_interval: Optional[RecurrenceInterval] = None
    recurrence_start: Optional[datetime] = None
    recurrence_end: Optional[datetime] = None


class TransactionUpdate(SQLModel):
    account_id: Optional[int] = None
    description: Optional[str] = None
    amount: Optional[float] = None
    type: Optional[TransactionType] = None
    status: Optional[TransactionStatus] = None
    category: Optional[TransactionCategory] = None
    due_date: Optional[datetime] = None
    payment_date: Optional[datetime] = None
    is_recurring: Optional[bool] = None
    recurrence_interval: Optional[RecurrenceInterval] = None
    recurrence_start: Optional[datetime] = None
    recurrence_end: Optional[datetime] = None


class TransactionResponse(SQLModel):
    id: int
    tenant_id: int
    account_id: int
    description: str
    amount: float
    type: str
    status: str
    category: str
    due_date: datetime
    payment_date: Optional[datetime]
    order_id: Optional[int]
    is_recurring: bool
    recurrence_interval: Optional[str] = None
    recurrence_start: Optional[datetime] = None
    recurrence_end: Optional[datetime] = None
    parent_transaction_id: Optional[int] = None
    owner_id: int
    created_by_id: int
    created_at: datetime
    updated_at: datetime
    # Dados relacionados
    account_name: Optional[str] = None
    order_number: Optional[str] = None


# ==================== APPOINTMENTS ====================

class AppointmentStatus(str, Enum):
    SCHEDULED = "scheduled"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    RESCHEDULED = "rescheduled"
    NO_SHOW = "no_show"


class Appointment(SQLModel, table=True):
    """Agendamentos/Reuniões com Leads"""
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    lead_id: int = Field(foreign_key="lead.id", index=True)
    title: str
    description: Optional[str] = None
    scheduled_at: datetime  # Data e hora agendada
    duration_minutes: int = Field(default=30)  # Duração em minutos
    location: Optional[str] = None  # Local da reunião (presencial, online, endereço)
    meeting_url: Optional[str] = None  # URL para reunião online (Zoom, Meet, etc.)
    status: AppointmentStatus = AppointmentStatus.SCHEDULED
    notes: Optional[str] = None  # Notas da reunião (preenchidas após)
    outcome: Optional[str] = None  # Resultado da reunião
    completed_at: Optional[datetime] = None  # Quando foi completada
    cancelled_at: Optional[datetime] = None  # Quando foi cancelada
    # Ownership
    owner_id: Optional[int] = Field(foreign_key="user.id", index=True, default=None)
    created_by_id: Optional[int] = Field(foreign_key="user.id", index=True, default=None)
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Relationships
    lead: Optional["Lead"] = Relationship()


class AppointmentCreate(SQLModel):
    lead_id: int
    title: str
    description: Optional[str] = None
    scheduled_at: datetime
    duration_minutes: int = 30
    location: Optional[str] = None
    meeting_url: Optional[str] = None
    owner_id: Optional[int] = None
    notes: Optional[str] = None


class AppointmentUpdate(SQLModel):
    title: Optional[str] = None
    description: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    duration_minutes: Optional[int] = None
    location: Optional[str] = None
    meeting_url: Optional[str] = None
    status: Optional[AppointmentStatus] = None
    notes: Optional[str] = None
    outcome: Optional[str] = None
    owner_id: Optional[int] = None


class AppointmentResponse(SQLModel):
    id: int
    tenant_id: int
    lead_id: int
    title: str
    description: Optional[str]
    scheduled_at: datetime
    duration_minutes: int
    location: Optional[str]
    meeting_url: Optional[str]
    status: AppointmentStatus
    notes: Optional[str]
    outcome: Optional[str]
    completed_at: Optional[datetime]
    cancelled_at: Optional[datetime]
    owner_id: Optional[int]
    created_by_id: Optional[int]
    created_at: datetime
    updated_at: datetime
    # Lead info (opcional, pode ser incluído via join)
    lead_name: Optional[str] = None
    lead_company: Optional[str] = None


# ==================== INTEGRATIONS ====================

class IntegrationType(str, Enum):
    WHATSAPP_TWILIO = "whatsapp_twilio"
    GOOGLE_CALENDAR = "google_calendar"
    EMAIL_SMTP = "email_smtp"
    EMAIL_IMAP = "email_imap"
    TOTVS = "totvs"
    SALESFORCE = "salesforce"


class TenantIntegration(SQLModel, table=True):
    """Integrações de Tenant"""
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    integration_type: IntegrationType
    is_active: bool = Field(default=False)
    credentials_encrypted: Optional[str] = Field(default=None, sa_column=Column(JSON))  # JSON criptografado
    config: Optional[Dict] = Field(default=None, sa_column=Column(JSON))  # Configurações adicionais
    last_sync_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class TenantIntegrationCreate(SQLModel):
    integration_type: IntegrationType
    credentials: Optional[Dict] = None  # Será criptografado antes de salvar
    config: Optional[Dict] = None
    is_active: bool = True


class TenantIntegrationUpdate(SQLModel):
    credentials: Optional[Dict] = None
    config: Optional[Dict] = None
    is_active: Optional[bool] = None


class TenantIntegrationResponse(SQLModel):
    id: int
    tenant_id: int
    integration_type: str
    is_active: bool
    config: Optional[Dict] = None
    last_sync_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    # Não incluir credentials_encrypted por segurança


# ==================== FORMS ====================

class FormFieldType(str, Enum):
    TEXT = "text"
    EMAIL = "email"
    PHONE = "phone"
    SELECT = "select"
    TEXTAREA = "textarea"
    NUMBER = "number"
    DATE = "date"
    CHECKBOX = "checkbox"


class Form(SQLModel, table=True):
    """Formulários de Captura"""
    id: Optional[int] = Field(default=None, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    name: str
    description: Optional[str] = None
    button_text: str = Field(default="Enviar")
    button_color: str = Field(default="#3b82f6")  # Cor hex do botão
    success_message: str = Field(default="Obrigado! Entraremos em contato em breve.")
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Relationships
    fields: List["FormField"] = Relationship(back_populates="form")


class FormField(SQLModel, table=True):
    """Campos de Formulário"""
    id: Optional[int] = Field(default=None, primary_key=True)
    form_id: int = Field(foreign_key="form.id", index=True)
    field_type: FormFieldType
    label: str
    name: str  # Nome do campo (usado no HTML)
    placeholder: Optional[str] = None
    required: bool = Field(default=False)
    order: int = Field(default=0)  # Ordem de exibição
    options: Optional[List[str]] = Field(default=None, sa_column=Column(JSON))  # Para SELECT
    
    # Relationships
    form: Optional["Form"] = Relationship(back_populates="fields")


class FormFieldCreate(SQLModel):
    field_type: FormFieldType
    label: str
    name: str
    placeholder: Optional[str] = None
    required: bool = False
    order: int = 0
    options: Optional[List[str]] = None


class FormFieldResponse(SQLModel):
    id: int
    form_id: int
    field_type: str
    label: str
    name: str
    placeholder: Optional[str]
    required: bool
    order: int
    options: Optional[List[str]] = None


class FormCreate(SQLModel):
    name: str
    description: Optional[str] = None
    button_text: str = "Enviar"
    button_color: str = "#3b82f6"
    success_message: str = "Obrigado! Entraremos em contato em breve."
    is_active: bool = True
    fields: List[FormFieldCreate] = []


class FormUpdate(SQLModel):
    name: Optional[str] = None
    description: Optional[str] = None
    button_text: Optional[str] = None
    button_color: Optional[str] = None
    success_message: Optional[str] = None
    is_active: Optional[bool] = None
    fields: Optional[List[FormFieldCreate]] = None


class FormResponse(SQLModel):
    id: int
    tenant_id: int
    name: str
    description: Optional[str]
    button_text: str
    button_color: str
    success_message: str
    is_active: bool
    created_at: datetime
    updated_at: datetime
    fields: List[FormFieldResponse] = []


class FormSubmitRequest(SQLModel):
    """Request para submissão pública de formulário"""
    form_id: int
    data: Dict[str, str]  # Dados do formulário


# ==================== CUSTOM FIELDS AND MODULES ====================

class CustomFieldType(str, Enum):
    TEXT = "text"
    NUMBER = "number"
    EMAIL = "email"
    DATE = "date"
    BOOLEAN = "boolean"
    SELECT = "select"
    TEXTAREA = "textarea"
    FILE = "file"
    URL = "url"
    RELATIONSHIP = "relationship"


class CustomField(SQLModel, table=True):
    """Campos customizados para módulos"""
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    module_target: str  # 'leads', 'orders', 'items', 'contacts', 'accounts', 'opportunities', 'proposals' ou nome de custom_module
    field_label: str
    field_name: str  # Slug único por tenant+module_target
    field_type: CustomFieldType
    options: Optional[List[str]] = Field(default=None, sa_column=Column(JSON))  # Para SELECT
    required: bool = Field(default=False)
    default_value: Optional[str] = None
    order: int = Field(default=0)
    relationship_target: Optional[str] = None  # Para campos RELATIONSHIP (ex: 'leads', 'contacts')
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class CustomFieldCreate(SQLModel):
    module_target: str
    field_label: str
    field_name: str
    field_type: CustomFieldType
    options: Optional[List[str]] = None
    required: bool = False
    default_value: Optional[str] = None
    order: int = 0
    relationship_target: Optional[str] = None


class CustomFieldUpdate(SQLModel):
    field_label: Optional[str] = None
    field_type: Optional[CustomFieldType] = None
    options: Optional[List[str]] = None
    required: Optional[bool] = None
    default_value: Optional[str] = None
    order: Optional[int] = None
    relationship_target: Optional[str] = None


class CustomFieldResponse(SQLModel):
    id: uuid.UUID
    tenant_id: int
    module_target: str
    field_label: str
    field_name: str
    field_type: str
    options: Optional[List[str]] = None
    required: bool
    default_value: Optional[str] = None
    order: int
    relationship_target: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class CustomModule(SQLModel, table=True):
    """Módulos customizados criados pelo usuário"""
    id: Optional[uuid.UUID] = Field(default_factory=uuid.uuid4, primary_key=True)
    tenant_id: int = Field(foreign_key="tenant.id", index=True)
    name: str  # Nome do módulo (ex: 'Contratos')
    slug: str  # Slug único por tenant (ex: 'contracts')
    description: Optional[str] = None
    icon: Optional[str] = None  # Nome do ícone (ex: 'FileText')
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class CustomModuleCreate(SQLModel):
    name: str
    slug: str
    description: Optional[str] = None
    icon: Optional[str] = None
    is_active: bool = True
    fields: Optional[List["CustomFieldCreate"]] = None  # Campos a serem criados junto com o módulo


class CustomModuleUpdate(SQLModel):
    name: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    is_active: Optional[bool] = None


class CustomModuleResponse(SQLModel):
    id: uuid.UUID
    tenant_id: int
    name: str
    slug: str
    description: Optional[str] = None
    icon: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime