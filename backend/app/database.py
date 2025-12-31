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
                # Campos do LinkedIn
                ("linkedin_headline", "TEXT"),
                ("linkedin_about", "TEXT"),
                ("linkedin_experience_json", "TEXT"),
                ("linkedin_education_json", "TEXT"),
                ("linkedin_certifications_json", "TEXT"),
                ("linkedin_skills", "TEXT"),
                ("linkedin_articles_json", "TEXT"),
                ("linkedin_recent_activity", "TEXT"),
                ("linkedin_connections_count", "INTEGER"),
                ("linkedin_followers_count", "INTEGER"),
                ("linkedin_summary", "TEXT"),
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


def migrate_items_tables():
    """Create item and stocktransaction tables and add items column to proposal table"""
    with Session(engine) as session:
        try:
            # Check if item table exists
            table_check = text("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = 'item'
                )
            """)
            result = session.exec(table_check).first()
            item_table_exists = result[0] if result else False
            
            if not item_table_exists:
                # Table will be created by SQLModel.metadata.create_all
                print("✓ Item table will be created by SQLModel")
            else:
                print("✓ Item table already exists")
            
            # Check if stocktransaction table exists
            stock_check = text("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = 'stocktransaction'
                )
            """)
            result = session.exec(stock_check).first()
            stock_table_exists = result[0] if result else False
            
            if not stock_table_exists:
                print("✓ StockTransaction table will be created by SQLModel")
            else:
                print("✓ StockTransaction table already exists")
            
            # Add image_url column to item table if it doesn't exist
            if item_table_exists:
                check_image_url = text("""
                    SELECT column_name 
                    FROM information_schema.columns 
                    WHERE table_name='item' AND column_name='image_url'
                """)
                result = session.exec(check_image_url).first()
                
                if not result:
                    try:
                        alter_query = text("ALTER TABLE item ADD COLUMN image_url VARCHAR(500)")
                        session.exec(alter_query)
                        session.commit()
                        print("✓ Added image_url column to item table")
                    except Exception as e:
                        session.rollback()
                        print(f"Warning: Could not add image_url column to item: {e}")
                else:
                    print("✓ image_url column already exists in item table")
                
                # Add custom_attributes column to item table if it doesn't exist
                check_custom_attrs = text("""
                    SELECT column_name 
                    FROM information_schema.columns 
                    WHERE table_name='item' AND column_name='custom_attributes'
                """)
                result = session.exec(check_custom_attrs).first()
                
                if not result:
                    try:
                        alter_query = text("ALTER TABLE item ADD COLUMN custom_attributes JSONB")
                        session.exec(alter_query)
                        session.commit()
                        print("✓ Added custom_attributes column to item table")
                    except Exception as e:
                        session.rollback()
                        print(f"Warning: Could not add image_url column to item: {e}")
                else:
                    print("✓ image_url column already exists in item table")
            
            # Add items column to proposal table if it doesn't exist
            proposal_table_check = text("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = 'proposal'
                )
            """)
            result = session.exec(proposal_table_check).first()
            proposal_exists = result[0] if result else False
            
            if proposal_exists:
                check_items_column = text("""
                    SELECT column_name 
                    FROM information_schema.columns 
                    WHERE table_name='proposal' AND column_name='items'
                """)
                result = session.exec(check_items_column).first()
                
                if not result:
                    try:
                        alter_query = text("ALTER TABLE proposal ADD COLUMN items TEXT")
                        session.exec(alter_query)
                        session.commit()
                        print("✓ Added items column to proposal table")
                    except Exception as e:
                        session.rollback()
                        print(f"Warning: Could not add items column to proposal: {e}")
                else:
                    print("✓ Items column already exists in proposal table")
            
            # Create indexes if they don't exist
            try:
                # Index for item.tenant_id
                idx_tenant_check = text("""
                    SELECT indexname 
                    FROM pg_indexes 
                    WHERE tablename='item' AND indexname='idx_item_tenant_id'
                """)
                result = session.exec(idx_tenant_check).first()
                if not result:
                    idx_query = text("CREATE INDEX IF NOT EXISTS idx_item_tenant_id ON item(tenant_id)")
                    session.exec(idx_query)
                    session.commit()
                    print("✓ Created index idx_item_tenant_id on item table")
                
                # Index for item.sku + tenant_id (unique per tenant)
                idx_sku_check = text("""
                    SELECT indexname 
                    FROM pg_indexes 
                    WHERE tablename='item' AND indexname='idx_item_sku_tenant'
                """)
                result = session.exec(idx_sku_check).first()
                if not result:
                    idx_query = text("CREATE INDEX IF NOT EXISTS idx_item_sku_tenant ON item(tenant_id, sku) WHERE sku IS NOT NULL")
                    session.exec(idx_query)
                    session.commit()
                    print("✓ Created index idx_item_sku_tenant on item table")
                
                # Index for stocktransaction.item_id
                idx_stock_item_check = text("""
                    SELECT indexname 
                    FROM pg_indexes 
                    WHERE tablename='stocktransaction' AND indexname='idx_stocktransaction_item_id'
                """)
                result = session.exec(idx_stock_item_check).first()
                if not result:
                    idx_query = text("CREATE INDEX IF NOT EXISTS idx_stocktransaction_item_id ON stocktransaction(item_id)")
                    session.exec(idx_query)
                    session.commit()
                    print("✓ Created index idx_stocktransaction_item_id on stocktransaction table")
                    
            except Exception as e:
                session.rollback()
                print(f"Warning: Could not create indexes: {e}")
                
        except Exception as e:
            session.rollback()
            print(f"Migration warning (items tables): {e}")


def migrate_tenant_limits():
    """Create tenantlimit, apicalllog, and planlimitdefaults tables and initialize default limits"""
    from app.models import PlanType, PlanLimitDefaults
    
    with Session(engine) as session:
        try:
            # Check if tenantlimit table exists
            table_check = text("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = 'tenantlimit'
                )
            """)
            result = session.exec(table_check).first()
            table_exists = result[0] if result else False
            
            # Check if planlimitdefaults table exists
            plan_limits_check = text("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = 'planlimitdefaults'
                )
            """)
            plan_limits_result = session.exec(plan_limits_check).first()
            plan_limits_exists = plan_limits_result[0] if plan_limits_result else False
            
            if not table_exists:
                # Tables will be created by SQLModel.metadata.create_all in init_db
                # But we can create them explicitly here if needed
                create_tenantlimit = text("""
                    CREATE TABLE IF NOT EXISTS tenantlimit (
                        id SERIAL PRIMARY KEY,
                        tenant_id INTEGER UNIQUE NOT NULL,
                        plan_type VARCHAR(50) NOT NULL DEFAULT 'starter',
                        max_leads INTEGER NOT NULL DEFAULT 100,
                        max_users INTEGER NOT NULL DEFAULT 3,
                        max_items INTEGER NOT NULL DEFAULT 50,
                        max_api_calls INTEGER NOT NULL DEFAULT 1000,
                        max_tokens INTEGER NOT NULL DEFAULT 100000,
                        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                        FOREIGN KEY (tenant_id) REFERENCES tenant(id)
                    )
                """)
                create_apicalllog = text("""
                    CREATE TABLE IF NOT EXISTS apicalllog (
                        id SERIAL PRIMARY KEY,
                        tenant_id INTEGER NOT NULL,
                        endpoint VARCHAR(500) NOT NULL,
                        method VARCHAR(10) NOT NULL,
                        user_id INTEGER,
                        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                        FOREIGN KEY (tenant_id) REFERENCES tenant(id),
                        FOREIGN KEY (user_id) REFERENCES "user"(id)
                    )
                """)
                session.exec(create_tenantlimit)
                session.exec(create_apicalllog)
                create_llmtokenusage = text("""
                    CREATE TABLE IF NOT EXISTS llmtokenusage (
                        id SERIAL PRIMARY KEY,
                        tenant_id INTEGER NOT NULL,
                        user_id INTEGER,
                        provider VARCHAR(50) NOT NULL,
                        model VARCHAR(100) NOT NULL,
                        prompt_tokens INTEGER NOT NULL DEFAULT 0,
                        completion_tokens INTEGER NOT NULL DEFAULT 0,
                        total_tokens INTEGER NOT NULL DEFAULT 0,
                        endpoint VARCHAR(500),
                        feature VARCHAR(100),
                        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                        FOREIGN KEY (tenant_id) REFERENCES tenant(id),
                        FOREIGN KEY (user_id) REFERENCES "user"(id)
                    )
                """)
                session.exec(create_llmtokenusage)
                
                # Criar índices para melhor performance
                try:
                    idx_tenant_id = text("CREATE INDEX IF NOT EXISTS idx_apicalllog_tenant_id ON apicalllog(tenant_id)")
                    idx_created_at = text("CREATE INDEX IF NOT EXISTS idx_apicalllog_created_at ON apicalllog(created_at)")
                    idx_tenant_created = text("CREATE INDEX IF NOT EXISTS idx_apicalllog_tenant_created ON apicalllog(tenant_id, created_at)")
                    session.exec(idx_tenant_id)
                    session.exec(idx_created_at)
                    session.exec(idx_tenant_created)
                    print("✓ Created indexes for apicalllog table")
                except Exception as idx_error:
                    print(f"Warning: Could not create indexes for apicalllog: {idx_error}")
                
                session.commit()
                print("✓ Created tenantlimit and apicalllog tables")
            else:
                print("✓ tenantlimit and apicalllog tables already exist")
            
            if not plan_limits_exists:
                create_planlimitdefaults = text("""
                    CREATE TABLE IF NOT EXISTS planlimitdefaults (
                        id SERIAL PRIMARY KEY,
                        plan_type VARCHAR(50) UNIQUE NOT NULL,
                        max_leads INTEGER NOT NULL DEFAULT 100,
                        max_users INTEGER NOT NULL DEFAULT 3,
                        max_items INTEGER NOT NULL DEFAULT 50,
                        max_api_calls INTEGER NOT NULL DEFAULT 1000,
                        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
                    )
                """)
                session.exec(create_planlimitdefaults)
                session.commit()
                print("✓ Created planlimitdefaults table")
            else:
                print("✓ planlimitdefaults table already exists")
            
            # Initialize default plan limits
            plan_defaults = {
                PlanType.STARTER: {
                    "max_leads": 100,
                    "max_users": 3,
                    "max_items": 50,
                    "max_api_calls": 1000
                },
                PlanType.PROFESSIONAL: {
                    "max_leads": 1000,
                    "max_users": 10,
                    "max_items": 500,
                    "max_api_calls": 10000
                },
                PlanType.ENTERPRISE: {
                    "max_leads": -1,  # Ilimitado
                    "max_users": -1,
                    "max_items": -1,
                    "max_api_calls": -1
                }
            }
            
            for plan_type, defaults in plan_defaults.items():
                existing_plan_limit = session.exec(
                    text("SELECT id FROM planlimitdefaults WHERE plan_type = :plan_type"),
                    {"plan_type": plan_type.value}
                ).first()
                
                if not existing_plan_limit:
                    insert_plan_limit = text("""
                        INSERT INTO planlimitdefaults (plan_type, max_leads, max_users, max_items, max_api_calls, created_at, updated_at)
                        VALUES (:plan_type, :max_leads, :max_users, :max_items, :max_api_calls, NOW(), NOW())
                    """)
                    session.exec(
                        insert_plan_limit,
                        {
                            "plan_type": plan_type.value,
                            **defaults
                        }
                    )
                    session.commit()
                    print(f"✓ Initialized default limits for plan {plan_type.value}")
            
            # Initialize default limits for existing tenants
            all_tenants = session.exec(text("SELECT id FROM tenant")).all()
            
            for tenant_id in all_tenants:
                # Check if limit already exists for this tenant
                existing_limit = session.exec(
                    text("SELECT id FROM tenantlimit WHERE tenant_id = :tenant_id"),
                    {"tenant_id": tenant_id}
                ).first()
                
                if not existing_limit:
                    # Create default Starter plan limits
                    insert_query = text("""
                        INSERT INTO tenantlimit (tenant_id, plan_type, max_leads, max_users, max_items, max_api_calls, created_at, updated_at)
                        VALUES (:tenant_id, :plan_type, :max_leads, :max_users, :max_items, :max_api_calls, NOW(), NOW())
                    """)
                    session.exec(
                        insert_query,
                        {
                            "tenant_id": tenant_id,
                            "plan_type": PlanType.STARTER.value,
                            "max_leads": 100,
                            "max_users": 3,
                            "max_items": 50,
                            "max_api_calls": 1000
                        }
                    )
                    session.commit()
                    print(f"✓ Initialized default limits for tenant {tenant_id}")
            
        except Exception as e:
            session.rollback()
            print(f"Migration warning (tenant limits): {e}")


def migrate_orders_tables():
    """Create order, orderitem, and orderstatushistory tables"""
    from app.models import Order, OrderItem, OrderStatusHistory
    
    with Session(engine) as session:
        try:
            # Check if order table exists
            table_check = text("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = 'order'
                )
            """)
            result = session.exec(table_check).first()
            table_exists = result[0] if result else False
            
            if not table_exists:
                # Tables will be created by SQLModel.metadata.create_all in init_db
                # But we can create them explicitly here if needed
                create_order = text("""
                    CREATE TABLE IF NOT EXISTS "order" (
                        id SERIAL PRIMARY KEY,
                        tenant_id INTEGER NOT NULL,
                        proposal_id INTEGER,
                        contact_id INTEGER,
                        account_id INTEGER,
                        customer_name VARCHAR(255) NOT NULL,
                        customer_email VARCHAR(255),
                        customer_phone VARCHAR(50),
                        status VARCHAR(50) NOT NULL DEFAULT 'pending',
                        total_amount DECIMAL(10, 2) NOT NULL,
                        currency VARCHAR(10) NOT NULL DEFAULT 'BRL',
                        notes TEXT,
                        owner_id INTEGER NOT NULL,
                        created_by_id INTEGER NOT NULL,
                        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                        FOREIGN KEY (tenant_id) REFERENCES tenant(id),
                        FOREIGN KEY (proposal_id) REFERENCES proposal(id),
                        FOREIGN KEY (contact_id) REFERENCES contact(id),
                        FOREIGN KEY (account_id) REFERENCES account(id),
                        FOREIGN KEY (owner_id) REFERENCES "user"(id),
                        FOREIGN KEY (created_by_id) REFERENCES "user"(id)
                    )
                """)
                create_orderitem = text("""
                    CREATE TABLE IF NOT EXISTS orderitem (
                        id SERIAL PRIMARY KEY,
                        tenant_id INTEGER NOT NULL,
                        order_id INTEGER NOT NULL,
                        item_id INTEGER NOT NULL,
                        quantity INTEGER NOT NULL,
                        unit_price DECIMAL(10, 2) NOT NULL,
                        subtotal DECIMAL(10, 2) NOT NULL,
                        FOREIGN KEY (tenant_id) REFERENCES tenant(id),
                        FOREIGN KEY (order_id) REFERENCES "order"(id) ON DELETE CASCADE,
                        FOREIGN KEY (item_id) REFERENCES item(id)
                    )
                """)
                create_orderstatushistory = text("""
                    CREATE TABLE IF NOT EXISTS orderstatushistory (
                        id SERIAL PRIMARY KEY,
                        tenant_id INTEGER NOT NULL,
                        order_id INTEGER NOT NULL,
                        status VARCHAR(50) NOT NULL,
                        notes TEXT,
                        changed_by_id INTEGER NOT NULL,
                        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                        FOREIGN KEY (tenant_id) REFERENCES tenant(id),
                        FOREIGN KEY (order_id) REFERENCES "order"(id) ON DELETE CASCADE,
                        FOREIGN KEY (changed_by_id) REFERENCES "user"(id)
                    )
                """)
                session.exec(create_order)
                session.exec(create_orderitem)
                session.exec(create_orderstatushistory)
                
                # Criar índices
                try:
                    idx_order_tenant = text("CREATE INDEX IF NOT EXISTS idx_order_tenant_id ON \"order\"(tenant_id)")
                    idx_order_proposal = text("CREATE INDEX IF NOT EXISTS idx_order_proposal_id ON \"order\"(proposal_id)")
                    idx_order_contact = text("CREATE INDEX IF NOT EXISTS idx_order_contact_id ON \"order\"(contact_id)")
                    idx_order_account = text("CREATE INDEX IF NOT EXISTS idx_order_account_id ON \"order\"(account_id)")
                    idx_orderitem_order = text("CREATE INDEX IF NOT EXISTS idx_orderitem_order_id ON orderitem(order_id)")
                    idx_orderitem_item = text("CREATE INDEX IF NOT EXISTS idx_orderitem_item_id ON orderitem(item_id)")
                    idx_orderstatushistory_order = text("CREATE INDEX IF NOT EXISTS idx_orderstatushistory_order_id ON orderstatushistory(order_id)")
                    session.exec(idx_order_tenant)
                    session.exec(idx_order_proposal)
                    session.exec(idx_order_contact)
                    session.exec(idx_order_account)
                    session.exec(idx_orderitem_order)
                    session.exec(idx_orderitem_item)
                    session.exec(idx_orderstatushistory_order)
                    print("✓ Created indexes for orders tables")
                except Exception as idx_error:
                    print(f"Warning: Could not create indexes for orders: {idx_error}")
                
                session.commit()
                print("✓ Created order, orderitem, and orderstatushistory tables")
            else:
                # Verificar se precisa adicionar colunas contact_id e account_id
                try:
                    check_contact = text("""
                        SELECT column_name 
                        FROM information_schema.columns 
                        WHERE table_name = 'order' AND column_name = 'contact_id'
                    """)
                    result_contact = session.exec(check_contact).first()
                    if not result_contact:
                        add_contact = text("ALTER TABLE \"order\" ADD COLUMN contact_id INTEGER REFERENCES contact(id)")
                        add_account = text("ALTER TABLE \"order\" ADD COLUMN account_id INTEGER REFERENCES account(id)")
                        session.exec(add_contact)
                        session.exec(add_account)
                        # Criar índices
                        idx_order_contact = text("CREATE INDEX IF NOT EXISTS idx_order_contact_id ON \"order\"(contact_id)")
                        idx_order_account = text("CREATE INDEX IF NOT EXISTS idx_order_account_id ON \"order\"(account_id)")
                        session.exec(idx_order_contact)
                        session.exec(idx_order_account)
                        session.commit()
                        print("✓ Added contact_id and account_id columns to order table")
                    else:
                        print("✓ order table already has contact_id and account_id columns")
                except Exception as e:
                    print(f"Warning: Could not add contact_id/account_id columns: {e}")
                    session.rollback()
                
                print("✓ order, orderitem, and orderstatushistory tables already exist")
            
        except Exception as e:
            session.rollback()
            print(f"Migration warning (orders tables): {e}")


