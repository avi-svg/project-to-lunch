import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";

const API_BASE_URL =
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:3000";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "staff") {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as { password?: unknown };
  const password = typeof body.password === "string" ? body.password : "";

  if (!password) {
    return NextResponse.json({ message: "הסיסמה נדרשת." }, { status: 400 });
  }

  try {
    const backendRes = await fetch(`${API_BASE_URL}/users/verify-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-acting-user-id": userId,
      },
      body: JSON.stringify({ password }),
    });

    const data = (await backendRes.json()) as {
      verified?: boolean;
      message?: string;
    };

    if (!backendRes.ok || !data.verified) {
      return NextResponse.json(
        { message: data.message ?? "סיסמה שגויה." },
        { status: 401 },
      );
    }

    return NextResponse.json({ granted: true });
  } catch {
    return NextResponse.json(
      { message: "לא ניתן לאמת את הסיסמה כרגע." },
      { status: 503 },
    );
  }
}
