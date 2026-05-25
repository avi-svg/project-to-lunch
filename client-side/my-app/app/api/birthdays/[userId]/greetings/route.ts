import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import {
  BackendUsersError,
  createBirthdayGreetingForActor,
  fetchBirthdayGreetingsForActor,
} from "@/lib/server-users";

type Context = {
  params: Promise<{
    userId: string;
  }>;
};

export async function GET(_request: Request, context: Context) {
  const session = await getServerSession(authOptions);
  const actorUserId = session?.user?.id;

  if (!actorUserId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { userId } = await context.params;

  try {
    const greetings = await fetchBirthdayGreetingsForActor(actorUserId, userId);
    return NextResponse.json({ greetings });
  } catch (error) {
    if (error instanceof BackendUsersError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { message: "Unable to load birthday greetings." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, context: Context) {
  const session = await getServerSession(authOptions);
  const actorUserId = session?.user?.id;

  if (!actorUserId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { userId } = await context.params;

  try {
    const body = (await request.json()) as { message?: string };
    const greeting = await createBirthdayGreetingForActor(
      actorUserId,
      userId,
      body.message ?? "",
    );

    return NextResponse.json(
      { message: "Birthday greeting created successfully.", greeting },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof BackendUsersError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { message: "Unable to create birthday greeting." },
      { status: 500 },
    );
  }
}
