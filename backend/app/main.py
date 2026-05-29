from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

BASE_DIR = Path(__file__).resolve().parent.parent
UPLOADS_DIR = BASE_DIR / "uploads"
ENV_PATH = BASE_DIR / ".env"
load_dotenv(ENV_PATH)

from app.data import models
from app.data.database import engine, ensure_sqlite_schema_updates
from app.routes.cv_files import router as cv_files_router
from app.routes.cv_parser import router as cv_router
from app.routes.cv_requests import router as cv_requests_router
from app.routes.interview import router as interview_router
from app.routes.job_matching import router as job_router
from app.routes.jobs import router as jobs_router
from app.routes.job_analysis import router as job_analysis_router
from app.routes.company_auth import router as company_auth_router
from app.routes.company_interviews import router as company_interviews_router
from app.routes.company_jobs import router as company_jobs_router
from app.routes.resume_builder import router as resume_router
from app.routes.skill_gap import router as skill_gap_router
from app.routes.skills import router as skills_router
from app.routes.users import profile_router, router as users_router

UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(
    title="Smart Recruitment Platform Backend",
    description="AI-powered smart recruitment platform backend built with FastAPI.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")


@app.on_event("startup")
def on_startup() -> None:
    models.Base.metadata.create_all(bind=engine)
    ensure_sqlite_schema_updates()


@app.get("/", tags=["health"])
def root() -> dict[str, str]:
    return {"message": "Smart Recruitment Platform backend is running."}


@app.get("/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(job_router)
app.include_router(jobs_router)
app.include_router(skill_gap_router)
app.include_router(users_router, prefix="/users", tags=["users"])
app.include_router(profile_router, tags=["profile"])
app.include_router(cv_router)
app.include_router(cv_files_router)
app.include_router(cv_requests_router)
app.include_router(skills_router)
app.include_router(interview_router)
app.include_router(resume_router)
app.include_router(job_analysis_router)
app.include_router(company_auth_router)
app.include_router(company_jobs_router)
app.include_router(company_interviews_router)
