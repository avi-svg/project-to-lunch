import {
  CreateShiftPayload,
  CreateShiftNotePayload,
  ShiftAttendance,
  ShiftAttendanceDashboardResponse,
  ShiftAssignmentTypesByUserId,
  MyRegisteredShiftsResponse,
  ReplaceShiftAssignmentsResponse,
  Shift,
  ShiftNote,
  ShiftAssignmentRequestType,
  ShiftSwapRequest,
  ShiftSwapRequestsResponse,
  ShiftRegistration,
  UpdateShiftSwapVolunteerOfferPayload,
  UpdateShiftSwapRequestPayload,
  UpdateRegistrationPayload,
  UpdateAttendancePayload,
  UpdateShiftPayload,
  WeekShiftsResponse,
} from "@/lib/shifts";
import type { BackendDirectoryUser } from "@/lib/server-users";

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

export async function fetchShiftAttendanceDashboardForUser(userId: string) {
  return backendShiftsFetch<ShiftAttendanceDashboardResponse>(
    userId,
    "/shifts/attendance",
  );
}

export async function fetchShiftSwapRequestsForUser(userId: string) {
  return backendShiftsFetch<ShiftSwapRequestsResponse>(
    userId,
    "/shifts/swap-requests",
  );
}

export async function fetchShiftByIdForUser(userId: string, shiftId: string) {
  return backendShiftsFetch<{ shift: Shift }>(userId, `/shifts/${shiftId}`);
}

export async function fetchShiftNotesForUser(userId: string, shiftId: string) {
  return backendShiftsFetch<{ notes: ShiftNote[] }>(
    userId,
    `/shifts/${shiftId}/notes`,
  );
}

export type ShiftAssignmentPoolsResponse = {
  shiftType: Shift["shiftType"] | null;
  monthStart: string | null;
  monthEnd: string | null;
  defaultUsers: BackendDirectoryUser[];
  alreadyAssignedUsers: BackendDirectoryUser[];
};

export async function fetchShiftAssignmentPoolsForUser(
  userId: string,
  shiftId: string,
) {
  return backendShiftsFetch<ShiftAssignmentPoolsResponse>(
    userId,
    `/shifts/${shiftId}/assignment-pools`,
  );
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

export async function deleteShiftForUser(userId: string, shiftId: string) {
  return backendShiftsFetch<{ message: string; deletedShiftId: string }>(
    userId,
    `/shifts/${shiftId}`,
    {
      method: "DELETE",
    },
  );
}

export async function createShiftNoteForUser(
  userId: string,
  shiftId: string,
  payload: CreateShiftNotePayload,
) {
  return backendShiftsFetch<{ message: string; note: ShiftNote }>(
    userId,
    `/shifts/${shiftId}/notes`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function replaceShiftAssignmentsForUser(
  userId: string,
  shiftId: string,
  userIds: string[],
  assignmentTypesByUserId: ShiftAssignmentTypesByUserId = {},
  assignmentType: ShiftAssignmentRequestType = "standard",
) {
  return backendShiftsFetch<ReplaceShiftAssignmentsResponse>(
    userId,
    `/shifts/${shiftId}/assignments`,
    {
      method: "PUT",
      body: JSON.stringify({ userIds, assignmentType, assignmentTypesByUserId }),
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

export async function reportShiftAttendanceForUser(
  userId: string,
  shiftId: string,
) {
  return backendShiftsFetch<{ message: string; attendance: ShiftAttendance }>(
    userId,
    `/shifts/${shiftId}/attendance`,
    {
      method: "POST",
    },
  );
}

export async function reportShiftAttendanceManuallyForUser(
  userId: string,
  shiftId: string,
  registrationId: string,
) {
  return backendShiftsFetch<{ message: string; attendance: ShiftAttendance }>(
    userId,
    `/shifts/${shiftId}/registrations/${registrationId}/attendance/manual`,
    {
      method: "POST",
    },
  );
}

export async function reportShiftAttendanceAbsentForUser(
  userId: string,
  shiftId: string,
  registrationId: string,
) {
  return backendShiftsFetch<{ message: string; attendance: ShiftAttendance }>(
    userId,
    `/shifts/${shiftId}/registrations/${registrationId}/attendance/absent`,
    {
      method: "POST",
    },
  );
}

export async function overrideShiftAttendanceForUser(
  userId: string,
  shiftId: string,
  attendanceId: string,
  payload: { markAs: "present" | "absent" },
) {
  return backendShiftsFetch<{ message: string; attendance: ShiftAttendance }>(
    userId,
    `/shifts/${shiftId}/attendance/${attendanceId}/override`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function addUserAttendanceForUser(
  userId: string,
  shiftId: string,
  payload: { userId: string },
) {
  return backendShiftsFetch<{
    message: string;
    registration: ShiftRegistration;
    attendance: ShiftAttendance;
  }>(
    userId,
    `/shifts/${shiftId}/attendance/add-user`,
    {
      method: "POST",
      body: JSON.stringify(payload),
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

async function updateAttendanceForUser(
  userId: string,
  shiftId: string,
  attendanceId: string,
  action: "approve" | "reject",
  payload: UpdateAttendancePayload,
) {
  return backendShiftsFetch<{ message: string; attendance: ShiftAttendance }>(
    userId,
    `/shifts/${shiftId}/attendance/${attendanceId}/${action}`,
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

export async function approveShiftAttendanceForUser(
  userId: string,
  shiftId: string,
  attendanceId: string,
  payload: UpdateAttendancePayload,
) {
  return updateAttendanceForUser(
    userId,
    shiftId,
    attendanceId,
    "approve",
    payload,
  );
}

export async function rejectShiftAttendanceForUser(
  userId: string,
  shiftId: string,
  attendanceId: string,
  payload: UpdateAttendancePayload,
) {
  return updateAttendanceForUser(
    userId,
    shiftId,
    attendanceId,
    "reject",
    payload,
  );
}

export async function createShiftSwapRequestForUser(
  userId: string,
  shiftId: string,
  reason: string,
) {
  return backendShiftsFetch<{ message: string; request: ShiftSwapRequest }>(
    userId,
    `/shifts/${shiftId}/swap-requests`,
    {
      method: "POST",
      body: JSON.stringify({ reason }),
    },
  );
}

export async function updateShiftSwapRequestForUser(
  userId: string,
  requestId: string,
  payload: UpdateShiftSwapRequestPayload,
) {
  return backendShiftsFetch<{ message: string; request: ShiftSwapRequest }>(
    userId,
    `/shifts/swap-requests/${requestId}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function createShiftSwapVolunteerOfferForUser(
  userId: string,
  requestId: string,
) {
  return backendShiftsFetch<{ message: string; request: ShiftSwapRequest }>(
    userId,
    `/shifts/swap-requests/${requestId}/volunteers`,
    {
      method: "POST",
    },
  );
}

export async function updateShiftSwapVolunteerOfferForUser(
  userId: string,
  requestId: string,
  offerId: string,
  payload: UpdateShiftSwapVolunteerOfferPayload,
) {
  return backendShiftsFetch<{ message: string; request: ShiftSwapRequest }>(
    userId,
    `/shifts/swap-requests/${requestId}/volunteers/${offerId}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}
