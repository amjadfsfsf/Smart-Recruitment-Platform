export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PHONE_PATTERN = /^\+?[0-9().\-\s]{7,20}$/;
export const HTTP_URL_PATTERN = /^https?:\/\/.+/i;
export const EXPERIENCE_LEVELS = ["Junior", "Mid", "Senior"];
export const LANGUAGE_PROFICIENCY_LEVELS = ["Beginner", "Intermediate", "Advanced", "Fluent", "Native"];
export const CURRENT_YEAR = new Date().getFullYear();
export const DEFAULT_TEMPLATE_ID = "classic-ats";
export const TEMPLATE_ID_ALIASES = {
  "modern-minimal": "minimal-bold",
  "creative-sidebar": "sidebar-clean",
};
export const STANDARD_SECTION_TITLES = {
  personal: "Personal Information",
  summary: "Summary",
  education: "Education",
  experience: "Work Experience",
  skills: "Skills",
  projects: "Projects",
  certifications: "Certifications",
  languages: "Languages",
};
export const BUILT_IN_SECTION_TYPES = ["summary", "education", "experience", "skills", "projects", "certifications", "languages"];
export const PERSONAL_SECTION = {
  id: "personal",
  type: "personal",
  title: "Personal Information",
};
export const RESUME_TEMPLATES = [
  {
    id: "classic-ats",
    label: "Classic",
    description: "Single-column ATS layout with clean spacing and standard headings.",
  },
  {
    id: "minimal-bold",
    label: "Minimal Bold",
    description: "Bold monochrome resume with strong headings, thin dividers, and a clean ATS-friendly layout.",
  },
  {
    id: "elegant-gray",
    label: "Elegant Gray",
    description: "Soft gray section cards with subtle borders and rounded containers for a polished modern feel.",
  },
  {
    id: "sidebar-clean",
    label: "Sidebar Clean",
    description: "Professional two-column resume with a dark accent sidebar for contact details and skills.",
  },
  {
    id: "sidebar-blue",
    label: "Sidebar Blue",
    description: "Sidebar resume variant with a blue accent panel and ATS-friendly two-column layout.",
  },
  {
    id: "sidebar-green",
    label: "Sidebar Green",
    description: "Sidebar resume variant with an emerald accent panel and the same clean structure.",
  },
  {
    id: "sidebar-purple",
    label: "Sidebar Purple",
    description: "Sidebar resume variant with a purple accent panel while preserving the same layout.",
  },
  {
    id: "sidebar-dark",
    label: "Sidebar Dark",
    description: "Sidebar resume variant with a dark charcoal panel for a more formal visual style.",
  },
  {
    id: "compact-professional",
    label: "Compact Professional",
    description: "Dense one-page layout with smaller type and tighter spacing for content-heavy resumes.",
  },
];
export const SECTION_LIBRARY = {
  personal: {
    type: "personal",
    defaultId: "personal",
    title: STANDARD_SECTION_TITLES.personal,
    canDelete: true,
    builtIn: true,
  },
  summary: {
    type: "summary",
    defaultId: "summary",
    title: STANDARD_SECTION_TITLES.summary,
    canDelete: true,
    builtIn: true,
  },
  education: {
    type: "education",
    defaultId: "education",
    title: STANDARD_SECTION_TITLES.education,
    canDelete: true,
    builtIn: true,
  },
  experience: {
    type: "experience",
    defaultId: "experience",
    title: STANDARD_SECTION_TITLES.experience,
    canDelete: true,
    builtIn: true,
  },
  skills: {
    type: "skills",
    defaultId: "skills",
    title: STANDARD_SECTION_TITLES.skills,
    canDelete: true,
    builtIn: true,
  },
  projects: {
    type: "projects",
    defaultId: "projects",
    title: STANDARD_SECTION_TITLES.projects,
    canDelete: true,
    builtIn: true,
  },
  certifications: {
    type: "certifications",
    defaultId: "certifications",
    title: STANDARD_SECTION_TITLES.certifications,
    canDelete: true,
    builtIn: true,
  },
  languages: {
    type: "languages",
    defaultId: "languages",
    title: STANDARD_SECTION_TITLES.languages,
    canDelete: true,
    builtIn: true,
  },
  custom: {
    type: "custom",
    defaultId: "",
    title: "New Section",
    canDelete: true,
    builtIn: false,
  },
};

