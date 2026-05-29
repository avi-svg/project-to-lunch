import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth";
import { ShiftAttendanceClient } from "@/components/shift-attendance-client";
import {
  BackendShiftsError,
  fetchShiftAttendanceDashboardForUser,
} from "@/lib/server-shifts";
import type { Shift } from "@/lib/shifts";

export default async function ShiftAttendancePage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/");
  }

  let myShifts: Shift[] = [];
  let reviewShifts: Shift[] = [];
  let errorMessage = "";

  try {
    const response = await fetchShiftAttendanceDashboardForUser(session.user.id);
    myShifts = response.myShifts;
    reviewShifts = response.reviewShifts;
  } catch (error) {
    errorMessage =
      error instanceof BackendShiftsError
        ? error.message
        : "לא ניתן לטעון את מסך הנוכחות כרגע.";
  }

  return (
    <main className="min-h-screen bg-stone-100 px-6 py-12 text-stone-900">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <div className="flex flex-wrap gap-3">
          <Link
            href="/dashboard"
            className="inline-flex rounded-2xl border border-stone-300 bg-white px-5 py-3 text-sm font-medium text-stone-900 transition hover:border-stone-900"
          >
            חזרה לדשבורד
          </Link>
          <Link
            href="/personal-area"
            className="inline-flex rounded-2xl border border-stone-300 bg-white px-5 py-3 text-sm font-medium text-stone-900 transition hover:border-stone-900"
          >
            מעבר לאזור האישי
          </Link>
        </div>

        <ShiftAttendanceClient
          currentUserName={session.user.name ?? "משתמש"}
          currentUserRole={session.user.role ?? "user"}
          initialMyShifts={myShifts}
          initialReviewShifts={reviewShifts}
          initialError={errorMessage}
        />
      </div>
    </main>
  );
}