def migrate_integrations_tables():
    """Create tenantintegration table"""
    from app.models import TenantIntegration, IntegrationType
    from sqlalchemy import text
    
    with Session(engine) as session:
        try:
            # Check if tenantintegration table exists
            table_check = text("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = 'tenantintegration'
                )
            """)
            result = session.exec(table_check).first()
            table_exists = result[0] if result else False
            
            if not table_exists:
                # Tables will be created by SQLModel.metadata.create_all in init_db
                # But we can create explicitly here if needed
                create_table = text("""
                    CREATE TABLE IF NOT EXISTS tenantintegration (
                        id SERIAL PRIMARY KEY,
                        tenant_id INTEGER NOT NULL,
                        integration_type VARCHAR(50) NOT NULL,
                        is_active BOOLEAN NOT NULL DEFAULT FALSE,
                        credentials_encrypted JSONB,
                        config JSONB,
                        last_sync_at TIMESTAMP WITH TIME ZONE,
                        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                        FOREIGN KEY (tenant_id) REFERENCES tenant(id),
                        UNIQUE(tenant_id, integration_type)
                    )
                """)
                session.exec(create_table)
                
                # Criar índices
                session.exec(text("CREATE INDEX IF NOT EXISTS idx_tenantintegration_tenant_id ON tenantintegration(tenant_id)"))
                session.exec(text("CREATE INDEX IF NOT EXISTS idx_tenantintegration_type ON tenantintegration(integration_type)"))
                
                session.commit()
                print("✓ Created tenantintegration table")
            else:
                print("✓ tenantintegration table already exists")
        except Exception as e:
            session.rollback()
            print(f"Migration warning (integrations tables): {e}")


def migrate_forms_tables():
    """Create form and formfield tables"""
    from app.models import Form, FormField
    from sqlalchemy import text
    
    with Session(engine) as session:
        try:
            # Check if form table exists
            table_check = text("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = 'form'
                )
            """)
            result = session.exec(table_check).first()
            table_exists = result[0] if result else False
            
            if not table_exists:
                create_form_table = text("""
                    CREATE TABLE IF NOT EXISTS form (
                        id SERIAL PRIMARY KEY,
                        tenant_id INTEGER NOT NULL,
                        name VARCHAR(255) NOT NULL,
                        description TEXT,
                        button_text VARCHAR(100) NOT NULL DEFAULT 'Enviar',
                        button_color VARCHAR(7) NOT NULL DEFAULT '#3b82f6',
                        success_message TEXT NOT NULL DEFAULT 'Obrigado! Entraremos em contato em breve.',
                        is_active BOOLEAN NOT NULL DEFAULT TRUE,
                        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                        FOREIGN KEY (tenant_id) REFERENCES tenant(id)
                    )
                """)
                create_formfield_table = text("""
                    CREATE TABLE IF NOT EXISTS formfield (
                        id SERIAL PRIMARY KEY,
                        form_id INTEGER NOT NULL,
                        field_type VARCHAR(50) NOT NULL,
                        label VARCHAR(255) NOT NULL,
                        name VARCHAR(255) NOT NULL,
                        placeholder VARCHAR(255),
                        required BOOLEAN NOT NULL DEFAULT FALSE,
                        "order" INTEGER NOT NULL DEFAULT 0,
                        options JSONB,
                        FOREIGN KEY (form_id) REFERENCES form(id) ON DELETE CASCADE
                    )
                """)
                session.exec(create_form_table)
                session.exec(create_formfield_table)
                
                # Criar índices
                session.exec(text("CREATE INDEX IF NOT EXISTS idx_form_tenant_id ON form(tenant_id)"))
                session.exec(text("CREATE INDEX IF NOT EXISTS idx_formfield_form_id ON formfield(form_id)"))
                
                session.commit()
                print("✓ Created form and formfield tables")
            else:
                print("✓ form and formfield tables already exist")
        except Exception as e:
            session.rollback()
            print(f"Migration warning (forms tables): {e}")


