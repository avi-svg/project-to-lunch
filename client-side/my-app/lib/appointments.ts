import { apiFetch } from "@/lib/api";

export type CreateAppointmentPayload = {
  businessId: string;
  userId: string;
  startTime: string;
  endTime: string;
};

export type AppointmentResponse = {
  id?: string;
  message?: string;
};

export type AppointmentStatus = "confirmed" | "pending" | "cancelled";

export type DashboardAppointment = {
  id: string;
  startTime: string;
  endTime: string;
  serviceName: string;
  counterpartyName: string;
  status: AppointmentStatus;
  relationship: "bookedByUser" | "forUser";
};

export type DashboardAppointmentsResponse = {
  bookedByUser: DashboardAppointment[];
  forUser: DashboardAppointment[];
};

type CancelAppointmentResponse = {
  message?: string;
};

export type AppointmentVerificationPayload = Omit<
  CreateAppointmentPayload,
  "userId"
>;

export type AppointmentVerificationRequestResponse = {
  message: string;
  expiresAt: string;
  maskedEmail: string;
};

export type PendingAppointmentVerification = {
  email: string;
  expiresAt: string;
  attemptsLeft: number;
  resendAvailableAt: string;
};

export type AppointmentVerificationResult = {
  message: string;
};

export async function createAppointment(
  payload: CreateAppointmentPayload,
): Promise<AppointmentResponse> {
  return apiFetch<AppointmentResponse>("/appointments", {
    method: "POST",
    body: payload,
  });
}

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

export async function getDashboardAppointments() {
  return internalApiFetch<DashboardAppointmentsResponse>(
    "/api/dashboard/appointments",
  );
}

export async function cancelAppointment(appointmentId: string) {
  return internalApiFetch<CancelAppointmentResponse>(
    `/api/dashboard/appointments/${appointmentId}/cancel`,
    {
      method: "PATCH",
    },
  );
}

export async function requestAppointmentVerification(
  payload: AppointmentVerificationPayload,
) {
  return internalApiFetch<AppointmentVerificationRequestResponse>(
    "/api/appointments/request-verification",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function getPendingAppointmentVerification() {
  return internalApiFetch<PendingAppointmentVerification>(
    "/api/appointments/verification/pending",
  );
}

export async function resendAppointmentVerification() {
  return internalApiFetch<AppointmentVerificationRequestResponse>(
    "/api/appointments/verification/resend",
    {
      method: "POST",
    },
  );
}

export async function verifyAppointmentCode(code: string) {
  return internalApiFetch<AppointmentVerificationResult>(
    "/api/appointments/verify",
    {
      method: "POST",
      body: JSON.stringify({ code }),
    },
  );
}
