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

function canManageUser(
  actorUserId: string | undefined,
  actorRole: string | undefined,
  requestedUserId: string,
) {
  return Boolean(actorUserId) &&
    (isTeamRole(actorRole) || actorUserId === requestedUserId);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  const session = await getServerSession(authOptions);
  const actorUserId = session?.user?.id;
  const actorRole = session?.user?.role;
  const { userId } = await context.params;

  if (!canManageUser(actorUserId, actorRole, userId)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const safeActorUserId = actorUserId as string;

  try {
    const body = (await request.json()) as ManageUserPayload;
    const { role, ...updatePayload } = body;
    let user: BackendDirectoryUser | null = null;

    if (role !== undefined) {
      if (!isTeamRole(actorRole)) {
        return NextResponse.json(
          { message: "Only staff users can update roles." },
          { status: 403 },
        );
      }

      user = await updateBackendUserRoleForActor(safeActorUserId, userId, role);
    }

    const hasFieldUpdates = Object.values(updatePayload).some(
      (value) => value !== undefined,
    );

    if (hasFieldUpdates) {
      user = await updateBackendUserForActor(
        safeActorUserId,
        userId,
        updatePayload,
      );
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
