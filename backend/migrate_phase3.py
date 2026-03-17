from app.database import engine
import sqlalchemy as sa


def migrate():
    with engine.begin() as conn:
        # Suppression rules table
        conn.execute(sa.text("""
            CREATE TABLE IF NOT EXISTS suppression_rules (
                id VARCHAR(36) PRIMARY KEY,
                company_id VARCHAR(36) REFERENCES companies(id) ON DELETE CASCADE,
                pattern VARCHAR(255) NOT NULL,
                reason TEXT,
                created_by VARCHAR(255) DEFAULT 'Support Engineer',
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT NOW()
            )
        """))
    print("Phase 3 migration complete.")


if __name__ == "__main__":
    migrate()
