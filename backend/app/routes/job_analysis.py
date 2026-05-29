from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.security import get_current_user, require_user
from app.data import get_db
from app.data.models import User
from app.services.jobs.job_analysis_service import analyze_job

router = APIRouter(prefix="/job-analysis", tags=["job-analysis"])


class JobAnalysisRequest(BaseModel):
    job_title: str = Field(..., min_length=1, max_length=300)
    job_description: str = Field(default="", max_length=10000)
    job_skills: Optional[list[str]] = Field(default=None)


@router.post("/analyze")
async def analyze_job_endpoint(
    payload: JobAnalysisRequest,
    current_user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    try:
        result = await analyze_job(
            db=db,
            user_id=current_user.id,
            job_title=payload.job_title,
            job_description=payload.job_description,
            job_skills=payload.job_skills,
        )
        return result
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