def migrate_custom_fields_tables():
    """Create custom_fields and custom_modules tables, and add custom_attributes columns"""
    from app.models import CustomField, CustomModule
    from sqlalchemy import text
    
    with Session(engine) as session:
        try:
            # Check if customfield table exists
            table_check = text("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = 'customfield'
                )
            """)
            result = session.exec(table_check).first()
            table_exists = result[0] if result else False
            
            if not table_exists:
                create_customfield_table = text("""
                    CREATE TABLE IF NOT EXISTS customfield (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        tenant_id INTEGER NOT NULL,
                        module_target VARCHAR(255) NOT NULL,
                        field_label VARCHAR(255) NOT NULL,
                        field_name VARCHAR(255) NOT NULL,
                        field_type VARCHAR(50) NOT NULL,
                        options JSONB,
                        required BOOLEAN NOT NULL DEFAULT FALSE,
                        default_value VARCHAR(255),
                        "order" INTEGER NOT NULL DEFAULT 0,
                        relationship_target VARCHAR(255),
                        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                        FOREIGN KEY (tenant_id) REFERENCES tenant(id),
                        UNIQUE(tenant_id, module_target, field_name)
                    )
                """)
                create_custommodule_table = text("""
                    CREATE TABLE IF NOT EXISTS custommodule (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        tenant_id INTEGER NOT NULL,
                        name VARCHAR(255) NOT NULL,
                        slug VARCHAR(255) NOT NULL,
                        description TEXT,
                        icon VARCHAR(100),
                        is_active BOOLEAN NOT NULL DEFAULT TRUE,
                        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                        FOREIGN KEY (tenant_id) REFERENCES tenant(id),
                        UNIQUE(tenant_id, slug)
                    )
                """)
                session.exec(create_customfield_table)
                session.exec(create_custommodule_table)
                
                # Criar índices
                session.exec(text("CREATE INDEX IF NOT EXISTS idx_customfield_tenant_id ON customfield(tenant_id)"))
                session.exec(text("CREATE INDEX IF NOT EXISTS idx_customfield_module_target ON customfield(module_target)"))
                session.exec(text("CREATE INDEX IF NOT EXISTS idx_custommodule_tenant_id ON custommodule(tenant_id)"))
                session.exec(text("CREATE INDEX IF NOT EXISTS idx_custommodule_slug ON custommodule(slug)"))
                
                session.commit()
                print("✓ Created customfield and custommodule tables")
            else:
                print("✓ customfield and custommodule tables already exist")
                # Verificar e corrigir tipo de id se necessário
                try:
                    # Verificar tipo da coluna id em custommodule
                    check_id_type = text("""
                        SELECT data_type 
                        FROM information_schema.columns 
                        WHERE table_name = 'custommodule' AND column_name = 'id'
                    """)
                    result = session.exec(check_id_type).first()
                    if result and result[0] == 'integer':
                        # A tabela foi criada com id INTEGER, precisamos alterar para UUID
                        print("⚠️ Converting custommodule.id from INTEGER to UUID...")
                        # Primeiro, criar uma nova coluna temporária
                        session.exec(text("ALTER TABLE custommodule ADD COLUMN id_new UUID DEFAULT gen_random_uuid()"))
                        session.commit()
                        # Copiar dados (se houver)
                        # Depois, remover a coluna antiga e renomear a nova
                        session.exec(text("ALTER TABLE custommodule DROP CONSTRAINT custommodule_pkey"))
                        session.exec(text("ALTER TABLE custommodule DROP COLUMN id"))
                        session.exec(text("ALTER TABLE custommodule RENAME COLUMN id_new TO id"))
                        session.exec(text("ALTER TABLE custommodule ADD PRIMARY KEY (id)"))
                        session.commit()
                        print("✓ Converted custommodule.id to UUID")
                except Exception as e:
                    print(f"⚠️ Could not convert custommodule.id type: {e}")
                    session.rollback()
                
                try:
                    # Verificar tipo da coluna id em customfield
                    check_id_type = text("""
                        SELECT data_type 
                        FROM information_schema.columns 
                        WHERE table_name = 'customfield' AND column_name = 'id'
                    """)
                    result = session.exec(check_id_type).first()
                    if result and result[0] == 'integer':
                        # A tabela foi criada com id INTEGER, precisamos alterar para UUID
                        print("⚠️ Converting customfield.id from INTEGER to UUID...")
                        # Primeiro, criar uma nova coluna temporária
                        session.exec(text("ALTER TABLE customfield ADD COLUMN id_new UUID DEFAULT gen_random_uuid()"))
                        session.commit()
                        # Remover a coluna antiga e renomear a nova
                        session.exec(text("ALTER TABLE customfield DROP CONSTRAINT customfield_pkey"))
                        session.exec(text("ALTER TABLE customfield DROP COLUMN id"))
                        session.exec(text("ALTER TABLE customfield RENAME COLUMN id_new TO id"))
                        session.exec(text("ALTER TABLE customfield ADD PRIMARY KEY (id)"))
                        session.commit()
                        print("✓ Converted customfield.id to UUID")
                except Exception as e:
                    print(f"⚠️ Could not convert customfield.id type: {e}")
                    session.rollback()
            
            # Adicionar coluna custom_attributes nas tabelas nativas
            tables_to_migrate = ['lead', 'order', 'item', 'contact', 'account', 'opportunity', 'proposal']
            for table_name in tables_to_migrate:
                try:
                    # Verificar se coluna já existe
                    column_check = text(f"""
                        SELECT EXISTS (
                            SELECT FROM information_schema.columns 
                            WHERE table_name = '{table_name}' AND column_name = 'custom_attributes'
                        )
                    """)
                    result = session.exec(column_check).first()
                    column_exists = result[0] if result else False
                    
                    if not column_exists:
                        add_column = text(f"""
                            ALTER TABLE {table_name} 
                            ADD COLUMN custom_attributes JSONB
                        """)
                        session.exec(add_column)
                        session.commit()
                        print(f"✓ Added custom_attributes column to {table_name} table")
                except Exception as e:
                    print(f"Warning: Could not add custom_attributes to {table_name}: {e}")
                    session.rollback()
            
        except Exception as e:
            session.rollback()
            print(f"Migration warning (custom fields tables): {e}")


def migrate_sequence_table():
    """Adiciona coluna default_start_date à tabela sequence se não existir"""
    with Session(engine) as session:
        try:
            # Verificar se a tabela sequence existe
            table_check = text("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = 'sequence'
                )
            """)
            result = session.exec(table_check).first()
            table_exists = result[0] if result else False
            
            if not table_exists:
                print("⚠️ Tabela sequence não existe. Será criada pelo SQLModel.")
                return
            
            # Verificar se a coluna já existe
            column_check = text("""
                SELECT EXISTS (
                    SELECT FROM information_schema.columns 
                    WHERE table_name = 'sequence' AND column_name = 'default_start_date'
                )
            """)
            result = session.exec(column_check).first()
            column_exists = result[0] if result else False
            
            if not column_exists:
                # Adicionar coluna
                add_column = text("""
                    ALTER TABLE sequence 
                    ADD COLUMN default_start_date TIMESTAMP WITH TIME ZONE
                """)
                session.exec(add_column)
                session.commit()
                print("✓ Adicionada coluna default_start_date à tabela sequence")
            else:
                print("- Coluna default_start_date já existe na tabela sequence")
                
        except Exception as e:
            session.rollback()
            print(f"⚠️ Erro na migração da tabela sequence: {e}")


