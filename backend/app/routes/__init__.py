"""
Route package that groups FastAPI routers.
"""

from fastapi import APIRouter

from app.routes import courses, jobs, skills, users

api_router = APIRouter()

# Users and their skills
api_router.include_router(users.router)
api_router.include_router(skills.router)

# Target jobs, job skills, and skill-gap analysis
api_router.include_router(jobs.router)

# Courses
api_router.include_router(courses.router)

__all__ = ["api_router"]
