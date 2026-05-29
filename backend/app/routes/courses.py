"""
Course endpoints.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.data import get_db
from app.data import models as m
from app.data import schemas as s

router = APIRouter(prefix="/courses", tags=["courses"])


@router.post("", response_model=s.CourseRead, status_code=status.HTTP_201_CREATED)
def create_course(payload: s.CourseCreate, db: Session = Depends(get_db)) -> s.CourseRead:
    course = m.Course(
        title=payload.title.strip(),
        provider=payload.provider.strip(),
        skill_name=payload.skill_name.strip(),
        level=payload.level,
        url=payload.url,
    )
    db.add(course)
    db.commit()
    db.refresh(course)
    return course


@router.get("", response_model=list[s.CourseRead])
def list_courses(db: Session = Depends(get_db)) -> list[s.CourseRead]:
    return db.query(m.Course).all()


@router.get("/by-skill/{skill_name}", response_model=list[s.CourseRead])
def list_courses_by_skill(skill_name: str, db: Session = Depends(get_db)) -> list[s.CourseRead]:
    courses = db.query(m.Course).filter(m.Course.skill_name.ilike(f"%{skill_name}%")).all()
    if not courses:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No courses found for that skill.")
    return courses
