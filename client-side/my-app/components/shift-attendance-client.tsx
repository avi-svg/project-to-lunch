"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  approveShiftAttendance,
  rejectShiftAttendance,
  reportShiftAttendance,
  reportShiftAttendanceManually,
  type Shift,
  type ShiftAttendance,
  type ShiftAttendanceStatus,
  type UserRole,
} from "@/lib/shifts";

type Props = {
  currentUserName: string;
  currentUserRole: UserRole;
  initialMyShifts: Shift[];
  initialReviewShifts: Shift[];
  initialError: string;
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getAttendanceWindowStart(shift: Shift) {
  if (shift.attendanceWindowStartsAt) {
    return new Date(shift.attendanceWindowStartsAt);
  }

  const fallback = new Date(shift.startTime);
  fallback.setMinutes(fallback.getMinutes() - 5);
  return fallback;
}

function getAttendanceWindowEnd(shift: Shift) {
  return new Date(shift.attendanceWindowEndsAt ?? shift.endTime);
}

function getMyAttendanceState(shift: Shift, now: number) {
  if (shift.myAttendance) {
    return {
      canReport: false,
      tone:
        shift.myAttendance.status === "approved"
          ? "emerald"
          : shift.myAttendance.status === "rejected"
            ? "rose"
            : "amber",
      title:
        shift.myAttendance.status === "approved"
          ? "הנוכחות אושרה"
          : shift.myAttendance.status === "rejected"
            ? "הנוכחות נדחתה"
            : "הנוכחות דווחה וממתינה לאישור",
      description: `שעת דיווח: ${formatDateTime(shift.myAttendance.reportedAt)}`,
    };
  }

  const startsAt = getAttendanceWindowStart(shift).getTime();
  const endsAt = getAttendanceWindowEnd(shift).getTime();

  if (now < startsAt) {
    return {
      canReport: false,
      tone: "stone",
      title: "חלון הדיווח עדיין לא נפתח",
      description: `אפשר לדווח החל מ-${formatDateTime(
        getAttendanceWindowStart(shift).toISOString(),
      )}`,
    };
  }

  if (now <= endsAt) {
    return {
      canReport: true,
      tone: "sky",
      title: "אפשר לדווח נוכחות עכשיו",
      description: `הדיווח פתוח עד ${formatDateTime(
        getAttendanceWindowEnd(shift).toISOString(),
      )}`,
    };
  }

  return {
    canReport: false,
    tone: "stone",
    title: "חלון הדיווח נסגר",
    description: "לא התקבל דיווח נוכחות עד סיום התורנות.",
  };
}

function getAttendanceStatusLabel(status: ShiftAttendanceStatus) {
  if (status === "approved") {
    return "אושר";
  }

  if (status === "rejected") {
    return "נדחה";
  }

  return "ממתין לאישור";
}

function getAttendanceSourceLabel(attendance: ShiftAttendance) {
  if (attendance.reportSource === "staff-manual") {
    return attendance.reportedBy?.name
      ? `דווח ידנית על ידי ${attendance.reportedBy.name}`
      : "דווח ידנית על ידי איש צוות";
  }

  return "דווח עצמאית על ידי המשתמש";
}

function getAttendanceBadgeClass(status: ShiftAttendanceStatus | "missing") {
  if (status === "approved") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "rejected") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }

  if (status === "pending") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-stone-200 bg-stone-100 text-stone-600";
}

function replaceAttendanceInRegistrations(
  registrations: Shift["registrations"],
  attendance: ShiftAttendance,
) {
  if (!registrations) {
    return registrations;
  }

  return registrations.map((registration) =>
    registration.id === attendance.registrationId
      ? { ...registration, attendance }
      : registration,
  );
}

