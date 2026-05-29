"use client";

import { startTransition, useDeferredValue, useEffect, useRef, useState } from "react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useController, useFieldArray, useForm, useWatch } from "react-hook-form";

import { generateResumeWithAI } from "@/api/generate-resume";
import {
  fetchDeletedResumeSections,
  fetchResumeBuilderState,
  restoreResumeSection,
  saveResumeBuilderState,
  softDeleteResumeSection,
} from "@/api/resume-data";
import { getProfileMe, uploadCv } from "@/lib/api";
import SectionHeader from "@/components/SectionHeader";
import { getToken, getUser } from "@/lib/auth";
import {
  MAX_RESUME_COMPRESSION_LEVEL,
  compressResumeData,
  getResumeCompressionSettings,
} from "@/lib/resumeCompression";
import {
  BUILT_IN_SECTION_TYPES,
  CURRENT_YEAR,
  DEFAULT_TEMPLATE_ID,
  LANGUAGE_PROFICIENCY_LEVELS,
  PERSONAL_SECTION,
  RESUME_TEMPLATES,
  SECTION_LIBRARY,
  buildDefaultSections,
  canDeleteSection,
  createCustomSectionId,
  createEmptyCertification,
  createEmptyEducation,
  createEmptyExperience,
  createEmptyLanguage,
  createEmptyProject,
  createEmptySkill,
  createSectionConfig,
  defaultResumeValues,
  getBuiltInSectionsMissingFromConfig,
  getFilledSkillCount,
  getResumeCompletionIssues,
  getSectionOrderIds,
  getVisibleSections,
  hasText,
  mapAiResumeToForm,
  mapProfileToResume,
  normalizeTemplateId,
} from "@/lib/resumeBuilder";
import { getAtsScore } from "@/utils/atsScore";
import AddSectionModal from "./AddSectionModal";
import AIFormModal from "./AIFormModal";
import ATSScorePanel from "./ATSScorePanel";
import ConfirmSectionDeleteModal from "./ConfirmSectionDeleteModal";
import CustomSectionForm from "./CustomSectionForm";
import ExportTemplateModal from "./ExportTemplateModal";
import OptimizeForJobModal from "./OptimizeForJobModal";
import PersonalInfoForm from "./PersonalInfoForm";
import ResumePreview from "./ResumePreview";
import RewriteFieldAction from "./RewriteFieldAction";
import SavedResumeVersionsPanel from "./SavedResumeVersionsPanel";
import SectionForm from "./SectionForm";
import SortableResumeSection from "./SortableResumeSection";
import SummaryRewritePanel from "./SummaryRewritePanel";
import TemplateSwitcher from "./TemplateSwitcher";
import ProfileSyncToast from "./ProfileSyncToast";
import UndoDeleteToast from "./UndoDeleteToast";
import RewriteToast from "./RewriteToast";

const RESUME_VERSION_STORAGE_KEY = "smart-recruitment-platform-resume-versions";
const RESUME_TEMPLATE_STORAGE_KEY = "smart-recruitment-platform-selected-resume-template";
const AUTO_SAVE_DELAY_MS = 700;
const UNDO_WINDOW_MS = 10000;
const PROFILE_SYNC_TOAST_DURATION_MS = 4000;
const REWRITE_TOAST_DURATION_MS = 2500;

const educationFields = [
  {
    name: "universityName",
    label: "University Name",
    placeholder: "University of Jordan",
    rules: { required: "University name is required." },
  },
  {
    name: "degree",
    label: "Degree",
    placeholder: "BSc in Computer Science",
    rules: { required: "Degree is required." },
  },
  {
    name: "gpa",
    label: "GPA",
    placeholder: "3.8 / 4.0",
    rewriteable: false,
  },
  {
    name: "startYear",
    label: "Start Year",
    type: "number",
    min: 1950,
    max: CURRENT_YEAR + 10,
    inputMode: "numeric",
    placeholder: "2020",
    rules: {
      required: "Start year is required.",
      min: { value: 1950, message: "Enter a valid year." },
      max: { value: CURRENT_YEAR + 10, message: "Enter a valid year." },
    },
  },
  {
    name: "endYear",
    label: "End Year",
    type: "number",
    min: 1950,
    max: CURRENT_YEAR + 10,
    inputMode: "numeric",
    placeholder: "2024",
    rules: (_, itemValues) => ({
      required: "End year is required.",
      min: { value: 1950, message: "Enter a valid year." },
      max: { value: CURRENT_YEAR + 10, message: "Enter a valid year." },
      validate: (value) =>
        !itemValues?.startYear || Number(value) >= Number(itemValues.startYear) || "End year must be after start year.",
    }),
  },
];

const experienceFields = [
  {
    name: "jobTitle",
    label: "Job Title",
    placeholder: "Frontend Developer",
    rules: { required: "Job title is required." },
  },
  {
    name: "companyName",
    label: "Company Name",
    placeholder: "Smart Recruitment Platform",
    rules: { required: "Company name is required." },
  },
  {
    name: "startDate",
    label: "Start Date",
    type: "month",
    rules: { required: "Start date is required." },
  },
  {
    name: "endDate",
    label: "End Date",
    type: "month",
    hideWhen: (itemValues) => Boolean(itemValues?.isPresent),
    rules: (_, itemValues) => ({
      validate: (value) => {
        if (itemValues?.isPresent) {
          return true;
        }
        if (!value) {
          return "End date or Present is required.";
        }
        if (itemValues?.startDate && value < itemValues.startDate) {
          return "End date must be after start date.";
        }
        return true;
      },
    }),
  },
  {
    name: "isPresent",
    label: "I currently work here",
    type: "checkbox",
    fullWidth: true,
  },
  {
    name: "description",
    label: "Description",
    type: "textarea",
    rows: 5,
    placeholder: "Built reusable UI components that improved delivery speed.\nOptimized API integrations for better reliability.",
    helperText: "Use one achievement per line. The preview will convert lines into bullet points.",
    fullWidth: true,
    rules: { required: "Description is required." },
  },
];

const skillFields = [
  {
    name: "name",
    label: "Skill",
    placeholder: "React",
    rules: { required: "Skill name is required." },
  },
];

const projectFields = [
  {
    name: "name",
    label: "Project Name",
    placeholder: "Applicant Tracking Dashboard",
    rules: { required: "Project name is required." },
  },
  {
    name: "link",
    label: "Project Link",
    type: "url",
    placeholder: "https://github.com/username/project",
    helperText: "Optional. If provided, it will appear as a clickable label in preview and PDF.",
    rules: {
      validate: (value) =>
        !value || /^https?:\/\/.+/i.test(value) || "Enter a valid project URL.",
    },
  },
  {
    name: "technologies",
    label: "Technologies",
    placeholder: "Optional (e.g. React, Node.js, Python)",
    helperText: "Optional. Comma-separated list of technologies used.",
    trim: true,
  },
  {
    name: "description",
    label: "Description",
    type: "textarea",
    rows: 4,
    placeholder: "Designed a dashboard for resume screening.\nImplemented analytics for hiring teams.",
    helperText: "Use one outcome per line for clean ATS bullet points.",
    fullWidth: true,
    rules: { required: "Project description is required." },
  },
];

const certificationFields = [
  {
    name: "name",
    label: "Certification Name",
    placeholder: "AWS Certified Cloud Practitioner",
    rules: { required: "Certification name is required." },
  },
  {
    name: "provider",
    label: "Provider",
    placeholder: "Amazon Web Services",
    rules: { required: "Provider is required." },
  },
  {
    name: "year",
    label: "Year",
    type: "number",
    min: 1950,
    max: CURRENT_YEAR + 10,
    inputMode: "numeric",
    placeholder: "2025",
    rules: {
      required: "Year is required.",
      min: { value: 1950, message: "Enter a valid year." },
      max: { value: CURRENT_YEAR + 10, message: "Enter a valid year." },
    },
  },
];

const languageFields = [
  {
    name: "language",
    label: "Language",
    placeholder: "English",
    rules: { required: "Language name is required." },
  },
  {
    name: "level",
    label: "Proficiency Level",
    type: "select",
    placeholder: "Select level",
    options: LANGUAGE_PROFICIENCY_LEVELS,
    rules: { required: "Proficiency level is required." },
  },
];

function buildEducationHint(items = []) {
  return items
    .map((item) => [item.degree?.trim(), item.universityName?.trim()].filter(Boolean).join(" at "))
    .filter(Boolean)
    .join("; ");
}

function buildSkillsHint(items = []) {
  return items
    .map((item) => item?.name?.trim())
    .filter(Boolean)
    .join(", ");
}

function buildBadgeList({ aiGenerated, optimized }) {
  const badges = [];

  if (aiGenerated) {
    badges.push({ label: "AI Generated", tone: "emerald" });
  }
  if (optimized) {
    badges.push({ label: "Optimized for Job", tone: "sky" });
  }

  return badges;
}

function sanitizeSections(rawSections = [], options = {}) {
  const { fallbackToDefaults = true } = options;

  if (!Array.isArray(rawSections)) {
    return fallbackToDefaults ? buildDefaultSections() : [];
  }

  if (!rawSections.length) {
    return fallbackToDefaults ? buildDefaultSections() : [];
  }

  const seenBuiltInTypes = new Set();
  const normalizedSections = [];

  rawSections.forEach((section) => {
    const type = typeof section?.type === "string" ? section.type : "";
    const definition = SECTION_LIBRARY[type];

    if (!definition) {
      return;
    }

    if (definition.builtIn) {
      if (seenBuiltInTypes.has(type)) {
        return;
      }
      seenBuiltInTypes.add(type);
    }

    normalizedSections.push(
      createSectionConfig(type, {
        id:
          typeof section?.id === "string" && section.id.trim()
            ? section.id
            : definition.defaultId || createCustomSectionId(),
        title:
          definition.builtIn
            ? definition.title
            : typeof section?.title === "string" && section.title.trim()
              ? section.title.trim()
              : definition.title,
        visible: section?.visible !== false,
      }),
    );
  });

  return normalizedSections;
}