def migrate_goal_metric_type_enum():
    """Adiciona novos valores ao enum GoalMetricType se não existirem"""
    with Session(engine) as session:
        try:
            # Verificar se o enum existe
            enum_check = text("""
                SELECT EXISTS (
                    SELECT 1 FROM pg_type WHERE typname = 'goalmetrictype'
                )
            """)
            result = session.exec(enum_check).first()
            enum_exists = result[0] if result else False
            
            if not enum_exists:
                print("⚠️ Enum goalmetrictype não existe. Será criado pelo SQLModel.")
                return
            
            # Valores a adicionar
            new_values = ['MEETINGS_SCHEDULED', 'MEETINGS_COMPLETED']
            
            for value in new_values:
                try:
                    # Verificar se o valor já existe
                    value_check = text(f"""
                        SELECT EXISTS (
                            SELECT 1 FROM pg_enum 
                            WHERE enumlabel = '{value}' 
                            AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'goalmetrictype')
                        )
                    """)
                    result = session.exec(value_check).first()
                    value_exists = result[0] if result else False
                    
                    if not value_exists:
                        # Adicionar valor ao enum
                        # Nota: ALTER TYPE ... ADD VALUE não pode ser executado em uma transação
                        # Por isso, precisamos fazer commit antes
                        session.commit()
                        # Usar DO block para evitar erro se já existir
                        add_value_do = text(f"""
                            DO $$ BEGIN
                                IF NOT EXISTS (
                                    SELECT 1 FROM pg_enum 
                                    WHERE enumlabel = '{value}' 
                                    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'goalmetrictype')
                                ) THEN
                                    ALTER TYPE goalmetrictype ADD VALUE '{value}';
                                END IF;
                            END $$;
                        """)
                        session.exec(add_value_do)
                        session.commit()
                        print(f"✓ Adicionado valor '{value}' ao enum goalmetrictype")
                    else:
                        print(f"- Valor '{value}' já existe no enum goalmetrictype")
                except Exception as e:
                    session.rollback()
                    # Se o valor já existe, pode dar erro, mas isso é OK
                    if 'already exists' in str(e).lower() or 'duplicate' in str(e).lower():
                        print(f"- Valor '{value}' já existe no enum (erro esperado)")
                    else:
                        print(f"⚠️ Erro ao adicionar valor '{value}' ao enum: {e}")
                        
        except Exception as e:
            session.rollback()
            print(f"⚠️ Erro na migração do enum goalmetrictype: {e}")