function getMyShiftPriority(shift: Shift, now: number) {
  const state = getMyAttendanceState(shift, now);
  const windowStart = getAttendanceWindowStart(shift).getTime();
  const windowEnd = getAttendanceWindowEnd(shift).getTime();

  if (state.canReport) {
    return { bucket: 0, sortValue: windowEnd };
  }

  if (shift.myAttendance?.status === "pending") {
    return {
      bucket: 1,
      sortValue: -new Date(shift.myAttendance.reportedAt).getTime(),
    };
  }

  if (windowStart > now) {
    return { bucket: 2, sortValue: windowStart };
  }

  if (!shift.myAttendance && windowEnd < now) {
    return { bucket: 3, sortValue: -windowEnd };
  }

  return {
    bucket: 4,
    sortValue: shift.myAttendance
      ? -new Date(shift.myAttendance.updatedAt).getTime()
      : -windowEnd,
  };
}

function getReviewShiftPriority(shift: Shift) {
  const now = Date.now();
  const windowStart = getAttendanceWindowStart(shift).getTime();
  const endTime = new Date(shift.endTime).getTime();
  const approvedRegistrations = (shift.registrations ?? []).filter(
    (registration) => registration.status === "approved",
  );
  const pendingCount = approvedRegistrations.filter(
    (registration) => registration.attendance?.status === "pending",
  ).length;
  const missingCount = approvedRegistrations.filter(
    (registration) => registration.attendance === null,
  ).length;

  if (windowStart <= now && endTime >= now && (pendingCount > 0 || missingCount > 0)) {
    return { bucket: 0, sortValue: endTime };
  }

  if (windowStart <= now && endTime < now && pendingCount > 0) {
    return {
      bucket: 1,
      sortValue: -pendingCount * 10000000000000 + endTime,
    };
  }

  if (windowStart <= now && missingCount > 0) {
    return { bucket: 2, sortValue: -endTime };
  }

  if (pendingCount > 0) {
    return {
      bucket: 3,
      sortValue: -pendingCount * 10000000000000 + endTime,
    };
  }

  if (missingCount > 0) {
    return { bucket: 4, sortValue: -endTime };
  }

  return { bucket: 5, sortValue: -endTime };
}

function getReviewRegistrationPriority(registration: NonNullable<Shift["registrations"]>[number]) {
  if (registration.attendance?.status === "pending") {
    return {
      bucket: 0,
      sortValue: -new Date(registration.attendance.reportedAt).getTime(),
    };
  }

  if (registration.attendance === null) {
    return { bucket: 1, sortValue: 0 };
  }

  return {
    bucket: 2,
    sortValue: -new Date(registration.attendance.updatedAt).getTime(),
  };
}

