import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { APPOINTMENT_VERIFICATION_COOKIE } from "@/lib/verification-cookie";
import {
  BackendVerificationError,
  requestAppointmentVerificationOnServer,
} from "@/lib/server-appointment-verification";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const email = session?.user?.email;

  if (!userId || !email) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  try {
    const result = await requestAppointmentVerificationOnServer({
      userId,
      email,
      businessId: body.businessId,
      startTime: body.startTime,
      endTime: body.endTime,
    });

    const cookieStore = await cookies();
    cookieStore.set(APPOINTMENT_VERIFICATION_COOKIE, result.verificationRequestId, {
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
      { message: "לא ניתן לשלוח קוד אימות כרגע." },
      { status: 500 },
    );
  }
}
