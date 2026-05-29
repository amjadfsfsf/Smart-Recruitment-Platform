const TOKEN_KEY = "smart_recruitment_platform_token";
const USER_KEY = "smart_recruitment_platform_user";

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage || null;
  } catch {
    return null;
  }
}


export function getStoredUser() {
  const storage = getStorage();
  if (!storage) {
    return null;
  }

  const raw = storage.getItem(USER_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveSession(token, user) {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  storage.setItem("token", token);
  storage.setItem("user", JSON.stringify(user));
}

export function getToken() {
  const storage = getStorage();
  if (!storage) {
    return null;
  }

  return storage.getItem("token");
}

export function getUser() {
  const storage = getStorage();
  if (!storage) {
    return null;
  }

  const raw = storage.getItem("user");
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearSession() {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  storage.removeItem("token");
  storage.removeItem("user");
}


export function isAuthenticated() {
  return Boolean(getToken());
}

export function getRole() {
  const user = getUser();
  return user?.role || "user";
}

export function getDashboardPath() {
  return getRole() === "company" ? "/company-dashboard" : "/dashboard";
}
