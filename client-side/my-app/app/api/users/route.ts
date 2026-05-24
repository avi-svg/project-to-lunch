import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import {
  BackendUsersError,
  createBackendUserForActor,
  type CreateBackendUserPayload,
} from "@/lib/server-users";

function isTeamRole(role: string | undefined) {
  return role === "admin" || role === "staff";
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId || !isTeamRole(session?.user?.role)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as CreateBackendUserPayload;
    const user = await createBackendUserForActor(userId, body);

    return NextResponse.json(
      { message: "User created successfully.", user },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof BackendUsersError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { message: "Unable to create user." },
      { status: 500 },
    );
  }
}
