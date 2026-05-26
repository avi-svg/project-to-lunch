import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import {
  BackendShiftsError,
  replaceShiftAssignmentsForUser,
} from "@/lib/server-shifts";
import type {
  ShiftAssignmentRequestType,
  ShiftAssignmentTypesByUserId,
} from "@/lib/shifts";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PUT(request: Request, context: RouteContext) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id } = await context.params;
    const assignmentType: ShiftAssignmentRequestType =
      body?.assignmentType === "forced" ? "forced" : "standard";
    const assignmentTypesByUserId: ShiftAssignmentTypesByUserId =
      body?.assignmentTypesByUserId &&
      typeof body.assignmentTypesByUserId === "object" &&
      !Array.isArray(body.assignmentTypesByUserId)
        ? body.assignmentTypesByUserId
        : {};
    const result = await replaceShiftAssignmentsForUser(
      userId,
      id,
      Array.isArray(body?.userIds) ? body.userIds : [],
      assignmentTypesByUserId,
      assignmentType,
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof BackendShiftsError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { message: "Unable to update shift assignments." },
      { status: 500 },
    );
  }
}