function buildSectionsFromLegacyOrder(sectionOrder = []) {
  if (!Array.isArray(sectionOrder) || !sectionOrder.length) {
    return buildDefaultSections();
  }

  return sanitizeSections(
    sectionOrder.map((sectionId) => {
      const type = Object.keys(SECTION_LIBRARY).find((key) => SECTION_LIBRARY[key].defaultId === sectionId) || sectionId;

      return createSectionConfig(type, { id: sectionId });
    }),
  );
}

function buildResumeFormValues(resumeData = {}) {
  const selectedTemplate = normalizeTemplateId(resumeData.selected_template || resumeData.selectedTemplate || DEFAULT_TEMPLATE_ID);
  const rawPersonalInfo = resumeData.personalInfo || resumeData.personal || {};
  const personalInfo = {
    fullName: rawPersonalInfo.fullName || rawPersonalInfo.name || "",
    email: rawPersonalInfo.email || "",
    phone: rawPersonalInfo.phone || "",
    location: rawPersonalInfo.location || rawPersonalInfo.city || "",
    links: Array.isArray(rawPersonalInfo.links)
      ? rawPersonalInfo.links
      : (rawPersonalInfo.linkedin || rawPersonalInfo.linkedinUrl || rawPersonalInfo.linkedin_url)
      ? [{ label: "LinkedIn", url: rawPersonalInfo.linkedin || rawPersonalInfo.linkedinUrl || rawPersonalInfo.linkedin_url }]
      : [{ label: "LinkedIn", url: "" }],
  };
  const nextSkills = Array.isArray(resumeData.skills)
    ? resumeData.skills
        .map((item) => {
          if (typeof item === "string") {
            return { name: item.trim() };
          }

          if (typeof item === "object" && item !== null) {
            return {
              name: item.name || item.skillName || item.skill || "",
            };
          }

          return null;
        })
        .filter((item) => item && item.name)
    : [];
  const education = Array.isArray(resumeData.education)
    ? resumeData.education.map((item) => ({
        universityName: item?.universityName || item?.university || item?.school || "",
        degree: item?.degree || "",
        gpa: item?.gpa || "",
        startYear: item?.startYear || item?.start || "",
        endYear: item?.endYear || item?.end || "",
      }))
    : [];
  const rawExperience = Array.isArray(resumeData.experience)
    ? resumeData.experience
    : Array.isArray(resumeData.work_experience)
      ? resumeData.work_experience
      : Array.isArray(resumeData.workExperience)
        ? resumeData.workExperience
        : [];
  const experience = rawExperience.map((item) => ({
        jobTitle: item?.jobTitle || item?.title || "",
        companyName: item?.companyName || item?.company || "",
        startDate: item?.startDate || item?.start || "",
        endDate: item?.endDate || item?.end || "",
        isPresent: Boolean(item?.isPresent ?? item?.present),
        description: Array.isArray(item?.description) ? item.description.join("\n") : item?.description || "",
      }));
  const projects = Array.isArray(resumeData.projects)
    ? resumeData.projects.map((item) => ({
        name: item?.name || "",
        link: item?.link || "",
        description: Array.isArray(item?.description) ? item.description.join("\n") : item?.description || "",
        technologies: Array.isArray(item?.technologies) ? item.technologies.join(", ") : item?.technologies || "",
      }))
    : [];
  const certifications = Array.isArray(resumeData.certifications)
    ? resumeData.certifications.map((item) => ({
        name: item?.name || "",
        provider: item?.provider || "",
        year: item?.year || "",
      }))
    : [];
  const languages = Array.isArray(resumeData.languages)
    ? resumeData.languages.map((item) => ({
        language: item?.language || item?.name || "",
        level: item?.level || item?.proficiency || "",
      }))
    : [];

  while (nextSkills.length < 3) {
    nextSkills.push(createEmptySkill());
  }

  return {
    ...defaultResumeValues,
    selected_template: selectedTemplate,
    personalInfo: {
      ...defaultResumeValues.personalInfo,
      ...personalInfo,
    },
    summary: typeof resumeData.summary === "string" ? resumeData.summary : "",
    education: education.length ? education : [createEmptyEducation()],
    experience: experience.length ? experience : [createEmptyExperience()],
    skills: nextSkills,
    projects: projects.length ? projects : [createEmptyProject()],
    certifications: certifications.length ? certifications : [createEmptyCertification()],
    languages: languages.length ? languages : [createEmptyLanguage()],
    customSections: Array.isArray(resumeData.customSections) ? resumeData.customSections : [],
  };
}


function StatusMessage({ status }) {
  if (!status?.message) {
    return null;
  }

  const toneClasses =
    status.type === "success"
      ? "premium-status-success"
      : status.type === "warning"
        ? "premium-status-warning"
        : "premium-status-danger";

  return (
    <div className={`mb-6 rounded-2xl border px-4 py-3 text-sm ${toneClasses}`}>
      {status.isNetworkError ? (
        <div>
          <p className="font-semibold mb-1">⚠️ Cannot connect to backend.</p>
          <p>{status.message}</p>
          <div className="mt-2 text-xs font-mono bg-red-100/50 p-2 rounded text-red-800">
            Run: cd backend && npm run dev
          </div>
        </div>
      ) : (
        status.message
      )}
    </div>
  );
}

