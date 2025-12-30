"""
Migration script to add new columns to Lead table
"""
from sqlmodel import Session, text
from app.database import engine


def migrate_lead_table():
    """Add new columns to Lead table if they don't exist"""
    with Session(engine) as session:
        try:
            # Check if columns exist and add them if they don't
            migrations = [
                ("phone", "VARCHAR"),
                ("website", "VARCHAR"),
                ("linkedin_url", "VARCHAR"),
                ("source", "VARCHAR"),
                ("score", "INTEGER DEFAULT 0"),
                ("assigned_to", "INTEGER"),
                ("tags", "TEXT"),
                ("last_contact", "TIMESTAMP"),
                ("next_followup", "TIMESTAMP"),
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
                    # Add column
                    alter_query = text(f"ALTER TABLE lead ADD COLUMN {column_name} {column_type}")
                    session.exec(alter_query)
                    session.commit()
                    print(f"✓ Added column: {column_name}")
                else:
                    print(f"- Column already exists: {column_name}")
            
            # Update status column to use enum if needed
            # Check current status column type
            status_check = text("""
                SELECT data_type 
                FROM information_schema.columns 
                WHERE table_name='lead' AND column_name='status'
            """)
            status_type = session.exec(status_check).first()
            
            if status_type and status_type[0] != 'USER-DEFINED':
                # Status is VARCHAR, we can keep it as is since SQLModel handles enum conversion
                print("- Status column is VARCHAR (OK)")
            
            print("\n✓ Migration completed successfully!")
            
        except Exception as e:
            session.rollback()
            print(f"✗ Migration error: {e}")
            raise


if __name__ == "__main__":
    migrate_lead_table()





