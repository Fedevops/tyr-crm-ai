from sqlmodel import SQLModel, create_engine, Session, text
from sqlalchemy.orm import sessionmaker
from app.config import settings

engine = create_engine(settings.database_url, echo=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_session():
    """Dependency for getting database session"""
    with Session(engine) as session:
        yield session


def migrate_lead_table():
    """Add new columns to Lead table if they don't exist"""
    with Session(engine) as session:
        try:
            # Check if lead table exists
            table_check = text("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = 'lead'
                )
            """)
            result = session.exec(table_check).first()
            table_exists = result[0] if result else False
            
            if not table_exists:
                return  # Table doesn't exist, create_all will handle it
            
            # Check if columns exist and add them if they don't
            migrations = [
                ("phone", "VARCHAR(255)"),
                ("website", "VARCHAR(255)"),
                ("linkedin_url", "VARCHAR(255)"),
                ("source", "VARCHAR(255)"),
                ("score", "INTEGER DEFAULT 0"),
                ("assigned_to", "INTEGER"),
                ("tags", "TEXT"),
                ("last_contact", "TIMESTAMP WITH TIME ZONE"),
                ("next_followup", "TIMESTAMP WITH TIME ZONE"),
                # Campos de enriquecimento automático
                ("address", "TEXT"),
                ("city", "VARCHAR(255)"),
                ("state", "VARCHAR(50)"),
                ("zip_code", "VARCHAR(20)"),
                ("country", "VARCHAR(100)"),
                ("industry", "VARCHAR(255)"),
                ("company_size", "VARCHAR(100)"),
                ("context", "TEXT"),
                # Campos Casa dos Dados
                ("razao_social", "VARCHAR(500)"),
                ("nome_fantasia", "VARCHAR(500)"),
                ("cnpj", "VARCHAR(18)"),
                ("data_abertura", "TIMESTAMP WITH TIME ZONE"),
                ("capital_social", "NUMERIC(15,2)"),
                ("situacao_cadastral", "VARCHAR(100)"),
                ("data_situacao_cadastral", "TIMESTAMP WITH TIME ZONE"),
                ("motivo_situacao_cadastral", "VARCHAR(255)"),
                ("natureza_juridica", "VARCHAR(255)"),
                ("porte", "VARCHAR(50)"),
                ("logradouro", "VARCHAR(255)"),
                ("numero", "VARCHAR(50)"),
                ("bairro", "VARCHAR(255)"),
                ("cep", "VARCHAR(20)"),
                ("municipio", "VARCHAR(255)"),
                ("uf", "VARCHAR(2)"),
                ("complemento", "VARCHAR(255)"),
                ("cnae_principal_codigo", "VARCHAR(20)"),
                ("cnae_principal_descricao", "VARCHAR(500)"),
                ("cnaes_secundarios_json", "TEXT"),
                ("telefone_empresa", "VARCHAR(50)"),
                ("email_empresa", "VARCHAR(255)"),
                ("socios_json", "TEXT"),
                ("simples_nacional", "BOOLEAN"),
                ("data_opcao_simples", "TIMESTAMP WITH TIME ZONE"),
                ("data_exclusao_simples", "TIMESTAMP WITH TIME ZONE"),
                ("agent_suggestion", "TEXT"),
            ]
            
            for column_name, column_type in migrations:
                # Check if column exists
                check_query = text(f"""
                    SELECT column_name 
                    FROM information_schema.columns 
                    WHERE table_name='lead' AND column_name='{column_name}'
                """)
                result = session.exec(check_query).first()
                
                if not result:
                    try:
                        # Add column
                        alter_query = text(f"ALTER TABLE lead ADD COLUMN {column_name} {column_type}")
                        session.exec(alter_query)
                        session.commit()
                        print(f"✓ Added column to lead table: {column_name}")
                        
                        # Add foreign key constraint for assigned_to
                        if column_name == "assigned_to":
                            try:
                                fk_query = text("""
                                    ALTER TABLE lead 
                                    ADD CONSTRAINT lead_assigned_to_fkey 
                                    FOREIGN KEY (assigned_to) REFERENCES "user"(id)
                                """)
                                session.exec(fk_query)
                                session.commit()
                                print(f"✓ Added foreign key constraint for assigned_to")
                            except Exception as fk_error:
                                session.rollback()
                                print(f"Warning: Could not add foreign key for assigned_to: {fk_error}")
                    except Exception as col_error:
                        session.rollback()
                        print(f"Warning: Could not add column {column_name}: {col_error}")
            
        except Exception as e:
            session.rollback()
            print(f"Migration warning: {e}")


def init_db():
    """Initialize database tables"""
    SQLModel.metadata.create_all(engine)
    # Run migrations for existing tables
    migrate_lead_table()





