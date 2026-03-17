from app.database import engine
from app.models import Base
import sqlalchemy as sa


def migrate():
    with engine.begin() as conn:
        # Add companies table
        conn.execute(sa.text("""
            CREATE TABLE IF NOT EXISTS companies (
                id VARCHAR(36) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                slug VARCHAR(255) UNIQUE NOT NULL,
                tier VARCHAR(50) DEFAULT 'starter',
                created_at TIMESTAMP DEFAULT NOW()
            )
        """))
        # Add projects table
        conn.execute(sa.text("""
            CREATE TABLE IF NOT EXISTS projects (
                id VARCHAR(36) PRIMARY KEY,
                company_id VARCHAR(36) REFERENCES companies(id),
                name VARCHAR(255) NOT NULL,
                app_version VARCHAR(50),
                created_at TIMESTAMP DEFAULT NOW()
            )
        """))
        # Add new columns to bundles (ignore errors if columns already exist)
        for col_sql in [
            "ALTER TABLE bundles ADD COLUMN IF NOT EXISTS company_id VARCHAR(36) REFERENCES companies(id)",
            "ALTER TABLE bundles ADD COLUMN IF NOT EXISTS project_id VARCHAR(36) REFERENCES projects(id)",
            "ALTER TABLE bundles ADD COLUMN IF NOT EXISTS app_version VARCHAR(50)",
            "ALTER TABLE bundles ADD COLUMN IF NOT EXISTS assigned_to VARCHAR(255)",
            "ALTER TABLE bundles ADD COLUMN IF NOT EXISTS triage_status VARCHAR(50) DEFAULT 'unassigned'",
            "ALTER TABLE bundles ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP",
            "ALTER TABLE bundles ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP",
            "ALTER TABLE bundles ADD COLUMN IF NOT EXISTS s3_key VARCHAR(500)",
        ]:
            conn.execute(sa.text(col_sql))
    print("Migration complete.")


if __name__ == "__main__":
    migrate()
