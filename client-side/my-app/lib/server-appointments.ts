import { DashboardAppointmentsResponse } from "@/lib/appointments";

const API_BASE_URL =
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:3000";

class BackendAppointmentsError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "BackendAppointmentsError";
    this.status = status;
  }
}

async function backendAppointmentsFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      cache: "no-store",
    });
  } catch {
    throw new BackendAppointmentsError(
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

    throw new BackendAppointmentsError(message, response.status);
  }

  return data as T;
}

export async function fetchDashboardAppointmentsForUser(userId: string) {
  return backendAppointmentsFetch<DashboardAppointmentsResponse>(
    `/users/${userId}/appointments`,
  );
}

export async function cancelAppointmentForUser(
  userId: string,
  appointmentId: string,
) {
  return backendAppointmentsFetch<{ message?: string }>(
    `/appointments/${appointmentId}/cancel`,
    {
      method: "PATCH",
      body: JSON.stringify({ userId }),
    },
  );
}

export { BackendAppointmentsError };
