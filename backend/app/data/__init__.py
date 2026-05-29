"""
Data layer package.

Exports SQLAlchemy Base so models can be imported cleanly.
"""

from app.data.database import Base, get_db

__all__ = ["Base", "get_db"]
