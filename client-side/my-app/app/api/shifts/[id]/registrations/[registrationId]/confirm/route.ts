import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import {
  BackendShiftsError,
  confirmShiftRegistrationForUser,
} from "@/lib/server-shifts";

type RouteContext = {
  params: Promise<{
    id: string;
    registrationId: string;
  }>;
};

export async function PATCH(_request: Request, context: RouteContext) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id, registrationId } = await context.params;
    const result = await confirmShiftRegistrationForUser(
      userId,
      id,
      registrationId,
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
      { message: "Unable to confirm registration." },
      { status: 500 },
    );
  }
}