export function createCustomSectionId() {
  return `custom-${Math.random().toString(36).slice(2, 9)}-${Date.now().toString(36)}`;
}

export function createSectionConfig(type, overrides = {}) {
  const definition = SECTION_LIBRARY[type] || SECTION_LIBRARY.custom;

  return {
    id: overrides.id || definition.defaultId || createCustomSectionId(),
    type,
    title: overrides.title || definition.title,
    visible: overrides.visible ?? true,
  };
}

export function buildDefaultSections() {
  return BUILT_IN_SECTION_TYPES.map((type) =>
    createSectionConfig(type),
  );
}

export const DEFAULT_SECTIONS = buildDefaultSections();
export const DEFAULT_SECTION_ORDER = DEFAULT_SECTIONS.map((section) => section.id);

export function getSectionDefinition(type = "custom") {
  return SECTION_LIBRARY[type] || SECTION_LIBRARY.custom;
}

export function getStandardSectionTitle(type = "custom", fallbackTitle = "") {
  return STANDARD_SECTION_TITLES[type] || fallbackTitle || "Custom Section";
}

export function getSectionLabel(sectionIdOrType = "") {
  return getStandardSectionTitle(sectionIdOrType, getSectionDefinition(sectionIdOrType).title || sectionIdOrType);
}

export function canDeleteSection(section) {
  if (!section) {
    return false;
  }

  return Boolean(getSectionDefinition(section.type).canDelete);
}

export function getVisibleSections(sections = []) {
  return sections.filter((section) => section?.visible);
}

export function getSectionOrderIds(sections = []) {
  return sections.map((section) => section.id);
}

export function getBuiltInSectionsMissingFromConfig(sections = []) {
  const existingTypes = new Set(sections.map((section) => section.type));

  return Object.values(SECTION_LIBRARY).filter(
    (definition) => definition.builtIn && !existingTypes.has(definition.type),
  );
}

export function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function isHttpUrl(value = "") {
  return HTTP_URL_PATTERN.test(String(value).trim());
}

export function normalizeExternalUrl(value = "") {
  const normalized = String(value || "").trim();
  return isHttpUrl(normalized) ? normalized : "";
}

export function createEmptyEducation() {
  return {
    universityName: "",
    degree: "",
    gpa: "",
    startYear: "",
    endYear: "",
  };
}

export function createEmptyExperience() {
  return {
    jobTitle: "",
    companyName: "",
    startDate: "",
    endDate: "",
    isPresent: false,
    description: "",
  };
}

export function createEmptySkill() {
  return {
    name: "",
  };
}

export function createEmptyProject() {
  return {
    name: "",
    link: "",
    description: "",
    technologies: "",
  };
}

export function createEmptyCertification() {
  return {
    name: "",
    provider: "",
    year: "",
  };
}

export function createEmptyLanguage() {
  return {
    language: "",
    level: "",
  };
}

export function createEmptyCustomSection() {
  return {
    id: "",
    content: "",
  };
}

export const defaultResumeValues = {
  selected_template: DEFAULT_TEMPLATE_ID,
  personalInfo: {
    fullName: "",
    email: "",
    phone: "",
    location: "",
    links: [{ label: "LinkedIn", url: "" }],
  },
  summary: "",
  education: [createEmptyEducation()],
  experience: [createEmptyExperience()],
  skills: [createEmptySkill(), createEmptySkill(), createEmptySkill()],
  projects: [createEmptyProject()],
  certifications: [createEmptyCertification()],
  languages: [createEmptyLanguage()],
  customSections: [],
};

function hasAnyValue(values = []) {
  return values.some((value) => hasText(value));
}

function hasEducationContent(item = {}) {
  return hasAnyValue([item.universityName, item.degree, item.gpa, item.startYear, item.endYear]);
}

function hasExperienceContent(item = {}) {
  return hasAnyValue([item.jobTitle, item.companyName, item.startDate, item.endDate, item.description]) || Boolean(item.isPresent);
}

function isEducationSectionEmpty(items = []) {
  return !Array.isArray(items) || items.length === 0 || items.every((item) => !hasEducationContent(item));
}

