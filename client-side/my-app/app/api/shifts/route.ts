import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { BackendShiftsError, createShiftForUser } from "@/lib/server-shifts";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const result = await createShiftForUser(userId, body);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof BackendShiftsError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { message: "Unable to create shift." },
      { status: 500 },
    );
  }
}