def migrate_llm_tokens_tracking():
    """Adiciona coluna max_tokens na tabela tenantlimit e cria tabela llmtokenusage"""
    with Session(engine) as session:
        try:
            # Verificar se a coluna max_tokens já existe
            check_column = text("""
                SELECT EXISTS (
                    SELECT FROM information_schema.columns 
                    WHERE table_name = 'tenantlimit' 
                    AND column_name = 'max_tokens'
                )
            """)
            result = session.exec(check_column).first()
            column_exists = result[0] if result else False
            
            if not column_exists:
                # Adicionar coluna max_tokens
                # Primeiro adicionar como nullable, depois atualizar valores existentes, depois tornar NOT NULL
                add_max_tokens = text("""
                    ALTER TABLE tenantlimit 
                    ADD COLUMN max_tokens INTEGER
                """)
                session.exec(add_max_tokens)
                session.commit()
                
                # Atualizar valores existentes com default
                update_existing = text("""
                    UPDATE tenantlimit 
                    SET max_tokens = 100000 
                    WHERE max_tokens IS NULL
                """)
                session.exec(update_existing)
                session.commit()
                
                # Tornar NOT NULL
                set_not_null = text("""
                    ALTER TABLE tenantlimit 
                    ALTER COLUMN max_tokens SET NOT NULL,
                    ALTER COLUMN max_tokens SET DEFAULT 100000
                """)
                session.exec(set_not_null)
                session.commit()
                print("✅ Coluna max_tokens adicionada à tabela tenantlimit")
            else:
                print("✓ Coluna max_tokens já existe na tabela tenantlimit")
            
            # Verificar se a tabela llmtokenusage existe
            check_table = text("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = 'llmtokenusage'
                )
            """)
            table_result = session.exec(check_table).first()
            table_exists = table_result[0] if table_result else False
            
            if not table_exists:
                # Criar tabela llmtokenusage
                create_table = text("""
                    CREATE TABLE IF NOT EXISTS llmtokenusage (
                        id SERIAL PRIMARY KEY,
                        tenant_id INTEGER NOT NULL,
                        user_id INTEGER,
                        provider VARCHAR(50) NOT NULL,
                        model VARCHAR(100) NOT NULL,
                        prompt_tokens INTEGER NOT NULL DEFAULT 0,
                        completion_tokens INTEGER NOT NULL DEFAULT 0,
                        total_tokens INTEGER NOT NULL DEFAULT 0,
                        endpoint VARCHAR(500),
                        feature VARCHAR(100),
                        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                        FOREIGN KEY (tenant_id) REFERENCES tenant(id),
                        FOREIGN KEY (user_id) REFERENCES "user"(id)
                    )
                """)
                session.exec(create_table)
                # Criar índices
                idx_tenant = text("CREATE INDEX IF NOT EXISTS idx_llmtokenusage_tenant_id ON llmtokenusage(tenant_id)")
                idx_created = text("CREATE INDEX IF NOT EXISTS idx_llmtokenusage_created_at ON llmtokenusage(created_at)")
                idx_tenant_created = text("CREATE INDEX IF NOT EXISTS idx_llmtokenusage_tenant_created ON llmtokenusage(tenant_id, created_at)")
                session.exec(idx_tenant)
                session.exec(idx_created)
                session.exec(idx_tenant_created)
                session.commit()
                logger.info("✅ Tabela llmtokenusage criada")
        except Exception as e:
            logger.error(f"❌ Erro ao migrar tracking de tokens LLM: {e}")
            session.rollback()


def migrate_notifications_table():
    """Cria tabela de notificações"""
    with Session(engine) as session:
        try:
            # Verificar se a tabela existe
            check_table = text("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = 'notification'
                )
            """)
            table_result = session.exec(check_table).first()
            table_exists = table_result[0] if table_result else False
            
            if not table_exists:
                # Criar tabela notification
                create_table = text("""
                    CREATE TABLE IF NOT EXISTS notification (
                        id SERIAL PRIMARY KEY,
                        tenant_id INTEGER NOT NULL,
                        user_id INTEGER NOT NULL,
                        type VARCHAR(50) NOT NULL,
                        title VARCHAR(500) NOT NULL,
                        message TEXT NOT NULL,
                        is_read BOOLEAN NOT NULL DEFAULT FALSE,
                        action_url VARCHAR(500),
                        metadata_json JSONB,
                        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                        read_at TIMESTAMP WITH TIME ZONE,
                        FOREIGN KEY (tenant_id) REFERENCES tenant(id),
                        FOREIGN KEY (user_id) REFERENCES "user"(id)
                    )
                """)
                session.exec(create_table)
                # Criar índices
                idx_tenant = text("CREATE INDEX IF NOT EXISTS idx_notification_tenant_id ON notification(tenant_id)")
                idx_user = text("CREATE INDEX IF NOT EXISTS idx_notification_user_id ON notification(user_id)")
                idx_is_read = text("CREATE INDEX IF NOT EXISTS idx_notification_is_read ON notification(is_read)")
                idx_created = text("CREATE INDEX IF NOT EXISTS idx_notification_created_at ON notification(created_at)")
                idx_user_read = text("CREATE INDEX IF NOT EXISTS idx_notification_user_read ON notification(user_id, is_read)")
                session.exec(idx_tenant)
                session.exec(idx_user)
                session.exec(idx_is_read)
                session.exec(idx_created)
                session.exec(idx_user_read)
                session.commit()
                logger.info("✅ Tabela notification criada")
            else:
                print("✓ Tabela notification já existe")
        except Exception as e:
            logger.error(f"❌ Erro ao migrar tabela de notificações: {e}")
            session.rollback()


def init_db():
    """Initialize database tables"""
    SQLModel.metadata.create_all(engine)
    # Run migrations for existing tables
    migrate_lead_table()
    migrate_task_table()
    migrate_proposal_table()
    migrate_items_tables()
    migrate_tenant_limits()
    migrate_orders_tables()
    migrate_integrations_tables()
    migrate_forms_tables()
    migrate_custom_fields_tables()
    # Add foreign keys for account_id and contact_id after tables are created
    migrate_lead_foreign_keys()
    # Garantir que todos os leads existentes tenham owner_id e created_by_id
    migrate_existing_leads_ownership()
    # Garantir que todas as tasks existentes tenham owner_id e created_by_id
    migrate_existing_tasks_ownership()
    # Adicionar coluna default_start_date à tabela sequence
    migrate_sequence_table()
    # Adicionar novos valores ao enum GoalMetricType
    migrate_goal_metric_type_enum()
    # Adicionar coluna max_tokens e criar tabela LLMTokenUsage
    migrate_llm_tokens_tracking()
    # Criar tabela de notificações
    migrate_notifications_table()





