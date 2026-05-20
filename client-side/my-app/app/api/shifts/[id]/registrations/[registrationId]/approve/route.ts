import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import {
  approveShiftRegistrationForUser,
  BackendShiftsError,
} from "@/lib/server-shifts";

type RouteContext = {
  params: Promise<{
    id: string;
    registrationId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { id, registrationId } = await context.params;
    const result = await approveShiftRegistrationForUser(
      userId,
      id,
      registrationId,
      body,
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof BackendShiftsError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { message: "Unable to approve registration." },
      { status: 500 },
    );
  }
}
