"""
SQLAlchemy models for persistent platform data.

Only platform/user data is stored here. Live job listings fetched from external
APIs are **not** persisted.
"""

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import relationship

from app.data.database import Base


class User(Base):
    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("email", name="uq_users_email"),)

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(120), nullable=False)
    email = Column(String(120), nullable=False, index=True)
    password_hash = Column(String(256), nullable=False)
    education_level = Column(String(80), nullable=True)
    field_of_study = Column(String(160), nullable=True)
    experience_level = Column(String(80), nullable=True)
    desired_job_title = Column(String(160), nullable=True)
    target_role = Column(Text, nullable=True)
    preferred_language = Column(String(10), nullable=True)
    role = Column(String(20), nullable=False, default="user")
    cv_path = Column(String(400), nullable=True)
    logo_url = Column(String(500), nullable=True)
    banner_url = Column(String(500), nullable=True)
    industry = Column(String(160), nullable=True)
    company_size = Column(String(80), nullable=True)
    founded_year = Column(Integer, nullable=True)
    website = Column(String(500), nullable=True)
    linkedin = Column(String(500), nullable=True)
    location = Column(String(240), nullable=True)
    country = Column(String(120), nullable=True)
    city = Column(String(120), nullable=True)
    about = Column(Text, nullable=True)
    mission = Column(Text, nullable=True)
    vision = Column(Text, nullable=True)
    culture = Column(Text, nullable=True)
    technologies = Column(JSON, nullable=False, default=list)
    hiring_focus_areas = Column(JSON, nullable=False, default=list)
    work_mode = Column(String(80), nullable=True)
    working_hours = Column(String(160), nullable=True)
    benefits = Column(JSON, nullable=False, default=list)
    hr_email = Column(String(160), nullable=True)
    support_email = Column(String(160), nullable=True)
    phone_number = Column(String(80), nullable=True)
    github = Column(String(500), nullable=True)
    twitter = Column(String(500), nullable=True)
    facebook = Column(String(500), nullable=True)
    social_links = Column(JSON, nullable=False, default=dict)
    verified_company = Column(Boolean, nullable=False, default=False)

    skills = relationship("UserSkill", back_populates="user", cascade="all, delete-orphan")
    saved_jobs = relationship("SavedJob", back_populates="user", cascade="all, delete-orphan")
    skill_gap_history = relationship(
        "SkillGapHistory",
        back_populates="user",
        cascade="all, delete-orphan",
        order_by="desc(SkillGapHistory.created_at)",
    )


class UserSkill(Base):
    __tablename__ = "user_skills"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    skill_name = Column(String(120), nullable=False)
    level = Column(String(50), nullable=True)  # e.g., beginner/intermediate/expert

    user = relationship("User", back_populates="skills")


class TargetJob(Base):
    __tablename__ = "target_jobs"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(120), nullable=False)
    description = Column(Text, nullable=True)

    required_skills = relationship("JobSkill", back_populates="job", cascade="all, delete-orphan")


