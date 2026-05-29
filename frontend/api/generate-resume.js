function parseErrorMessage(payload) {
  if (payload?.error) {
    return payload.error;
  }

  if (payload?.message) {
    return payload.message;
  }

  return "Could not generate resume content.";
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBulletArray(value, fieldName) {
  if (Array.isArray(value)) {
    const cleaned = value
      .map((item) => normalizeText(item).replace(/^[\s\u2022*-]+/, ""))
      .filter(Boolean);

    if (cleaned.length) {
      return cleaned;
    }
  }

  if (typeof value === "string") {
    const cleaned = value
      .split(/\r?\n/)
      .map((item) => normalizeText(item).replace(/^[\s\u2022*-]+/, ""))
      .filter(Boolean);

    if (cleaned.length) {
      return cleaned;
    }
  }

  throw new Error(`AI response field "${fieldName}" is invalid.`);
}

function normalizeStringArray(value, fieldName) {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") {
          return normalizeText(item);
        }

        if (item && typeof item === "object") {
          return normalizeText(item.name || item.skill_name || item.skill || item.label);
        }

        return "";
      })
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => normalizeText(item))
      .filter(Boolean);
  }

  throw new Error(`AI response field "${fieldName}" is invalid.`);
}

function pickArray(payload, keys) {
  for (const key of keys) {
    const value = payload?.[key];
    if (Array.isArray(value)) {
      return value;
    }
  }

  return [];
}

function normalizeGeneratedResume(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("AI response is not a valid JSON object.");
  }

  const summary = normalizeText(payload.summary);
  if (summary.length < 50) {
    throw new Error("AI response returned an incomplete summary.");
  }

  const educationPayload = pickArray(payload, ["education", "education_history", "academicHistory"]);
  const experiencePayload = pickArray(payload, ["experience", "work_experience", "workExperience"]);
  const projectsPayload = pickArray(payload, ["projects", "project_experience", "projectExperience"]);
  const skills = normalizeStringArray(payload.skills || payload.skill_entries || [], "skills");
  const education = educationPayload.map((item, index) => {
    const school = normalizeText(item?.school || item?.universityName || item?.university);
    const degree = normalizeText(item?.degree || item?.title);
    const gpa = normalizeText(item?.gpa);
    const startYear = normalizeText(item?.startYear || item?.start);
    const endYear = normalizeText(item?.endYear || item?.end);

    if (!school && !degree && !gpa && !startYear && !endYear) {
      throw new Error(`AI response returned an empty education item at position ${index + 1}.`);
    }

    return { school, degree, gpa, startYear, endYear };
  });
  const experience = experiencePayload.map((item, index) => {
        const jobTitle = normalizeText(item?.jobTitle || item?.title);
        const company = normalizeText(item?.company || item?.companyName);
        const startDate = normalizeText(item?.startDate || item?.start);
        const endDate = normalizeText(item?.endDate || item?.end);
        const description = normalizeBulletArray(item?.description, `experience[${index}].description`);

        if (!jobTitle || !company || !startDate || !endDate || !description.length) {
          throw new Error(`AI response returned an incomplete experience item at position ${index + 1}.`);
        }

        return { jobTitle, company, startDate, endDate, description };
      });

  const projects = projectsPayload.map((item, index) => {
        const name = normalizeText(item?.name);
        const link = normalizeText(item?.link);
        const description = normalizeBulletArray(item?.description, `projects[${index}].description`);
        const technologies = item?.technologies
          ? normalizeStringArray(item.technologies, `projects[${index}].technologies`)
          : [];

        if (!name || !description.length) {
          throw new Error(`AI response returned an incomplete project item at position ${index + 1}.`);
        }

        return { name, link, description, technologies };
      });

  if (!skills.length || !education.length || !experience.length || !projects.length) {
    throw new Error("AI response is missing one or more required resume sections.");
  }

  return {
    summary,
    skills,
    education,
    experience,
    projects,
  };
}

export async function generateResumeWithAI(payload) {
  const apiBaseUrl = process.env.NEXT_PUBLIC_RESUME_AI_API_URL || "http://localhost:8000";
  const response = await fetch(`${apiBaseUrl}/api/resume-builder/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(parseErrorMessage(data));
  }

  const rawPayload = data?.data ?? data;
  console.log("[resume-generate] Raw API response", rawPayload);

  const parsedResume = normalizeGeneratedResume(rawPayload);
  console.info("[resume-generate] Parsed resume JSON", parsedResume);
  return parsedResume;
}