function SummarySection({
  title,
  control,
  setValue,
  error,
  skills,
  experience,
  onApplyGeneratedSummary,
  badges = [],
  onRewriteSuccess,
  onRewriteError,
}) {
  const {
    field,
  } = useController({
    name: "summary",
    control,
    rules: {
      required: "Summary is required.",
      minLength: {
        value: 50,
        message: "Summary must be at least 50 characters.",
      },
    },
    defaultValue: "",
  });

  return (
    <section className="resume-editor-panel rounded-[1.5rem] border p-5 md:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-white">{title}</h2>
            {badges.map((badge) => (
              <span
                key={`${title}-${badge.label}`}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  badge.tone === "sky"
                    ? "border border-sky-300/15 bg-sky-400/10 text-sky-100"
                    : "border border-cyan-300/15 bg-cyan-400/10 text-cyan-100"
                }`}
              >
                {badge.label}
              </span>
            ))}
          </div>
          <p className="mt-1 text-sm text-white/[0.62]">
            Write a concise, ATS-friendly introduction with at least 50 characters.
          </p>
        </div>
      </div>

      <div className="mb-1.5 flex items-center justify-between gap-3">
        <label htmlFor="summary" className="block text-sm font-medium text-white/[0.78]">
          Professional Summary
        </label>
        <RewriteFieldAction
          value={field.value ?? ""}
          onRewrite={(rewritten) => {
            if (setValue) {
              setValue("summary", rewritten, {
                shouldDirty: true,
                shouldTouch: true,
                shouldValidate: true,
              });
            } else {
              field.onChange(rewritten);
            }
          }}
          successMessage="Summary rewritten successfully."
          onSuccess={onRewriteSuccess}
          onError={onRewriteError}
          section="summary"
          fieldName="summary"
          fieldLabel="Professional Summary"
          skills={skills.join(", ")}
          experience={JSON.stringify(experience)}
        />
      </div>
      <textarea
        id="summary"
        rows={5}
        placeholder="Results-driven software engineer with experience building scalable web applications..."
        className="dashboard-field w-full rounded-2xl border border-white/10 bg-[#0A0F1C]/90 px-3 py-2.5 text-sm leading-6 text-white/95 outline-none transition placeholder:text-white/[0.42] focus:border-[#A78BFA]/60 focus:ring-2 focus:ring-[#A78BFA]/15"
        {...field}
        value={field.value || ""}
      />
      {error?.message ? <p className="mt-1.5 text-xs text-red-600">{error.message}</p> : null}

      <SummaryRewritePanel
        currentSummary={field.value || ""}
        skills={skills}
        experience={experience}
        onApplySummary={(summary, metadata) => {
          field.onChange(summary);
          onApplyGeneratedSummary?.(summary, metadata);
        }}
        onSuccess={onRewriteSuccess}
        onError={onRewriteError}
      />
    </section>
  );
}

function ResumeBuilderHero({
  selectedTemplate,
  selectedTemplateId,
  onTemplateChange,
  templates,
  hasProfileSession,
  isProfileSyncing,
  onSyncProfile,
  onAddSection,
  onGenerateAi,
  onOptimizeJob,
  onSaveCv,
  isSavingCv,
  onExport,
  canExport,
  isExporting,
}) {
  const secondaryActionClass =
    "premium-secondary-action inline-flex h-10 min-w-0 items-center justify-center whitespace-nowrap rounded-xl px-3.5 text-[13px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";
  const primaryActionClass =
    "premium-action inline-flex h-10 min-w-0 items-center justify-center whitespace-nowrap rounded-xl px-4 text-[13px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";
  const groupClass =
    "flex min-w-0 flex-wrap items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.035] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]";

  return (
    <header className="max-w-full overflow-hidden rounded-2xl border border-white/[0.08] bg-[linear-gradient(135deg,rgba(255,255,255,0.04),transparent_46%,rgba(103,232,249,0.028))] px-4 py-5 shadow-[0_12px_34px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.055)] backdrop-blur-xl sm:px-5 lg:px-6">
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-3">
        <div className="overflow-hidden">
          <div className="flex min-w-0 flex-col gap-4 pb-4 lg:grid lg:grid-cols-[minmax(0,0.9fr)_minmax(320px,1fr)] lg:items-end">
            <div className="min-w-0">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.045] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-100/70">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,0.5)]" />
                AI resume workspace
              </div>
              <h1 className="max-w-2xl text-[clamp(1.7rem,2.3vw,2.55rem)] font-semibold leading-[1.06] tracking-normal text-white">
                Resume Builder
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/[0.64] md:text-[15px]">
                Build an ATS-friendly resume with focused sections, live preview, AI refinement, and clean PDF export.
              </p>
            </div>

            <div className="hidden min-w-0 rounded-2xl border border-white/[0.075] bg-white/[0.035] p-3 text-sm text-white/[0.66] shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] lg:block">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-cyan-300/10 px-2.5 py-1 text-xs font-semibold text-cyan-100">
                  {selectedTemplate.label}
                </span>
                <span className="rounded-full bg-violet-300/10 px-2.5 py-1 text-xs font-semibold text-violet-100">
                  Live preview
                </span>
                <span className="rounded-full bg-white/[0.06] px-2.5 py-1 text-xs font-semibold text-white/[0.72]">
                  Auto-save ready
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
          <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/[0.44]">Workspace</p>
                <p className="truncate text-sm font-semibold text-white">Resume Builder</p>
              </div>
              <div className={`${groupClass} w-full sm:w-auto`}>
                <label className="sr-only" htmlFor="resume-template-quick-switch">
                  Quick switch resume template
                </label>
                <select
                  id="resume-template-quick-switch"
                  value={selectedTemplateId}
                  onChange={(event) => onTemplateChange(event.target.value)}
                  className="dashboard-field h-10 max-w-full min-w-0 rounded-xl border border-white/10 bg-[#0A0F1C]/90 px-3 text-[13px] font-semibold text-white/90 outline-none transition"
                >
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="min-w-0 overflow-hidden">
              <div className="flex min-w-0 flex-wrap items-center gap-2 pt-1 lg:pt-0">
                <div className={groupClass}>
                  <button
                    type="button"
                    onClick={onSyncProfile}
                    disabled={!hasProfileSession || isProfileSyncing}
                    className={secondaryActionClass}
                  >
                    {isProfileSyncing ? "Syncing..." : "Sync Profile"}
                  </button>
                  <button type="button" onClick={onAddSection} className={secondaryActionClass}>
                    Add Section
                  </button>
                </div>
                <div className={groupClass}>
                  <button type="button" onClick={onGenerateAi} className={secondaryActionClass}>
                    Generate AI
                  </button>
                  <button type="button" onClick={onOptimizeJob} className={secondaryActionClass}>
                    Optimize
                  </button>
                </div>
                <div className={groupClass}>
                  <button
                    type="button"
                    onClick={onSaveCv}
                    disabled={isSavingCv}
                    className={secondaryActionClass}
                  >
                    {isSavingCv ? "Saving..." : "Save CV"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <button type="button" onClick={onExport} disabled={!canExport} className={`${primaryActionClass} w-full sm:w-auto`}>
            {isExporting ? "Preparing PDF..." : "Export PDF"}
          </button>
        </div>
      </div>
    </header>
  );
}

export default function ResumeBuilderPage() {
  const previewRef = useRef(null);
  const undoTimeoutRef = useRef(null);
  const undoIntervalRef = useRef(null);
  const autoSaveTimeoutRef = useRef(null);
  const profileToastTimeoutRef = useRef(null);
  const rewriteToastTimeoutRef = useRef(null);
  const hasLoadedRemoteResumeRef = useRef(false);
  const hasAttemptedInitialProfileSyncRef = useRef(false);
  const pendingHydrationLogRef = useRef(null);

  const [status, setStatus] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [isResumeLoading, setIsResumeLoading] = useState(true);
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const [isProfileSyncing, setIsProfileSyncing] = useState(false);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true);
  const [profileData, setProfileData] = useState(null);
  const [profileSyncToastMessage, setProfileSyncToastMessage] = useState("");
  const [rewriteToastMessage, setRewriteToastMessage] = useState("");
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [isOptimizeModalOpen, setIsOptimizeModalOpen] = useState(false);
  const [isAddSectionModalOpen, setIsAddSectionModalOpen] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isSavingCv, setIsSavingCv] = useState(false);
  const [templateDialogAction, setTemplateDialogAction] = useState(null);
  const [pendingTemplateId, setPendingTemplateId] = useState(DEFAULT_TEMPLATE_ID);
  const [savedVersions, setSavedVersions] = useState([]);
  const [versionName, setVersionName] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState(DEFAULT_TEMPLATE_ID);
  const [compactMode, setCompactMode] = useState(false);
  const [showTemplates, setShowTemplates] = useState(true);
  const [autoCompressionLevel, setAutoCompressionLevel] = useState(0);
  const [previewHasOverflow, setPreviewHasOverflow] = useState(false);
  const [sections, setSections] = useState(() => buildDefaultSections());
  const [deletedSections, setDeletedSections] = useState([]);
  const [personalSectionDeleted, setPersonalSectionDeleted] = useState(false);
  const [jobContext, setJobContext] = useState({
    jobDescription: "",
    jobTitle: "",
  });
  const [aiGenerated, setAiGenerated] = useState({
    summary: false,
    education: false,
    skills: false,
    experience: false,
    projects: false,
  });
  const [optimizedSections, setOptimizedSections] = useState({
    summary: false,
    skills: false,
    experience: false,
  });
  const [pendingDeleteSection, setPendingDeleteSection] = useState(null);
  const [pendingSectionKey, setPendingSectionKey] = useState("");
  const [undoToast, setUndoToast] = useState(null);
  const [undoSecondsRemaining, setUndoSecondsRemaining] = useState(10);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
  );

  const {
    control,
    getValues,
    reset,
    setFocus,
    setValue,
    trigger,
    formState: { errors },
  } = useForm({
    defaultValues: defaultResumeValues,
    mode: "onBlur",
    reValidateMode: "onChange",
  });

  const educationFieldArray = useFieldArray({ control, name: "education" });
  const experienceFieldArray = useFieldArray({ control, name: "experience" });
  const skillsFieldArray = useFieldArray({ control, name: "skills" });
  const projectsFieldArray = useFieldArray({ control, name: "projects" });
  const certificationsFieldArray = useFieldArray({ control, name: "certifications" });
  const languagesFieldArray = useFieldArray({ control, name: "languages" });
  const customSectionsFieldArray = useFieldArray({ control, name: "customSections" });

  const resumeValues = useWatch({ control }) || defaultResumeValues;
  const deferredResume = useDeferredValue(resumeValues);
  const summaryJobTitle =
    resumeValues.experience?.find((item) => item?.jobTitle?.trim())?.jobTitle?.trim() ||
    jobContext.jobTitle?.trim() ||
    "";
  const summarySkills = (resumeValues.skills || [])
    .map((item) => item?.name?.trim())
    .filter(Boolean);
  const visibleSections = getVisibleSections(sections);
  const previewLayoutSignature = JSON.stringify({
    templateId: selectedTemplateId,
    compactMode,
    showPersonalInfo: !personalSectionDeleted,
    sections: sections.map((section) => ({
      id: section.id,
      type: section.type,
      title: section.title,
      visible: section.visible,
    })),
    personalInfo: deferredResume.personalInfo || {},
    summary: deferredResume.summary || "",
    education: deferredResume.education || [],
    experience: deferredResume.experience || [],
    skills: deferredResume.skills || [],
    projects: deferredResume.projects || [],
    certifications: deferredResume.certifications || [],
    languages: deferredResume.languages || [],
    customSections: deferredResume.customSections || [],
  });
  const effectiveCompressionLevel = Math.max(compactMode ? 1 : 0, autoCompressionLevel);
  const compressionLabel = getResumeCompressionSettings(effectiveCompressionLevel).label;
  const previewResumeData = compressResumeData(deferredResume, { level: effectiveCompressionLevel });
  const completionIssues = getResumeCompletionIssues(deferredResume, sections, {
    requirePersonalInfo: !personalSectionDeleted,
  });
  const atsScore = getAtsScore({
    resumeData: deferredResume,
    jobTitle: jobContext.jobTitle,
    jobDescription: jobContext.jobDescription,
    sections,
    sectionOrder: getSectionOrderIds(visibleSections),
    personalSectionDeleted,
  });
  const filledSkillCount = getFilledSkillCount(resumeValues.skills);
  const canExport = completionIssues.length === 0 && !isExporting;
  const selectedTemplate = RESUME_TEMPLATES.find((template) => template.id === selectedTemplateId) || RESUME_TEMPLATES[0];
  const templateDialogVerb = templateDialogAction === "save" ? "Save CV" : "Export PDF";
  const missingBuiltInSections = getBuiltInSectionsMissingFromConfig(sections)
    .filter((definition) => definition.type !== "personal" || personalSectionDeleted);
  const availableBuiltInSections = missingBuiltInSections.sort(
    (left, right) => BUILT_IN_SECTION_TYPES.indexOf(left.type) - BUILT_IN_SECTION_TYPES.indexOf(right.type),
  );
  const customSectionIndexMap = new Map((resumeValues.customSections || []).map((section, index) => [section?.id, index]));
  const hasProfileSession = Boolean(getToken());

  const getSectionOrderRank = (type = "") => {
    const builtInIndex = BUILT_IN_SECTION_TYPES.indexOf(type);
    return builtInIndex === -1 ? BUILT_IN_SECTION_TYPES.length : builtInIndex;
  };

  const createEmptyPersonalInfo = () => ({
    ...defaultResumeValues.personalInfo,
    links: (defaultResumeValues.personalInfo.links || []).map((link) => ({
      ...link,
    })),
  });

  const resetRestoredSectionData = (section) => {
    if (!section) {
      return;
    }

    switch (section.type) {
      case "personal":
        setValue("personalInfo", createEmptyPersonalInfo(), {
          shouldDirty: true,
          shouldValidate: false,
        });
        break;
      case "summary":
        setValue("summary", "", {
          shouldDirty: true,
          shouldValidate: false,
        });
        break;
      case "education":
        educationFieldArray.replace([createEmptyEducation()]);
        break;
      case "experience":
        experienceFieldArray.replace([createEmptyExperience()]);
        break;
      case "skills":
        skillsFieldArray.replace([createEmptySkill(), createEmptySkill(), createEmptySkill()]);
        break;
      case "projects":
        projectsFieldArray.replace([createEmptyProject()]);
        break;
      case "certifications":
        certificationsFieldArray.replace([createEmptyCertification()]);
        break;
      case "languages":
        languagesFieldArray.replace([createEmptyLanguage()]);
        break;
      case "custom": {
        const currentCustomSections = getValues("customSections") || [];
        const nextCustomSections = currentCustomSections.some((item) => item?.id === section.id)
          ? currentCustomSections.map((item) =>
              item?.id === section.id
                ? {
                    id: section.id,
                    content: "",
                  }
                : item,
            )
          : [
              ...currentCustomSections,
              {
                id: section.id,
                content: "",
              },
            ];

        customSectionsFieldArray.replace(nextCustomSections);
        break;
      }
      default:
        break;
    }
  };

  const restoreSectionLocally = (section) => {
    if (!section) {
      return;
    }

    if (section.type === "personal") {
      setPersonalSectionDeleted(false);
    } else {
      setSections((currentSections) => {
        if (currentSections.some((item) => item.id === section.id)) {
          return currentSections;
        }

        const nextSections = [
          ...currentSections,
          createSectionConfig(section.type, {
            id: section.id,
            title: section.title,
          }),
        ];

        return nextSections.sort(
          (left, right) => getSectionOrderRank(left.type) - getSectionOrderRank(right.type),
        );
      });
    }

    setDeletedSections((currentSections) => currentSections.filter((item) => item.id !== section.id));
    resetRestoredSectionData(section);
  };

  const applyTemplateSelection = (templateId, { collapseSwitcher = false } = {}) => {
    const normalizedTemplateId = normalizeTemplateId(templateId || DEFAULT_TEMPLATE_ID);
    setSelectedTemplateId(normalizedTemplateId);
    setValue("selected_template", normalizedTemplateId, {
      shouldDirty: true,
      shouldValidate: false,
    });

    if (typeof window !== "undefined") {
      window.localStorage.setItem(RESUME_TEMPLATE_STORAGE_KEY, normalizedTemplateId);
    }

    if (collapseSwitcher) {
      setShowTemplates(false);
    }

    return normalizedTemplateId;
  };

  const handleTemplateChange = (templateId) => {
    applyTemplateSelection(templateId, { collapseSwitcher: true });
  };

  useEffect(() => {
    setAutoCompressionLevel(0);
    setPreviewHasOverflow(false);
  }, [previewLayoutSignature]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    let frameId = 0;

    const measurePreview = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        const previewElement = previewRef.current;

        if (!previewElement) {
          return;
        }

        const previewRect = previewElement.getBoundingClientRect();
        const previewWidth = previewRect.width || previewElement.clientWidth;

        if (!previewWidth) {
          return;
        }

        const a4Height = previewWidth * (297 / 210);
        const contentHeight = Math.max(previewRect.height, previewElement.scrollHeight);
        const hasOverflow = contentHeight - a4Height > 2;

        if (hasOverflow && autoCompressionLevel < MAX_RESUME_COMPRESSION_LEVEL) {
          setAutoCompressionLevel((currentLevel) => Math.min(currentLevel + 1, MAX_RESUME_COMPRESSION_LEVEL));
          return;
        }

        setPreviewHasOverflow(hasOverflow);
      });
    };

    measurePreview();

    const previewElement = previewRef.current;
    const resizeObserver =
      typeof ResizeObserver !== "undefined" && previewElement ? new ResizeObserver(measurePreview) : null;

    resizeObserver?.observe(previewElement);
    window.addEventListener("resize", measurePreview);

    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", measurePreview);
    };
  }, [autoCompressionLevel, previewLayoutSignature]);

  function clearUndoTimers() {
    if (undoTimeoutRef.current) {
      window.clearTimeout(undoTimeoutRef.current);
      undoTimeoutRef.current = null;
    }

    if (undoIntervalRef.current) {
      window.clearInterval(undoIntervalRef.current);
      undoIntervalRef.current = null;
    }
  }

  function dismissUndoToast() {
    clearUndoTimers();
    setUndoToast(null);
    setUndoSecondsRemaining(10);
  }

  function showUndoToast(section) {
    clearUndoTimers();
    setUndoToast({
      sectionKey: section.id,
      sectionTitle: section.title,
    });
    setUndoSecondsRemaining(10);

    undoIntervalRef.current = window.setInterval(() => {
      setUndoSecondsRemaining((currentValue) => (currentValue > 1 ? currentValue - 1 : 0));
    }, 1000);

    undoTimeoutRef.current = window.setTimeout(() => {
      dismissUndoToast();
    }, UNDO_WINDOW_MS);
  }

  function dismissProfileSyncToast() {
    if (profileToastTimeoutRef.current) {
      window.clearTimeout(profileToastTimeoutRef.current);
      profileToastTimeoutRef.current = null;
    }

    setProfileSyncToastMessage("");
  }

  function showProfileSyncToast(message) {
    dismissProfileSyncToast();
    setProfileSyncToastMessage(message);

    profileToastTimeoutRef.current = window.setTimeout(() => {
      dismissProfileSyncToast();
    }, PROFILE_SYNC_TOAST_DURATION_MS);
  }

  function dismissRewriteToast() {
    if (rewriteToastTimeoutRef.current) {
      window.clearTimeout(rewriteToastTimeoutRef.current);
      rewriteToastTimeoutRef.current = null;
    }

    setRewriteToastMessage("");
  }

  function showRewriteToast(message) {
    dismissRewriteToast();
    setRewriteToastMessage(message);

    rewriteToastTimeoutRef.current = window.setTimeout(() => {
      dismissRewriteToast();
    }, REWRITE_TOAST_DURATION_MS);
  }

  function handleRewriteError(message) {
    setStatus({
      type: "error",
      message,
    });
  }

  function applyProfileSync(
    profile,
    { successMessage = "Profile data loaded into resume.", showToast = true, showNoChangesStatus = false } = {},
  ) {
    const currentResume = getValues();
    const mergeResult = mapProfileToResume(profile, currentResume);

    if (!mergeResult.changed) {
      if (showNoChangesStatus) {
        setStatus({
          type: "warning",
          message: "Resume already contains data for the available profile fields.",
        });
      }
      return false;
    }

    const nextResume = mergeResult.resume;
    const changedSections = new Set(mergeResult.changedSections);

    startTransition(() => {
      if (changedSections.has("personalInfo")) {
        Object.entries(nextResume.personalInfo || {}).forEach(([fieldName, value]) => {
          setValue(`personalInfo.${fieldName}`, value || "", {
            shouldDirty: true,
            shouldTouch: false,
            shouldValidate: false,
          });
        });
      }

      if (changedSections.has("education")) {
        educationFieldArray.replace(nextResume.education);
      }

      if (changedSections.has("experience")) {
        experienceFieldArray.replace(nextResume.experience);
      }

    if (changedSections.has("skills")) {
      skillsFieldArray.replace(nextResume.skills);
    }
    if (changedSections.has("languages")) {
      languagesFieldArray.replace(nextResume.languages);
    }
    });

    setStatus({
      type: "success",
      message: successMessage,
    });

    if (showToast) {
      showProfileSyncToast(successMessage);
    }

    return true;
  }

  async function loadProfileData({ syncIntoResume = false } = {}) {
    const token = getToken();

    if (!token) {
      setProfileData(null);
      setIsProfileLoading(false);
      return null;
    }

    if (syncIntoResume) {
      setIsProfileSyncing(true);
    } else {
      setIsProfileLoading(true);
    }

    try {
      const profile = await getProfileMe(token);
      setProfileData(profile);

      if (syncIntoResume) {
        applyProfileSync(profile, {
          successMessage: "Profile data loaded into resume.",
          showNoChangesStatus: true,
        });
      }

      return profile;
    } catch (error) {
      setStatus({
        type: "warning",
        message: error.message || "Could not load profile data for resume sync.",
      });
      return null;
    } finally {
      if (syncIntoResume) {
        setIsProfileSyncing(false);
      } else {
        setIsProfileLoading(false);
      }
    }
  }

  async function hydrateResumeBuilder({ showLoading = true, successMessage = "" } = {}) {
    if (!currentUserId) {
      return;
    }

    try {
      if (showLoading) {
        setIsResumeLoading(true);
      }

      const [resumeState, remoteDeletedSections] = await Promise.all([
        fetchResumeBuilderState(currentUserId),
        fetchDeletedResumeSections(currentUserId),
      ]);

      const mappedFormValues = buildResumeFormValues(resumeState.resumeData);

      console.log("[ResumeBuilder] mapped API resume data before reset", {
        apiResumeData: resumeState.resumeData,
        mappedFormValues,
      });

      pendingHydrationLogRef.current = {
        source: "api-resume",
        fullName: mappedFormValues.personalInfo.fullName,
        email: mappedFormValues.personalInfo.email,
      };

      reset(mappedFormValues);
      const hydratedTemplateId = normalizeTemplateId(
        resumeState.resumeData?.selected_template || resumeState.templateId || DEFAULT_TEMPLATE_ID,
      );

      setSections(sanitizeSections(resumeState.sections, { fallbackToDefaults: false }));
      setDeletedSections(Array.isArray(remoteDeletedSections) ? remoteDeletedSections : []);
      setPersonalSectionDeleted(Boolean(resumeState.personalSectionDeleted));
      applyTemplateSelection(hydratedTemplateId);
      setJobContext(
        resumeState.jobContext || {
          jobDescription: "",
          jobTitle: "",
        },
      );
      setAiGenerated(
        resumeState.aiGenerated || {
          summary: false,
          education: false,
          skills: false,
          experience: false,
          projects: false,
        },
      );
      setOptimizedSections(
        resumeState.optimizedSections || {
          summary: false,
          skills: false,
          experience: false,
        },
      );

      hasLoadedRemoteResumeRef.current = true;

      if (successMessage) {
        setStatus({
          type: "success",
          message: successMessage,
        });
      }
    } catch (error) {
      const isNetworkError =
        error.message.includes("Cannot reach the resume API") ||
        error.message.includes("Failed to fetch");

      if (isNetworkError) {
        reset({
          ...defaultResumeValues,
          personalInfo: {
            ...defaultResumeValues.personalInfo,
            fullName: "Demo User",
            email: "demo@email.com",
          },
        });
      }

      setStatus({
        type: "error",
        message: error.message || "Could not load the saved resume from the database.",
        isNetworkError,
      });
    } finally {
      if (showLoading) {
        setIsResumeLoading(false);
      }
    }
  }

  useEffect(() => {
    const storedUser = getUser();
    const resolvedUserId = storedUser?.id || 1; // Fallback to demo user ID 1

    if (!storedUser?.id) {
      setStatus({
        type: "warning",
        message: "You are viewing the demo resume. Sign in to save to your own account.",
      });
    }

    setCurrentUserId(resolvedUserId);
  }, []);

  useEffect(() => {
    hasAttemptedInitialProfileSyncRef.current = false;
  }, [currentUserId]);

  useEffect(() => {
    try {
      const storedVersions = window.localStorage.getItem(RESUME_VERSION_STORAGE_KEY);

      if (!storedVersions) {
        return;
      }

      const parsedVersions = JSON.parse(storedVersions);
      if (Array.isArray(parsedVersions)) {
        setSavedVersions(parsedVersions);
      }
    } catch (_error) {
      window.localStorage.removeItem(RESUME_VERSION_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    try {
      const storedTemplateId = window.localStorage.getItem(RESUME_TEMPLATE_STORAGE_KEY);

      if (storedTemplateId) {
        applyTemplateSelection(storedTemplateId);
      }
    } catch (_error) {
      window.localStorage.removeItem(RESUME_TEMPLATE_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (!currentUserId) {
      return;
    }

    hydrateResumeBuilder();
  }, [currentUserId]);

  useEffect(() => {
    if (!currentUserId) {
      return;
    }

    loadProfileData();
  }, [currentUserId]);

  useEffect(() => {
    if (!autoSyncEnabled || !profileData || isResumeLoading || hasAttemptedInitialProfileSyncRef.current) {
      return;
    }

    applyProfileSync(profileData, {
      successMessage: "Profile data loaded into resume.",
      showNoChangesStatus: false,
    });
    hasAttemptedInitialProfileSyncRef.current = true;
  }, [autoSyncEnabled, isResumeLoading, profileData]);

  useEffect(() => {
    return () => {
      clearUndoTimers();
      dismissProfileSyncToast();
      dismissRewriteToast();

      if (autoSaveTimeoutRef.current) {
        window.clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const customSectionConfigs = sections.filter((section) => section.type === "custom");
    const customSectionIds = new Set(customSectionConfigs.map((section) => section.id));
    const currentCustomSections = getValues("customSections") || [];
    const nextCustomSections = currentCustomSections.filter((section) => customSectionIds.has(section.id));

    customSectionConfigs.forEach((section) => {
      if (!nextCustomSections.some((item) => item.id === section.id)) {
        nextCustomSections.push({ id: section.id, content: "" });
      }
    });

    if (
      nextCustomSections.length !== currentCustomSections.length ||
      nextCustomSections.some((section, index) => section.id !== currentCustomSections[index]?.id)
    ) {
      customSectionsFieldArray.replace(nextCustomSections);
    }
  }, [customSectionsFieldArray, getValues, sections]);

  useEffect(() => {
    if (!pendingHydrationLogRef.current) {
      return;
    }

    console.log("[ResumeBuilder] form state after reset", {
      hydrationSource: pendingHydrationLogRef.current.source,
      personalInfo: resumeValues.personalInfo,
      skillCount: resumeValues.skills?.length || 0,
      educationCount: resumeValues.education?.length || 0,
      experienceCount: resumeValues.experience?.length || 0,
    });

    pendingHydrationLogRef.current = null;
  }, [resumeValues]);

  useEffect(() => {
    console.log("FORM STATE UPDATED:", resumeValues);
  }, [resumeValues]);

  useEffect(() => {
    if (!currentUserId || !hasLoadedRemoteResumeRef.current || isResumeLoading) {
      return;
    }

    if (autoSaveTimeoutRef.current) {
      window.clearTimeout(autoSaveTimeoutRef.current);
    }

    autoSaveTimeoutRef.current = window.setTimeout(async () => {
      try {
        await saveResumeBuilderState(currentUserId, {
          sections,
          personalSectionDeleted,
          resumeData: {
            ...resumeValues,
            selected_template: selectedTemplateId,
          },
          templateId: selectedTemplateId,
          jobContext,
          aiGenerated,
          optimizedSections,
        });
      } catch (error) {
        setStatus({
          type: "error",
          message: error.message || "Could not save the latest resume changes.",
        });
      }
    }, AUTO_SAVE_DELAY_MS);

    return () => {
      if (autoSaveTimeoutRef.current) {
        window.clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [
    aiGenerated,
    currentUserId,
    isResumeLoading,
    jobContext,
    optimizedSections,
    personalSectionDeleted,
    resumeValues,
    sections,
    selectedTemplateId,
  ]);

  const handleAddEntry = async ({ sectionName, label, append, createItem, focusField }) => {
    const isSectionValid = await trigger(sectionName);

    if (!isSectionValid) {
      setStatus({
        type: "error",
        message: `Complete the current ${label.toLowerCase()} entry before adding another one.`,
      });
      return;
    }

    const nextIndex = (getValues(sectionName) || []).length;
    append(createItem());
    setStatus(null);

    window.requestAnimationFrame(() => {
      setFocus(`${sectionName}.${nextIndex}.${focusField}`);
    });
  };

  const handleRemoveEntry = (remove, index) => {
    remove(index);
    setStatus(null);
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = sections.findIndex((section) => section.id === active.id);
    const newIndex = sections.findIndex((section) => section.id === over.id);

    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    setSections((currentSections) => arrayMove(currentSections, oldIndex, newIndex));
  };

  const buildValidationTargets = () => {
    const targets = [];

    if (!personalSectionDeleted) {
      targets.push("personalInfo");
    }

    sections.forEach((section) => {
      if (!section.visible) {
        return;
      }

      if (section.type === "custom") {
        const customSectionIndex = customSectionIndexMap.get(section.id);
        if (customSectionIndex !== undefined) {
          targets.push(`customSections.${customSectionIndex}.content`);
        }
        return;
      }

      targets.push(section.type);
    });

    return targets;
  };

  // SINGLE SOURCE OF TRUTH: both Export PDF and Save CV go through this.
  // Any change to PDF rendering must be made here so the two flows stay
  // byte-identical.
  const waitForPreviewRender = () =>
    new Promise((resolve) => {
      if (typeof window === "undefined") {
        resolve();
        return;
      }

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(resolve);
      });
    });

  const persistSelectedTemplate = async (templateId, { silent = false } = {}) => {
    if (!currentUserId) {
      return;
    }

    try {
      await saveResumeBuilderState(currentUserId, {
        sections,
        personalSectionDeleted,
        resumeData: {
          ...getValues(),
          selected_template: templateId,
        },
        templateId,
        jobContext,
        aiGenerated,
        optimizedSections,
      });
    } catch (error) {
      if (!silent) {
        throw error;
      }
    }
  };

  const generatePDFBlob = async (selectedTemplate) => {
    const templateId = normalizeTemplateId(selectedTemplate);

    if (!templateId) {
      throw new Error("Choose a resume template before saving or exporting.");
    }

    const element = document.getElementById("cv-preview");
    if (!element) {
      throw new Error("CV preview not found");
    }

    const html2pdfModule = await import("html2pdf.js");
    const html2pdf = html2pdfModule.default || html2pdfModule;

    const opt = {
      margin: 0,
      filename: "cv.pdf",
      image: { type: "jpeg", quality: 1 },
      html2canvas: {
        scale: 2,
        useCORS: true,
      },
      jsPDF: {
        unit: "mm",
        format: "a4",
        orientation: "portrait",
      },
    };

    return html2pdf().set(opt).from(element).outputPdf("blob");
  };

  const performSaveCv = async (selectedTemplate) => {
    const templateId = normalizeTemplateId(selectedTemplate);
    setStatus(null);
    const token = getToken();
    const storedUser = getUser();
    const email = storedUser?.email || getValues("personalInfo.email") || "";

    if (!token || !email) {
      setStatus({
        type: "error",
        message: "Sign in (with an account that has an email) to save your CV.",
      });
      return;
    }

    setIsSavingCv(true);
    try {
      await persistSelectedTemplate(templateId);
      await waitForPreviewRender();
      const pdfBlob = await generatePDFBlob(templateId);
      await uploadCv(token, email, pdfBlob, "cv.pdf");

      setStatus({
        type: "success",
        message: "CV saved successfully on the server.",
      });
    } catch (error) {
      setStatus({
        type: "error",
        message: error.message || "Could not save your CV.",
      });
    } finally {
      setIsSavingCv(false);
    }
  };

  const performExport = async (selectedTemplate) => {
    const templateId = normalizeTemplateId(selectedTemplate);
    setStatus(null);
    const isFormValid = await trigger(buildValidationTargets());
    const currentIssues = getResumeCompletionIssues(getValues(), sections, {
      requirePersonalInfo: !personalSectionDeleted,
    });

    if (!isFormValid || currentIssues.length) {
      setStatus({
        type: "error",
        message: "Complete all visible required fields before exporting your resume as PDF.",
      });
      return;
    }

    setIsExporting(true);
    try {
      await persistSelectedTemplate(templateId, { silent: true });
      await waitForPreviewRender();
      const blob = await generatePDFBlob(templateId);
      const fullName = (getValues("personalInfo.fullName") || "resume").trim();
      const safeName = fullName.replace(/[^A-Za-z0-9._-]+/g, "_") || "resume";
      const downloadName = `${safeName}.pdf`;

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = downloadName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);

      setStatus({
        type: "success",
        message: "Resume exported as PDF.",
      });
    } catch (error) {
      setStatus({
        type: "error",
        message: error.message || "Could not export your resume as PDF.",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const openTemplateDialog = (action) => {
    setStatus(null);
    setPendingTemplateId(normalizeTemplateId(selectedTemplateId || getValues("selected_template") || DEFAULT_TEMPLATE_ID));
    setTemplateDialogAction(action);
  };

  const handleTemplateDialogContinue = async () => {
    const templateId = applyTemplateSelection(pendingTemplateId, { collapseSwitcher: true });
    const action = templateDialogAction;

    if (!templateId) {
      setStatus({
        type: "error",
        message: "Choose a resume template before continuing.",
      });
      return;
    }

    setTemplateDialogAction(null);
    await waitForPreviewRender();

    if (action === "save") {
      await performSaveCv(templateId);
      return;
    }

    if (action === "export") {
      await performExport(templateId);
    }
  };

  const handleSyncProfile = async () => {
    await loadProfileData({ syncIntoResume: true });
  };

  const persistVersions = (nextVersions) => {
    setSavedVersions(nextVersions);
    window.localStorage.setItem(RESUME_VERSION_STORAGE_KEY, JSON.stringify(nextVersions));
  };

  const handleGenerateResume = async (payload) => {
    setIsAiLoading(true);
    setStatus(null);

    try {
      const data = await generateResumeWithAI(payload);
      console.log("AI RESPONSE:", data);
      console.log("[resume-generate] Generate Resume Draft response", data);

      if (!data || typeof data !== "object") {
        throw new Error("AI returned no data.");
      }

      const mappedResume = mapAiResumeToForm(data);
      console.log("[resume-generate] Mapped resume form data", mappedResume);

      const hasEducation =
        Array.isArray(mappedResume.education) &&
        mappedResume.education.some((item) =>
          [item?.universityName, item?.degree, item?.gpa, item?.startYear, item?.endYear].some((value) => hasText(value)),
        );
      const hasSkills =
        Array.isArray(mappedResume.skills) && mappedResume.skills.some((item) => hasText(item?.name));
      const hasExperience =
        Array.isArray(mappedResume.experience) &&
        mappedResume.experience.some((item) =>
          [item?.jobTitle, item?.companyName, item?.startDate, item?.endDate, item?.description].some((value) => hasText(value)),
        );
      const hasProjects =
        Array.isArray(mappedResume.projects) &&
        mappedResume.projects.some((item) =>
          [item?.name, item?.link, item?.technologies, item?.description].some((value) => hasText(value)),
        );
      const hasSummary = hasText(mappedResume.summary);

      if (!hasSummary && !hasEducation && !hasSkills && !hasExperience && !hasProjects) {
        if (typeof window !== "undefined") {
          window.alert("AI returned an empty resume draft.");
        }
        throw new Error("AI returned an empty resume draft.");
      }

      const currentFormValues = getValues();
      const nextFormValues = {
        ...currentFormValues,
        summary: mappedResume.summary || "",
        education: mappedResume.education?.length ? mappedResume.education : [createEmptyEducation()],
        skills: mappedResume.skills?.length ? mappedResume.skills : [createEmptySkill(), createEmptySkill(), createEmptySkill()],
        experience: mappedResume.experience?.length ? mappedResume.experience : [createEmptyExperience()],
        projects: mappedResume.projects?.length ? mappedResume.projects : [createEmptyProject()],
      };

      console.log("[resume-generate] Reset payload", nextFormValues);

      startTransition(() => {
        reset(nextFormValues);
        setAiGenerated({
          summary: hasSummary,
          education: hasEducation,
          skills: hasSkills,
          experience: hasExperience,
          projects: hasProjects,
        });
      });

      setStatus({
        type: "success",
        message: "AI draft added and applied to the resume form.",
      });
    } catch (error) {
      const message = error?.message || "AI returned no usable resume data.";
      setStatus({
        type: "error",
        message,
      });
      throw error;
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleAcceptSummaryOptimization = (summary, { optimized = false, jobDescription = "" } = {}) => {
    setValue("summary", summary, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
    setOptimizedSections((currentState) => ({
      ...currentState,
      summary: optimized,
    }));
    if (optimized && jobDescription.trim()) {
      setJobContext((currentContext) => ({
        ...currentContext,
        jobTitle: summaryJobTitle,
        jobDescription: jobDescription.trim(),
      }));
    }
    setStatus({
      type: "success",
      message: optimized
        ? "Summary updated with job-focused wording."
        : "Summary updated with a stronger, clearer rewrite.",
    });
  };

  const handleApplyGeneratedSummary = (summary, { optimized = false, jobDescription = "" } = {}) => {
    setValue("summary", summary, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
    setOptimizedSections((currentState) => ({
      ...currentState,
      summary: optimized,
    }));

    if (optimized && jobDescription.trim()) {
      setJobContext((currentContext) => ({
        ...currentContext,
        jobTitle: summaryJobTitle,
        jobDescription: jobDescription.trim(),
      }));
    }

    setStatus({
      type: "success",
      message: optimized
        ? "Summary updated with job-matched keywords."
        : "Summary updated with a stronger ATS-focused version.",
    });
  };

  const handleAcceptSkillsOptimization = (skills, { optimized = false } = {}) => {
    const nextSkills = skills.map((skill) => ({ name: skill }));

    while (nextSkills.length < 3) {
      nextSkills.push(createEmptySkill());
    }

    skillsFieldArray.replace(nextSkills);
    setOptimizedSections((currentState) => ({
      ...currentState,
      skills: optimized,
    }));
    setStatus({
      type: "success",
      message: optimized
        ? "Skills updated with stronger job-aligned keywords."
        : "Skills updated with stronger, clearer wording.",
    });
  };

  const handleAcceptExperienceOptimization = (index, description, { optimized = false } = {}) => {
    setValue(`experience.${index}.description`, description, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    });
    setOptimizedSections((currentState) => ({
      ...currentState,
      experience: optimized,
    }));
    setStatus({
      type: "success",
      message: optimized
        ? "Experience bullets updated with stronger ATS-friendly phrasing."
        : "Experience bullets updated with clearer, stronger phrasing.",
    });
  };

  const handleToggleSectionVisibility = (sectionId) => {
    setSections((currentSections) =>
      currentSections.map((section) =>
        section.id === sectionId ? { ...section, visible: !section.visible } : section,
      ),
    );
  };

  const handleDeleteSection = (section) => {
    if (!currentUserId) {
      setStatus({
        type: "error",
        message: "Sign in to delete sections from the saved resume.",
      });
      return;
    }

    setPendingDeleteSection(section);
  };

  const handleConfirmDeleteSection = async () => {
    if (!pendingDeleteSection || !currentUserId) {
      return;
    }

    const section = pendingDeleteSection;
    const previousSections = sections;
    const previousDeletedSections = deletedSections;
    const previousPersonalSectionDeleted = personalSectionDeleted;

    setPendingSectionKey(section.id);
    setPendingDeleteSection(null);

    if (section.type === "personal") {
      setPersonalSectionDeleted(true);
    } else {
      setSections((currentSections) => currentSections.filter((item) => item.id !== section.id));
    }

    setDeletedSections((currentSections) => [
      {
        id: section.id,
        type: section.type,
        title: section.title,
        deletedAt: new Date().toISOString(),
      },
      ...currentSections.filter((item) => item.id !== section.id),
    ]);

    try {
      await softDeleteResumeSection(currentUserId, section.id);
      showUndoToast(section);
      setStatus({
        type: "success",
        message: `${section.title} was removed. You can undo it for 10 seconds.`,
      });
    } catch (error) {
      setSections(previousSections);
      setDeletedSections(previousDeletedSections);
      setPersonalSectionDeleted(previousPersonalSectionDeleted);
      setStatus({
        type: "error",
        message: error.message || "Could not delete that section.",
      });
    } finally {
      setPendingSectionKey("");
    }
  };

  const restoreSectionByKey = async (sectionKey, successMessage) => {
    if (!currentUserId) {
      return;
    }

    const section = deletedSections.find((item) => item.id === sectionKey);

    setPendingSectionKey(sectionKey);

    try {
      await restoreResumeSection(currentUserId, sectionKey);
      dismissUndoToast();
      restoreSectionLocally(section);
      setStatus({
        type: "success",
        message: successMessage,
      });
    } catch (error) {
      setStatus({
        type: "error",
        message: error.message || "Could not restore that section.",
      });
    } finally {
      setPendingSectionKey("");
    }
  };

  const handleUndoDelete = async () => {
    if (!undoToast) {
      return;
    }

    await restoreSectionByKey(undoToast.sectionKey, `${undoToast.sectionTitle} restored as a blank section.`);
  };

  const handleAddBuiltInSection = async (sectionOption) => {
    const type = sectionOption?.type;
    if (!type || !SECTION_LIBRARY[type]) {
      return;
    }

    const previouslyDeleted = deletedSections.find((item) => item.type === type);

    if (previouslyDeleted) {
      restoreSectionLocally(previouslyDeleted);

      if (currentUserId) {
        try {
          await restoreResumeSection(currentUserId, previouslyDeleted.id);
        } catch (_error) {
          // Section was already restored locally; backend will sync on next save
        }
      }
    } else if (type === "personal") {
      setPersonalSectionDeleted(false);
      resetRestoredSectionData({ type: "personal" });
    } else {
      setSections((currentSections) => {
        const nextSections = [...currentSections, createSectionConfig(type)];
        return nextSections.sort(
          (left, right) => getSectionOrderRank(left.type) - getSectionOrderRank(right.type),
        );
      });
    }

    setIsAddSectionModalOpen(false);
    setStatus({
      type: "success",
      message: `${SECTION_LIBRARY[type].title} added back to the resume layout.`,
    });
  };

  const handleAddCustomSection = (title) => {
    const sectionId = createCustomSectionId();
    const nextTitle = typeof title === "string" && title.trim() ? title.trim() : "New Section";

    customSectionsFieldArray.append({ id: sectionId, content: "" });
    setSections((currentSections) => [
      ...currentSections,
      createSectionConfig("custom", {
        id: sectionId,
        title: nextTitle,
      }),
    ]);
    setIsAddSectionModalOpen(false);
    setStatus({
      type: "success",
      message: `${nextTitle} added to the resume layout.`,
    });
  };

  const handleUpdateCustomSectionTitle = (sectionId, title) => {
    setSections((currentSections) =>
      currentSections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              title,
            }
          : section,
      ),
    );
  };

  const handleSaveVersion = () => {
    const derivedName =
      versionName.trim() ||
      `${getValues("personalInfo.fullName") || "Resume Draft"}${jobContext.jobTitle ? ` - ${jobContext.jobTitle}` : ""}`;

    const nextVersion = {
      id: `${Date.now()}`,
      name: derivedName,
      savedAt: new Date().toISOString(),
      templateId: selectedTemplateId,
      templateLabel: RESUME_TEMPLATES.find((template) => template.id === selectedTemplateId)?.label || "Classic ATS",
      sections,
      deletedSections,
      personalSectionDeleted,
      jobContext,
      aiGenerated,
      optimizedSections,
      resumeData: getValues(),
    };

    persistVersions([nextVersion, ...savedVersions].slice(0, 10));
    setVersionName("");
    setStatus({
      type: "success",
      message: `Saved resume version "${derivedName}".`,
    });
  };

  const handleLoadVersion = (versionId) => {
    const selectedVersion = savedVersions.find((version) => version.id === versionId);

    if (!selectedVersion) {
      return;
    }

    const nextSections = selectedVersion.sections
      ? sanitizeSections(selectedVersion.sections, { fallbackToDefaults: false })
      : buildSectionsFromLegacyOrder(selectedVersion.sectionOrder);

    reset(buildResumeFormValues(selectedVersion.resumeData || {}));
    setSections(nextSections);
    setDeletedSections(selectedVersion.deletedSections || []);
    setPersonalSectionDeleted(Boolean(selectedVersion.personalSectionDeleted));
    setSelectedTemplateId(normalizeTemplateId(selectedVersion.templateId || DEFAULT_TEMPLATE_ID));
    setJobContext(selectedVersion.jobContext || { jobDescription: "", jobTitle: "" });
    setAiGenerated(
      selectedVersion.aiGenerated || {
        summary: false,
        education: false,
        skills: false,
        experience: false,
        projects: false,
      },
    );
    setOptimizedSections(
      selectedVersion.optimizedSections || {
        summary: false,
        skills: false,
        experience: false,
      },
    );
    setStatus({
      type: "success",
      message: `Loaded resume version "${selectedVersion.name}".`,
    });
  };

  const handleDeleteVersion = (versionId) => {
    const nextVersions = savedVersions.filter((version) => version.id !== versionId);
    persistVersions(nextVersions);
  };

  const renderSectionBody = (section) => {
    if (section.type === "summary") {
      return (
        <SummarySection
          title={section.title}
          control={control}
          setValue={setValue}
          error={section.visible ? errors.summary : null}
          skills={summarySkills}
          experience={resumeValues.experience}
          onApplyGeneratedSummary={handleApplyGeneratedSummary}
          onRewriteSuccess={showRewriteToast}
          onRewriteError={handleRewriteError}
          badges={buildBadgeList({
            aiGenerated: aiGenerated.summary,
            optimized: optimizedSections.summary,
          })}
        />
      );
    }

    if (section.type === "education") {
      return (
        <SectionForm
          title={section.title}
          description="List your degrees in reverse chronological order."
          name="education"
          fields={educationFields}
          items={educationFieldArray.fields}
          values={resumeValues.education}
          errors={errors}
          control={control}
          setValue={setValue}
          onRewriteSuccess={showRewriteToast}
          onRewriteError={handleRewriteError}
          onAdd={() =>
            handleAddEntry({
              sectionName: "education",
              label: "education",
              append: educationFieldArray.append,
              createItem: createEmptyEducation,
              focusField: "universityName",
            })
          }
          onRemove={(index) => handleRemoveEntry(educationFieldArray.remove, index)}
          addLabel="Add education"
        />
      );
    }

    if (section.type === "experience") {
      return (
        <SectionForm
          title={section.title}
          description="Use strong action verbs and line-by-line bullet content."
          name="experience"
          fields={experienceFields}
          items={experienceFieldArray.fields}
          values={resumeValues.experience}
          errors={errors}
          control={control}
          setValue={setValue}
          onRewriteSuccess={showRewriteToast}
          onRewriteError={handleRewriteError}
          badges={buildBadgeList({
            aiGenerated: aiGenerated.experience,
            optimized: optimizedSections.experience,
          })}
          onAdd={() =>
            handleAddEntry({
              sectionName: "experience",
              label: "experience",
              append: experienceFieldArray.append,
              createItem: createEmptyExperience,
              focusField: "jobTitle",
            })
          }
          onRemove={(index) => handleRemoveEntry(experienceFieldArray.remove, index)}
          addLabel="Add experience"
        />
      );
    }

    if (section.type === "skills") {
      return (
        <SectionForm
          title={section.title}
          description="Add at least three role-specific skills."
          name="skills"
          fields={skillFields}
          items={skillsFieldArray.fields}
          values={resumeValues.skills}
          errors={errors}
          control={control}
          setValue={setValue}
          onRewriteSuccess={showRewriteToast}
          onRewriteError={handleRewriteError}
          badges={buildBadgeList({
            aiGenerated: aiGenerated.skills,
            optimized: optimizedSections.skills,
          })}
          minItems={3}
          sectionError={section.visible && filledSkillCount < 3 ? "At least 3 skills are required." : ""}
          onAdd={() =>
            handleAddEntry({
              sectionName: "skills",
              label: "skill",
              append: skillsFieldArray.append,
              createItem: createEmptySkill,
              focusField: "name",
            })
          }
          onRemove={(index) => handleRemoveEntry(skillsFieldArray.remove, index)}
          addLabel="Add skill"
        />
      );
    }

    if (section.type === "projects") {
      return (
        <SectionForm
          title={section.title}
          description="Highlight practical work that supports your target role."
          name="projects"
          fields={projectFields}
          items={projectsFieldArray.fields}
          values={resumeValues.projects}
          errors={errors}
          control={control}
          setValue={setValue}
          onRewriteSuccess={showRewriteToast}
          onRewriteError={handleRewriteError}
          badges={buildBadgeList({
            aiGenerated: aiGenerated.projects,
            optimized: false,
          })}
          onAdd={() =>
            handleAddEntry({
              sectionName: "projects",
              label: "project",
              append: projectsFieldArray.append,
              createItem: createEmptyProject,
              focusField: "name",
            })
          }
          onRemove={(index) => handleRemoveEntry(projectsFieldArray.remove, index)}
          addLabel="Add project"
        />
      );
    }

    if (section.type === "certifications") {
      return (
        <SectionForm
          title={section.title}
          description="Add certifications that strengthen your ATS keywords."
          name="certifications"
          fields={certificationFields}
          items={certificationsFieldArray.fields}
          values={resumeValues.certifications}
          errors={errors}
          control={control}
          setValue={setValue}
          onRewriteSuccess={showRewriteToast}
          onRewriteError={handleRewriteError}
          onAdd={() =>
            handleAddEntry({
              sectionName: "certifications",
              label: "certification",
              append: certificationsFieldArray.append,
              createItem: createEmptyCertification,
              focusField: "name",
            })
          }
          onRemove={(index) => handleRemoveEntry(certificationsFieldArray.remove, index)}
          addLabel="Add certification"
        />
      );
    }

    if (section.type === "languages") {
      return (
        <SectionForm
          title={section.title}
          description="Add spoken or written languages with your proficiency level."
          name="languages"
          fields={languageFields}
          items={languagesFieldArray.fields}
          values={resumeValues.languages}
          errors={errors}
          control={control}
          setValue={setValue}
          onRewriteSuccess={showRewriteToast}
          onRewriteError={handleRewriteError}
          onAdd={() =>
            handleAddEntry({
              sectionName: "languages",
              label: "language",
              append: languagesFieldArray.append,
              createItem: createEmptyLanguage,
              focusField: "language",
            })
          }
          onRemove={(index) => handleRemoveEntry(languagesFieldArray.remove, index)}
          addLabel="Add language"
        />
      );
    }

    const customSectionIndex = customSectionIndexMap.get(section.id);

    if (customSectionIndex === undefined) {
      return (
        <section className="resume-editor-panel rounded-[1.5rem] border p-5 md:p-6">
          <h2 className="text-lg font-semibold text-slateplus">{section.title || "Custom Section"}</h2>
          <p className="mt-2 text-sm text-slate-500">
            Preparing this custom section so its content can stay synced with the preview and PDF.
          </p>
        </section>
      );
    }

    return (
      <CustomSectionForm
        section={section}
        fieldName={`customSections.${customSectionIndex}.content`}
        control={control}
        setValue={setValue}
        titleErrorMessage={section.visible && !String(section.title || "").trim() ? "Title is required for visible custom sections." : ""}
        errorMessage={errors?.customSections?.[customSectionIndex]?.content?.message || ""}
        onTitleChange={(value) => handleUpdateCustomSectionTitle(section.id, value)}
        onRewriteSuccess={showRewriteToast}
        onRewriteError={handleRewriteError}
      />
    );
  };

  if (isResumeLoading || isProfileLoading) {
    return (
      <>
        <SectionHeader
          title="Resume Builder"
          description="Build a professional ATS-friendly resume with dynamic sections, live preview, PDF export, and drag-and-drop layout control."
        />
        <div className="resume-editor-panel rounded-[1.5rem] border p-8">
          <div className="flex items-center gap-4 text-sm text-slate-500">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-[#67E8F9]" />
            <span>Loading your saved resume and profile data...</span>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] min-w-0">
      <ResumeBuilderHero
        selectedTemplate={selectedTemplate}
        selectedTemplateId={selectedTemplateId}
        onTemplateChange={applyTemplateSelection}
        templates={RESUME_TEMPLATES}
        hasProfileSession={hasProfileSession}
        isProfileSyncing={isProfileSyncing}
        onSyncProfile={handleSyncProfile}
        onAddSection={() => setIsAddSectionModalOpen(true)}
        onGenerateAi={() => setIsAiModalOpen(true)}
        onOptimizeJob={() => setIsOptimizeModalOpen(true)}
        onSaveCv={() => openTemplateDialog("save")}
        isSavingCv={isSavingCv}
        onExport={() => openTemplateDialog("export")}
        canExport={canExport}
        isExporting={isExporting}
      />

      <ExportTemplateModal
        open={Boolean(templateDialogAction)}
        templates={RESUME_TEMPLATES}
        selectedTemplateId={pendingTemplateId}
        resumeData={previewResumeData}
        sections={sections}
        showPersonalInfo={!personalSectionDeleted}
        compressionLevel={effectiveCompressionLevel}
        loading={isSavingCv || isExporting}
        actionLabel={`Continue to ${templateDialogVerb}`}
        onSelectTemplate={setPendingTemplateId}
        onContinue={handleTemplateDialogContinue}
        onClose={() => setTemplateDialogAction(null)}
      />

      <div className="relative z-0 min-w-0 pt-6">
        <StatusMessage status={status} />

        <div className="resume-editor-panel mb-6 rounded-[1.5rem] border p-5 no-print">
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="text-sm font-semibold text-slateplus">Smart section management</p>
            <p className="mt-2 text-sm text-white/[0.66]">
              Delete sections safely, undo within 10 seconds, and keep the layout focused on the sections you want to show.
              The form, preview, and exported PDF always follow the same active section set.
            </p>
            <label className="mt-4 inline-flex items-center gap-3 rounded-2xl border border-white/[0.1] bg-white/[0.045] px-4 py-2.5 text-sm text-white/[0.74]">
              <span className="font-medium">Auto-sync enabled</span>
              <button
                type="button"
                role="switch"
                aria-checked={autoSyncEnabled}
                onClick={() => setAutoSyncEnabled((currentValue) => !currentValue)}
                className={`relative h-7 w-12 rounded-full transition ${
                  autoSyncEnabled ? "bg-cyan-500" : "bg-white/20"
                }`}
              >
                <span
                  className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
                    autoSyncEnabled ? "left-6" : "left-1"
                  }`}
                />
              </button>
            </label>
          </div>
          <div className="dashboard-subcard rounded-2xl border p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/[0.48]">Current target role</p>
            <p className="mt-2 text-sm font-medium text-slateplus">{jobContext.jobTitle || "No job title selected yet"}</p>
            <p className="mt-1 text-sm text-white/[0.58]">
              {jobContext.jobDescription
                ? "A job description is loaded for ATS scoring and optimization."
                : "Add a job description to unlock keyword-specific scoring."}
            </p>
            <p className="mt-3 text-xs text-white/[0.52]">
              {hasProfileSession
                ? autoSyncEnabled
                  ? "Profile data will fill only empty resume fields."
                  : "Automatic profile fill is off. Use Sync with Profile whenever you want."
                : "Sign in to sync profile data into this resume."}
            </p>
          </div>
        </div>
      </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]">
        <div className="space-y-6">
          {!personalSectionDeleted ? (
            <PersonalInfoForm
              control={control}
              errors={errors.personalInfo}
              actions={
                <button
                  type="button"
                  onClick={() => handleDeleteSection(PERSONAL_SECTION)}
                  disabled={Boolean(pendingSectionKey)}
                  className="premium-danger-action rounded-2xl px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Delete Section
                </button>
              }
            />
          ) : null}

          <div className="rounded-[1.35rem] border border-dashed border-white/[0.14] bg-white/[0.04] p-4 text-sm leading-6 text-white/[0.6] no-print">
            Use the section controls to drag, hide, or delete ATS-safe sections. Hidden sections stay editable here but disappear from the preview and PDF.
          </div>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={getSectionOrderIds(sections)} strategy={verticalListSortingStrategy}>
              <div className="space-y-4">
                {sections.map((section) => (
                  <SortableResumeSection
                    key={section.id}
                    section={section}
                    canDelete={canDeleteSection(section)}
                    deleteDisabled={Boolean(pendingSectionKey)}
                    onDelete={() => handleDeleteSection(section)}
                    onToggleVisibility={() => handleToggleSectionVisibility(section.id)}
                  >
                    {renderSectionBody(section)}
                  </SortableResumeSection>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        <div className="space-y-4 xl:sticky xl:top-8 xl:self-start">
          <TemplateSwitcher
            templates={RESUME_TEMPLATES}
            selectedTemplateId={selectedTemplateId}
            onChange={handleTemplateChange}
            compactMode={compactMode}
            onToggleCompactMode={setCompactMode}
            showTemplates={showTemplates}
            onToggleVisibility={setShowTemplates}
            resumeData={previewResumeData}
            sections={sections}
            showPersonalInfo={!personalSectionDeleted}
            compressionLevel={effectiveCompressionLevel}
          />

          <ResumePreview
            resumeData={previewResumeData}
            aiGenerated={aiGenerated}
            optimizedSections={optimizedSections}
            previewRef={previewRef}
            completionIssues={completionIssues}
            selectedTemplateId={selectedTemplateId}
            sections={sections}
            showPersonalInfo={!personalSectionDeleted}
            compressionLevel={effectiveCompressionLevel}
            compressionLabel={compressionLabel}
            hasOverflow={previewHasOverflow}
          />

          <ATSScorePanel
            scoreData={atsScore}
            jobTitle={jobContext.jobTitle}
            jobDescription={jobContext.jobDescription}
          />

          <SavedResumeVersionsPanel
            draftName={versionName}
            versions={savedVersions}
            onDraftNameChange={setVersionName}
            onSave={handleSaveVersion}
            onLoad={handleLoadVersion}
            onDelete={handleDeleteVersion}
          />

          {completionIssues.length ? (
            <div className="premium-status-warning rounded-2xl border p-4 text-sm">
              Complete all visible required fields before exporting. Only visible sections are included in preview and PDF validation.
            </div>
          ) : null}
        </div>
        </div>
      </div>

      <AddSectionModal
        open={isAddSectionModalOpen}
        availableBuiltInSections={availableBuiltInSections}
        onClose={() => setIsAddSectionModalOpen(false)}
        onAddBuiltInSection={handleAddBuiltInSection}
        onAddCustomSection={handleAddCustomSection}
      />

      <AIFormModal
        open={isAiModalOpen}
        loading={isAiLoading}
        initialValues={{
          jobTitle: resumeValues.experience?.[0]?.jobTitle || "",
          level: "Mid",
          skills: buildSkillsHint(resumeValues.skills),
          education: buildEducationHint(resumeValues.education),
        }}
        onClose={() => setIsAiModalOpen(false)}
        onGenerate={handleGenerateResume}
      />

      <OptimizeForJobModal
        open={isOptimizeModalOpen}
        resumeData={resumeValues}
        initialContext={jobContext}
        onClose={() => setIsOptimizeModalOpen(false)}
        onSaveContext={setJobContext}
        onAcceptSummary={handleAcceptSummaryOptimization}
        onAcceptSkills={handleAcceptSkillsOptimization}
        onAcceptExperience={handleAcceptExperienceOptimization}
      />

      <ConfirmSectionDeleteModal
        open={Boolean(pendingDeleteSection)}
        sectionTitle={pendingDeleteSection?.title || "this section"}
        isPending={Boolean(pendingSectionKey)}
        onCancel={() => setPendingDeleteSection(null)}
        onConfirm={handleConfirmDeleteSection}
      />

      <UndoDeleteToast
        open={Boolean(undoToast)}
        sectionTitle={undoToast?.sectionTitle || "Section"}
        toastSectionKey={undoToast?.sectionKey || ""}
        secondsRemaining={undoSecondsRemaining}
        pendingSectionKey={pendingSectionKey}
        onUndo={handleUndoDelete}
        onDismiss={dismissUndoToast}
      />

      <ProfileSyncToast
        open={Boolean(profileSyncToastMessage)}
        message={profileSyncToastMessage}
        onDismiss={dismissProfileSyncToast}
      />

      <RewriteToast
        open={Boolean(rewriteToastMessage)}
        message={rewriteToastMessage}
        onDismiss={dismissRewriteToast}
      />
    </div>
  );
}
