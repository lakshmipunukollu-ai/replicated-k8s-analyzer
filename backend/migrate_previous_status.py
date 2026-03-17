"""Add previous_status column to bundles for archive/restore."""
from sqlalchemy import inspect
from app.database import engine
import sqlalchemy as sa


def migrate():
    inspector = inspect(engine)
    cols = [c["name"] for c in inspector.get_columns("bundles")]
    if "previous_status" in cols:
        print("previous_status already present.")
        return
    with engine.begin() as conn:
        conn.execute(sa.text("ALTER TABLE bundles ADD COLUMN previous_status VARCHAR(50)"))
    print("previous_status migration complete.")


if __name__ == "__main__":
    migrate()
