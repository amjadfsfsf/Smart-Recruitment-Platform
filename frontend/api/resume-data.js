function getResumeApiBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_RESUME_API_URL ||
    process.env.NEXT_PUBLIC_RESUME_AI_API_URL ||
    "http://localhost:8000"
  );
}

function getResumeBuilderBaseUrl() {
  return `${getResumeApiBaseUrl()}/api/resume-builder`;
}

function buildHeaders(userId, includeJson = false) {
  const headers = {
    Accept: "application/json",
    "x-user-id": String(userId),
  };

  if (includeJson) {
    headers["Content-Type"] = "application/json";
  }

  return headers;
}

function parseErrorMessage(payload, fallbackMessage) {
  if (payload?.error) {
    return payload.error;
  }

  if (payload?.message) {
    return payload.message;
  }

  return fallbackMessage;
}

async function parseResponse(response, fallbackMessage) {
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(parseErrorMessage(payload, fallbackMessage));
  }

  return payload?.data ?? payload;
}

/**
 * Wraps a fetch call so that network-level failures (TypeError: Failed to
 * fetch) are caught and re-thrown with a clear, actionable message instead of
 * the generic browser error.
 */
async function safeFetch(url, options) {
  try {
    return await fetch(url, options);
  } catch (networkError) {
    const baseUrl = getResumeApiBaseUrl();
    throw new Error(
      `Cannot reach the resume API at ${baseUrl}. ` +
      `Make sure the FastAPI backend is running (cd backend && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000). ` +
      `Original error: ${networkError.message}`
    );
  }
}

export async function fetchResumeBuilderState(userId) {
  const response = await safeFetch(getResumeBuilderBaseUrl(), {
    method: "GET",
    headers: buildHeaders(userId),
    cache: "no-store",
  });

  return parseResponse(response, "Could not load the saved resume.");
}

export async function saveResumeBuilderState(userId, payload) {
  const response = await safeFetch(getResumeBuilderBaseUrl(), {
    method: "PUT",
    headers: buildHeaders(userId, true),
    body: JSON.stringify(payload),
  });

  return parseResponse(response, "Could not save the latest resume changes.");
}

export async function fetchDeletedResumeSections(userId) {
  const response = await safeFetch(`${getResumeBuilderBaseUrl()}/sections/deleted`, {
    method: "GET",
    headers: buildHeaders(userId),
    cache: "no-store",
  });

  return parseResponse(response, "Could not load deleted sections.");
}

export async function softDeleteResumeSection(userId, sectionKey) {
  const response = await safeFetch(`${getResumeBuilderBaseUrl()}/sections/${encodeURIComponent(sectionKey)}/soft-delete`, {
    method: "POST",
    headers: buildHeaders(userId, true),
    body: JSON.stringify({}),
  });

  return parseResponse(response, "Could not delete that section.");
}

export async function restoreResumeSection(userId, sectionKey) {
  const response = await safeFetch(`${getResumeBuilderBaseUrl()}/sections/${encodeURIComponent(sectionKey)}/restore`, {
    method: "POST",
    headers: buildHeaders(userId, true),
    body: JSON.stringify({}),
  });

  return parseResponse(response, "Could not restore that section.");
}