export function ShiftAttendanceClient({
  currentUserName,
  currentUserRole,
  initialMyShifts,
  initialReviewShifts,
  initialError,
}: Props) {
  const [myShifts, setMyShifts] = useState(initialMyShifts);
  const [reviewShifts, setReviewShifts] = useState(initialReviewShifts);
  const [feedback, setFeedback] = useState(initialError);
  const [activeShiftId, setActiveShiftId] = useState<string | null>(null);
  const [activeAttendanceId, setActiveAttendanceId] = useState<string | null>(null);
  const [activeManualRegistrationId, setActiveManualRegistrationId] = useState<
    string | null
  >(null);
  const [now, setNow] = useState(() => Date.now());
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 30000);

    return () => window.clearInterval(timer);
  }, []);

  const isStaffView =
    currentUserRole === "staff" || currentUserRole === "admin";

  const pendingReviewCount = useMemo(
    () =>
      reviewShifts.reduce(
        (count, shift) =>
          count +
          (shift.registrations ?? []).filter(
            (registration) => registration.attendance?.status === "pending",
          ).length,
        0,
      ),
    [reviewShifts],
  );

  const prioritizedMyShifts = useMemo(
    () =>
      [...myShifts].sort((a, b) => {
        const aPriority = getMyShiftPriority(a, now);
        const bPriority = getMyShiftPriority(b, now);

        if (aPriority.bucket !== bPriority.bucket) {
          return aPriority.bucket - bPriority.bucket;
        }

        if (aPriority.sortValue !== bPriority.sortValue) {
          return aPriority.sortValue - bPriority.sortValue;
        }

        return a.startTime.localeCompare(b.startTime);
      }),
    [myShifts, now],
  );

  const prioritizedReviewShifts = useMemo(
    () =>
      [...reviewShifts].sort((a, b) => {
        const aPriority = getReviewShiftPriority(a);
        const bPriority = getReviewShiftPriority(b);

        if (aPriority.bucket !== bPriority.bucket) {
          return aPriority.bucket - bPriority.bucket;
        }

        if (aPriority.sortValue !== bPriority.sortValue) {
          return aPriority.sortValue - bPriority.sortValue;
        }

        return b.endTime.localeCompare(a.endTime);
      }),
    [reviewShifts],
  );

  function applyAttendanceUpdate(attendance: ShiftAttendance) {
    setMyShifts((current) =>
      current.map((shift) =>
        shift.id === attendance.shiftId
          ? {
              ...shift,
              myAttendance:
                shift.myRegistration?.id === attendance.registrationId
                  ? attendance
                  : shift.myAttendance,
              canReportAttendance: false,
            }
          : shift,
      ),
    );

    setReviewShifts((current) =>
      current.map((shift) =>
        shift.id === attendance.shiftId
          ? {
              ...shift,
              registrations: replaceAttendanceInRegistrations(
                shift.registrations,
                attendance,
              ),
            }
          : shift,
      ),
    );
  }

  function handleReportAttendance(shiftId: string) {
    setFeedback("");
    setActiveShiftId(shiftId);

    startTransition(async () => {
      try {
        const result = await reportShiftAttendance(shiftId);
        applyAttendanceUpdate(result.attendance);
        setFeedback(result.message);
      } catch (error) {
        setFeedback(
          error instanceof Error ? error.message : "דיווח הנוכחות נכשל.",
        );
      } finally {
        setActiveShiftId(null);
      }
    });
  }

  function handleReviewAttendance(
    shiftId: string,
    attendanceId: string,
    action: "approve" | "reject",
  ) {
    setFeedback("");
    setActiveAttendanceId(attendanceId);

    startTransition(async () => {
      try {
        const result =
          action === "approve"
            ? await approveShiftAttendance(shiftId, attendanceId)
            : await rejectShiftAttendance(shiftId, attendanceId);

        applyAttendanceUpdate(result.attendance);
        setFeedback(result.message);
      } catch (error) {
        setFeedback(
          error instanceof Error ? error.message : "עדכון הנוכחות נכשל.",
        );
      } finally {
        setActiveAttendanceId(null);
      }
    });
  }

  function handleManualAttendance(shiftId: string, registrationId: string) {
    setFeedback("");
    setActiveManualRegistrationId(registrationId);

    startTransition(async () => {
      try {
        const result = await reportShiftAttendanceManually(shiftId, registrationId);
        applyAttendanceUpdate(result.attendance);
        setFeedback(result.message);
      } catch (error) {
        setFeedback(
          error instanceof Error ? error.message : "הזנת הנוכחות הידנית נכשלה.",
        );
      } finally {
        setActiveManualRegistrationId(null);
      }
    });
  }

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[2rem] border border-stone-200 bg-white shadow-sm">
        <div className="bg-[linear-gradient(140deg,#1c1917,#57534e)] px-8 py-10 text-white">
          <p className="text-sm font-semibold tracking-[0.25em] text-stone-300">
            נוכחות בתורנות
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            דיווח עצמי למשתמשים ואישור סופי לצוות
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-stone-300">
            {currentUserName}, כאן מדווחים על נוכחות החל מחמש דקות לפני תחילת
            התורנות ועד סיומה. אחרי שהתורנות מסתיימת, איש צוות יכול לאשר או
            לדחות את הדיווחים שהתקבלו.
          </p>
        </div>
      </section>

      {feedback ? (
        <p className="rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700 shadow-sm">
          {feedback}
        </p>
      ) : null}

      <section className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold tracking-[0.2em] text-stone-500">
              דיווח אישי
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-stone-900">
              התורנויות המאושרות שלי
            </h2>
          </div>
          <span className="rounded-full bg-white px-4 py-2 text-sm text-stone-700 shadow-sm">
            {myShifts.length} תורנויות
          </span>
        </div>

        {myShifts.length === 0 ? (
          <div className="rounded-[2rem] border border-dashed border-stone-300 bg-white px-6 py-10 text-sm text-stone-600 shadow-sm">
            אין כרגע תורנויות מאושרות להצגת נוכחות.
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {prioritizedMyShifts.map((shift, index) => {
              const state = getMyAttendanceState(shift, now);

              return (
                <article
                  key={shift.id}
                  className={`rounded-[2rem] border bg-white p-6 shadow-sm ${
                    index === 0
                      ? "border-stone-900 shadow-lg ring-1 ring-stone-200"
                      : "border-stone-200"
                  }`}
                >
                  {index === 0 ? (
                    <div className="mb-4 inline-flex rounded-full bg-stone-900 px-3 py-2 text-xs font-semibold text-white">
                      הכי רלוונטי עכשיו
                    </div>
                  ) : null}
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-2xl font-semibold text-stone-900">
                        {shift.title}
                      </h3>
                      <p className="mt-3 text-sm leading-7 text-stone-600">
                        {formatDateTime(shift.startTime)} עד{" "}
                        {formatDateTime(shift.endTime)}
                      </p>
                      {shift.location ? (
                        <p className="text-sm text-stone-500">{shift.location}</p>
                      ) : null}
                    </div>
                    <span
                      className={`rounded-full border px-3 py-2 text-xs font-semibold ${getAttendanceBadgeClass(
                        shift.myAttendance?.status ?? "missing",
                      )}`}
                    >
                      {shift.myAttendance
                        ? getAttendanceStatusLabel(shift.myAttendance.status)
                        : "טרם דווח"}
                    </span>
                  </div>

                  <div className="mt-5 rounded-3xl bg-stone-50 p-4">
                    <p className="text-sm font-semibold text-stone-900">
                      {state.title}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-stone-600">
                      {state.description}
                    </p>
                    {shift.myAttendance ? (
                      <p className="mt-2 text-sm text-stone-500">
                        {getAttendanceSourceLabel(shift.myAttendance)}
                      </p>
                    ) : null}
                    {shift.myAttendance?.reviewNote ? (
                      <p className="mt-2 text-sm text-stone-500">
                        הערת צוות: {shift.myAttendance.reviewNote}
                      </p>
                    ) : null}
                  </div>

                  <div className="mt-5">
                    <button
                      type="button"
                      onClick={() => handleReportAttendance(shift.id)}
                      disabled={
                        !state.canReport ||
                        (isPending && activeShiftId === shift.id)
                      }
                      className="inline-flex rounded-2xl bg-stone-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:bg-stone-300"
                    >
                      {isPending && activeShiftId === shift.id
                        ? "שומר..."
                        : "דיווח נוכחות"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {isStaffView ? (
        <section className="space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold tracking-[0.2em] text-stone-500">
                נוכחות צוות
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-stone-900">
                דיווח ואישור נוכחות לצוות
              </h2>
            </div>
            <span className="rounded-full bg-white px-4 py-2 text-sm text-stone-700 shadow-sm">
              {pendingReviewCount} דיווחים ממתינים
            </span>
          </div>

          {reviewShifts.length === 0 ? (
            <div className="rounded-[2rem] border border-dashed border-stone-300 bg-white px-6 py-10 text-sm text-stone-600 shadow-sm">
              אין כרגע תורנויות שחלון נוכחות הצוות שלהן כבר נפתח.
            </div>
          ) : (
            <div className="space-y-5">
              {prioritizedReviewShifts.map((shift, index) => {
                const approvedRegistrations = (shift.registrations ?? [])
                  .filter((registration) => registration.status === "approved")
                  .sort((a, b) => {
                    const aPriority = getReviewRegistrationPriority(a);
                    const bPriority = getReviewRegistrationPriority(b);

                    if (aPriority.bucket !== bPriority.bucket) {
                      return aPriority.bucket - bPriority.bucket;
                    }

                    return aPriority.sortValue - bPriority.sortValue;
                  });

                return (
                  <section
                    key={shift.id}
                    className={`rounded-[2rem] border bg-white p-6 shadow-sm ${
                      index === 0
                        ? "border-stone-900 shadow-lg ring-1 ring-stone-200"
                        : "border-stone-200"
                    }`}
                  >
                    {index === 0 ? (
                      <div className="mb-4 inline-flex rounded-full bg-stone-900 px-3 py-2 text-xs font-semibold text-white">
                        הכי רלוונטי עכשיו
                      </div>
                    ) : null}
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <h3 className="text-2xl font-semibold text-stone-900">
                          {shift.title}
                        </h3>
                        <p className="mt-2 text-sm text-stone-600">
                          {new Date(shift.endTime).getTime() >= now
                            ? `פעילה עד ${formatDateTime(shift.endTime)}`
                            : `הסתיימה ב-${formatDateTime(shift.endTime)}`}
                        </p>
                        {shift.location ? (
                          <p className="text-sm text-stone-500">{shift.location}</p>
                        ) : null}
                      </div>
                      <span className="rounded-full bg-stone-100 px-4 py-2 text-sm text-stone-700">
                        {approvedRegistrations.length} משובצים מאושרים
                      </span>
                    </div>

                    <div className="mt-5 space-y-4">
                      {approvedRegistrations.map((registration) => {
                        const attendance = registration.attendance;

                        return (
                          <article
                            key={registration.id}
                            className="rounded-3xl border border-stone-200 bg-stone-50 p-4"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-4">
                              <div>
                                <p className="text-lg font-semibold text-stone-900">
                                  {registration.user.name ?? registration.user.email}
                                </p>
                                <p className="text-sm text-stone-500">
                                  {registration.user.email}
                                </p>
                                <p className="mt-2 text-sm text-stone-600">
                                  {attendance
                                    ? `דיווח נשלח ב-${formatDateTime(attendance.reportedAt)}`
                                    : "לא התקבל דיווח נוכחות מהמשתמש"}
                                </p>
                                {attendance ? (
                                  <p className="mt-2 text-sm text-stone-500">
                                    {getAttendanceSourceLabel(attendance)}
                                  </p>
                                ) : null}
                                {attendance?.reviewNote ? (
                                  <p className="mt-2 text-sm text-stone-500">
                                    הערת צוות: {attendance.reviewNote}
                                  </p>
                                ) : null}
                              </div>
                              <div className="flex flex-wrap items-center gap-3">
                                <span
                                  className={`rounded-full border px-3 py-2 text-xs font-semibold ${getAttendanceBadgeClass(
                                    attendance?.status ?? "missing",
                                  )}`}
                                >
                                  {attendance
                                    ? getAttendanceStatusLabel(attendance.status)
                                    : "לא דווח"}
                                </span>

                                {attendance?.status === "pending" ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleReviewAttendance(
                                          shift.id,
                                          attendance.id,
                                          "approve",
                                        )
                                      }
                                      disabled={
                                        isPending &&
                                        activeAttendanceId === attendance.id
                                      }
                                      className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-300"
                                    >
                                      אשר נוכחות
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleReviewAttendance(
                                          shift.id,
                                          attendance.id,
                                          "reject",
                                        )
                                      }
                                      disabled={
                                        isPending &&
                                        activeAttendanceId === attendance.id
                                      }
                                      className="rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm font-semibold text-rose-700 transition hover:border-rose-400 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                      דחה דיווח
                                    </button>
                                  </>
                                ) : null}

                                {!attendance ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleManualAttendance(
                                        shift.id,
                                        registration.id,
                                      )
                                    }
                                    disabled={
                                      isPending &&
                                      activeManualRegistrationId === registration.id
                                    }
                                    className="rounded-2xl bg-sky-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-sky-300"
                                  >
                                    {isPending &&
                                    activeManualRegistrationId === registration.id
                                      ? "שומר..."
                                      : "דווח נוכחות ידנית"}
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
