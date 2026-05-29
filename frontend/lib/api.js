const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function formatErrorMessage(payload) {
  if (Array.isArray(payload?.detail)) {
    return payload.detail
      .map((item) => {
        const field = Array.isArray(item?.loc) ? item.loc[item.loc.length - 1] : null;
        const message = item?.msg || item?.message;

        if (field && message) {
          return `${field}: ${message}`;
        }

        return message || JSON.stringify(item);
      })
      .join(", ");
  }

  return payload?.detail || payload?.message || "Request failed";
}

async function apiRequest(path, options = {}) {
  let { token = "", method = "GET", body } = options;

  if (!token && typeof window !== "undefined") {
    token = localStorage.getItem("token") || localStorage.getItem("smart_recruitment_platform_token") || "";
  }

  const headers = {
    Accept: "application/json",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = formatErrorMessage(payload);
    throw new Error(message);
  }

  return payload;
}

async function uploadRequest(path, options = {}) {
  let { token = "", method = "POST", formData } = options;

  if (!token && typeof window !== "undefined") {
    token = localStorage.getItem("token") || localStorage.getItem("smart_recruitment_platform_token") || "";
  }

  const headers = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: formData,
    cache: "no-store",
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = formatErrorMessage(payload);
    throw new Error(message);
  }

  return payload;
}

function normalizeResumeProfile(payload = {}) {
  const rawSkills = Array.isArray(payload?.skills)
    ? payload.skills
    : Array.isArray(payload?.skill_entries)
      ? payload.skill_entries
      : [];

  return {
    fullName: payload?.fullName || payload?.full_name || "",
    email: payload?.email || "",
    phone: payload?.phone || payload?.phoneNumber || "",
    location: payload?.location || payload?.city || "",
    linkedin: payload?.linkedin || payload?.linkedinUrl || payload?.linkedin_url || "",
    education: Array.isArray(payload?.education) ? payload.education : [],
    experience: Array.isArray(payload?.experience) ? payload.experience : [],
    skills: rawSkills
      .map((skill) => {
        if (typeof skill === "string") {
          return skill.trim();
        }

        return String(skill?.skill_name || skill?.name || "").trim();
      })
      .filter(Boolean),
    educationLevel: payload?.educationLevel || payload?.education_level || "",
    fieldOfStudy: payload?.fieldOfStudy || payload?.field_of_study || "",
    experienceLevel: payload?.experienceLevel || payload?.experience_level || "",
    desiredJobTitle: payload?.desiredJobTitle || payload?.desired_job_title || "",
    targetRole: payload?.targetRole || payload?.target_role || "",
  };
}

export function signUp(payload) {
  return apiRequest("/users", { method: "POST", body: payload });
}

export function registerCompany(payload) {
  return apiRequest("/company/register", { method: "POST", body: payload });
}

export function getCompanyProfile(token) {
  return apiRequest("/company/me/profile", { token });
}

export function updateCompanyProfile(token, payload) {
  return apiRequest("/company/me/profile", { method: "PUT", token, body: payload });
}

export function getPublicCompanyProfile(companyId) {
  return apiRequest(`/company/${companyId}`);
}

export function uploadCompanyProfileAsset(token, kind, file) {
  const formData = new FormData();
  formData.append("file", file);
  return uploadRequest(`/company/me/profile/assets?kind=${encodeURIComponent(kind)}`, {
    method: "POST",
    formData,
    token,
  });
}

export function signIn(payload) {
  return apiRequest("/users/login", { method: "POST", body: payload });
}

export function parseCv(file) {
  const formData = new FormData();
  formData.append("file", file);
  return uploadRequest("/auth/parse-cv", { method: "POST", formData });
}

export function getCurrentUser(token) {
  return apiRequest("/users/me", {
    method: "GET",
    token,
  });
}

export async function getProfileMe(token) {
  try {
    const payload = await apiRequest("/api/profile/me", {
      method: "GET",
      token,
    });

    return normalizeResumeProfile(payload);
  } catch (error) {
    const payload = await getCurrentUser(token);
    return normalizeResumeProfile(payload);
  }
}

export function getToken() {
  return localStorage.getItem("token");
}

export function updateProfile(token, payload) {
  return apiRequest("/users/me/profile", {
    method: "PUT",
    token,
    body: payload,
  });
}

export function addUserSkill(token, payload) {
  return apiRequest("/users/me/skills", {
    method: "POST",
    token,
    body: payload,
  });
}

export function deleteUserSkill(token, skillId) {
  return apiRequest(`/users/me/skills/${skillId}`, {
    method: "DELETE",
    token,
  });
}

export function getJobMatching(token, payload = {}, page = 1) {
  const pageNumber = Number.isFinite(Number(page)) && Number(page) > 0 ? Number(page) : 1;
  const pageQuery = `?page=${pageNumber}`;

  return apiRequest(`/job-matching${pageQuery}`, {
    method: "POST",
    token,
    body: payload,
  });
}

