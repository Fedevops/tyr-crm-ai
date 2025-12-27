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
                # Campos de ownership
                ("owner_id", "INTEGER"),
                ("created_by_id", "INTEGER"),
                # Campos de relacionamento com Account e Contact
                ("account_id", "INTEGER"),
                ("contact_id", "INTEGER"),
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
                        
                        # Add foreign key constraints
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
                        elif column_name == "owner_id":
                            try:
                                # First, migrate data: owner_id = assigned_to if exists, else use first admin user
                                # IMPORTANTE: Garantir que TODOS os leads tenham owner_id, mesmo que seja um fallback
                                migrate_query = text("""
                                    UPDATE lead 
                                    SET owner_id = COALESCE(
                                        assigned_to,
                                        owner_id,
                                        (SELECT id FROM "user" WHERE tenant_id = lead.tenant_id AND role = 'admin' LIMIT 1),
                                        (SELECT id FROM "user" WHERE tenant_id = lead.tenant_id LIMIT 1)
                                    )
                                    WHERE owner_id IS NULL
                                """)
                                session.exec(migrate_query)
                                session.commit()
                                
                                # Verificar se ainda há leads sem owner_id (caso não existam usuários)
                                check_null = text("SELECT COUNT(*) FROM lead WHERE owner_id IS NULL")
                                null_count = session.exec(check_null).first()
                                if null_count and null_count[0] > 0:
                                    print(f"⚠️ Ainda existem {null_count[0]} leads sem owner_id. Isso pode acontecer se não houver usuários no tenant.")
                                    # Não fazer NOT NULL se ainda houver NULLs
                                else:
                                    # Make NOT NULL after migration apenas se não houver NULLs
                                    try:
                                        alter_not_null = text("ALTER TABLE lead ALTER COLUMN owner_id SET NOT NULL")
                                        session.exec(alter_not_null)
                                        session.commit()
                                    except Exception as e:
                                        print(f"Warning: Could not set NOT NULL for owner_id: {e}")
                                
                                # Add foreign key (mesmo que possa ter NULLs temporariamente)
                                try:
                                    fk_query = text("""
                                        ALTER TABLE lead 
                                        ADD CONSTRAINT lead_owner_id_fkey 
                                        FOREIGN KEY (owner_id) REFERENCES "user"(id)
                                    """)
                                    session.exec(fk_query)
                                    session.commit()
                                except Exception as fk_err:
                                    # Se a constraint já existe, ignorar
                                    if "already exists" not in str(fk_err).lower():
                                        print(f"Warning: Could not add foreign key for owner_id: {fk_err}")
                                
                                # Add index
                                try:
                                    idx_query = text("CREATE INDEX IF NOT EXISTS idx_lead_owner_id ON lead(owner_id)")
                                    session.exec(idx_query)
                                    session.commit()
                                except Exception as idx_err:
                                    print(f"Warning: Could not add index for owner_id: {idx_err}")
                                
                                print(f"✓ Added owner_id column with foreign key and index")
                            except Exception as fk_error:
                                session.rollback()
                                print(f"Warning: Could not add foreign key for owner_id: {fk_error}")
                        elif column_name == "created_by_id":
                            try:
                                # Migrate data: use owner_id as fallback
                                migrate_query = text("""
                                    UPDATE lead 
                                    SET created_by_id = COALESCE(
                                        owner_id,
                                        (SELECT id FROM "user" WHERE tenant_id = lead.tenant_id AND role = 'admin' LIMIT 1),
                                        (SELECT id FROM "user" WHERE tenant_id = lead.tenant_id LIMIT 1)
                                    )
                                    WHERE created_by_id IS NULL
                                """)
                                session.exec(migrate_query)
                                session.commit()
                                
                                # Make NOT NULL after migration
                                alter_not_null = text("ALTER TABLE lead ALTER COLUMN created_by_id SET NOT NULL")
                                session.exec(alter_not_null)
                                session.commit()
                                
                                # Add foreign key
                                fk_query = text("""
                                    ALTER TABLE lead 
                                    ADD CONSTRAINT lead_created_by_id_fkey 
                                    FOREIGN KEY (created_by_id) REFERENCES "user"(id)
                                """)
                                session.exec(fk_query)
                                session.commit()
                                
                                # Add index
                                idx_query = text("CREATE INDEX IF NOT EXISTS idx_lead_created_by_id ON lead(created_by_id)")
                                session.exec(idx_query)
                                session.commit()
                                print(f"✓ Added created_by_id column with foreign key and index")
                            except Exception as fk_error:
                                session.rollback()
                                print(f"Warning: Could not add foreign key for created_by_id: {fk_error}")
                        elif column_name == "account_id":
                            try:
                                # Verificar se tabela account existe antes de adicionar foreign key
                                account_table_check = text("""
                                    SELECT EXISTS (
                                        SELECT FROM information_schema.tables 
                                        WHERE table_name = 'account'
                                    )
                                """)
                                account_exists = session.exec(account_table_check).first()
                                if account_exists and account_exists[0]:
                                    # Adicionar foreign key constraint
                                    fk_query = text("""
                                        ALTER TABLE lead 
                                        ADD CONSTRAINT lead_account_id_fkey 
                                        FOREIGN KEY (account_id) REFERENCES account(id)
                                    """)
                                    session.exec(fk_query)
                                    session.commit()
                                    print(f"✓ Added foreign key constraint for account_id")
                                else:
                                    print(f"⚠️ Table 'account' does not exist yet. Foreign key will be added when table is created.")
                            except Exception as fk_error:
                                session.rollback()
                                print(f"Warning: Could not add foreign key for account_id: {fk_error}")
                        elif column_name == "contact_id":
                            try:
                                # Verificar se tabela contact existe antes de adicionar foreign key
                                contact_table_check = text("""
                                    SELECT EXISTS (
                                        SELECT FROM information_schema.tables 
                                        WHERE table_name = 'contact'
                                    )
                                """)
                                contact_exists = session.exec(contact_table_check).first()
                                if contact_exists and contact_exists[0]:
                                    # Adicionar foreign key constraint
                                    fk_query = text("""
                                        ALTER TABLE lead 
                                        ADD CONSTRAINT lead_contact_id_fkey 
                                        FOREIGN KEY (contact_id) REFERENCES contact(id)
                                    """)
                                    session.exec(fk_query)
                                    session.commit()
                                    print(f"✓ Added foreign key constraint for contact_id")
                                else:
                                    print(f"⚠️ Table 'contact' does not exist yet. Foreign key will be added when table is created.")
                            except Exception as fk_error:
                                session.rollback()
                                print(f"Warning: Could not add foreign key for contact_id: {fk_error}")
                    except Exception as col_error:
                        session.rollback()
                        print(f"Warning: Could not add column {column_name}: {col_error}")
            
        except Exception as e:
            session.rollback()
            print(f"Migration warning: {e}")


