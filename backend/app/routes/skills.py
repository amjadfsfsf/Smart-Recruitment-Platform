"""
User skill endpoints.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.data import get_db
from app.data import models as m
from app.data import schemas as s
from app.services.jobs.skill_source import normalize_skill_name, search_skills

router = APIRouter(tags=["skills"])


@router.get("/skills/search", response_model=list[str])
def search_skill_suggestions(
    q: str = Query("", max_length=120, description="Search text for skill suggestions"),
    limit: int = Query(15, ge=1, le=50, description="Maximum number of results to return"),
    db: Session = Depends(get_db),
) -> list[str]:
    """
    Return persisted skill suggestions filtered by the query text.
    """
    return search_skills(db, q, limit)


@router.post("/skills", response_model=s.UserSkillRead, status_code=status.HTTP_201_CREATED)
def create_skill(payload: s.UserSkillCreate, db: Session = Depends(get_db)) -> s.UserSkillRead:
    """
    Attach a skill to a user.
    """
    user = db.get(m.User, payload.user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    skill_name = normalize_skill_name(payload.skill_name)
    if not skill_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Skill name is required.")

    existing = (
        db.query(m.UserSkill)
        .filter(m.UserSkill.user_id == payload.user_id)
        .filter(func.lower(m.UserSkill.skill_name) == skill_name.lower())
        .first()
    )
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Skill already exists.")

    skill = m.UserSkill(user_id=payload.user_id, skill_name=skill_name, level=payload.level)
    db.add(skill)
    db.commit()
    db.refresh(skill)
    return skill


@router.get("/users/{user_id}/skills", response_model=list[s.UserSkillRead])
def list_user_skills(user_id: int, db: Session = Depends(get_db)) -> list[s.UserSkillRead]:
    """
    List all skills for a specific user.
    """
    user = db.get(m.User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    return db.query(m.UserSkill).filter(m.UserSkill.user_id == user_id).all()
