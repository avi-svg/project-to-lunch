import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import {
  BackendShiftsError,
  overrideShiftAttendanceForUser,
} from "@/lib/server-shifts";

type RouteContext = {
  params: Promise<{
    id: string;
    attendanceId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id, attendanceId } = await context.params;
    const body = await request.json();
    const result = await overrideShiftAttendanceForUser(userId, id, attendanceId, body);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof BackendShiftsError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { message: "Unable to override attendance." },
      { status: 500 },
    );
  }
}