def migrate_task_table():
    """Add owner_id and created_by_id columns to Task table if they don't exist"""
    with Session(engine) as session:
        try:
            # Check if task table exists
            table_check = text("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = 'task'
                )
            """)
            result = session.exec(table_check).first()
            table_exists = result[0] if result else False
            
            if not table_exists:
                return  # Table doesn't exist, create_all will handle it
            
            # Check and add owner_id
            check_owner = text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='task' AND column_name='owner_id'
            """)
            result = session.exec(check_owner).first()
            
            if not result:
                try:
                    # Add column
                    alter_query = text("ALTER TABLE task ADD COLUMN owner_id INTEGER")
                    session.exec(alter_query)
                    session.commit()
                    
                    # Migrate data: owner_id = assigned_to if exists
                    migrate_query = text("""
                        UPDATE task 
                        SET owner_id = COALESCE(
                            assigned_to,
                            (SELECT id FROM "user" WHERE tenant_id = task.tenant_id AND role = 'admin' LIMIT 1),
                            (SELECT id FROM "user" WHERE tenant_id = task.tenant_id LIMIT 1)
                        )
                        WHERE owner_id IS NULL
                    """)
                    session.exec(migrate_query)
                    session.commit()
                    
                    # Make NOT NULL after migration
                    alter_not_null = text("ALTER TABLE task ALTER COLUMN owner_id SET NOT NULL")
                    session.exec(alter_not_null)
                    session.commit()
                    
                    # Add foreign key
                    fk_query = text("""
                        ALTER TABLE task 
                        ADD CONSTRAINT task_owner_id_fkey 
                        FOREIGN KEY (owner_id) REFERENCES "user"(id)
                    """)
                    session.exec(fk_query)
                    session.commit()
                    
                    # Add index
                    idx_query = text("CREATE INDEX IF NOT EXISTS idx_task_owner_id ON task(owner_id)")
                    session.exec(idx_query)
                    session.commit()
                    print(f"✓ Added owner_id column to task table with foreign key and index")
                except Exception as e:
                    session.rollback()
                    print(f"Warning: Could not add owner_id to task: {e}")
            
            # Check and add created_by_id
            check_created_by = text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='task' AND column_name='created_by_id'
            """)
            result = session.exec(check_created_by).first()
            
            if not result:
                try:
                    # Add column
                    alter_query = text("ALTER TABLE task ADD COLUMN created_by_id INTEGER")
                    session.exec(alter_query)
                    session.commit()
                    
                    # Migrate data: use owner_id as fallback
                    migrate_query = text("""
                        UPDATE task 
                        SET created_by_id = COALESCE(
                            owner_id,
                            (SELECT id FROM "user" WHERE tenant_id = task.tenant_id AND role = 'admin' LIMIT 1),
                            (SELECT id FROM "user" WHERE tenant_id = task.tenant_id LIMIT 1)
                        )
                        WHERE created_by_id IS NULL
                    """)
                    session.exec(migrate_query)
                    session.commit()
                    
                    # Make NOT NULL after migration
                    alter_not_null = text("ALTER TABLE task ALTER COLUMN created_by_id SET NOT NULL")
                    session.exec(alter_not_null)
                    session.commit()
                    
                    # Add foreign key
                    fk_query = text("""
                        ALTER TABLE task 
                        ADD CONSTRAINT task_created_by_id_fkey 
                        FOREIGN KEY (created_by_id) REFERENCES "user"(id)
                    """)
                    session.exec(fk_query)
                    session.commit()
                    
                    # Add index
                    idx_query = text("CREATE INDEX IF NOT EXISTS idx_task_created_by_id ON task(created_by_id)")
                    session.exec(idx_query)
                    session.commit()
                    print(f"✓ Added created_by_id column to task table with foreign key and index")
                except Exception as e:
                    session.rollback()
                    print(f"Warning: Could not add created_by_id to task: {e}")
                    
        except Exception as e:
            session.rollback()
            print(f"Task migration warning: {e}")


def migrate_lead_foreign_keys():
    """Add foreign key constraints for account_id and contact_id if tables exist"""
    with Session(engine) as session:
        try:
            # Check if account_id column exists but foreign key doesn't
            account_fk_check = text("""
                SELECT constraint_name 
                FROM information_schema.table_constraints 
                WHERE table_name='lead' AND constraint_name='lead_account_id_fkey'
            """)
            result = session.exec(account_fk_check).first()
            
            if not result:
                # Check if account table exists
                account_table_check = text("""
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_name = 'account'
                    )
                """)
                account_exists = session.exec(account_table_check).first()
                
                if account_exists and account_exists[0]:
                    # Check if account_id column exists
                    account_col_check = text("""
                        SELECT column_name 
                        FROM information_schema.columns 
                        WHERE table_name='lead' AND column_name='account_id'
                    """)
                    account_col_exists = session.exec(account_col_check).first()
                    
                    if account_col_exists:
                        try:
                            fk_query = text("""
                                ALTER TABLE lead 
                                ADD CONSTRAINT lead_account_id_fkey 
                                FOREIGN KEY (account_id) REFERENCES account(id)
                            """)
                            session.exec(fk_query)
                            session.commit()
                            print(f"✓ Added foreign key constraint for lead.account_id")
                        except Exception as e:
                            session.rollback()
                            print(f"Warning: Could not add foreign key for account_id: {e}")
            
            # Check if contact_id column exists but foreign key doesn't
            contact_fk_check = text("""
                SELECT constraint_name 
                FROM information_schema.table_constraints 
                WHERE table_name='lead' AND constraint_name='lead_contact_id_fkey'
            """)
            result = session.exec(contact_fk_check).first()
            
            if not result:
                # Check if contact table exists
                contact_table_check = text("""
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables 
                        WHERE table_name = 'contact'
                    )
                """)
                contact_exists = session.exec(contact_table_check).first()
                
                if contact_exists and contact_exists[0]:
                    # Check if contact_id column exists
                    contact_col_check = text("""
                        SELECT column_name 
                        FROM information_schema.columns 
                        WHERE table_name='lead' AND column_name='contact_id'
                    """)
                    contact_col_exists = session.exec(contact_col_check).first()
                    
                    if contact_col_exists:
                        try:
                            fk_query = text("""
                                ALTER TABLE lead 
                                ADD CONSTRAINT lead_contact_id_fkey 
                                FOREIGN KEY (contact_id) REFERENCES contact(id)
                            """)
                            session.exec(fk_query)
                            session.commit()
                            print(f"✓ Added foreign key constraint for lead.contact_id")
                        except Exception as e:
                            session.rollback()
                            print(f"Warning: Could not add foreign key for contact_id: {e}")
                            
        except Exception as e:
            session.rollback()
            print(f"Foreign key migration warning: {e}")


def migrate_existing_tasks_ownership():
    """Garantir que todas as tasks existentes tenham owner_id preenchido"""
    with Session(engine) as session:
        try:
            # Verificar se há tasks sem owner_id
            check_null = text("SELECT COUNT(*) FROM task WHERE owner_id IS NULL")
            null_count = session.exec(check_null).first()
            
            if null_count and null_count[0] > 0:
                print(f"⚠️ Encontradas {null_count[0]} tasks sem owner_id. Preenchendo...")
                
                # Preencher owner_id para todas as tasks que não têm
                migrate_query = text("""
                    UPDATE task 
                    SET owner_id = COALESCE(
                        assigned_to,
                        (SELECT id FROM "user" WHERE tenant_id = task.tenant_id AND role = 'admin' LIMIT 1),
                        (SELECT id FROM "user" WHERE tenant_id = task.tenant_id LIMIT 1)
                    )
                    WHERE owner_id IS NULL
                """)
                session.exec(migrate_query)
                session.commit()
                
                # Verificar novamente
                null_count_after = session.exec(check_null).first()
                if null_count_after and null_count_after[0] > 0:
                    print(f"⚠️ Ainda existem {null_count_after[0]} tasks sem owner_id.")
                else:
                    print(f"✓ Todas as tasks agora têm owner_id preenchido")
            
            # Garantir que todas as tasks tenham created_by_id
            check_created_by = text("SELECT COUNT(*) FROM task WHERE created_by_id IS NULL")
            created_by_null = session.exec(check_created_by).first()
            
            if created_by_null and created_by_null[0] > 0:
                print(f"⚠️ Encontradas {created_by_null[0]} tasks sem created_by_id. Preenchendo...")
                
                migrate_created_by = text("""
                    UPDATE task 
                    SET created_by_id = COALESCE(
                        owner_id,
                        (SELECT id FROM "user" WHERE tenant_id = task.tenant_id AND role = 'admin' LIMIT 1),
                        (SELECT id FROM "user" WHERE tenant_id = task.tenant_id LIMIT 1)
                    )
                    WHERE created_by_id IS NULL
                """)
                session.exec(migrate_created_by)
                session.commit()
                print(f"✓ Todas as tasks agora têm created_by_id preenchido")
                
        except Exception as e:
            session.rollback()
            print(f"Migration warning (existing tasks): {e}")


def migrate_existing_leads_ownership():
    """Garantir que todos os leads existentes tenham owner_id preenchido"""
    with Session(engine) as session:
        try:
            # Verificar se há leads sem owner_id
            check_null = text("SELECT COUNT(*) FROM lead WHERE owner_id IS NULL")
            null_count = session.exec(check_null).first()
            
            if null_count and null_count[0] > 0:
                print(f"⚠️ Encontrados {null_count[0]} leads sem owner_id. Preenchendo...")
                
                # Preencher owner_id para todos os leads que não têm
                migrate_query = text("""
                    UPDATE lead 
                    SET owner_id = COALESCE(
                        assigned_to,
                        (SELECT id FROM "user" WHERE tenant_id = lead.tenant_id AND role = 'admin' LIMIT 1),
                        (SELECT id FROM "user" WHERE tenant_id = lead.tenant_id LIMIT 1)
                    )
                    WHERE owner_id IS NULL
                """)
                session.exec(migrate_query)
                session.commit()
                
                # Verificar novamente
                null_count_after = session.exec(check_null).first()
                if null_count_after and null_count_after[0] > 0:
                    print(f"⚠️ Ainda existem {null_count_after[0]} leads sem owner_id. Isso pode acontecer se não houver usuários no tenant.")
                else:
                    print(f"✓ Todos os leads agora têm owner_id preenchido")
            
            # Garantir que todos os leads tenham created_by_id
            check_created_by = text("SELECT COUNT(*) FROM lead WHERE created_by_id IS NULL")
            created_by_null = session.exec(check_created_by).first()
            
            if created_by_null and created_by_null[0] > 0:
                print(f"⚠️ Encontrados {created_by_null[0]} leads sem created_by_id. Preenchendo...")
                
                migrate_created_by = text("""
                    UPDATE lead 
                    SET created_by_id = COALESCE(
                        owner_id,
                        (SELECT id FROM "user" WHERE tenant_id = lead.tenant_id AND role = 'admin' LIMIT 1),
                        (SELECT id FROM "user" WHERE tenant_id = lead.tenant_id LIMIT 1)
                    )
                    WHERE created_by_id IS NULL
                """)
                session.exec(migrate_created_by)
                session.commit()
                print(f"✓ Todos os leads agora têm created_by_id preenchido")
                
        except Exception as e:
            session.rollback()
            print(f"Migration warning (existing leads): {e}")


def migrate_proposal_table():
    """Add template_id and template_data columns to Proposal table if they don't exist"""
    with Session(engine) as session:
        try:
            # Check if proposal table exists
            table_check = text("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = 'proposal'
                )
            """)
            result = session.exec(table_check).first()
            table_exists = result[0] if result else False
            
            if not table_exists:
                return  # Table doesn't exist, create_all will handle it
            
            # Check and add template_id
            check_template_id = text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='proposal' AND column_name='template_id'
            """)
            result = session.exec(check_template_id).first()
            
            if not result:
                try:
                    # Add column
                    alter_query = text("ALTER TABLE proposal ADD COLUMN template_id INTEGER")
                    session.exec(alter_query)
                    session.commit()
                    
                    # Check if proposaltemplate table exists before adding foreign key
                    template_table_check = text("""
                        SELECT EXISTS (
                            SELECT FROM information_schema.tables 
                            WHERE table_name = 'proposaltemplate'
                        )
                    """)
                    template_exists = session.exec(template_table_check).first()
                    
                    if template_exists and template_exists[0]:
                        # Add foreign key
                        fk_query = text("""
                            ALTER TABLE proposal 
                            ADD CONSTRAINT proposal_template_id_fkey 
                            FOREIGN KEY (template_id) REFERENCES proposaltemplate(id)
                        """)
                        session.exec(fk_query)
                        session.commit()
                        
                        # Add index
                        idx_query = text("CREATE INDEX IF NOT EXISTS idx_proposal_template_id ON proposal(template_id)")
                        session.exec(idx_query)
                        session.commit()
                        print(f"✓ Added template_id column to proposal table with foreign key and index")
                    else:
                        print(f"⚠️ Table 'proposaltemplate' does not exist yet. Foreign key will be added when table is created.")
                except Exception as e:
                    session.rollback()
                    print(f"Warning: Could not add template_id to proposal: {e}")
            
            # Check and add template_data
            check_template_data = text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='proposal' AND column_name='template_data'
            """)
            result = session.exec(check_template_data).first()
            
            if not result:
                try:
                    # Add column as TEXT (JSON will be stored as string)
                    alter_query = text("ALTER TABLE proposal ADD COLUMN template_data TEXT")
                    session.exec(alter_query)
                    session.commit()
                    print(f"✓ Added template_data column to proposal table")
                except Exception as e:
                    session.rollback()
                    print(f"Warning: Could not add template_data to proposal: {e}")
            
        except Exception as e:
            session.rollback()
            print(f"Migration warning (proposal table): {e}")


def init_db():
    """Initialize database tables"""
    SQLModel.metadata.create_all(engine)
    # Run migrations for existing tables
    migrate_lead_table()
    migrate_task_table()
    migrate_proposal_table()
    # Add foreign keys for account_id and contact_id after tables are created
    migrate_lead_foreign_keys()
    # Garantir que todos os leads existentes tenham owner_id e created_by_id
    migrate_existing_leads_ownership()
    # Garantir que todas as tasks existentes tenham owner_id e created_by_id
    migrate_existing_tasks_ownership()





