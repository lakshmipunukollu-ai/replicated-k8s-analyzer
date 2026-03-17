from app.database import engine
import sqlalchemy as sa


def migrate():
    with engine.begin() as conn:
        # Finding annotations table
        conn.execute(sa.text("""
            CREATE TABLE IF NOT EXISTS finding_annotations (
                id VARCHAR(36) PRIMARY KEY,
                finding_id VARCHAR(36) REFERENCES findings(id) ON DELETE CASCADE,
                bundle_id VARCHAR(36) REFERENCES bundles(id) ON DELETE CASCADE,
                author VARCHAR(255) NOT NULL DEFAULT 'Support Engineer',
                content TEXT NOT NULL,
                annotation_type VARCHAR(50) DEFAULT 'note',
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        """))
        # Alert rules table
        conn.execute(sa.text("""
            CREATE TABLE IF NOT EXISTS alert_rules (
                id VARCHAR(36) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                company_id VARCHAR(36) REFERENCES companies(id) ON DELETE CASCADE,
                trigger_severity VARCHAR(20),
                trigger_pattern VARCHAR(255),
                trigger_count INTEGER DEFAULT 1,
                trigger_window_hours INTEGER DEFAULT 24,
                channel VARCHAR(50) DEFAULT 'slack',
                destination VARCHAR(500),
                is_active BOOLEAN DEFAULT TRUE,
                last_triggered_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT NOW()
            )
        """))
        # Alert firing history
        conn.execute(sa.text("""
            CREATE TABLE IF NOT EXISTS alert_firings (
                id VARCHAR(36) PRIMARY KEY,
                rule_id VARCHAR(36) REFERENCES alert_rules(id) ON DELETE CASCADE,
                bundle_id VARCHAR(36) REFERENCES bundles(id),
                company_id VARCHAR(36),
                triggered_at TIMESTAMP DEFAULT NOW(),
                payload JSON
            )
        """))
    print("Phase 2 migration complete.")


if __name__ == "__main__":
    migrate()
