import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import {
  approveShiftAttendanceForUser,
  BackendShiftsError,
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
    const body = await request.json().catch(() => ({}));
    const { id, attendanceId } = await context.params;
    const result = await approveShiftAttendanceForUser(
      userId,
      id,
      attendanceId,
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
      { message: "Unable to approve attendance." },
      { status: 500 },
    );
  }
}
