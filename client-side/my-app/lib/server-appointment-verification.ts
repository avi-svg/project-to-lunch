const API_BASE_URL =
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:3000";

class BackendVerificationError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "BackendVerificationError";
    this.status = status;
  }
}

async function backendVerificationFetch<T>(
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
    throw new BackendVerificationError(
      `לא ניתן להתחבר לשרת בכתובת ${API_BASE_URL}.`,
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

    throw new BackendVerificationError(message, response.status);
  }

  return data as T;
}

export type RequestVerificationPayload = {
  userId: string;
  email: string;
  businessId: string;
  startTime: string;
  endTime: string;
};

export type RequestVerificationResponse = {
  message: string;
  verificationRequestId: string;
  expiresAt: string;
  maskedEmail: string;
};

export type PendingVerificationResponse = {
  email: string;
  expiresAt: string;
  attemptsLeft: number;
  resendAvailableAt: string;
};

export async function requestAppointmentVerificationOnServer(
  payload: RequestVerificationPayload,
) {
  return backendVerificationFetch<RequestVerificationResponse>(
    "/appointments/verification/request",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function getPendingAppointmentVerificationOnServer(
  verificationRequestId: string,
  userId: string,
) {
  return backendVerificationFetch<PendingVerificationResponse>(
    `/appointments/verification/${verificationRequestId}?userId=${encodeURIComponent(userId)}`,
  );
}

export async function resendAppointmentVerificationOnServer(
  verificationRequestId: string,
  userId: string,
) {
  return backendVerificationFetch<RequestVerificationResponse>(
    "/appointments/verification/resend",
    {
      method: "POST",
      body: JSON.stringify({ verificationRequestId, userId }),
    },
  );
}

export async function confirmAppointmentVerificationOnServer(
  verificationRequestId: string,
  userId: string,
  code: string,
) {
  return backendVerificationFetch<{
    message: string;
    appointment: { id: string };
  }>("/appointments/verification/confirm", {
    method: "POST",
    body: JSON.stringify({ verificationRequestId, userId, code }),
  });
}

export { BackendVerificationError };
