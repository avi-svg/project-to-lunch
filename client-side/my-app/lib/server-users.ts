import type { UserRole } from "@/lib/shifts";

export type BackendDirectoryUser = {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  phone?: string | null;
  isActive?: boolean;
  hasPassword?: boolean;
};

type BackendUsersEnvelope =
  | BackendDirectoryUser[]
  | {
      users?: BackendDirectoryUser[];
      data?: BackendDirectoryUser[];
      items?: BackendDirectoryUser[];
    };

const API_BASE_URL =
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:3000";
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

export class BackendUsersError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "BackendUsersError";
    this.status = status;
  }
}

export type CreateBackendUserPayload = {
  email: string;
  name?: string | null;
  role?: UserRole;
  phone?: string | null;
  password?: string;
  isActive?: boolean;
};

export type UpdateBackendUserPayload = {
  email?: string;
  name?: string | null;
  phone?: string | null;
  password?: string | null;
  isActive?: boolean;
};

function extractUserFromPayload(data: unknown, fallbackMessage: string) {
  if (
    typeof data !== "object" ||
    data === null ||
    !("user" in data)
  ) {
    throw new BackendUsersError(fallbackMessage, 502);
  }

  const user = normalizeDirectoryUser(data.user);

  if (!user) {
    throw new BackendUsersError(fallbackMessage, 502);
  }

  return user;
}

function normalizeUserRole(role: unknown): UserRole | null {
  return role === "admin" || role === "staff" || role === "user" ? role : null;
}

function normalizeDirectoryUser(value: unknown): BackendDirectoryUser | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const role = normalizeUserRole(candidate.role);

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.email !== "string" ||
    !role
  ) {
    return null;
  }

  return {
    id: candidate.id,
    email: candidate.email,
    name: typeof candidate.name === "string" ? candidate.name : null,
    role,
    phone: typeof candidate.phone === "string" ? candidate.phone : null,
    isActive:
      typeof candidate.isActive === "boolean" ? candidate.isActive : undefined,
    hasPassword:
      typeof candidate.hasPassword === "boolean"
        ? candidate.hasPassword
        : undefined,
  };
}

function normalizeUsersPayload(payload: BackendUsersEnvelope | unknown) {
  const payloadRecord =
    typeof payload === "object" && payload !== null
      ? (payload as Record<string, unknown>)
      : null;

  const rawUsers = Array.isArray(payload)
    ? payload
    : payloadRecord
      ? (Array.isArray(payloadRecord.users) ? payloadRecord.users : undefined) ??
        (Array.isArray(payloadRecord.data) ? payloadRecord.data : undefined) ??
        (Array.isArray(payloadRecord.items) ? payloadRecord.items : undefined) ??
        []
      : [];

  if (!Array.isArray(rawUsers)) {
    throw new BackendUsersError("Backend users response has an unexpected shape.", 502);
  }

  return rawUsers
    .map((user) => normalizeDirectoryUser(user))
    .filter((user): user is BackendDirectoryUser => Boolean(user));
}

async function backendUsersFetch(path: string) {
  let response: Response;

  if (!INTERNAL_API_KEY) {
    throw new BackendUsersError(
      "Missing INTERNAL_API_KEY for server-to-server users request.",
      500,
    );
  }

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "x-internal-api-key": INTERNAL_API_KEY,
      },
    });
  } catch {
    throw new BackendUsersError(
      `Unable to reach the backend at ${API_BASE_URL}.`,
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
        : `Backend request failed with status ${response.status}.`;
    const message =
      typeof data === "object" &&
      data !== null &&
      "message" in data &&
      typeof data.message === "string"
        ? data.message
        : fallbackMessage;

    throw new BackendUsersError(message, response.status);
  }

  return data;
}

async function backendUsersFetchForActor(
  userId: string,
  path: string,
  options: RequestInit = {},
) {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "x-acting-user-id": userId,
        ...options.headers,
      },
    });
  } catch {
    throw new BackendUsersError(
      `Unable to reach the backend at ${API_BASE_URL}.`,
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
        : `Backend request failed with status ${response.status}.`;
    const message =
      typeof data === "object" &&
      data !== null &&
      "message" in data &&
      typeof data.message === "string"
        ? data.message
        : fallbackMessage;

    throw new BackendUsersError(message, response.status);
  }

  return data;
}

export async function fetchAllBackendUsers() {
  const data = await backendUsersFetch("/users");
  return normalizeUsersPayload(data);
}

export async function createBackendUserForActor(
  actorUserId: string,
  payload: CreateBackendUserPayload,
) {
  const data = await backendUsersFetchForActor(actorUserId, "/users", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return extractUserFromPayload(
    data,
    "Backend create user response has an unexpected shape.",
  );
}

export async function updateBackendUserForActor(
  actorUserId: string,
  userId: string,
  payload: UpdateBackendUserPayload,
) {
  const data = await backendUsersFetchForActor(actorUserId, `/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

  return extractUserFromPayload(
    data,
    "Backend update user response has an unexpected shape.",
  );
}

export async function updateBackendUserRoleForActor(
  actorUserId: string,
  userId: string,
  role: UserRole,
) {
  const data = await backendUsersFetchForActor(
    actorUserId,
    `/users/${userId}/role`,
    {
      method: "PATCH",
      body: JSON.stringify({ role }),
    },
  );

  return extractUserFromPayload(
    data,
    "Backend update role response has an unexpected shape.",
  );
}
