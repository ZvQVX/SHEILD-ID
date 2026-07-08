type AuthState = {
  token: string;
  role: string;
  /** SAM / sign-in name (for UI); server audit uses JWT `user`. */
  username?: string;
};

const STORAGE_KEY = "shield.auth";

export function getAuth(): AuthState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AuthState>;
    if (typeof parsed.token !== "string" || parsed.token.length === 0) return null;
    return {
      token: parsed.token,
      role: typeof parsed.role === "string" ? parsed.role : "user",
      username: typeof parsed.username === "string" ? parsed.username : undefined,
    };
  } catch {
    return null;
  }
}

export function setAuth(state: AuthState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearAuth() {
  localStorage.removeItem(STORAGE_KEY);
}

export function isAuthenticated() {
  return Boolean(getAuth()?.token);
}