function isExperienceSectionEmpty(items = []) {
  return !Array.isArray(items) || items.length === 0 || items.every((item) => !hasExperienceContent(item));
}

function isSkillsSectionEmpty(items = []) {
  return getFilledSkillCount(items) === 0;
}

function hasLanguageContent(item = {}) {
  return hasAnyValue([item.language, item.level]);
}

function isLanguagesSectionEmpty(items = []) {
  return !Array.isArray(items) || items.length === 0 || items.every((item) => !hasLanguageContent(item));
}

function normalizeProfileSkills(skills = []) {
  const mappedSkills = uniqueStrings(
    Array.isArray(skills)
      ? skills.map((skill) => {
          if (typeof skill === "string") {
            return skill;
          }

          return skill?.skill_name || skill?.name || skill?.skill || "";
        })
      : [],
  ).map((name) => ({ name }));

  while (mappedSkills.length < 3) {
    mappedSkills.push(createEmptySkill());
  }

  return mappedSkills;
}

function normalizeProfileEducation(profile = {}) {
  if (Array.isArray(profile.education) && profile.education.length) {
    return profile.education
      .map((item) => ({
        universityName: item?.universityName || item?.university || item?.school || "",
        degree: item?.degree || item?.title || "",
        gpa: item?.gpa || "",
        startYear: item?.startYear || item?.start || "",
        endYear: item?.endYear || item?.end || "",
      }))
      .filter((item) => hasEducationContent(item));
  }

  const degreeParts = [
    profile?.educationLevel || profile?.education_level || "",
    profile?.fieldOfStudy || profile?.field_of_study || "",
  ].filter(Boolean);

  if (!degreeParts.length) {
    return [];
  }

  return [
    {
      ...createEmptyEducation(),
      degree: degreeParts.join(" in "),
    },
  ];
}

function normalizeProfileExperience(profile = {}) {
  if (!Array.isArray(profile.experience)) {
    return [];
  }

  return profile.experience
    .map((item) => ({
      jobTitle: item?.jobTitle || item?.title || "",
      companyName: item?.companyName || item?.company || "",
      startDate: item?.startDate || item?.start || "",
      endDate: item?.endDate || item?.end || "",
      isPresent: Boolean(item?.isPresent ?? item?.present),
      description: item?.description || "",
    }))
    .filter((item) => hasExperienceContent(item));
}

export function mapProfileToResume(profile = {}, resume = defaultResumeValues) {
  const currentResume = {
    ...defaultResumeValues,
    ...resume,
    personalInfo: {
      ...defaultResumeValues.personalInfo,
      ...(resume?.personalInfo || {}),
    },
    education: Array.isArray(resume?.education) ? resume.education : defaultResumeValues.education,
    experience: Array.isArray(resume?.experience) ? resume.experience : defaultResumeValues.experience,
    skills: Array.isArray(resume?.skills) ? resume.skills : defaultResumeValues.skills,
    languages: Array.isArray(resume?.languages) ? resume.languages : defaultResumeValues.languages,
  };
  const nextResume = {
    ...currentResume,
    personalInfo: {
      ...currentResume.personalInfo,
    },
  };
  const changedSections = [];

  const personalInfoMappings = [
    ["fullName", profile?.fullName || profile?.full_name || ""],
    ["email", profile?.email || ""],
    ["phone", profile?.phone || profile?.phoneNumber || ""],
    ["location", profile?.location || profile?.city || ""],
  ];

  personalInfoMappings.forEach(([fieldName, profileValue]) => {
    if (!hasText(nextResume.personalInfo[fieldName]) && hasText(profileValue)) {
      nextResume.personalInfo[fieldName] = profileValue.trim();
    }
  });

  const profileLinkedin = profile?.linkedin || profile?.linkedinUrl || profile?.linkedin_url || "";
  if (hasText(profileLinkedin)) {
    const existingLinks = nextResume.personalInfo.links || [];
    const hasLinkedin = existingLinks.some(link => hasText(link.url) && link.label.toLowerCase() === "linkedin");
    
    if (!hasLinkedin) {
      if (existingLinks.length === 1 && !hasText(existingLinks[0].label) && !hasText(existingLinks[0].url)) {
        nextResume.personalInfo.links = [{ label: "LinkedIn", url: profileLinkedin.trim() }];
      } else {
        nextResume.personalInfo.links = [...existingLinks, { label: "LinkedIn", url: profileLinkedin.trim() }];
      }
    }
  }

  if (JSON.stringify(nextResume.personalInfo) !== JSON.stringify(currentResume.personalInfo)) {
    changedSections.push("personalInfo");
  }

  const mappedEducation = normalizeProfileEducation(profile);
  if (isEducationSectionEmpty(currentResume.education) && mappedEducation.length) {
    nextResume.education = mappedEducation;
    changedSections.push("education");
  }

  const mappedExperience = normalizeProfileExperience(profile);
  if (isExperienceSectionEmpty(currentResume.experience) && mappedExperience.length) {
    nextResume.experience = mappedExperience;
    changedSections.push("experience");
  }

  const mappedSkills = normalizeProfileSkills(profile?.skills);
  if (isSkillsSectionEmpty(currentResume.skills) && getFilledSkillCount(mappedSkills) > 0) {
    nextResume.skills = mappedSkills;
    changedSections.push("skills");
  }

  if (isLanguagesSectionEmpty(currentResume.languages) && Array.isArray(profile?.languages) && profile.languages.length) {
    const mappedLanguages = profile.languages
      .map((item) => {
        if (typeof item === "string") {
          return {
            ...createEmptyLanguage(),
            language: item.trim(),
          };
        }

        return {
          ...createEmptyLanguage(),
          language: item?.language || item?.name || "",
          level: item?.level || item?.proficiency || "",
        };
      })
      .filter((item) => hasLanguageContent(item));

    if (mappedLanguages.length) {
      nextResume.languages = mappedLanguages;
      changedSections.push("languages");
    }
  }

  return {
    resume: nextResume,
    changed: changedSections.length > 0,
    changedSections,
  };
}

