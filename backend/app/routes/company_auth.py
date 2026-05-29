"""
Company registration endpoint.
"""

import os
import re
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from app.core.security import COMPANY_EMAIL_DOMAIN, get_current_user, hash_password, require_company
from app.data import get_db
from app.data.models import User

router = APIRouter(prefix="/company", tags=["company-auth"])


class CompanyRegisterRequest(BaseModel):
    company_name: str = Field(..., min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=128)


class CompanyProfileUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    industry: str | None = Field(default=None, max_length=160)
    company_size: str | None = Field(default=None, max_length=80)
    founded_year: int | None = Field(default=None, ge=1800, le=2100)
    website: str | None = Field(default=None, max_length=500)
    linkedin: str | None = Field(default=None, max_length=500)
    location: str | None = Field(default=None, max_length=240)
    country: str | None = Field(default=None, max_length=120)
    city: str | None = Field(default=None, max_length=120)
    about: str | None = Field(default=None, max_length=5000)
    mission: str | None = Field(default=None, max_length=3000)
    vision: str | None = Field(default=None, max_length=3000)
    culture: str | None = Field(default=None, max_length=3000)
    technologies: list[str] = Field(default_factory=list)
    hiring_focus_areas: list[str] = Field(default_factory=list)
    work_mode: str | None = Field(default=None, max_length=80)
    working_hours: str | None = Field(default=None, max_length=160)
    benefits: list[str] = Field(default_factory=list)
    hr_email: EmailStr | None = None
    support_email: EmailStr | None = None
    phone_number: str | None = Field(default=None, max_length=80)
    github: str | None = Field(default=None, max_length=500)
    twitter: str | None = Field(default=None, max_length=500)
    facebook: str | None = Field(default=None, max_length=500)
    social_links: dict = Field(default_factory=dict)


BASE_DIR = Path(__file__).resolve().parents[2]
COMPANY_ASSETS_DIR = (BASE_DIR / "uploads" / "company-assets").resolve()
COMPANY_ASSETS_DIR.mkdir(parents=True, exist_ok=True)
MAX_IMAGE_BYTES = 5 * 1024 * 1024
IMAGE_TYPES = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/gif": ".gif"}


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register_company(payload: CompanyRegisterRequest, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()

    if not email.endswith(COMPANY_EMAIL_DOMAIN):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Company email must end with '{COMPANY_EMAIL_DOMAIN}'",
        )

    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered.",
        )

    user = User(
        full_name=payload.company_name.strip(),
        email=email,
        password_hash=payload.password,
        role="company",
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    return {
        "message": "Company registered successfully",
        "user": {
            "id": user.id,
            "full_name": user.full_name,
            "email": user.email,
            "role": user.role,
        },
    }


@router.get("/me/profile")
def get_my_company_profile(
    current_user: User = Depends(require_company),
    db: Session = Depends(get_db),
):
    company = db.get(User, current_user.id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return serialize_company_profile(company, public=False)


@router.put("/me/profile")
def update_my_company_profile(
    payload: CompanyProfileUpdate,
    current_user: User = Depends(require_company),
    db: Session = Depends(get_db),
):
    company = db.get(User, current_user.id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        if field in {"technologies", "hiring_focus_areas", "benefits"}:
            setattr(company, field, _clean_list(value))
        elif field == "social_links":
            setattr(company, field, value or {})
        elif isinstance(value, str):
            setattr(company, field, value.strip() or None)
        else:
            setattr(company, field, value)

    db.commit()
    db.refresh(company)
    return serialize_company_profile(company, public=False)


@router.post("/me/profile/assets")
async def upload_company_profile_asset(
    kind: str,
    file: UploadFile = File(...),
    current_user: User = Depends(require_company),
    db: Session = Depends(get_db),
):
    if kind not in {"logo", "banner"}:
        raise HTTPException(status_code=400, detail="Asset kind must be logo or banner")

    extension = IMAGE_TYPES.get(file.content_type or "")
    if not extension:
        raise HTTPException(status_code=400, detail="Only PNG, JPG, WEBP, and GIF images are supported")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded image is empty")
    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image file is too large")

    filename = f"company-{current_user.id}-{kind}-{uuid4().hex}{extension}"
    target_path = (COMPANY_ASSETS_DIR / filename).resolve()
    if not str(target_path).startswith(str(COMPANY_ASSETS_DIR)):
        raise HTTPException(status_code=400, detail="Invalid asset path")

    with open(target_path, "wb") as output:
        output.write(content)

    asset_url = f"/uploads/company-assets/{filename}"
    company = db.get(User, current_user.id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    if kind == "logo":
        company.logo_url = asset_url
    else:
        company.banner_url = asset_url
    db.commit()

    return {"url": asset_url, "kind": kind}


@router.get("/{company_id}")
def get_public_company_profile(company_id: int, db: Session = Depends(get_db)):
    company = db.get(User, company_id)
    if not company or company.role != "company":
        raise HTTPException(status_code=404, detail="Company not found")
    return serialize_company_profile(company, public=True)


def serialize_company_profile(company: User, *, public: bool = True) -> dict:
    social_links = dict(company.social_links or {})
    for key in ["linkedin", "github", "twitter", "facebook"]:
        value = getattr(company, key, None)
        if value:
            social_links[key] = value

    location = company.location or ", ".join(part for part in [company.city, company.country] if part)
    profile = {
        "id": company.id,
        "full_name": company.full_name,
        "email": company.email if not public else None,
        "logo_url": company.logo_url,
        "banner_url": company.banner_url,
        "industry": company.industry,
        "company_size": company.company_size,
        "founded_year": company.founded_year,
        "website": company.website,
        "linkedin": company.linkedin,
        "location": location,
        "country": company.country,
        "city": company.city,
        "about": company.about,
        "mission": company.mission,
        "vision": company.vision,
        "culture": company.culture,
        "technologies": company.technologies or [],
        "hiring_focus_areas": company.hiring_focus_areas or [],
        "work_mode": company.work_mode,
        "working_hours": company.working_hours,
        "benefits": company.benefits or [],
        "hr_email": company.hr_email,
        "support_email": company.support_email,
        "phone_number": company.phone_number,
        "github": company.github,
        "twitter": company.twitter,
        "facebook": company.facebook,
        "social_links": social_links,
        "verified_company": bool(company.verified_company),
        "profile_url": f"/company/{company.id}",
    }
    if not public:
        profile["role"] = company.role
    return profile


def _clean_list(values: list[str] | None) -> list[str]:
    cleaned = []
    seen = set()
    for value in values or []:
        item = re.sub(r"\s+", " ", str(value or "").strip())
        key = item.lower()
        if item and key not in seen:
            cleaned.append(item[:120])
            seen.add(key)
    return cleaned
