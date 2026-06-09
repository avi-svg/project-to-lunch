export const PERM_VIEW_HOUSING_HISTORY = "view_housing_attendance_history";
export const PERM_MANAGE_HOUSING_HISTORY =
  "manage_housing_attendance_history_permissions";

export type StaffPermission =
  | typeof PERM_VIEW_HOUSING_HISTORY
  | typeof PERM_MANAGE_HOUSING_HISTORY;

export type PermissionEntry = {
  userId: string;
  permission: StaffPermission;
  grantedAt: string;
  grantedById: string | null;
  userName: string;
  userEmail: string;
  grantedByName: string | null;
};

export type PermissionsStatusResponse = {
  isBootstrapped: boolean;
  permission: StaffPermission;
  permissions: PermissionEntry[];
};

export type CheckPermissionResponse = {
  hasPermission: boolean;
  isBootstrapped: boolean;
};

export class BackendPermissionsError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "BackendPermissionsError";
    this.status = status;
  }
}

const API_BASE_URL =
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:3000";

async function backendPermFetchForActor(
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
    throw new BackendPermissionsError(
      `Unable to reach the backend at ${API_BASE_URL}.`,
      503,
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const data = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const message =
      typeof data === "object" &&
      data !== null &&
      "message" in data &&
      typeof (data as Record<string, unknown>).message === "string"
        ? (data as { message: string }).message
        : `Backend request failed with status ${response.status}.`;
    throw new BackendPermissionsError(message, response.status);
  }

  return data;
}

function normalizePermissionEntry(value: unknown): PermissionEntry | null {
  if (typeof value !== "object" || value === null) return null;
  const c = value as Record<string, unknown>;
  if (typeof c.userId !== "string" || typeof c.permission !== "string")
    return null;
  return {
    userId: c.userId,
    permission: c.permission as StaffPermission,
    grantedAt: typeof c.grantedAt === "string" ? c.grantedAt : "",
    grantedById: typeof c.grantedById === "string" ? c.grantedById : null,
    userName: typeof c.userName === "string" ? c.userName : c.userId,
    userEmail: typeof c.userEmail === "string" ? c.userEmail : "",
    grantedByName:
      typeof c.grantedByName === "string" ? c.grantedByName : null,
  };
}

export async function fetchPermissionsStatus(
  actorUserId: string,
  permission: StaffPermission = PERM_VIEW_HOUSING_HISTORY,
): Promise<PermissionsStatusResponse> {
  const data = await backendPermFetchForActor(
    actorUserId,
    `/permissions?permission=${encodeURIComponent(permission)}`,
  );

  const d = data as Record<string, unknown>;
  const entries = Array.isArray(d.permissions)
    ? (d.permissions as unknown[])
        .map(normalizePermissionEntry)
        .filter((e): e is PermissionEntry => e !== null)
    : [];

  return {
    isBootstrapped: d.isBootstrapped === true,
    permission: (d.permission as StaffPermission) ?? permission,
    permissions: entries,
  };
}

export async function checkMyPermission(
  actorUserId: string,
  permission: StaffPermission,
): Promise<CheckPermissionResponse> {
  const data = await backendPermFetchForActor(
    actorUserId,
    `/permissions/check?permission=${encodeURIComponent(permission)}`,
  );

  const d = data as Record<string, unknown>;
  return {
    hasPermission: d.hasPermission === true,
    isBootstrapped: d.isBootstrapped === true,
  };
}

export async function bootstrapPermissions(
  actorUserId: string,
  managerUserIds: string[],
): Promise<void> {
  await backendPermFetchForActor(actorUserId, "/permissions/bootstrap", {
    method: "POST",
    body: JSON.stringify({ managerUserIds }),
  });
}

export async function grantPermission(
  actorUserId: string,
  targetUserId: string,
  permission: StaffPermission,
): Promise<void> {
  await backendPermFetchForActor(actorUserId, "/permissions", {
    method: "POST",
    body: JSON.stringify({ targetUserId, permission }),
  });
}

export async function revokePermission(
  actorUserId: string,
  targetUserId: string,
  permission: StaffPermission,
): Promise<void> {
  await backendPermFetchForActor(
    actorUserId,
    `/permissions/${targetUserId}?permission=${encodeURIComponent(permission)}`,
    { method: "DELETE" },
  );
}
