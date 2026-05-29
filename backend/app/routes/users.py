"""
User and profile endpoints.
"""

from __future__ import annotations

from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.security import create_access_token, detect_role, get_current_user, hash_password, verify_password
from app.data import get_db
from app.data import models as m
from app.data import schemas as s
from app.data.models import User
from app.services.jobs.role_utils import resolve_desired_job_title
from app.services.jobs.skill_source import normalize_skill_name

router = APIRouter()
profile_router = APIRouter(prefix="/api/profile")


class LoginRequest(BaseModel):
    email: str
    password: str


def _serialize_current_user(user: m.User) -> dict:
    desired_job_title = resolve_desired_job_title(
        user.desired_job_title,
        user.target_role,
        default="",
    )
    skills = [skill.skill_name for skill in user.skills]
    skill_entries = [
        {
            "id": skill.id,
            "skill_name": skill.skill_name,
            "level": skill.level,
        }
        for skill in user.skills
    ]

    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "education_level": user.education_level,
        "field_of_study": user.field_of_study,
        "experience_level": user.experience_level,
        "desired_job_title": desired_job_title,
        "target_role": user.target_role,
        "preferred_language": user.preferred_language,
        "skills": skills,
        "skill_entries": skill_entries,
        "profile": {
            "skills": skills,
            "interests": [],
            "education": user.education_level or "",
            "field_of_study": user.field_of_study or "",
            "experience": user.experience_level or "",
            "target_career": desired_job_title,
            "career_goal": user.target_role or "",
        },
    }


def _serialize_resume_profile(user: m.User) -> dict:
    desired_job_title = resolve_desired_job_title(
        user.desired_job_title,
        user.target_role,
        default="",
    )
    skills = [skill.skill_name for skill in user.skills if skill.skill_name]
    education: list[dict[str, str]] = []

    if user.education_level or user.field_of_study:
        degree_parts = [part for part in [user.education_level, user.field_of_study] if part]
        education.append(
            {
                "universityName": "",
                "degree": " in ".join(degree_parts),
                "gpa": "",
                "startYear": "",
                "endYear": "",
            }
        )

    return {
        "fullName": user.full_name or "",
        "email": user.email or "",
        "phone": "",
        "location": "",
        "links": [],
        "education": education,
        "experience": [],
        "skills": skills,
        "educationLevel": user.education_level or "",
        "fieldOfStudy": user.field_of_study or "",
        "experienceLevel": user.experience_level or "",
        "desiredJobTitle": desired_job_title,
        "targetRole": user.target_role or "",
    }


def _get_attached_user(db: Session, user_id: int) -> m.User:
    user = db.get(m.User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    return user


@router.post("/", response_model=s.UserRead, status_code=status.HTTP_201_CREATED)
def create_user(payload: s.UserCreate, db: Session = Depends(get_db)) -> s.UserRead:
    existing = db.query(m.User).filter(m.User.email == payload.email.lower()).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered.",
        )

    normalized_skills: list[str] = []
    seen = set()
    for skill in payload.skills:
        name = normalize_skill_name(skill.skill_name)
        if not name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Skill name is required."
            )
        key = name.lower()
        if key in seen:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Duplicate skills are not allowed."
            )
        seen.add(key)
        normalized_skills.append(name)

    if not normalized_skills:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At least one skill is required.")

    role = detect_role(payload.email)

    user = m.User(
        full_name=payload.full_name.strip(),
        email=payload.email.lower(),
        password_hash=payload.password,
        education_level=payload.education_level,
        field_of_study=payload.field_of_study.strip(),
        experience_level=payload.experience_level,
        desired_job_title=payload.desired_job_title,
        target_role=payload.target_role,
        preferred_language=payload.preferred_language or "en",
        role=role,
    )

    try:
        db.add(user)
        db.flush()  # assign ID before adding related skills

        for skill_name in normalized_skills:
            db.add(m.UserSkill(user_id=user.id, skill_name=skill_name))

        db.commit()
        db.refresh(user)
        return user
    except Exception:
        db.rollback()
        raise


@router.post("/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(m.User).filter(m.User.email == payload.email.lower()).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    role = getattr(user, "role", None) or detect_role(user.email)
    access_token = create_access_token(data={"sub": str(user.id), "role": role})
    return {
        "message": "Login successful",
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "full_name": user.full_name,
            "email": user.email,
            "role": role,
            "education_level": user.education_level,
            "field_of_study": user.field_of_study,
            "experience_level": user.experience_level,
            "desired_job_title": resolve_desired_job_title(
                user.desired_job_title,
                user.target_role,
                default="",
            ),
            "target_role": user.target_role,
            "preferred_language": user.preferred_language,
        },
    }


@router.get("/me")
def get_me(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = _get_attached_user(db, current_user.id)
    return _serialize_current_user(user)


@profile_router.get("/me")
def get_profile_me(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = _get_attached_user(db, current_user.id)
    return _serialize_resume_profile(user)


@router.put("/me/profile")
def update_me_profile(
    payload: s.UserProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = _get_attached_user(db, current_user.id)

    if payload.full_name is not None:
        user.full_name = payload.full_name.strip()
    if payload.education_level is not None:
        user.education_level = payload.education_level.strip() or None
    if payload.field_of_study is not None:
        user.field_of_study = payload.field_of_study.strip() or None
    if payload.experience_level is not None:
        user.experience_level = payload.experience_level.strip() or None
    if payload.desired_job_title is not None:
        user.desired_job_title = payload.desired_job_title.strip() or None
    if payload.target_role is not None:
        user.target_role = payload.target_role.strip() or None
    if payload.preferred_language is not None:
        user.preferred_language = (payload.preferred_language or "").strip() or None

    db.commit()
    db.refresh(user)
    return _serialize_current_user(user)


@router.post("/me/skills", response_model=s.UserSkillRead, status_code=status.HTTP_201_CREATED)
def add_me_skill(
    payload: s.CurrentUserSkillCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> s.UserSkillRead:
    user = _get_attached_user(db, current_user.id)

    normalized_skill = normalize_skill_name(payload.skill_name)
    if not normalized_skill:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Skill name is required.")

    existing = (
        db.query(m.UserSkill)
        .filter(m.UserSkill.user_id == user.id)
        .filter(func.lower(m.UserSkill.skill_name) == normalized_skill.lower())
        .first()
    )
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Skill already exists.")

    skill = m.UserSkill(user_id=user.id, skill_name=normalized_skill, level=payload.level)
    db.add(skill)
    db.commit()
    db.refresh(skill)
    return skill


@router.delete(
    "/me/skills/{skill_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
def remove_me_skill(
    skill_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Delete a skill from the current user's profile.
    """

    skill = (
        db.query(m.UserSkill)
        .filter(m.UserSkill.id == skill_id)
        .filter(m.UserSkill.user_id == current_user.id)
        .first()
    )

    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")

    db.delete(skill)
    db.commit()

    return Response(status_code=204)


@router.get("/{user_id}", response_model=s.UserRead)
def get_user(user_id: int, db: Session = Depends(get_db)) -> s.UserRead:
    user = db.get(m.User, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )
    return user
