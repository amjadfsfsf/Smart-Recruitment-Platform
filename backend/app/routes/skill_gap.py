"""
Skill-gap controller endpoints.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.data import get_db
from app.data import models as m
from app.data import schemas as s
from app.services.skill_gap.skill_gap_service import (
    analyze_skill_gap_for_user,
    get_latest_skill_gap_for_user,
    recompute_skill_gap_for_user,
)

router = APIRouter(tags=["skill-gap"])


@router.post(
    "/skill-gap/analyze",
    response_model=s.SkillGapAnalyzeResponse,
    response_model_exclude_none=True,
)
async def analyze_skill_gap_controller(
    payload: s.SkillGapAnalyzeRequest,
    current_user: m.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> s.SkillGapAnalyzeResponse:
    attached_user = db.get(m.User, current_user.id)
    if attached_user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    result = await analyze_skill_gap_for_user(
        db,
        user=attached_user,
        payload=payload.model_dump(),
    )
    return s.SkillGapAnalyzeResponse(**result)


import logging

logger = logging.getLogger(__name__)

@router.post(
    "/skill-gap/recompute",
    response_model=s.SkillGapAnalyzeResponse,
    response_model_exclude_none=True,
)
async def recompute_skill_gap_controller(
    payload: s.SkillGapRecomputeRequest,
    current_user: m.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> s.SkillGapAnalyzeResponse:
    logger.info(f"Recompute request for user {current_user.id} with payload: {payload.model_dump()}")
    
    attached_user = db.get(m.User, current_user.id)
    if attached_user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    try:
        result = await recompute_skill_gap_for_user(
            db,
            user=attached_user,
            payload=payload.model_dump(),
        )
        return s.SkillGapAnalyzeResponse(**result)
    except ValueError as e:
        logger.error(f"Recompute validation error: {str(e)}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post(
    "/skill-gap/latest",
    response_model=s.SkillGapLatestResponse,
    response_model_exclude_none=True,
)
async def latest_skill_gap_controller(
    payload: s.SkillGapLatestRequest,
    current_user: m.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> s.SkillGapLatestResponse:
    attached_user = db.get(m.User, current_user.id)
    if attached_user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    result = get_latest_skill_gap_for_user(
        db,
        user=attached_user,
        payload=payload.model_dump(),
    )
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No saved analysis was found for the current role settings.",
        )

    return s.SkillGapLatestResponse(**result)
