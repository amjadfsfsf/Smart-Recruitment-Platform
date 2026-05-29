from __future__ import annotations

import json
import logging
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)

from app.services.cv.resume_builder.schemas import (
    DeletedSectionsResponse,
    GenerateResumeRequest,
    GenerateResumeResponse,
    GenerateSummaryRequest,
    GenerateSummaryResponse,
    ResumeResponse,
    ResumeStateRequest,
    RewriteRequest,
    RewriteResponse,
    SectionActionRequest,
    SectionActionResponse,
)
from app.services.cv.resume_builder.service import (
    ResumeBuilderError,
    generate_resume_draft,
    generate_summary_versions,
    get_deleted_resume_sections,
    get_resume_builder_state,
    resolve_resume_user_id,
    restore_resume_section,
    rewrite_text,
    save_resume_builder_state,
    soft_delete_resume_section,
)

router = APIRouter(
    prefix="/api/resume-builder",
    tags=["resume-builder"],
)


def _http_error(exc: ResumeBuilderError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=exc.message)


def _resolve_user_id(
    request: Request,
    query_user_id: int | None = None,
    payload_user_id: int | None = None,
) -> int:
    raw_user_id = request.headers.get("x-user-id") or query_user_id or payload_user_id
    try:
        return resolve_resume_user_id(raw_user_id)
    except ResumeBuilderError as exc:
        raise _http_error(exc) from exc


@router.post("/generate")
async def generate_resume(payload: GenerateResumeRequest):
    try:
        logger.info(f"Generating resume for jobTitle: {payload.jobTitle}")
        
        if not payload.jobTitle or not str(payload.jobTitle).strip():
            return JSONResponse(
                status_code=400,
                content={"status": "error", "message": "Job Title is required."}
            )

        data = generate_resume_draft(payload)
        logger.info("Structured resume draft result: %s", json.dumps(data, ensure_ascii=False))
        return {"status": "success", "data": data}
        
    except Exception as exc:
        logger.error(f"Generate resume failed: {exc}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={
                "status": "error", 
                "message": getattr(exc, "message", None) or str(exc) or "Failed to generate resume"
            }
        )


@router.get("", response_model=ResumeResponse)
async def get_resume(
    request: Request,
    user_id: int | None = Query(default=None, alias="userId"),
) -> ResumeResponse:
    resolved_user_id = _resolve_user_id(request, query_user_id=user_id)

    try:
        data = get_resume_builder_state(resolved_user_id)
    except ResumeBuilderError as exc:
        raise _http_error(exc) from exc

    return ResumeResponse(data=data)


@router.put("", response_model=ResumeResponse)
async def save_resume(
    request: Request,
    payload: ResumeStateRequest,
    user_id: int | None = Query(default=None, alias="userId"),
) -> ResumeResponse:
    resolved_user_id = _resolve_user_id(
        request,
        query_user_id=user_id,
        payload_user_id=payload.userId,
    )

    try:
        data = save_resume_builder_state(resolved_user_id, payload.model_dump(exclude_none=True))
    except ResumeBuilderError as exc:
        raise _http_error(exc) from exc

    return ResumeResponse(data=data)


@router.get("/sections/deleted", response_model=DeletedSectionsResponse)
async def get_deleted_sections(
    request: Request,
    user_id: int | None = Query(default=None, alias="userId"),
) -> DeletedSectionsResponse:
    resolved_user_id = _resolve_user_id(request, query_user_id=user_id)

    try:
        data = get_deleted_resume_sections(resolved_user_id)
    except ResumeBuilderError as exc:
        raise _http_error(exc) from exc

    return DeletedSectionsResponse(data=data)


@router.post(
    "/sections/{section_key}/soft-delete",
    response_model=SectionActionResponse,
)
async def soft_delete_section(
    section_key: str,
    request: Request,
    payload: SectionActionRequest | None = None,
    user_id: int | None = Query(default=None, alias="userId"),
) -> SectionActionResponse:
    resolved_user_id = _resolve_user_id(
        request,
        query_user_id=user_id,
        payload_user_id=payload.userId if payload else None,
    )

    try:
        data = soft_delete_resume_section(resolved_user_id, section_key)
    except ResumeBuilderError as exc:
        raise _http_error(exc) from exc

    return SectionActionResponse(data=data)


@router.post(
    "/sections/{section_key}/restore",
    response_model=SectionActionResponse,
)
async def restore_section(
    section_key: str,
    request: Request,
    payload: SectionActionRequest | None = None,
    user_id: int | None = Query(default=None, alias="userId"),
) -> SectionActionResponse:
    resolved_user_id = _resolve_user_id(
        request,
        query_user_id=user_id,
        payload_user_id=payload.userId if payload else None,
    )

    try:
        data = restore_resume_section(resolved_user_id, section_key)
    except ResumeBuilderError as exc:
        raise _http_error(exc) from exc

    return SectionActionResponse(data=data)


@router.post("/rewrite", response_model=RewriteResponse)
async def rewrite(request: RewriteRequest) -> RewriteResponse:
    try:
        rewritten = rewrite_text(
            request.text,
            request.section,
            request.fieldName,
            request.fieldLabel,
            request.skills,
            request.experience,
        )
    except ResumeBuilderError as exc:
        raise _http_error(exc) from exc

    return RewriteResponse(rewritten=rewritten)


@router.post("/generate-summary", response_model=GenerateSummaryResponse)
async def generate_summary(request: GenerateSummaryRequest) -> GenerateSummaryResponse:
    try:
        summaries = generate_summary_versions(request)
    except ResumeBuilderError as exc:
        raise _http_error(exc) from exc

    summary_lookup = {item.get("id"): item.get("summary", "") for item in summaries}
    return GenerateSummaryResponse(
        summaries=summaries,
        general=summary_lookup.get("balanced", ""),
        results=summary_lookup.get("impact", ""),
        tools=summary_lookup.get("technical", ""),
    )
