import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import type { UserRole } from "@/lib/shifts";
import {
  BackendUsersError,
  type BackendDirectoryUser,
  updateBackendUserForActor,
  updateBackendUserRoleForActor,
  type UpdateBackendUserPayload,
} from "@/lib/server-users";

type ManageUserPayload = UpdateBackendUserPayload & {
  role?: UserRole;
};

function isTeamRole(role: string | undefined) {
  return role === "admin" || role === "staff";
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  const session = await getServerSession(authOptions);
  const actorUserId = session?.user?.id;

  if (!actorUserId || !isTeamRole(session?.user?.role)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { userId } = await context.params;

  try {
    const body = (await request.json()) as ManageUserPayload;
    const { role, ...updatePayload } = body;
    let user: BackendDirectoryUser | null = null;

    if (role !== undefined) {
      user = await updateBackendUserRoleForActor(actorUserId, userId, role);
    }

    const hasFieldUpdates = Object.values(updatePayload).some(
      (value) => value !== undefined,
    );

    if (hasFieldUpdates) {
      user = await updateBackendUserForActor(actorUserId, userId, updatePayload);
    }

    if (!user) {
      return NextResponse.json(
        { message: "No user changes were provided." },
        { status: 400 },
      );
    }

    return NextResponse.json({ message: "User updated successfully.", user });
  } catch (error) {
    if (error instanceof BackendUsersError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { message: "Unable to update user." },
      { status: 500 },
    );
  }
}
