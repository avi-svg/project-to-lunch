import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { APPOINTMENT_VERIFICATION_COOKIE } from "@/lib/verification-cookie";
import {
  BackendVerificationError,
  confirmAppointmentVerificationOnServer,
} from "@/lib/server-appointment-verification";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const cookieStore = await cookies();
  const verificationRequestId =
    cookieStore.get(APPOINTMENT_VERIFICATION_COOKIE)?.value ?? "";

  if (!verificationRequestId) {
    return NextResponse.json(
      { message: "לא נמצא תהליך אימות פעיל." },
      { status: 404 },
    );
  }

  const body = await request.json();

  try {
    const result = await confirmAppointmentVerificationOnServer(
      verificationRequestId,
      userId,
      body.code,
    );

    cookieStore.delete(APPOINTMENT_VERIFICATION_COOKIE);

    return NextResponse.json({
      message: result.message,
    });
  } catch (error) {
    if (error instanceof BackendVerificationError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { message: "אימות הקוד נכשל." },
      { status: 500 },
    );
  }
}
