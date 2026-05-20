import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import {
  BackendShiftsError,
  fetchWeekShiftsForUser,
} from "@/lib/server-shifts";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const start = searchParams.get("start");

  if (!start) {
    return NextResponse.json(
      { message: "start is required." },
      { status: 400 },
    );
  }

  try {
    const shifts = await fetchWeekShiftsForUser(userId, start);
    return NextResponse.json(shifts);
  } catch (error) {
    if (error instanceof BackendShiftsError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { message: "Unable to load shifts." },
      { status: 500 },
    );
  }
}