export async function requestSkillGapAnalysis(payload, token = "") {
  return apiRequest("/skill-gap/analyze", {
    method: "POST",
    token,
    body: payload,
  });
}

export async function recomputeSkillGapAnalysis(payload, token = "") {
  return apiRequest("/skill-gap/recompute", {
    method: "POST",
    token,
    body: payload,
  });
}

export async function getLatestSkillGapAnalysis(payload, token = "") {
  return apiRequest("/skill-gap/latest", {
    method: "POST",
    token,
    body: payload,
  });
}

export function getSkillGap(token, payload) {
  return requestSkillGapAnalysis(payload, token);
}

export function getCareerPath(token, payload) {
  return apiRequest("/analysis/career-path", { method: "POST", body: payload });
}

export function getCourseRecommendations(token, skillsCsv = "") {
  const query = encodeURIComponent(skillsCsv);
  return apiRequest(`/courses/recommendations?skills=${query}`, { token });
}

export function searchSkills(query = "") {
  const encoded = encodeURIComponent(query || "");
  return apiRequest(`/skills/search?q=${encoded}`);
}

export function getJobFeed(query = "") {
  const encoded = encodeURIComponent(query);
  return apiRequest(`/jobs/feed?query=${encoded}`);
}

export function startInterview(token, payload = {}) {
  return apiRequest("/interview/start", { method: "POST", token, body: payload });
}

export function fetchInterviewSession(token, sessionId) {
  return apiRequest(`/interview/session/${sessionId}`, { token });
}

export function submitInterviewAnswer(token, formData) {
  return uploadRequest("/interview/answer", { method: "POST", token, formData });
}

export function completeInterview(token, payload) {
  return apiRequest("/interview/complete", { method: "POST", token, body: payload });
}

export function askInterviewQuestion(token, payload = {}) {
  return apiRequest("/question", { method: "POST", token, body: payload });
}

export function analyzeJobSkills(token, payload) {
  return apiRequest("/job-analysis/analyze", {
    method: "POST",
    token,
    body: payload,
  });
}

export function improveResume() {
  return Promise.resolve({ improved_resume: "Resume improvement feature not connected yet." });
}

export function createCompanyJob(token, payload) {
  return apiRequest("/jobs/create", { method: "POST", token, body: payload });
}

export function getCompanyJobs(token, companyId) {
  return apiRequest(`/jobs/company/${companyId}`, { token });
}

export function deleteCompanyJob(token, jobId) {
  return apiRequest(`/jobs/${jobId}`, { method: "DELETE", token });
}

export function matchCandidates(token, jobId, { minScore = 0, topK = 50 } = {}) {
  const params = new URLSearchParams({ min_score: minScore, top_k: topK });
  return apiRequest(`/jobs/${jobId}/match-candidates?${params}`, { token });
}

export function createCompanyInterview(token, payload) {
  return apiRequest("/company-interviews", { method: "POST", token, body: payload });
}

export function getCompanyInterview(token, sessionId) {
  return apiRequest(`/company-interviews/${sessionId}`, { token });
}

export function saveCompanyInterviewTemplate(token, sessionId, payload) {
  return apiRequest(`/company-interviews/${sessionId}/template`, {
    method: "PUT",
    token,
    body: payload,
  });
}

export function getCandidateCompanyInterviews(token) {
  return apiRequest("/company-interviews/candidate", { token });
}

export function acceptCompanyInterview(token, sessionId) {
  return apiRequest(`/company-interviews/${sessionId}/accept`, { method: "POST", token });
}

export function startCompanyInterview(token, sessionId) {
  return apiRequest(`/company-interviews/${sessionId}/start`, { method: "POST", token });
}

export function getCompanyInterviewResults(token, sessionId) {
  return apiRequest(`/company-interviews/${sessionId}/results`, { token });
}

export function requestCandidateCv(token, payload) {
  return apiRequest("/cv-requests", { method: "POST", token, body: payload });
}

export function getCandidateCvRequests(token) {
  return apiRequest("/cv-requests/candidate", { token });
}

export function getCompanyCvRequests(token) {
  return apiRequest("/cv-requests/company", { token });
}

export async function uploadCv(token, email, blob, filename = "cv.pdf") {
  const formData = new FormData();
  formData.append("file", blob, filename);
  formData.append("email", String(email || ""));
  return uploadRequest("/upload-cv", { method: "POST", formData, token });
}

async function fetchAndDownload(url, token, filename) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    let message = "Failed to download CV";
    try {
      const data = await response.json();
      message = formatErrorMessage(data) || message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

export async function downloadCandidateCv(token, filename) {
  await fetchAndDownload(
    `${API_URL}/download-cv/${encodeURIComponent(filename)}`,
    token,
    filename,
  );
}
