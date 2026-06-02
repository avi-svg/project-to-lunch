import Link from "next/link";
import type { StaffDashboardSummary, ShiftStatus } from "@/lib/shifts";

const DISPLAY_TIME_ZONE = "Asia/Jerusalem";

function formatShortDate(iso: string) {
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: DISPLAY_TIME_ZONE,
    day: "numeric",
    month: "short",
  }).format(new Date(iso));
}

const statusLabels: Record<ShiftStatus, string> = {
  open: "פתוחות",
  closed: "סגורות",
  cancelled: "מבוטלות",
  completed: "הושלמו",
};

const statusColors: Record<ShiftStatus, string> = {
  open: "bg-emerald-100 text-emerald-800",
  closed: "bg-amber-100 text-amber-800",
  cancelled: "bg-red-100 text-red-800",
  completed: "bg-stone-100 text-stone-700",
};

type Props = {
  data: StaffDashboardSummary | null;
};

export function StaffDashboardPanel({ data }: Props) {
  if (!data) {
    return (
      <section className="rounded-[2rem] border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        לא ניתן לטעון את נתוני הצוות כרגע.
      </section>
    );
  }

  const { shiftsWithPendingAttendance, shiftsWithMissingAttendance, shiftStatusCounts, swapRequestCounts } = data;

  const totalSwapRequests = Object.values(swapRequestCounts).reduce((a, b) => a + b, 0);
  const pendingSwapRequests = swapRequestCounts["pending"] ?? 0;

  const hasPendingAttendance = shiftsWithPendingAttendance.length > 0;
  const hasMissingAttendance = shiftsWithMissingAttendance.length > 0;
  const hasAttentionItems = hasPendingAttendance || hasMissingAttendance;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold tracking-[0.2em] text-stone-500">צוות</p>
          <h2 className="mt-1 text-2xl font-semibold text-stone-900">טיפול שוטף</h2>
        </div>
        <Link
          href="/manage-shifts/manage"
          className="inline-flex rounded-2xl border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-900 transition hover:border-stone-900"
        >
          לוח ניהול
        </Link>
      </div>

      {/* Attendance needing action */}
      <div className="overflow-hidden rounded-[2rem] border border-stone-200 bg-white shadow-sm">
        <div className="border-b border-stone-100 px-6 py-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-stone-900">נוכחות לטיפול</h3>
            <Link
              href="/shift-attendance"
              className="text-sm font-medium text-stone-500 transition hover:text-stone-900"
            >
              לכל הנוכחות ←
            </Link>
          </div>
        </div>

        {!hasAttentionItems ? (
          <p className="px-6 py-5 text-sm text-stone-500">אין דיווחי נוכחות הממתינים לטיפול.</p>
        ) : (
          <div className="divide-y divide-stone-100">
            {hasPendingAttendance && (
              <div className="px-6 py-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-stone-400">
                  ממתינים לאישור
                </p>
                <ul className="space-y-2">
                  {shiftsWithPendingAttendance.map((shift) => (
                    <li key={shift.id} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <span className="truncate text-sm font-medium text-stone-900">
                          {shift.title}
                        </span>
                        <span className="ml-2 text-xs text-stone-500">{formatShortDate(shift.startTime)}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                          {shift.pendingCount} ממתינים
                        </span>
                        <Link
                          href={`/manage-shifts/${shift.id}`}
                          className="rounded-xl border border-stone-300 bg-white px-3 py-1 text-xs font-medium text-stone-900 transition hover:border-stone-900"
                        >
                          לאישור
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {hasMissingAttendance && (
              <div className="px-6 py-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-stone-400">
                  נוכחות שטרם סומנה
                </p>
                <ul className="space-y-2">
                  {shiftsWithMissingAttendance.map((shift) => (
                    <li key={shift.id} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <span className="truncate text-sm font-medium text-stone-900">
                          {shift.title}
                        </span>
                        <span className="ml-2 text-xs text-stone-500">{formatShortDate(shift.startTime)}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-800">
                          {shift.missingCount}/{shift.totalApproved} לא סומנו
                        </span>
                        <Link
                          href={`/manage-shifts/${shift.id}`}
                          className="rounded-xl border border-stone-300 bg-white px-3 py-1 text-xs font-medium text-stone-900 transition hover:border-stone-900"
                        >
                          לסימון
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Shift status counts + swap requests side by side */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="overflow-hidden rounded-[2rem] border border-stone-200 bg-white shadow-sm">
          <div className="border-b border-stone-100 px-6 py-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-stone-900">תורנויות לפי סטטוס</h3>
              <span className="text-xs text-stone-400">3 חודשים אחרונים</span>
            </div>
          </div>
          <ul className="divide-y divide-stone-100">
            {(["open", "closed", "completed", "cancelled"] as ShiftStatus[]).map((status) => {
              const count = shiftStatusCounts[status] ?? 0;
              return (
                <li key={status} className="flex items-center justify-between gap-3 px-6 py-3">
                  <span className="text-sm text-stone-700">{statusLabels[status]}</span>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColors[status]}`}>
                      {count}
                    </span>
                    {(status === "open" || status === "closed") && count > 0 && (
                      <Link
                        href="/manage-shifts/manage"
                        className="text-xs font-medium text-stone-400 transition hover:text-stone-900"
                      >
                        לניהול
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="overflow-hidden rounded-[2rem] border border-stone-200 bg-white shadow-sm">
          <div className="border-b border-stone-100 px-6 py-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-stone-900">בקשות החלפה</h3>
              <Link
                href="/shift-swap-requests"
                className="text-sm font-medium text-stone-500 transition hover:text-stone-900"
              >
                לכל הבקשות ←
              </Link>
            </div>
          </div>
          <div className="px-6 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-stone-700">סה״כ בקשות</span>
              <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-semibold text-stone-700">
                {totalSwapRequests}
              </span>
            </div>
            {pendingSwapRequests > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-stone-700">ממתינות לטיפול</span>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                    {pendingSwapRequests}
                  </span>
                  <Link
                    href="/shift-swap-requests"
                    className="text-xs font-medium text-stone-400 transition hover:text-stone-900"
                  >
                    לטיפול
                  </Link>
                </div>
              </div>
            )}
            {pendingSwapRequests === 0 && (
              <p className="text-sm text-stone-500">אין בקשות ממתינות.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
