from app.database import engine
import sqlalchemy as sa


def migrate():
    with engine.begin() as conn:
        conn.execute(sa.text("""
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(36) PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                name VARCHAR(255),
                role VARCHAR(50) DEFAULT 'company_user',
                company_id VARCHAR(36) REFERENCES companies(id) ON DELETE SET NULL,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT NOW(),
                last_login TIMESTAMP
            )
        """))
    print("Auth migration complete.")


if __name__ == "__main__":
    migrate()
