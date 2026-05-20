import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import {
  BackendAppointmentsError,
  fetchDashboardAppointmentsForUser,
} from "@/lib/server-appointments";

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const appointments = await fetchDashboardAppointmentsForUser(userId);
    return NextResponse.json(appointments);
  } catch (error) {
    if (error instanceof BackendAppointmentsError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { message: "Unable to load appointments." },
      { status: 500 },
    );
  }
}
