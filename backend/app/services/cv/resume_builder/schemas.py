from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class GenerateResumeRequest(BaseModel):
    jobTitle: str
    level: str
    skills: str = ""
    education: str = ""
    currentSummary: str = ""
    currentExperience: str = ""
    currentProjects: str = ""
    links: list[dict[str, str]] = Field(default_factory=list)


class GenerateResumeResponse(BaseModel):
    data: dict[str, Any]


class RewriteRequest(BaseModel):
    text: str
    section: str = Field(default="resume")
    fieldName: str = ""
    fieldLabel: str = ""
    skills: str = ""  # Optional skills for summary rewrite
    experience: str = ""  # Optional experience for summary rewrite


class RewriteResponse(BaseModel):
    rewritten: str


class GenerateSummaryRequest(BaseModel):
    jobTitle: str = ""
    summary: str = ""
    skills: list[str] = Field(default_factory=list)
    experience: Any = Field(default_factory=list)
    jobDescription: str = ""


class GenerateSummaryOption(BaseModel):
    id: str
    label: str
    tone: str
    optimized: bool = False
    summary: str
    keywordsUsed: list[str] = Field(default_factory=list)


class GenerateSummaryResponse(BaseModel):
    summaries: list[GenerateSummaryOption] = Field(default_factory=list)
    general: str = ""
    results: str = ""
    tools: str = ""


class ResumeStateRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    userId: int | None = None
    sections: list[dict[str, Any]] = Field(default_factory=list)
    personalSectionDeleted: bool = False
    resumeData: dict[str, Any] = Field(default_factory=dict)
    templateId: str = "classic-ats"
    jobContext: dict[str, Any] = Field(default_factory=dict)
    aiGenerated: dict[str, bool] = Field(default_factory=dict)
    optimizedSections: dict[str, bool] = Field(default_factory=dict)


class ResumeResponse(BaseModel):
    data: dict[str, Any]


class DeletedSectionsResponse(BaseModel):
    data: list[dict[str, Any]]


class SectionActionRequest(BaseModel):
    userId: int | None = None


class SectionActionResponse(BaseModel):
    success: bool = True
    data: dict[str, Any]