export function splitLines(value = "") {
  return String(value)
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\s\u2022*-]+/, "").trim())
    .filter(Boolean);
}

export function splitCsv(value = "") {
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getFilledSkillCount(skills = []) {
  return skills.filter((item) => hasText(item?.name)).length;
}

export function normalizeTemplateId(templateId = DEFAULT_TEMPLATE_ID) {
  return TEMPLATE_ID_ALIASES[templateId] || templateId || DEFAULT_TEMPLATE_ID;
}

export function getResumeTemplate(templateId = DEFAULT_TEMPLATE_ID) {
  const resolvedTemplateId = normalizeTemplateId(templateId);
  return RESUME_TEMPLATES.find((template) => template.id === resolvedTemplateId) || RESUME_TEMPLATES[0];
}

export function getTemplateExportElementId(templateId = DEFAULT_TEMPLATE_ID) {
  return `template-${normalizeTemplateId(templateId)}`;
}

export function getTemplatePreviewElementId(templateId = DEFAULT_TEMPLATE_ID) {
  return `template-preview-${normalizeTemplateId(templateId)}`;
}

export function uniqueStrings(values = []) {
  return Array.from(
    new Set(
      values
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean),
    ),
  );
}

export function findCustomSectionData(customSections = [], sectionId = "") {
  return customSections.find((section) => section?.id === sectionId) || null;
}

