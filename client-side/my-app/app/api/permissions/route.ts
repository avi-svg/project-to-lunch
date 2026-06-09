import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import {
  BackendPermissionsError,
  fetchPermissionsStatus,
  grantPermission,
  PERM_VIEW_HOUSING_HISTORY,
  PERM_MANAGE_HOUSING_HISTORY,
  type StaffPermission,
} from "@/lib/server-permissions";

function isValidPermission(value: unknown): value is StaffPermission {
  return (
    value === PERM_VIEW_HOUSING_HISTORY || value === PERM_MANAGE_HOUSING_HISTORY
  );
}

function isStaffRole(role: string | undefined) {
  return role === "staff" || role === "admin";
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id || !isStaffRole(session.user.role)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const permission = url.searchParams.get("permission") ?? PERM_VIEW_HOUSING_HISTORY;

  if (!isValidPermission(permission)) {
    return NextResponse.json({ message: "Invalid permission type." }, { status: 400 });
  }

  try {
    const data = await fetchPermissionsStatus(session.user.id, permission);
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof BackendPermissionsError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    return NextResponse.json({ message: "Unable to fetch permissions." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id || !isStaffRole(session.user.role)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { targetUserId?: unknown; permission?: unknown };

  if (typeof body.targetUserId !== "string" || !isValidPermission(body.permission)) {
    return NextResponse.json(
      { message: "targetUserId and a valid permission are required." },
      { status: 400 },
    );
  }

  try {
    await grantPermission(session.user.id, body.targetUserId, body.permission);
    return NextResponse.json({ message: "Permission granted." }, { status: 201 });
  } catch (error) {
    if (error instanceof BackendPermissionsError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    return NextResponse.json({ message: "Unable to grant permission." }, { status: 500 });
  }
}
