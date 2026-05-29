"""
Database configuration for the Smart Recruitment Platform backend.

Uses SQLite by default for local development, but can be swapped to PostgreSQL
by setting the DATABASE_URL environment variable (e.g. postgres://user:pass@host/db).
"""

import os
from pathlib import Path
from typing import Generator

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from app.services.jobs.role_utils import resolve_desired_job_title


# Allow easy upgrade to PostgreSQL by overriding DATABASE_URL.
DEFAULT_SQLITE_PATH = Path(__file__).resolve().parents[2] / "careerpath.db"
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DEFAULT_SQLITE_PATH.as_posix()}")

# SQLite needs check_same_thread=False when used with FastAPI.
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
    future=True,
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
    expire_on_commit=False,
    future=True,
)

Base = declarative_base()


def ensure_sqlite_schema_updates() -> None:
    """
    Apply lightweight SQLite column additions for local development.
    """
    if not DATABASE_URL.startswith("sqlite"):
        return

    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    if "users" not in tables:
        return

    existing_columns = {column["name"] for column in inspector.get_columns("users")}
    skill_gap_columns = (
        {column["name"] for column in inspector.get_columns("skill_gap_history")}
        if "skill_gap_history" in tables
        else set()
    )

    statements = []
    if "role" not in existing_columns:
        statements.append("ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'user'")
    if "cv_path" not in existing_columns:
        statements.append("ALTER TABLE users ADD COLUMN cv_path VARCHAR(400)")
    if "field_of_study" not in existing_columns:
        statements.append("ALTER TABLE users ADD COLUMN field_of_study VARCHAR(160)")
    if "desired_job_title" not in existing_columns:
        statements.append("ALTER TABLE users ADD COLUMN desired_job_title VARCHAR(160)")
    if "preferred_language" not in existing_columns:
        statements.append("ALTER TABLE users ADD COLUMN preferred_language VARCHAR(10)")
    company_columns = {
        "logo_url": "VARCHAR(500)",
        "banner_url": "VARCHAR(500)",
        "industry": "VARCHAR(160)",
        "company_size": "VARCHAR(80)",
        "founded_year": "INTEGER",
        "website": "VARCHAR(500)",
        "linkedin": "VARCHAR(500)",
        "location": "VARCHAR(240)",
        "country": "VARCHAR(120)",
        "city": "VARCHAR(120)",
        "about": "TEXT",
        "mission": "TEXT",
        "vision": "TEXT",
        "culture": "TEXT",
        "technologies": "JSON",
        "hiring_focus_areas": "JSON",
        "work_mode": "VARCHAR(80)",
        "working_hours": "VARCHAR(160)",
        "benefits": "JSON",
        "hr_email": "VARCHAR(160)",
        "support_email": "VARCHAR(160)",
        "phone_number": "VARCHAR(80)",
        "github": "VARCHAR(500)",
        "twitter": "VARCHAR(500)",
        "facebook": "VARCHAR(500)",
        "social_links": "JSON",
        "verified_company": "BOOLEAN NOT NULL DEFAULT 0",
    }
    for column_name, column_type in company_columns.items():
        if column_name not in existing_columns:
            statements.append(f"ALTER TABLE users ADD COLUMN {column_name} {column_type}")
    if "skill_gap_history" in tables and "critical_state_key" not in skill_gap_columns:
        statements.append("ALTER TABLE skill_gap_history ADD COLUMN critical_state_key VARCHAR(512)")
    if "skill_gap_history" in tables and "required_skills" not in skill_gap_columns:
        statements.append("ALTER TABLE skill_gap_history ADD COLUMN required_skills JSON")
    if "skill_gap_history" in tables and "required_skill_priority" not in skill_gap_columns:
        statements.append("ALTER TABLE skill_gap_history ADD COLUMN required_skill_priority JSON")

    with engine.begin() as connection:
        for stmt in statements:
            connection.execute(text(stmt))

        if "skill_gap_history" in tables:
            connection.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_skill_gap_history_critical_state_key "
                    "ON skill_gap_history (critical_state_key)"
                )
            )

        rows = connection.execute(
            text(
                """
                SELECT id, desired_job_title, target_role
                FROM users
                WHERE desired_job_title IS NULL OR TRIM(desired_job_title) = ''
                """
            )
        ).mappings()

        for row in rows:
            connection.execute(
                text("UPDATE users SET desired_job_title = :desired_job_title WHERE id = :id"),
                {
                    "id": row["id"],
                    "desired_job_title": resolve_desired_job_title(
                        row.get("desired_job_title"),
                        row.get("target_role"),
                        default="",
                    ),
                },
            )


def get_db() -> Generator[Session, None, None]:
    """
    FastAPI dependency that yields a database session and cleans it up safely.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