export function getResumeCompletionIssues(values = defaultResumeValues, sections = DEFAULT_SECTIONS, options = {}) {
  const issues = [];
  const personalInfo = values.personalInfo || {};
  const visibleSections = getVisibleSections(sections);
  const visibleTypes = new Set(visibleSections.map((section) => section.type));
  const requirePersonalInfo = options.requirePersonalInfo !== false;

  if (requirePersonalInfo) {
    if (!hasText(personalInfo.fullName)) {
      issues.push("Full Name is required.");
    }
    if (!EMAIL_PATTERN.test(personalInfo.email?.trim() || "")) {
      issues.push("A valid Email is required.");
    }
    if (!PHONE_PATTERN.test(personalInfo.phone?.trim() || "")) {
      issues.push("A valid Phone Number is required.");
    }
    if (!hasText(personalInfo.location)) {
      issues.push("City / Country is required.");
    }
    if (Array.isArray(personalInfo.links)) {
      personalInfo.links.forEach((link, index) => {
        if (hasText(link.url) && !isHttpUrl(link.url)) {
          issues.push(`Link ${index + 1} (${link.label || "Link"}) must be a valid URL.`);
        }
      });
    }
  }

  if (visibleTypes.has("summary") && (!hasText(values.summary) || values.summary.trim().length < 50)) {
    issues.push("Summary must be at least 50 characters.");
  }

  if (visibleTypes.has("education")) {
    (values.education || []).forEach((item, index) => {
      if (!hasText(item.universityName)) {
        issues.push(`Education ${index + 1}: University Name is required.`);
      }
      if (!hasText(item.degree)) {
        issues.push(`Education ${index + 1}: Degree is required.`);
      }
      if (!hasText(item.startYear)) {
        issues.push(`Education ${index + 1}: Start Year is required.`);
      }
      if (!hasText(item.endYear)) {
        issues.push(`Education ${index + 1}: End Year is required.`);
      }
      if (hasText(item.startYear) && hasText(item.endYear) && Number(item.endYear) < Number(item.startYear)) {
        issues.push(`Education ${index + 1}: End Year must be after Start Year.`);
      }
    });
  }

  if (visibleTypes.has("experience")) {
    (values.experience || []).forEach((item, index) => {
      if (!hasText(item.jobTitle)) {
        issues.push(`Experience ${index + 1}: Job Title is required.`);
      }
      if (!hasText(item.companyName)) {
        issues.push(`Experience ${index + 1}: Company Name is required.`);
      }
      if (!hasText(item.startDate)) {
        issues.push(`Experience ${index + 1}: Start Date is required.`);
      }
      if (!item.isPresent && !hasText(item.endDate)) {
        issues.push(`Experience ${index + 1}: End Date or Present is required.`);
      }
      if (hasText(item.startDate) && hasText(item.endDate) && item.endDate < item.startDate) {
        issues.push(`Experience ${index + 1}: End Date must be after Start Date.`);
      }
      if (!hasText(item.description)) {
        issues.push(`Experience ${index + 1}: Description is required.`);
      }
    });
  }

  if (visibleTypes.has("skills") && getFilledSkillCount(values.skills) < 3) {
    issues.push("At least 3 skills are required.");
  }

  if (visibleTypes.has("projects")) {
    (values.projects || []).forEach((item, index) => {
      if (!hasText(item.name)) {
        issues.push(`Project ${index + 1}: Project Name is required.`);
      }
      if (!hasText(item.description)) {
        issues.push(`Project ${index + 1}: Description is required.`);
      }
      if (hasText(item.link) && !isHttpUrl(item.link)) {
        issues.push(`Project ${index + 1}: Link must be a valid URL.`);
      }
    });
  }

  if (visibleTypes.has("certifications")) {
    (values.certifications || []).forEach((item, index) => {
      if (!hasText(item.name)) {
        issues.push(`Certification ${index + 1}: Name is required.`);
      }
      if (!hasText(item.provider)) {
        issues.push(`Certification ${index + 1}: Provider is required.`);
      }
      if (!hasText(item.year)) {
        issues.push(`Certification ${index + 1}: Year is required.`);
      }
    });
  }

  if (visibleTypes.has("languages")) {
    (values.languages || []).forEach((item, index) => {
      if (!hasText(item.language)) {
        issues.push(`Language ${index + 1}: Language name is required.`);
      }
      if (!hasText(item.level)) {
        issues.push(`Language ${index + 1}: Proficiency level is required.`);
      }
    });
  }

  visibleSections
    .filter((section) => section.type === "custom")
    .forEach((section) => {
      const customSection = findCustomSectionData(values.customSections || [], section.id);

      if (!hasText(section.title)) {
        issues.push("Custom sections need a title.");
      }
      if (!hasText(customSection?.content)) {
        issues.push(`${section.title || "Custom section"}: Content is required.`);
      }
    });

  return issues;
}

function normalizeGeneratedText(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean)
      .map((line) => line.replace(/^[\s\u2022*-]+/, "").trim())
      .filter(Boolean)
      .join("\n");
  }

  return splitLines(value).join("\n");
}

function normalizeGeneratedArray(value = []) {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return splitCsv(value);
  }

  return [];
}

function pickGeneratedArray(source = {}, keys = []) {
  for (const key of keys) {
    const value = source?.[key];
    if (Array.isArray(value)) {
      return value;
    }
  }

  return [];
}

