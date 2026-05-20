import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { APPOINTMENT_VERIFICATION_COOKIE } from "@/lib/verification-cookie";
import {
  BackendVerificationError,
  getPendingAppointmentVerificationOnServer,
} from "@/lib/server-appointment-verification";

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const verificationRequestId =
    (await cookies()).get(APPOINTMENT_VERIFICATION_COOKIE)?.value ?? "";

  if (!verificationRequestId) {
    return NextResponse.json(
      { message: "לא נמצא תהליך אימות פעיל." },
      { status: 404 },
    );
  }

  try {
    const result = await getPendingAppointmentVerificationOnServer(
      verificationRequestId,
      userId,
    );

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof BackendVerificationError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { message: "לא ניתן לטעון את פרטי האימות." },
      { status: 500 },
    );
  }
}
