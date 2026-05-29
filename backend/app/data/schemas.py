"""
Pydantic schemas for request/response validation.
"""

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.services.jobs.role_utils import (
    clean_text as clean_role_text,
    resolve_desired_job_title,
)
from typing import List, Optional, Any
from app.services.jobs.skill_source import normalize_skill_name


def _normalize_role_payload(data: object, *, allow_profile_description: bool = False) -> object:
    if not isinstance(data, dict):
        return data

    normalized = dict(data)
    target_role_source = normalized.get("target_role")
    if allow_profile_description and not target_role_source:
        target_role_source = normalized.get("profile_description")

    desired_job_title = resolve_desired_job_title(
        normalized.get("desired_job_title"),
        target_role_source,
        default="",
    )
    target_role = clean_role_text(target_role_source)

    if desired_job_title:
        normalized["desired_job_title"] = desired_job_title

    if desired_job_title and target_role and desired_job_title.lower() == target_role.lower():
        target_role = ""

    normalized["target_role"] = target_role or None
    if allow_profile_description:
        normalized.pop("profile_description", None)

    return normalized

# -----------------------------
# User schemas
# -----------------------------


class UserBase(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=120)
    email: EmailStr
    education_level: Optional[str] = None
    field_of_study: Optional[str] = Field(default=None, max_length=160)
    experience_level: Optional[str] = None
    desired_job_title: Optional[str] = Field(default=None, max_length=160)
    target_role: Optional[str] = Field(default=None, max_length=2000)
    preferred_language: Optional[str] = Field(default=None, max_length=10, description="Preferred language code (en|ar)")

    @model_validator(mode="before")
    @classmethod
    def normalize_role_fields(cls, data):
        return _normalize_role_payload(data)

    @field_validator("desired_job_title", "target_role", "field_of_study", "education_level", "experience_level", "preferred_language")
    @classmethod
    def clean_optional_text_fields(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = clean_role_text(value)
        return cleaned or None


class SignupSkill(BaseModel):
    skill_name: str = Field(..., min_length=1, max_length=120)


class UserCreate(UserBase):
    # Override to make required during signup
    field_of_study: str = Field(..., max_length=160)
    desired_job_title: str = Field(..., min_length=1, max_length=160)

    password: str = Field(..., min_length=6, max_length=128)
    confirm_password: str = Field(..., min_length=6, max_length=128)
    skills: list[SignupSkill] = Field(..., min_length=1)

    @model_validator(mode="after")
    def validate_passwords_match(self):
        if self.password != self.confirm_password:
            raise ValueError("Passwords do not match")
        return self


class UserRead(UserBase):
    id: int

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="after")
    def ensure_desired_job_title(self):
        self.desired_job_title = resolve_desired_job_title(
            self.desired_job_title,
            self.target_role,
            default="",
        ) or None
        return self