class JobSkill(Base):
    __tablename__ = "job_skills"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("target_jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    skill_name = Column(String(120), nullable=False)
    importance = Column(String(50), nullable=True)  # e.g., required/nice-to-have or a priority label

    job = relationship("TargetJob", back_populates="required_skills")


class Course(Base):
    __tablename__ = "courses"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    provider = Column(String(120), nullable=False)
    skill_name = Column(String(120), nullable=False)
    level = Column(String(50), nullable=True)
    url = Column(String(400), nullable=False)


class SavedJob(Base):
    __tablename__ = "saved_jobs"
    __table_args__ = (UniqueConstraint("user_id", "external_job_id", name="uq_user_saved_job"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    external_job_id = Column(String(120), nullable=False)
    title = Column(String(200), nullable=False)
    company = Column(String(120), nullable=False)
    location = Column(String(120), nullable=True)
    url = Column(String(400), nullable=False)

    user = relationship("User", back_populates="saved_jobs")


class Job(Base):
    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True, index=True)
    job_title = Column(String, nullable=False)
    company = Column(String, nullable=False)
    location = Column(String, nullable=False)
    job_description = Column(Text, nullable=False)
    required_skills = Column(Text, nullable=False)  # JSON string
    apply_link = Column(String, nullable=False)


class CompanyJob(Base):
    __tablename__ = "company_jobs"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=False)
    required_skills = Column(JSON, nullable=False, default=list)
    experience_level = Column(String(80), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)

    company = relationship("User", backref="company_jobs")


class CVRequest(Base):
    __tablename__ = "cv_requests"
    __table_args__ = (UniqueConstraint("candidate_id", "company_id", "job_id", name="uq_cv_request_candidate_company_job"),)

    id = Column(Integer, primary_key=True, index=True)
    candidate_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    company_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    job_id = Column(Integer, ForeignKey("company_jobs.id", ondelete="SET NULL"), nullable=True, index=True)
    status = Column(String(40), nullable=False, default="pending", index=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    candidate = relationship("User", foreign_keys=[candidate_id], backref="candidate_cv_requests")
    company = relationship("User", foreign_keys=[company_id], backref="company_cv_requests")
    job = relationship("CompanyJob", backref="cv_requests")


class InterviewSession(Base):
    __tablename__ = "interview_sessions"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    candidate_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    job_id = Column(Integer, ForeignKey("company_jobs.id", ondelete="SET NULL"), nullable=True, index=True)
    runtime_session_id = Column(String(80), nullable=True, index=True)
    status = Column(String(40), nullable=False, default="draft", index=True)
    language = Column(String(10), nullable=False, default="en")
    interview_type = Column(String(80), nullable=False, default="technical")
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)

    company = relationship("User", foreign_keys=[company_id], backref="company_interview_sessions")
    candidate = relationship("User", foreign_keys=[candidate_id], backref="candidate_interview_sessions")
    job = relationship("CompanyJob", backref="interview_sessions")
    questions = relationship(
        "InterviewQuestion",
        back_populates="interview_session",
        cascade="all, delete-orphan",
        order_by="InterviewQuestion.order_index",
    )
    answers = relationship(
        "InterviewAnswer",
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="InterviewAnswer.id",
    )


class InterviewQuestion(Base):
    __tablename__ = "interview_questions"

    id = Column(Integer, primary_key=True, index=True)
    interview_session_id = Column(Integer, ForeignKey("interview_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    question_text = Column(Text, nullable=False)
    category = Column(String(80), nullable=False, default="technical")
    difficulty = Column(String(40), nullable=False, default="medium")
    expected_answer_keywords = Column(JSON, nullable=False, default=list)
    required = Column(Boolean, nullable=False, default=True)
    order_index = Column(Integer, nullable=False, default=0)

    interview_session = relationship("InterviewSession", back_populates="questions")


class InterviewAnswer(Base):
    __tablename__ = "interview_answers"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("interview_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    question_id = Column(Integer, ForeignKey("interview_questions.id", ondelete="SET NULL"), nullable=True, index=True)
    answer_text = Column(Text, nullable=True)
    video_path = Column(String(500), nullable=True)
    ai_feedback = Column(JSON, nullable=True)
    score = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    session = relationship("InterviewSession", back_populates="answers")
    question = relationship("InterviewQuestion")


class SkillEmbeddingCache(Base):
    """Persistent cache for skill embedding vectors keyed by normalized skill text."""

    __tablename__ = "skill_embedding_cache"
    __table_args__ = (UniqueConstraint("skill_key", "model", name="uq_skill_embedding_key_model"),)

    id = Column(Integer, primary_key=True, index=True)
    skill_key = Column(String(255), nullable=False, index=True)
    model = Column(String(80), nullable=False)
    embedding = Column(JSON, nullable=False, default=list)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class SkillGapHistory(Base):
    __tablename__ = "skill_gap_history"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    job_title = Column(String(160), nullable=False, index=True)
    critical_state_key = Column(String(512), nullable=True, index=True)
    match_score = Column(Float, nullable=False, default=0)
    previous_match_score = Column(Float, nullable=True)
    required_skills = Column(JSON, nullable=False, default=list)
    required_skill_priority = Column(JSON, nullable=False, default=dict)
    missing_skills = Column(JSON, nullable=False, default=dict)
    skill_priority = Column(JSON, nullable=False, default=dict)
    improvement_detected = Column(Boolean, nullable=False, default=False)
    improvement_reason = Column(Text, nullable=False, default="")
    newly_acquired_skills = Column(JSON, nullable=False, default=list)
    still_missing_skills = Column(JSON, nullable=False, default=list)
    user_skills_snapshot = Column(JSON, nullable=False, default=list)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)

    user = relationship("User", back_populates="skill_gap_history")
