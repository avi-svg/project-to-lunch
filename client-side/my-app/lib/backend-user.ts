export type BackendUser = {
  id: string;
  email: string;
  name: string | null;
  role: "admin" | "staff" | "user";
};

export class BackendUserAuthError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "BackendUserAuthError";
    this.status = status;
  }
}

type SyncUserPayload = {
  email: string;
  name: string | null;
};

const API_BASE_URL =
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:3000";

export async function syncAuthenticatedUser(
  payload: SyncUserPayload,
): Promise<BackendUser> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}/users/oauth`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error(
      `Unable to reach the Express backend at ${API_BASE_URL}. Make sure the server is running and that POST /users/oauth is available.`,
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const data = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const fallbackMessage =
      typeof data === "string" && data.trim().length > 0
        ? `Backend user sync failed with status ${response.status}: ${data.trim()}`
        : `Backend user sync failed with status ${response.status}.`;

    const message =
      typeof data === "object" &&
      data !== null &&
      "message" in data &&
      typeof data.message === "string"
        ? data.message
        : fallbackMessage;

    throw new Error(message);
  }

  if (
    typeof data !== "object" ||
    data === null ||
    typeof data.id !== "string" ||
    typeof data.email !== "string" ||
    !("name" in data) ||
    !("role" in data)
  ) {
    throw new Error("Backend user sync returned an unexpected response.");
  }

  return {
    id: data.id,
    email: data.email,
    name: typeof data.name === "string" ? data.name : null,
    role:
      data.role === "admin" || data.role === "staff" || data.role === "user"
        ? data.role
        : "user",
  };
}

export async function authenticateCredentialsUser(payload: {
  identifier: string;
  password: string;
}): Promise<BackendUser> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}/users/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new BackendUserAuthError(
      `Unable to reach the Express backend at ${API_BASE_URL}. Make sure the server is running and that POST /users/login is available.`,
      503,
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const data = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const fallbackMessage =
      typeof data === "string" && data.trim().length > 0
        ? data.trim()
        : `Backend credential auth failed with status ${response.status}.`;
    const message =
      typeof data === "object" &&
      data !== null &&
      "message" in data &&
      typeof data.message === "string"
        ? data.message
        : fallbackMessage;

    throw new BackendUserAuthError(message, response.status);
  }

  if (
    typeof data !== "object" ||
    data === null ||
    typeof data.id !== "string" ||
    typeof data.email !== "string" ||
    !("name" in data) ||
    !("role" in data)
  ) {
    throw new BackendUserAuthError(
      "Backend credential auth returned an unexpected response.",
      500,
    );
  }

  return {
    id: data.id,
    email: data.email,
    name: typeof data.name === "string" ? data.name : null,
    role:
      data.role === "admin" || data.role === "staff" || data.role === "user"
        ? data.role
        : "user",
  };
}
