export type UserRole = "admin" | "staff" | "user";
export type ShiftStatus = "open" | "closed" | "cancelled" | "completed";
export type ShiftType = "dinner" | "cleaning";
export type ShiftAssignmentMode = "assign-later" | "assign-now";
export type ShiftRegistrationStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled";

export type ShiftActor = {
  id: string;
  name: string | null;
  email: string;
  role: UserRole;
};

export type ShiftRegistration = {
  id: string;
  shiftId: string;
  userId: string;
  status: ShiftRegistrationStatus;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
  reviewNote: string | null;
  user: ShiftActor;
  reviewedBy: Omit<ShiftActor, "role"> | null;
};

export type Shift = {
  id: string;
  title: string;
  shiftType?: ShiftType | null;
  assignmentMode?: ShiftAssignmentMode | null;
  description: string | null;
  location: string | null;
  startTime: string;
  endTime: string;
  durationMinutes?: number | null;
  capacity: number;
  status: ShiftStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: ShiftActor;
  reservedSlots: number;
  availableSlots: number;
  myRegistration: {
    id: string;
    status: ShiftRegistrationStatus;
    createdAt: string;
    reviewedAt: string | null;
    reviewNote: string | null;
  } | null;
  registrations?: ShiftRegistration[];
};

export type WeekShiftsResponse = {
  weekStart: string;
  weekEnd: string;
  shifts: Shift[];
};

export type MyRegisteredShiftsResponse = {
  shifts: Shift[];
};

export type CreateShiftPayload = {
  title: string;
  shiftType?: ShiftType;
  assignmentMode?: ShiftAssignmentMode;
  description?: string;
  location?: string;
  startTime: string;
  endTime: string;
  durationMinutes?: number;
  capacity: number;
};

export type UpdateShiftPayload = Partial<CreateShiftPayload> & {
  status?: ShiftStatus;
};

export type UpdateRegistrationPayload = {
  reviewNote?: string;
};

async function internalApiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const data = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const message =
      typeof data === "object" &&
      data !== null &&
      "message" in data &&
      typeof data.message === "string"
        ? data.message
        : "Request failed.";

    throw new Error(message);
  }

  return data as T;
}

export async function getWeekShifts(start: string) {
  return internalApiFetch<WeekShiftsResponse>(
    `/api/shifts/week?start=${encodeURIComponent(start)}`,
  );
}

export async function createShift(payload: CreateShiftPayload) {
  return internalApiFetch<{ message: string; shift: Shift }>("/api/shifts", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateShift(shiftId: string, payload: UpdateShiftPayload) {
  return internalApiFetch<{ message: string; shift: Shift }>(
    `/api/shifts/${shiftId}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function replaceShiftAssignments(shiftId: string, userIds: string[]) {
  return internalApiFetch<{ message: string; shift: Shift }>(
    `/api/shifts/${shiftId}/assignments`,
    {
      method: "PUT",
      body: JSON.stringify({ userIds }),
    },
  );
}

export async function registerForShift(shiftId: string) {
  return internalApiFetch<{ message: string; registration: ShiftRegistration }>(
    `/api/shifts/${shiftId}/register`,
    {
      method: "POST",
    },
  );
}

export async function confirmShiftRegistration(
  shiftId: string,
  registrationId: string,
) {
  return internalApiFetch<{ message: string; registration: ShiftRegistration }>(
    `/api/shifts/${shiftId}/registrations/${registrationId}/confirm`,
    {
      method: "PATCH",
    },
  );
}

export async function approveShiftRegistration(
  shiftId: string,
  registrationId: string,
  payload: UpdateRegistrationPayload = {},
) {
  return internalApiFetch<{ message: string; registration: ShiftRegistration }>(
    `/api/shifts/${shiftId}/registrations/${registrationId}/approve`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function rejectShiftRegistration(
  shiftId: string,
  registrationId: string,
  payload: UpdateRegistrationPayload = {},
) {
  return internalApiFetch<{ message: string; registration: ShiftRegistration }>(
    `/api/shifts/${shiftId}/registrations/${registrationId}/reject`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function cancelShiftRegistration(
  shiftId: string,
  registrationId: string,
  payload: UpdateRegistrationPayload = {},
) {
  return internalApiFetch<{ message: string; registration: ShiftRegistration }>(
    `/api/shifts/${shiftId}/registrations/${registrationId}/cancel`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}
