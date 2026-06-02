"use client";

import { useState } from "react";
import Link from "next/link";
import type { StaffDashboardSummary, ShiftComputedStatus } from "@/lib/shifts";

const DISPLAY_TIME_ZONE = "Asia/Jerusalem";

function formatShortDate(iso: string) {
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: DISPLAY_TIME_ZONE,
    day: "numeric",
    month: "short",
  }).format(new Date(iso));
}

type StatusConfig = {
  label: string;
  color: string;
  linkLabel?: string;
};

const statusConfig: Record<ShiftComputedStatus, StatusConfig> = {
  in_progress:        { label: "בתהליך",                  color: "bg-sky-100 text-sky-800" },
  ended_incomplete:   { label: "הסתיימה אך טרם הושלמה",  color: "bg-amber-100 text-amber-800", linkLabel: "לטיפול" },
  ended_complete:     { label: "הסתיימה והושלמה",         color: "bg-emerald-100 text-emerald-800" },
  fully_assigned:     { label: "שובצה ואושרה",            color: "bg-emerald-100 text-emerald-800" },
  partially_assigned: { label: "שובצה חלקית",             color: "bg-amber-100 text-amber-800", linkLabel: "לשיבוץ" },
  not_assigned:       { label: "טרם שובצה",               color: "bg-rose-100 text-rose-800",   linkLabel: "לשיבוץ" },
  cancelled:          { label: "בוטלה",                   color: "bg-stone-100 text-stone-500" },
};

const statusOrder: ShiftComputedStatus[] = [
  "in_progress",
  "ended_incomplete",
  "not_assigned",
  "partially_assigned",
  "fully_assigned",
  "ended_complete",
  "cancelled",
];

type Props = {
  data: StaffDashboardSummary | null;
};

export function StaffDashboardPanel({ data }: Props) {
  const [expandedStatus, setExpandedStatus] = useState<ShiftComputedStatus | null>(null);

  if (!data) {
    return (
      <section className="rounded-[2rem] border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        לא ניתן לטעון את נתוני הצוות כרגע.
      </section>
    );
  }

  const {
    shiftsWithPendingAttendance,
    shiftsWithMissingAttendance,
    shiftStatusCounts,
    shiftsByStatus,
    swapRequestCounts,
  } = data;

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
                  ממתינים לאישור צוות
                </p>
                <ul className="space-y-2">
                  {shiftsWithPendingAttendance.map((shift) => (
                    <li key={shift.id} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <span className="truncate text-sm font-medium text-stone-900">
                          {shift.title}
                        </span>
                        <span className="mr-2 text-xs text-stone-500">{formatShortDate(shift.startTime)}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                          {shift.pendingCount} ממתינים
                        </span>
                        <Link
                          href={`/manage-shifts/${shift.id}`}
                          className="rounded-xl border border-stone-300 bg-white px-3 py-1 text-xs font-medium text-stone-900 transition hover:border-stone-900"
                        >
                          לטיפול
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
                  חלון הדיווח עבר — נדרש דיווח ידני
                </p>
                <ul className="space-y-2">
                  {shiftsWithMissingAttendance.map((shift) => (
                    <li key={shift.id} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <span className="truncate text-sm font-medium text-stone-900">
                          {shift.title}
                        </span>
                        <span className="mr-2 text-xs text-stone-500">{formatShortDate(shift.startTime)}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-800">
                          {shift.missingCount}/{shift.totalApproved} לא דיווחו
                        </span>
                        <Link
                          href="/shift-attendance"
                          className="rounded-xl border border-stone-300 bg-white px-3 py-1 text-xs font-medium text-stone-900 transition hover:border-stone-900"
                        >
                          לדיווח ידני
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

      {/* Shift status counts + swap requests */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="overflow-hidden rounded-[2rem] border border-stone-200 bg-white shadow-sm">
          <div className="border-b border-stone-100 px-6 py-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-stone-900">תורנויות לפי סטטוס</h3>
              <span className="text-xs text-stone-400">3 חודשים אחרונים</span>
            </div>
          </div>
          <ul className="divide-y divide-stone-100">
            {statusOrder.map((status) => {
              const count = shiftStatusCounts[status] ?? 0;
              if (count === 0) return null;
              const config = statusConfig[status];
              const shifts = shiftsByStatus?.[status] ?? [];
              const isExpanded = expandedStatus === status;

              return (
                <li key={status}>
                  <button
                    onClick={() => setExpandedStatus(isExpanded ? null : status)}
                    className="flex w-full items-center justify-between gap-3 px-6 py-3 transition hover:bg-stone-50"
                  >
                    <span className="text-sm text-stone-700">{config.label}</span>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${config.color}`}>
                        {count}
                      </span>
                      <span
                        className="text-xs text-stone-400 transition-transform"
                        style={{ display: "inline-block", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}
                      >
                        ▾
                      </span>
                    </div>
                  </button>

                  {isExpanded && shifts.length > 0 && (
                    <div className="border-t border-stone-100 bg-stone-50 px-6 py-3">
                      <ul className="space-y-2">
                        {shifts.map((shift) => (
                          <li key={shift.id} className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <span className="truncate text-sm font-medium text-stone-900">
                                {shift.title}
                              </span>
                              <span className="mr-2 text-xs text-stone-500">
                                {formatShortDate(shift.startTime)}
                              </span>
                            </div>
                            <Link
                              href={`/manage-shifts/${shift.id}`}
                              className="shrink-0 rounded-xl border border-stone-300 bg-white px-3 py-1 text-xs font-medium text-stone-900 transition hover:border-stone-900"
                            >
                              לניהול ←
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
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
          <div className="space-y-3 px-6 py-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-stone-700">סה״כ בקשות</span>
              <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-semibold text-stone-700">
                {totalSwapRequests}
              </span>
            </div>
            {pendingSwapRequests > 0 ? (
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
            ) : (
              <p className="text-sm text-stone-500">אין בקשות ממתינות.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
