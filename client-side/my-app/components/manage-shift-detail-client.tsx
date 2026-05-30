"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ShiftNotesBoard } from "@/components/shift-notes-board";
import { deleteShift, type Shift, type ShiftRegistrationStatus, type UserRole } from "@/lib/shifts";

type Props = {
  shift: Shift;
  activeSwapRequestsCount: number;
  currentUserId: string;
  currentUserRole: UserRole;
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatShiftType(shiftType: Shift["shiftType"]) {
  if (shiftType === "cleaning") {
    return "ניקיון";
  }

  if (shiftType === "dinner") {
    return "ארוחת ערב";
  }

  return "לא הוגדר";
}

function formatRegistrationStatus(status: ShiftRegistrationStatus) {
  if (status === "approved") {
    return "מאושר";
  }

  if (status === "pending") {
    return "ממתין";
  }

  if (status === "rejected") {
    return "נדחה";
  }

  return "בוטל";
}

function getRegistrationTone(status: ShiftRegistrationStatus) {
  if (status === "approved") {
    return "bg-emerald-100 text-emerald-900";
  }

  if (status === "pending") {
    return "bg-amber-100 text-amber-900";
  }

  if (status === "rejected") {
    return "bg-rose-100 text-rose-900";
  }

  return "bg-stone-200 text-stone-700";
}

function getShiftLifecycleStatus(shift: Shift, activeSwapRequestsCount: number) {
  const now = Date.now();
  const startTime = new Date(shift.startTime).getTime();
  const endTime = new Date(shift.endTime).getTime();
  const processStartTime = startTime - 15 * 60 * 1000;
  const registrations = shift.registrations ?? [];
  const activeRegistrations = registrations.filter(
    (registration) =>
      registration.status === "approved" || registration.status === "pending",
  );
  const approvedRegistrations = registrations.filter(
    (registration) => registration.status === "approved",
  );
  const pendingRegistrations = registrations.filter(
    (registration) => registration.status === "pending",
  );
  const pendingAttendanceCount = approvedRegistrations.filter(
    (registration) => registration.attendance?.status === "pending",
  ).length;
  const missingAttendanceCount = approvedRegistrations.filter(
    (registration) => registration.attendance === null,
  ).length;
  const completedAttendanceCount = approvedRegistrations.filter(
    (registration) => registration.attendance?.status === "approved",
  ).length;

  if (now >= processStartTime && now <= endTime) {
    return {
      label: "בתהליך",
      tone: "bg-sky-100 text-sky-900",
      description: "מרבע שעה לפני תחילת התורנות ועד סיומה, התורנות נחשבת פעילה.",
    };
  }

  if (now > endTime) {
    if (pendingAttendanceCount === 0 && missingAttendanceCount === 0) {
      return {
        label: "הסתיימה והושלמה",
        tone: "bg-emerald-100 text-emerald-900",
        description:
          completedAttendanceCount > 0
            ? "כל דיווחי הנוכחות התקבלו ואושרו."
            : "התורנות הסתיימה ואין דיווחי נוכחות פתוחים לטיפול.",
      };
    }

    return {
      label: "הסתיימה אך טרם הושלמה",
      tone: "bg-amber-100 text-amber-900",
      description: `נותרו ${pendingAttendanceCount} דיווחים ממתינים ו-${missingAttendanceCount} דיווחים חסרים.`,
    };
  }

  if (activeRegistrations.length === 0 && activeSwapRequestsCount === 0) {
    return {
      label: "תורנות נוצרה",
      tone: "bg-stone-200 text-stone-800",
      description: "התורנות נשמרה במערכת ועדיין לא בוצעו עליה פעולות שיבוץ.",
    };
  }

  if (activeSwapRequestsCount > 0) {
    return {
      label: "שובצה חלקית",
      tone: "bg-amber-100 text-amber-900",
      description: `יש ${activeSwapRequestsCount} בקשות החלפה פעילות שעדיין דורשות טיפול.`,
    };
  }

  if (activeRegistrations.length < shift.capacity) {
    return {
      label: "שובצה חלקית",
      tone: "bg-amber-100 text-amber-900",
      description: `שובצו ${activeRegistrations.length} מתוך ${shift.capacity} מקומות.`,
    };
  }

  if (pendingRegistrations.length === shift.capacity) {
    return {
      label: "שובצה וטרם אושרה",
      tone: "bg-orange-100 text-orange-900",
      description: "כל המקומות שובצו, אך כל השיבוצים עדיין ממתינים לאישור.",
    };
  }

  if (approvedRegistrations.length === shift.capacity) {
    return {
      label: "שובצה ואושרה",
      tone: "bg-emerald-100 text-emerald-900",
      description: "כל המקומות שובצו ואושרו, ואין בקשות החלפה פתוחות.",
    };
  }

  return {
    label: "שובצה חלקית",
    tone: "bg-amber-100 text-amber-900",
    description: "יש שילוב של שיבוצים מאושרים וממתינים שעדיין דורש טיפול.",
  };
}

export function ManageShiftDetailClient({
  shift,
  activeSwapRequestsCount,
  currentUserId,
  currentUserRole,
}: Props) {
  const router = useRouter();
  const activeRegistrations = useMemo(
    () =>
      (shift.registrations ?? []).filter(
        (registration) =>
          registration.status === "approved" || registration.status === "pending",
      ),
    [shift.registrations],
  );
  const archivedRegistrations = useMemo(
    () =>
      (shift.registrations ?? []).filter(
        (registration) =>
          registration.status === "rejected" || registration.status === "cancelled",
      ),
    [shift.registrations],
  );
  const lifecycleStatus = useMemo(
    () => getShiftLifecycleStatus(shift, activeSwapRequestsCount),
    [activeSwapRequestsCount, shift],
  );
  const hasPendingAssignments = activeRegistrations.some(
    (registration) => registration.status === "pending",
  );
  const swapRequestsHref = `/shift-swap-requests?shiftId=${encodeURIComponent(
    shift.id,
  )}`;
  const attendanceHref = `/shift-attendance?shiftId=${encodeURIComponent(
    shift.id,
  )}`;
  const [deleteConfirmationId, setDeleteConfirmationId] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [isDeleting, startDeleteTransition] = useTransition();
  const isDeleteConfirmationMatched = deleteConfirmationId.trim() === shift.id;

  function handleDeleteShift() {
    if (!isDeleteConfirmationMatched || isDeleting) {
      return;
    }

    const confirmed = window.confirm(
      "האם למחוק את התורנות ואת כל הנתונים הקשורים אליה? אי אפשר לשחזר את הפעולה הזאת.",
    );

    if (!confirmed) {
      return;
    }

    setDeleteError("");

    startDeleteTransition(async () => {
      try {
        await deleteShift(shift.id);
        router.push("/manage-shifts/manage");
        router.refresh();
      } catch (error) {
        setDeleteError(
          error instanceof Error ? error.message : "מחיקת התורנות נכשלה.",
        );
      }
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_24rem]">
      <section className="space-y-6">
        <section className="overflow-hidden rounded-[2rem] border border-stone-200 bg-white shadow-sm">
          <div className="bg-[linear-gradient(135deg,#1c1917,#57534e)] px-8 py-10 text-white">
            <p className="text-sm font-semibold tracking-[0.25em] text-stone-300">
              ניהול תורנות
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight">{shift.title}</h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-stone-300">
              כאן מנהלים את השיבוצים, בקשות ההחלפה, הנוכחות וסטטוס ההתקדמות של
              התורנות שבחרת.
            </p>
          </div>

          <div className="grid gap-4 border-t border-stone-200 bg-stone-50 p-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <div className="rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-sm text-stone-500">מועד התורנות</p>
              <p className="mt-2 text-lg font-semibold text-stone-900">
                {formatDateTime(shift.startTime)}
              </p>
              <p className="mt-1 text-sm text-stone-600">
                סיום: {formatDateTime(shift.endTime)}
              </p>

              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  href={`/manage-shifts/${shift.id}/assign`}
                  className="inline-flex rounded-2xl bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-700"
                >
                  מעבר לשיבוץ תורנים
                </Link>
                <Link
                  href={`/manage-shifts/${shift.id}/edit`}
                  className="inline-flex rounded-2xl border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-900 transition hover:border-stone-900"
                >
                  עריכת פרטי התורנות
                </Link>
                <Link
                  href={attendanceHref}
                  className="inline-flex rounded-2xl border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-900 transition hover:border-stone-900"
                >
                  מעבר לדיווח נוכחות בתורנות
                </Link>
              </div>
            </div>

            <div className="grid gap-4">
              <div className="rounded-3xl bg-white p-5 shadow-sm">
                <p className="text-sm text-stone-500">בקשות החלפה</p>
                <p className="mt-2 text-3xl font-semibold text-stone-900">
                  {activeSwapRequestsCount}
                </p>
                <p className="mt-1 text-sm text-stone-600">
                  כמות הבקשות הפעילות לתורנות הזאת
                </p>
                <Link
                  href={swapRequestsHref}
                  className="mt-4 inline-flex rounded-2xl border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-900 transition hover:border-stone-900"
                >
                  מעבר לבקשות ההחלפה
                </Link>
              </div>

              <div className="rounded-3xl bg-white p-5 shadow-sm">
                <p className="text-sm text-stone-500">סטטוס התורנות</p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <span
                    className={`rounded-full px-3 py-1 text-sm font-semibold ${lifecycleStatus.tone}`}
                  >
                    {lifecycleStatus.label}
                  </span>
                  <span className="text-sm text-stone-500">
                    סוג: {formatShiftType(shift.shiftType)}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-7 text-stone-600">
                  {lifecycleStatus.description}
                </p>
              </div>
            </div>
          </div>
        </section>

        {hasPendingAssignments ? (
          <section className="rounded-[2rem] border border-amber-200 bg-amber-50 p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold tracking-[0.2em] text-amber-700">
                  שיבוצים בהמתנה
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-amber-950">
                  יש משתמשים עם סטטוס ממתין
                </h2>
                <p className="mt-2 text-sm leading-7 text-amber-900">
                  אם צריך לעדכן את ההקצאה או לאשר שיבוצים, אפשר לעבור למסך
                  השיבוץ ולעבוד שם על הרשימה המלאה.
                </p>
              </div>

              <Link
                href={`/manage-shifts/${shift.id}/assign`}
                className="inline-flex rounded-2xl bg-amber-700 px-5 py-3 text-sm font-medium text-white transition hover:bg-amber-800"
              >
                מעבר למסך השיבוץ
              </Link>
            </div>
          </section>
        ) : null}

        <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold tracking-[0.2em] text-stone-500">
                תורנים לתורנות הנוכחית
              </p>
              <h2 className="mt-2 text-3xl font-semibold text-stone-900">
                רשימת משתתפים ושיבוצים
              </h2>
            </div>

            <span className="rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white">
              {activeRegistrations.length} פעילים
            </span>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {activeRegistrations.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-stone-300 bg-stone-50 px-6 py-10 text-center text-sm text-stone-600 md:col-span-2">
                עדיין אין משתמשים משובצים לתורנות הזאת.
              </div>
            ) : (
              activeRegistrations.map((registration) => (
                <article
                  key={registration.id}
                  className="rounded-3xl border border-stone-200 bg-stone-50 p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-stone-900">
                        {registration.user.name ?? "ללא שם"}
                      </p>
                      <p className="mt-1 text-sm text-stone-600">
                        {registration.user.email}
                      </p>
                    </div>

                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${getRegistrationTone(
                        registration.status,
                      )}`}
                    >
                      {formatRegistrationStatus(registration.status)}
                    </span>
                  </div>

                  <div className="mt-4 space-y-2 text-sm text-stone-600">
                    <p>נרשם בתאריך: {formatDateTime(registration.createdAt)}</p>
                    {registration.reviewedAt ? (
                      <p>עודכן בתאריך: {formatDateTime(registration.reviewedAt)}</p>
                    ) : null}
                    {registration.reviewNote ? <p>הערה: {registration.reviewNote}</p> : null}
                  </div>

                  <div className="mt-5 flex flex-wrap gap-3">
                    {registration.status === "pending" ? (
                      <Link
                        href={`/manage-shifts/${shift.id}/assign`}
                        className="inline-flex rounded-2xl border border-stone-900 bg-white px-4 py-2 text-sm font-medium text-stone-900 transition hover:bg-stone-100"
                      >
                        עדכון דרך מסך השיבוץ
                      </Link>
                    ) : null}
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        {archivedRegistrations.length > 0 ? (
          <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
            <div>
              <p className="text-sm font-semibold tracking-[0.2em] text-stone-500">
                היסטוריית סטטוסים
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-stone-900">
                בקשות שאינן פעילות כרגע
              </h2>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {archivedRegistrations.map((registration) => (
                <article
                  key={registration.id}
                  className="rounded-3xl border border-stone-200 bg-stone-50 p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-stone-900">
                        {registration.user.name ?? "ללא שם"}
                      </p>
                      <p className="mt-1 text-sm text-stone-600">
                        {registration.user.email}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${getRegistrationTone(
                        registration.status,
                      )}`}
                    >
                      {formatRegistrationStatus(registration.status)}
                    </span>
                  </div>

                  {registration.reviewNote ? (
                    <p className="mt-4 text-sm text-stone-600">{registration.reviewNote}</p>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </section>

      <aside className="space-y-6">
        <ShiftNotesBoard
          shiftId={shift.id}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          title="לוח הערות חשוב לתורנות"
          description="זהו לוח ההערות המשותף של התורנות. כל מי שרשום כרגע לתורנות רואה את ההודעות, ואיש צוות יכול לסמן אם הערה מסוימת מיועדת בעתיד גם להתרעת וואטסאפ."
        />

        <section className="rounded-[2rem] border border-rose-200 bg-rose-50 p-6 shadow-sm">
          <p className="text-sm font-semibold tracking-[0.2em] text-rose-700">
            מחיקה
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-rose-950">
            מחיקת תורנות
          </h2>
          <p className="mt-3 text-sm leading-7 text-rose-900">
            הפעולה הזאת מוחקת את התורנות, ההרשמות, דיווחי הנוכחות ובקשות ההחלפה
            שקשורים אליה. כדי לאשר את המחיקה צריך להקליד את מזהה ה-DB של
            התורנות כפי שהוא מופיע כאן במסך הניהול.
          </p>

          <div className="mt-5 rounded-3xl border border-rose-200 bg-white p-4">
            <p className="text-sm text-rose-700">מזהה תורנות ב-DB</p>
            <code className="mt-2 block break-all rounded-2xl bg-stone-900 px-4 py-3 text-sm text-white">
              {shift.id}
            </code>
          </div>

          <label className="mt-5 block text-sm font-medium text-rose-950">
            הקלד את המזהה המלא כדי לאפשר מחיקה
          </label>
          <input
            type="text"
            value={deleteConfirmationId}
            onChange={(event) => setDeleteConfirmationId(event.target.value)}
            placeholder="הדבק כאן את ה-ID המלא"
            dir="ltr"
            className="mt-2 w-full rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-rose-400"
          />

          {deleteError ? (
            <p className="mt-3 text-sm text-rose-700">{deleteError}</p>
          ) : null}

          <button
            type="button"
            onClick={handleDeleteShift}
            disabled={!isDeleteConfirmationMatched || isDeleting}
            className="mt-5 flex w-full items-center justify-center rounded-2xl bg-rose-700 px-5 py-3 text-sm font-medium text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:bg-rose-300"
          >
            {isDeleting ? "מוחק תורנות..." : "מחק את התורנות וכל מה שקשור אליה"}
          </button>
        </section>
      </aside>
    </div>
  );
}
