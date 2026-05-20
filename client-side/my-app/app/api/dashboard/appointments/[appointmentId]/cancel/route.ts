import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import {
  BackendAppointmentsError,
  cancelAppointmentForUser,
} from "@/lib/server-appointments";

type RouteContext = {
  params: Promise<{
    appointmentId: string;
  }>;
};

export async function PATCH(_request: Request, context: RouteContext) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { appointmentId } = await context.params;

  try {
    const result = await cancelAppointmentForUser(userId, appointmentId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof BackendAppointmentsError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { message: "Unable to cancel the appointment." },
      { status: 500 },
    );
  }
}