function normalizeGeneratedDate(value, { isEndDate = false } = {}) {
  const normalized = typeof value === "string" ? value.trim() : "";

  if (!normalized) {
    return "";
  }

  if (/^\d{4}-\d{2}$/.test(normalized)) {
    return normalized;
  }

  if (/^\d{4}$/.test(normalized)) {
    return `${normalized}-${isEndDate ? "12" : "01"}`;
  }

  return "";
}

export function mapAiResumeToForm(generatedResume = {}) {
  const educationSource = pickGeneratedArray(generatedResume, ["education", "education_history", "academicHistory"]);
  const experienceSource = pickGeneratedArray(generatedResume, ["experience", "work_experience", "workExperience"]);
  const projectsSource = pickGeneratedArray(generatedResume, ["projects", "projectExperience", "project_experience"]);
  const languagesSource = pickGeneratedArray(generatedResume, ["languages", "languageProficiency", "language_proficiency"]);
  const mappedSkills = normalizeGeneratedArray(generatedResume.skills || generatedResume.skill_entries).map((name) => ({ name }));

  while (mappedSkills.length < 3) {
    mappedSkills.push(createEmptySkill());
  }

  const mappedEducation =
    educationSource.length
      ? educationSource.map((item) => ({
          ...createEmptyEducation(),
          universityName:
            typeof item?.universityName === "string"
              ? item.universityName.trim()
              : typeof item?.university === "string"
                ? item.university.trim()
                : typeof item?.school === "string"
                  ? item.school.trim()
                  : "",
          degree:
            typeof item?.degree === "string"
              ? item.degree.trim()
              : typeof item?.title === "string"
                ? item.title.trim()
                : "",
          gpa: typeof item?.gpa === "string" ? item.gpa.trim() : "",
          startYear:
            typeof item?.startYear === "string"
              ? item.startYear.trim()
              : typeof item?.start === "string"
                ? item.start.trim()
                : "",
          endYear:
            typeof item?.endYear === "string"
              ? item.endYear.trim()
              : typeof item?.end === "string"
                ? item.end.trim()
                : "",
        }))
      : [createEmptyEducation()];

  const mappedExperience =
    experienceSource.length
      ? experienceSource.map((item) => ({
          ...createEmptyExperience(),
          jobTitle:
            typeof item?.jobTitle === "string"
              ? item.jobTitle.trim()
              : typeof item?.title === "string"
                ? item.title.trim()
                : "",
          companyName:
            typeof item?.company === "string"
              ? item.company.trim()
              : typeof item?.companyName === "string"
                ? item.companyName.trim()
                : "",
          startDate: normalizeGeneratedDate(item?.startDate || item?.start),
          endDate: normalizeGeneratedDate(item?.endDate || item?.end, { isEndDate: true }),
          isPresent: /^(present|current)$/i.test(
            typeof (item?.endDate || item?.end) === "string" ? String(item.endDate || item.end).trim() : "",
          ),
          description: normalizeGeneratedText(item?.description || ""),
        }))
      : [createEmptyExperience()];

  const mappedProjects =
    projectsSource.length
      ? projectsSource.map((item) => ({
          ...createEmptyProject(),
          name: typeof item?.name === "string" ? item.name.trim() : "",
          link: typeof item?.link === "string" ? item.link.trim() : "",
          description: normalizeGeneratedText(item?.description || ""),
          technologies: normalizeGeneratedArray(item?.technologies).join(", "),
        }))
      : [createEmptyProject()];

  const mappedLanguages =
    languagesSource.length
      ? languagesSource.map((item) => ({
          ...createEmptyLanguage(),
          language:
            typeof item === "string"
              ? item.trim()
              : typeof item?.language === "string"
                ? item.language.trim()
                : typeof item?.name === "string"
                  ? item.name.trim()
                  : "",
          level:
            typeof item?.level === "string"
              ? item.level.trim()
              : typeof item?.proficiency === "string"
                ? item.proficiency.trim()
                : "",
        }))
      : [createEmptyLanguage()];

  return {
    summary: typeof generatedResume.summary === "string" ? generatedResume.summary.trim() : "",
    education: mappedEducation,
    skills: mappedSkills,
    experience: mappedExperience,
    projects: mappedProjects,
    languages: mappedLanguages,
  };
}
