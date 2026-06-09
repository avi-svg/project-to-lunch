import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import {
  BackendPermissionsError,
  revokePermission,
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

export async function DELETE(
  request: Request,
  context: { params: Promise<{ targetUserId: string }> },
) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id || !isStaffRole(session.user.role)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { targetUserId } = await context.params;
  const url = new URL(request.url);
  const permission = url.searchParams.get("permission") ?? PERM_VIEW_HOUSING_HISTORY;

  if (!isValidPermission(permission)) {
    return NextResponse.json({ message: "Invalid permission type." }, { status: 400 });
  }

  try {
    await revokePermission(session.user.id, targetUserId, permission);
    return NextResponse.json({ message: "Permission revoked." });
  } catch (error) {
    if (error instanceof BackendPermissionsError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    return NextResponse.json({ message: "Unable to revoke permission." }, { status: 500 });
  }
}
