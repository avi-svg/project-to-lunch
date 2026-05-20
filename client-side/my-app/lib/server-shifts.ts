import {
  CreateShiftPayload,
  MyRegisteredShiftsResponse,
  Shift,
  ShiftRegistration,
  UpdateRegistrationPayload,
  UpdateShiftPayload,
  WeekShiftsResponse,
} from "@/lib/shifts";

const API_BASE_URL =
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:3000";

export class BackendShiftsError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "BackendShiftsError";
    this.status = status;
  }
}

async function backendShiftsFetch<T>(
  userId: string,
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "x-acting-user-id": userId,
        ...options.headers,
      },
      cache: "no-store",
    });
  } catch {
    throw new BackendShiftsError(
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

    throw new BackendShiftsError(message, response.status);
  }

  return data as T;
}

export async function fetchWeekShiftsForUser(userId: string, start: string) {
  return backendShiftsFetch<WeekShiftsResponse>(
    userId,
    `/shifts/week?start=${encodeURIComponent(start)}`,
  );
}

export async function fetchMyRegisteredShiftsForUser(userId: string) {
  return backendShiftsFetch<MyRegisteredShiftsResponse>(userId, "/shifts/mine");
}

export async function fetchShiftByIdForUser(userId: string, shiftId: string) {
  return backendShiftsFetch<{ shift: Shift }>(userId, `/shifts/${shiftId}`);
}

export async function createShiftForUser(
  userId: string,
  payload: CreateShiftPayload,
) {
  return backendShiftsFetch<{ message: string; shift: Shift }>(userId, "/shifts", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateShiftForUser(
  userId: string,
  shiftId: string,
  payload: UpdateShiftPayload,
) {
  return backendShiftsFetch<{ message: string; shift: Shift }>(
    userId,
    `/shifts/${shiftId}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function replaceShiftAssignmentsForUser(
  userId: string,
  shiftId: string,
  userIds: string[],
) {
  return backendShiftsFetch<{ message: string; shift: Shift }>(
    userId,
    `/shifts/${shiftId}/assignments`,
    {
      method: "PUT",
      body: JSON.stringify({ userIds }),
    },
  );
}

export async function registerForShiftForUser(userId: string, shiftId: string) {
  return backendShiftsFetch<{ message: string; registration: ShiftRegistration }>(
    userId,
    `/shifts/${shiftId}/register`,
    {
      method: "POST",
    },
  );
}

export async function confirmShiftRegistrationForUser(
  userId: string,
  shiftId: string,
  registrationId: string,
) {
  return backendShiftsFetch<{ message: string; registration: ShiftRegistration }>(
    userId,
    `/shifts/${shiftId}/registrations/${registrationId}/confirm`,
    {
      method: "PATCH",
    },
  );
}

async function updateRegistrationForUser(
  userId: string,
  shiftId: string,
  registrationId: string,
  action: "approve" | "reject" | "cancel",
  payload: UpdateRegistrationPayload,
) {
  return backendShiftsFetch<{ message: string; registration: ShiftRegistration }>(
    userId,
    `/shifts/${shiftId}/registrations/${registrationId}/${action}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function approveShiftRegistrationForUser(
  userId: string,
  shiftId: string,
  registrationId: string,
  payload: UpdateRegistrationPayload,
) {
  return updateRegistrationForUser(
    userId,
    shiftId,
    registrationId,
    "approve",
    payload,
  );
}

export async function rejectShiftRegistrationForUser(
  userId: string,
  shiftId: string,
  registrationId: string,
  payload: UpdateRegistrationPayload,
) {
  return updateRegistrationForUser(
    userId,
    shiftId,
    registrationId,
    "reject",
    payload,
  );
}

export async function cancelShiftRegistrationForUser(
  userId: string,
  shiftId: string,
  registrationId: string,
  payload: UpdateRegistrationPayload,
) {
  return updateRegistrationForUser(
    userId,
    shiftId,
    registrationId,
    "cancel",
    payload,
  );
}
