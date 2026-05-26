export type UserRole = "admin" | "staff" | "user";
export type ShiftStatus = "open" | "closed" | "cancelled" | "completed";
export type ShiftType = "dinner" | "cleaning";
export type ShiftAssignmentMode = "assign-later" | "assign-now";
export type ShiftAssignmentRequestType = "standard" | "forced";
export type ShiftRegistrationStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled";
export type ShiftSwapRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled"
  | "closed";
export type ShiftSwapVolunteerOfferStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled";

export type ShiftAssignmentPoolUser = {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  phone?: string | null;
  birthDate?: string | null;
  isActive?: boolean;
};

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

export type ShiftAssignmentNotificationSummary = {
  attempted: number;
  sent: number;
  skippedNoPhone: number;
  skippedInvalidPhone: number;
  failed: number;
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

export type ShiftSwapRequest = {
  id: string;
  shiftId: string;
  requesterUserId: string;
  requesterRegistrationId: string;
  status: ShiftSwapRequestStatus;
  reason: string | null;
  canViewReason: boolean;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
  reviewNote: string | null;
  requesterRegistrationStatus: ShiftRegistrationStatus;
  volunteerOffersCount: number;
  volunteerOffers: ShiftSwapVolunteerOffer[];
  myVolunteerOffer: ShiftSwapVolunteerOffer | null;
  requester: ShiftActor;
  reviewedBy: Omit<ShiftActor, "role"> | null;
  shift: {
    id: string;
    title: string;
    description: string | null;
    location: string | null;
    startTime: string;
    endTime: string;
    status: ShiftStatus;
  };
};

export type ShiftSwapVolunteerOffer = {
  id: string;
  swapRequestId: string;
  volunteerUserId: string;
  status: ShiftSwapVolunteerOfferStatus;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
  reviewNote: string | null;
  volunteer: ShiftActor;
  reviewedBy: Omit<ShiftActor, "role"> | null;
};

export type WeekShiftsResponse = {
  weekStart: string;
  weekEnd: string;
  shifts: Shift[];
};

export type MyRegisteredShiftsResponse = {
  shifts: Shift[];
};

export type ShiftSwapRequestsResponse = {
  requests: ShiftSwapRequest[];
};

export type ReplaceShiftAssignmentsResponse = {
  message: string;
  shift: Shift;
  appliedAssignmentType?: ShiftAssignmentRequestType;
  notificationSummary?: ShiftAssignmentNotificationSummary;
};

export type ShiftAssignmentPoolsResponse = {
  shiftType: ShiftType | null;
  monthStart: string | null;
  monthEnd: string | null;
  defaultUsers: ShiftAssignmentPoolUser[];
  alreadyAssignedUsers: ShiftAssignmentPoolUser[];
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

export type CreateShiftSwapRequestPayload = {
  reason: string;
};

export type UpdateShiftSwapRequestPayload = {
  status: ShiftSwapRequestStatus;
  reviewNote?: string;
};

export type UpdateShiftSwapVolunteerOfferPayload = {
  status: ShiftSwapVolunteerOfferStatus;
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

export async function replaceShiftAssignments(
  shiftId: string,
  userIds: string[],
  assignmentType: ShiftAssignmentRequestType = "standard",
) {
  return internalApiFetch<ReplaceShiftAssignmentsResponse>(
    `/api/shifts/${shiftId}/assignments`,
    {
      method: "PUT",
      body: JSON.stringify({ userIds, assignmentType }),
    },
  );
}

export async function getShiftAssignmentPools(shiftId: string) {
  return internalApiFetch<ShiftAssignmentPoolsResponse>(
    `/api/shifts/${shiftId}/assignment-pools`,
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

export async function getShiftSwapRequests() {
  return internalApiFetch<ShiftSwapRequestsResponse>("/api/shifts/swap-requests");
}

export async function createShiftSwapRequest(
  shiftId: string,
  payload: CreateShiftSwapRequestPayload,
) {
  return internalApiFetch<{ message: string; request: ShiftSwapRequest }>(
    `/api/shifts/${shiftId}/swap-requests`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function updateShiftSwapRequest(
  requestId: string,
  payload: UpdateShiftSwapRequestPayload,
) {
  return internalApiFetch<{ message: string; request: ShiftSwapRequest }>(
    `/api/shifts/swap-requests/${requestId}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function createShiftSwapVolunteerOffer(requestId: string) {
  return internalApiFetch<{ message: string; request: ShiftSwapRequest }>(
    `/api/shifts/swap-requests/${requestId}/volunteers`,
    {
      method: "POST",
    },
  );
}

export async function updateShiftSwapVolunteerOffer(
  requestId: string,
  offerId: string,
  payload: UpdateShiftSwapVolunteerOfferPayload,
) {
  return internalApiFetch<{ message: string; request: ShiftSwapRequest }>(
    `/api/shifts/swap-requests/${requestId}/volunteers/${offerId}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}