class UserProfileUpdate(BaseModel):
    full_name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    education_level: Optional[str] = Field(default=None, max_length=80)
    field_of_study: Optional[str] = Field(default=None, max_length=160)
    experience_level: Optional[str] = Field(default=None, max_length=80)
    desired_job_title: Optional[str] = Field(default=None, max_length=160)
    target_role: Optional[str] = Field(default=None, max_length=2000)
    preferred_language: Optional[str] = Field(default=None, max_length=10)

    @model_validator(mode="before")
    @classmethod
    def normalize_role_fields(cls, data):
        return _normalize_role_payload(data)

    @field_validator("desired_job_title", "target_role", "field_of_study", "education_level", "experience_level", "preferred_language")
    @classmethod
    def clean_optional_text_fields(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = clean_role_text(value)
        return cleaned or None


class CurrentUserSkillCreate(BaseModel):
    skill_name: str = Field(..., min_length=1, max_length=120)
    level: Optional[str] = Field(default=None, max_length=50)


# -----------------------------
# User skill schemas
# -----------------------------


class UserSkillBase(BaseModel):
    skill_name: str = Field(..., min_length=1, max_length=120)
    level: Optional[str] = Field(default=None, description="Entry-Level/Intermediate/Expert")


class UserSkillCreate(UserSkillBase):
    user_id: int


class UserSkillRead(UserSkillBase):
    id: int
    user_id: int

    model_config = ConfigDict(from_attributes=True)


# -----------------------------
# Target job schemas
# -----------------------------


class TargetJobBase(BaseModel):
    title: str = Field(..., min_length=2, max_length=120)
    description: Optional[str] = None


class TargetJobCreate(TargetJobBase):
    pass


class TargetJobRead(TargetJobBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


# -----------------------------
# Job skill schemas
# -----------------------------


class JobSkillBase(BaseModel):
    skill_name: str = Field(..., min_length=1, max_length=120)
    importance: Optional[str] = None


class JobSkillCreate(JobSkillBase):
    job_id: int


class JobSkillRead(JobSkillBase):
    id: int
    job_id: int

    model_config = ConfigDict(from_attributes=True)


# -----------------------------
# Course schemas
# -----------------------------


class CourseBase(BaseModel):
    title: str = Field(..., min_length=2, max_length=200)
    provider: str = Field(..., min_length=1, max_length=120)
    skill_name: str = Field(..., min_length=1, max_length=120)
    level: Optional[str] = None
    url: str = Field(..., max_length=400)


class CourseCreate(CourseBase):
    pass


class CourseRead(CourseBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


# -----------------------------
# Saved job schemas
# -----------------------------


class SavedJobBase(BaseModel):
    external_job_id: str = Field(..., max_length=120)
    title: str = Field(..., max_length=200)
    company: str = Field(..., max_length=120)
    location: Optional[str] = None
    url: str = Field(..., max_length=400)


class SavedJobCreate(SavedJobBase):
    user_id: int


class SavedJobRead(SavedJobBase):
    id: int
    user_id: int

    model_config = ConfigDict(from_attributes=True)


# -----------------------------
# Skill gap response schema
# -----------------------------


class SkillGapResponse(BaseModel):
    user_id: int
    job_id: int
    existing_skills: list[str]
    missing_skills: list[str]
    match_percentage: float


class SkillGapAnalyzeRequest(BaseModel):
    education: str = Field(..., min_length=1, max_length=120)
    experience: str = Field(..., min_length=1, max_length=120)
    field: str = Field(default="", max_length=160)
    skills: list[str] = Field(default_factory=list)
    desired_job_title: str = Field(..., min_length=1, max_length=160)
    target_role: Optional[str] = Field(default=None, max_length=2000)

    @model_validator(mode="before")
    @classmethod
    def normalize_role_fields(cls, data):
        return _normalize_role_payload(data, allow_profile_description=True)

    @field_validator("education", "experience", "desired_job_title")
    @classmethod
    def validate_required_text(cls, value: str) -> str:
        cleaned = clean_role_text(value)
        if not cleaned:
            raise ValueError("Field must not be empty")
        return cleaned

    @field_validator("field")
    @classmethod
    def validate_optional_field(cls, value: str) -> str:
        return clean_role_text(value) or ""

    @field_validator("target_role")
    @classmethod
    def validate_optional_target_role(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = clean_role_text(value)
        return cleaned or None

    @field_validator("skills")
    @classmethod
    def validate_skills(cls, values: list[str]) -> list[str]:
        cleaned: list[str] = []
        seen: set[str] = set()
        for value in values:
            normalized = normalize_skill_name(value)
            if not normalized:
                continue
            key = normalized.lower()
            if key in seen:
                continue
            seen.add(key)
            cleaned.append(normalized)

        return cleaned

class SkillGapRecomputeRequest(BaseModel):
    skills: Optional[list[Any]] = None

    @field_validator("skills")
    @classmethod
    def validate_skills(cls, values: Optional[list[Any]]) -> Optional[list[str]]:
        if values is None:
            return None
        cleaned: list[str] = []
        seen: set[str] = set()
        for value in values:
            if isinstance(value, dict):
                skill_str = value.get("skill_name", "")
            else:
                skill_str = str(value)
            normalized = normalize_skill_name(skill_str)
            if not normalized:
                continue
            key = normalized.lower()
            if key in seen:
                continue
            seen.add(key)
            cleaned.append(normalized)
        return cleaned


class SkillGapLatestRequest(BaseModel):
    education: str = Field(..., min_length=1, max_length=120)
    experience: str = Field(..., min_length=1, max_length=120)
    desired_job_title: str = Field(..., min_length=1, max_length=160)
    target_role: Optional[str] = Field(default=None, max_length=2000)

    @model_validator(mode="before")
    @classmethod
    def normalize_role_fields(cls, data):
        return _normalize_role_payload(data, allow_profile_description=True)

    @field_validator("education", "experience", "desired_job_title")
    @classmethod
    def validate_required_text(cls, value: str) -> str:
        cleaned = clean_role_text(value)
        if not cleaned:
            raise ValueError("Field must not be empty")
        return cleaned

    @field_validator("target_role")
    @classmethod
    def validate_optional_target_role(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = clean_role_text(value)
        return cleaned or None


class BasicSkillGapAnalysis(BaseModel):
    existing_skills: list[str] = Field(default_factory=list)
    missing_skills: list[str] = Field(default_factory=list)
    match_percentage: float = 0


class AIMissingSkills(BaseModel):
    technical: list[str] = Field(default_factory=list)
    tools: list[str] = Field(default_factory=list)
    soft: list[str] = Field(default_factory=list)


class AISkillPriority(BaseModel):
    high: list[str] = Field(default_factory=list)
    medium: list[str] = Field(default_factory=list)
    low: list[str] = Field(default_factory=list)


class LearningRoadmapStep(BaseModel):
    step: int = Field(..., ge=1)
    title: str = Field(default="")
    description: str = Field(default="")


class SemanticSkillMatch(BaseModel):
    skill: str
    matched_with: str = ""
    similarity: float = 0.0
    type: Literal["semantic"] = "semantic"


class AISkillGapAnalysis(BaseModel):
    match_score: float = 0
    normalized_user_skills: list[str] = Field(default_factory=list)
    role_required_skills: AIMissingSkills = Field(default_factory=AIMissingSkills)
    missing_skills: AIMissingSkills = Field(default_factory=AIMissingSkills)
    skill_priority: AISkillPriority = Field(default_factory=AISkillPriority)
    required_skills_by_level: AISkillPriority = Field(default_factory=AISkillPriority)
    normalized_required_skills: list[str] = Field(default_factory=list)
    matched_skills: list[str] = Field(default_factory=list)
    exact_matches: list[str] = Field(default_factory=list)
    semantic_matches: list[SemanticSkillMatch] = Field(default_factory=list)
    skill_gap: list[str] = Field(default_factory=list)
    improvement_detected: bool = False
    improvement_reason: str = ""
    newly_acquired_skills: list[str] = Field(default_factory=list)
    newly_added_skills_detected: list[str] = Field(default_factory=list)
    still_missing_skills: list[str] = Field(default_factory=list)
    previous_match_score: Optional[float] = None
    score_delta: float = 0
    score_direction: Literal["up", "down", "flat"] = "flat"
    cached: bool = False
    created_at: Optional[str] = None


class SkillGapMissingByLevel(BaseModel):
    HIGH: list[str] = Field(default_factory=list)
    MEDIUM: list[str] = Field(default_factory=list)
    LOW: list[str] = Field(default_factory=list)


class SkillGapAnalyzeResponse(BaseModel):
    status: Literal["success"] = "success"
    score: float = 0
    normalized_user_skills: list[str] = Field(default_factory=list)
    required_skills: list[str] = Field(default_factory=list)
    normalized_required: list[str] = Field(default_factory=list)
    normalized_required_skills: list[str] = Field(default_factory=list)
    required_skills_by_level: SkillGapMissingByLevel = Field(default_factory=SkillGapMissingByLevel)
    missing_skills: list[str] = Field(default_factory=list)
    skill_gap: list[str] = Field(default_factory=list)
    matched_skills: list[str] = Field(default_factory=list)
    exact_matches: list[str] = Field(default_factory=list)
    semantic_matches: list[SemanticSkillMatch] = Field(default_factory=list)
    newly_added_skills_detected: list[str] = Field(default_factory=list)
    improvement_detected: bool = False
    missing_by_level: SkillGapMissingByLevel = Field(default_factory=SkillGapMissingByLevel)
    skills_snapshot: list[str] = Field(default_factory=list)
    source: Literal["gpt", "database"] = "gpt"
    created_at: Optional[str] = None
    basic_analysis: BasicSkillGapAnalysis
    ai_analysis: AISkillGapAnalysis


class SkillGapLatestResponse(BaseModel):
    status: Literal["success"] = "success"
    score: float = 0
    normalized_user_skills: list[str] = Field(default_factory=list)
    required_skills: list[str] = Field(default_factory=list)
    normalized_required: list[str] = Field(default_factory=list)
    normalized_required_skills: list[str] = Field(default_factory=list)
    required_skills_by_level: SkillGapMissingByLevel = Field(default_factory=SkillGapMissingByLevel)
    missing_by_level: SkillGapMissingByLevel = Field(default_factory=SkillGapMissingByLevel)
    skills_snapshot: list[str] = Field(default_factory=list)
    source: Literal["database"] = "database"
    created_at: Optional[str] = None


# -----------------------------
# Company job schemas
# -----------------------------


class CompanyJobCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=200)
    description: str = Field(..., min_length=10)
    required_skills: List[str] = Field(..., min_length=1)
    experience_level: Optional[str] = Field(default=None, max_length=80)

    @field_validator("required_skills")
    @classmethod
    def validate_required_skills(cls, values: List[str]) -> List[str]:
        cleaned: list[str] = []
        seen: set[str] = set()
        for v in values:
            norm = normalize_skill_name(v)
            if not norm:
                continue
            key = norm.lower()
            if key in seen:
                continue
            seen.add(key)
            cleaned.append(norm)
        if not cleaned:
            raise ValueError("At least one valid skill is required")
        return cleaned


class CompanyJobRead(BaseModel):
    id: int
    company_id: int
    title: str
    description: str
    required_skills: List[str]
    experience_level: Optional[str] = None
    created_at: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class CandidateScoreBreakdown(BaseModel):
    skills_weight: float = 0.45
    desc_weight: float = 0.30
    major_weight: float = 0.15
    title_weight: float = 0.10


class CandidateMatchResult(BaseModel):
    user_id: int
    full_name: str
    email: str
    experience_level: Optional[str] = None
    skills: List[str] = Field(default_factory=list)
    final_score: float = 0
    skills_score: float = 0
    desc_score: float = 0
    major_score: float = 0
    title_score: float = 0
    score_breakdown: CandidateScoreBreakdown = Field(default_factory=CandidateScoreBreakdown)
    # Backward-compatible aliases for existing recruiter card code.
    score: float = 0
    score_display: str = "0.00%"
    # The job's full required-skills array (kept verbatim, never truncated).
    required_skills: List[str] = Field(default_factory=list)
    exact_matches: List[str] = Field(default_factory=list)
    semantic_matches: List[SemanticSkillMatch] = Field(default_factory=list)
    missing_skills: List[str] = Field(default_factory=list)
    has_cv: bool = False
    hasCV: bool = False
    cv_filename: Optional[str] = None
    cv_url: Optional[str] = None
    cv_request_id: Optional[int] = None
    cv_request_status: Optional[str] = None
    cv_request_created_at: Optional[str] = None
    cv_request_completed_at: Optional[str] = None
    interview_session_id: Optional[int] = None
    interview_status: Optional[str] = None


class CompanyCandidateMatchResponse(BaseModel):
    job_id: int
    job_title: str
    job_required_skills: List[str] = Field(default_factory=list)
    total_candidates: int = 0
    candidates: List[CandidateMatchResult] = Field(default_factory=list)


class CVRequestCreate(BaseModel):
    candidate_id: int
    job_id: Optional[int] = None


class CVRequestRead(BaseModel):
    id: int
    candidate_id: int
    company_id: int
    job_id: Optional[int] = None
    status: str = "pending"
    created_at: Optional[str] = None
    completed_at: Optional[str] = None
    company: Optional[dict] = None
    candidate: Optional[dict] = None
    job: Optional[dict] = None


class InterviewQuestionPayload(BaseModel):
    id: Optional[int] = None
    question_text: str = Field(..., min_length=3, max_length=3000)
    category: str = Field(default="technical", max_length=80)
    difficulty: str = Field(default="medium", max_length=40)
    expected_answer_keywords: List[str] = Field(default_factory=list)
    required: bool = True
    order_index: int = 0

    @field_validator("question_text", "category", "difficulty")
    @classmethod
    def clean_question_text_fields(cls, value: str) -> str:
        cleaned = clean_role_text(value)
        if not cleaned:
            raise ValueError("Field must not be empty")
        return cleaned

    @field_validator("expected_answer_keywords")
    @classmethod
    def clean_expected_keywords(cls, values: List[str]) -> List[str]:
        cleaned: list[str] = []
        seen: set[str] = set()
        for value in values:
            keyword = clean_role_text(value)
            key = keyword.lower()
            if not keyword or key in seen:
                continue
            seen.add(key)
            cleaned.append(keyword)
        return cleaned


class InterviewSessionCreate(BaseModel):
    candidate_id: int
    job_id: Optional[int] = None


class InterviewTemplateUpdate(BaseModel):
    language: str = Field(default="en", max_length=10)
    interview_type: str = Field(default="technical", max_length=80)
    questions: List[InterviewQuestionPayload] = Field(..., min_length=1)


class InterviewQuestionRead(BaseModel):
    id: int
    question_text: str
    category: str = "technical"
    difficulty: str = "medium"
    expected_answer_keywords: List[str] = Field(default_factory=list)
    required: bool = True
    order_index: int = 0

    model_config = ConfigDict(from_attributes=True)


class InterviewAnswerRead(BaseModel):
    id: int
    question_id: Optional[int] = None
    answer_text: Optional[str] = None
    video_path: Optional[str] = None
    video_url: Optional[str] = None
    ai_feedback: Optional[Any] = None
    score: Optional[float] = None

    model_config = ConfigDict(from_attributes=True)


class InterviewSessionRead(BaseModel):
    id: int
    company_id: int
    candidate_id: int
    job_id: Optional[int] = None
    runtime_session_id: Optional[str] = None
    status: str = "draft"
    language: str = "en"
    interview_type: str = "technical"
    created_at: Optional[str] = None
    completed_at: Optional[str] = None
    candidate: Optional[dict] = None
    company: Optional[dict] = None
    job: Optional[dict] = None
    questions: List[InterviewQuestionRead] = Field(default_factory=list)
    answers: List[InterviewAnswerRead] = Field(default_factory=list)
    overall_score: Optional[float] = None
    analysis: Optional[Any] = None
    audio_score: Optional[Any] = None
    video_score: Optional[Any] = None
    scores: Optional[Any] = None
    candidate_position: Optional[Any] = None
    analysisScope: Optional[str] = None
    lastQuestionIndex: Optional[int] = None
    finalVideoPath: Optional[str] = None
    finalVideoUrl: Optional[str] = None


# -----------------------------
# CV parsing schemas
# -----------------------------


class CVParseResponse(BaseModel):
    full_name: str = ""
    email: str = ""
    education_level: str = ""
    experience_level: str = ""
    desired_job_title: str = ""
    target_role: str = ""
    skills: list[str] = Field(default_factory=list)
    summary: str = ""
