import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import {
  BackendPermissionsError,
  bootstrapPermissions,
} from "@/lib/server-permissions";

function isStaffRole(role: string | undefined) {
  return role === "staff" || role === "admin";
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id || !isStaffRole(session.user.role)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { managerUserIds?: unknown };

  if (!Array.isArray(body.managerUserIds) || body.managerUserIds.length === 0) {
    return NextResponse.json(
      { message: "managerUserIds must be a non-empty array." },
      { status: 400 },
    );
  }

  try {
    await bootstrapPermissions(session.user.id, body.managerUserIds as string[]);
    return NextResponse.json({ message: "Bootstrap completed." }, { status: 201 });
  } catch (error) {
    if (error instanceof BackendPermissionsError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    return NextResponse.json({ message: "Unable to complete bootstrap." }, { status: 500 });
  }
}
