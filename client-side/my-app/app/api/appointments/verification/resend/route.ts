import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { APPOINTMENT_VERIFICATION_COOKIE } from "@/lib/verification-cookie";
import {
  BackendVerificationError,
  resendAppointmentVerificationOnServer,
} from "@/lib/server-appointment-verification";

export async function POST() {
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

  try {
    const result = await resendAppointmentVerificationOnServer(
      verificationRequestId,
      userId,
    );

    cookieStore.set(APPOINTMENT_VERIFICATION_COOKIE, verificationRequestId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: new Date(result.expiresAt),
    });

    return NextResponse.json({
      message: result.message,
      expiresAt: result.expiresAt,
      maskedEmail: result.maskedEmail,
    });
  } catch (error) {
    if (error instanceof BackendVerificationError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { message: "לא ניתן לשלוח קוד חדש כרגע." },
      { status: 500 },
    );
  }
}
