const API_BASE_URL =
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:3000";
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

export type ApartmentResident = {
  id: string;
  name: string | null;
  email: string;
};

export type ApartmentGender = "male" | "female";

export type BackendApartment = {
  id: string;
  name: string;
  address: string | null;
  gender: ApartmentGender | null;
  position: number;
  residents: ApartmentResident[];
  createdAt: string;
  updatedAt: string;
};

export class BackendApartmentsError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "BackendApartmentsError";
    this.status = status;
  }
}

function normalizeResident(value: unknown): ApartmentResident | null {
  if (typeof value !== "object" || value === null) return null;
  const c = value as Record<string, unknown>;
  if (typeof c.id !== "string" || typeof c.email !== "string") return null;
  return {
    id: c.id,
    name: typeof c.name === "string" ? c.name : null,
    email: c.email,
  };
}

function normalizeApartment(value: unknown): BackendApartment | null {
  if (typeof value !== "object" || value === null) return null;
  const c = value as Record<string, unknown>;
  if (typeof c.id !== "string" || typeof c.name !== "string") return null;

  const gender =
    c.gender === "male" || c.gender === "female" ? c.gender : null;

  const residents = Array.isArray(c.residents)
    ? (c.residents as unknown[])
        .map(normalizeResident)
        .filter((r): r is ApartmentResident => r !== null)
    : [];

  return {
    id: c.id,
    name: c.name,
    address: typeof c.address === "string" ? c.address : null,
    gender,
    position: typeof c.position === "number" ? c.position : 0,
    residents,
    createdAt: typeof c.createdAt === "string" ? c.createdAt : "",
    updatedAt: typeof c.updatedAt === "string" ? c.updatedAt : "",
  };
}

async function apartmentsFetch(path: string, options: RequestInit = {}) {
  if (!INTERNAL_API_KEY) {
    throw new BackendApartmentsError(
      "Missing INTERNAL_API_KEY for server-to-server apartments request.",
      500,
    );
  }

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        "x-internal-api-key": INTERNAL_API_KEY,
        ...options.headers,
      },
    });
  } catch {
    throw new BackendApartmentsError(
      `Unable to reach the backend at ${API_BASE_URL}.`,
      503,
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message =
      typeof data === "object" &&
      data !== null &&
      "message" in data &&
      typeof data.message === "string"
        ? data.message
        : `Backend request failed with status ${response.status}.`;
    throw new BackendApartmentsError(message, response.status);
  }

  return data;
}

export async function fetchAllApartments(): Promise<BackendApartment[]> {
  const data = await apartmentsFetch("/apartments");

  if (
    typeof data !== "object" ||
    data === null ||
    !Array.isArray(data.apartments)
  ) {
    throw new BackendApartmentsError(
      "Backend apartments response has an unexpected shape.",
      502,
    );
  }

  return (data.apartments as unknown[])
    .map(normalizeApartment)
    .filter((a): a is BackendApartment => a !== null);
}
