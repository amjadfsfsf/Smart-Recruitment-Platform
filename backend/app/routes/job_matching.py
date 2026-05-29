from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, selectinload

from app.core.security import get_current_user, require_user
from app.data import get_db
from app.data.models import User
from app.services.jobs.job_matching_service import match_jobs
import traceback

router = APIRouter()


class JobMatchingRequest(BaseModel):
    top_k: int = Field(default=50, ge=1, le=100)
    fetch_limit: int = Field(default=100, ge=1, le=100)


@router.post("/job-matching")
def job_matching(
    payload: JobMatchingRequest,
    page: int = Query(1, ge=1, description="Page number for upstream job search"),
    current_user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    try:
        print("current_user.id =", current_user.id)
        print("top_k =", payload.top_k)
        print("fetch_limit =", payload.fetch_limit)

        user_with_skills = (
            db.query(User)
            .options(selectinload(User.skills))
            .filter(User.id == current_user.id)
            .first()
        )
        if not user_with_skills:
            raise ValueError("User not found.")

        result = match_jobs(
            user_with_skills,
            location="any",
            top_k=payload.top_k,
            experience_level=user_with_skills.experience_level if hasattr(user_with_skills, "experience_level") else None,
            page=page,
        )

        
        return result

    except ValueError as e:
        print("VALUE ERROR:", str(e))
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        print("JOB MATCHING ERROR:", str(e))
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
