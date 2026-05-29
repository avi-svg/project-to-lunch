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

type PageProps = {
  searchParams?: Promise<{
    shiftId?: string;
  }>;
};

export default async function ShiftAttendancePage({ searchParams }: PageProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/");
  }

  const resolvedSearchParams = await searchParams;
  const selectedShiftId = resolvedSearchParams?.shiftId?.trim() ?? "";
  let myShifts: Shift[] = [];
  let reviewShifts: Shift[] = [];
  let errorMessage = "";

  try {
    const response = await fetchShiftAttendanceDashboardForUser(session.user.id);
    myShifts = response.myShifts;
    reviewShifts = response.reviewShifts;

    if (selectedShiftId) {
      myShifts = myShifts.filter((shift) => shift.id === selectedShiftId);
      reviewShifts = reviewShifts.filter((shift) => shift.id === selectedShiftId);
    }
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

        {selectedShiftId ? (
          <section className="rounded-[2rem] border border-stone-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold tracking-[0.2em] text-stone-500">
              מסנן פעיל
            </p>
            <p className="mt-2 text-sm leading-7 text-stone-700">
              מוצגת כאן רק תורנות אחת לצורך דיווח ואישור נוכחות.
            </p>
          </section>
        ) : null}

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
