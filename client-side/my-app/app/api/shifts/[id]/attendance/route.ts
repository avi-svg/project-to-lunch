import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import {
  BackendShiftsError,
  reportShiftAttendanceForUser,
} from "@/lib/server-shifts";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const result = await reportShiftAttendanceForUser(userId, id);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof BackendShiftsError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { message: "Unable to report attendance." },
      { status: 500 },
    );
  }
}
