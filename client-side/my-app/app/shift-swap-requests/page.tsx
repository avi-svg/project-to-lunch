import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth";
import { ShiftSwapRequestsClient } from "@/components/shift-swap-requests-client";
import {
  BackendShiftsError,
  fetchShiftSwapRequestsForUser,
} from "@/lib/server-shifts";
import type { ShiftSwapRequest } from "@/lib/shifts";

type PageProps = {
  searchParams?: Promise<{
    shiftId?: string;
  }>;
};

export default async function ShiftSwapRequestsPage({
  searchParams,
}: PageProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id || !session.user.email) {
    redirect("/");
  }

  const resolvedSearchParams = await searchParams;
  const selectedShiftId = resolvedSearchParams?.shiftId?.trim() ?? "";
  let requests: ShiftSwapRequest[] = [];
  let errorMessage = "";

  try {
    requests = (await fetchShiftSwapRequestsForUser(session.user.id)).requests;
    if (selectedShiftId) {
      requests = requests.filter((request) => request.shift.id === selectedShiftId);
    }
  } catch (error) {
    errorMessage =
      error instanceof BackendShiftsError
        ? error.message
        : "לא ניתן לטעון את בקשות ההחלפה כרגע.";
  }

  const isStaffView =
    session.user.role === "staff" || session.user.role === "admin";

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

        <ShiftSwapRequestsClient
          currentUserId={session.user.id}
          currentUserRole={session.user.role ?? "user"}
          initialRequests={requests}
          initialError={errorMessage}
          heading={
            selectedShiftId
              ? "בקשות החלפה לתורנות"
              : isStaffView
                ? "ניהול בקשות החלפה"
                : "בקשות החלפה"
          }
          description={
            selectedShiftId
              ? "מוצגות כאן רק בקשות ההחלפה של התורנות שנבחרה."
              : isStaffView
                ? "כאן מוצגות כברירת מחדל רק בקשות רלוונטיות מהחודש האחרון שעדיין מחכות לטיפול או לאישור של הצוות."
                : "כאן מופיעות בקשות החלפה של משתמשים אחרים שעדיין פתוחות ורלוונטיות להחלפה."
          }
          showOwnRequestsSection={false}
        />
      </div>
    </main>
  );
}
