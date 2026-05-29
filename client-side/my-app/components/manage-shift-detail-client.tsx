"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteShift, type Shift, type ShiftRegistrationStatus } from "@/lib/shifts";

type Props = {
  shift: Shift;
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("he-IL", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatShiftStatus(status: Shift["status"]) {
  if (status === "open") {
    return "פתוחה";
  }

  if (status === "closed") {
    return "סגורה";
  }

  if (status === "completed") {
    return "הושלמה";
  }

  return "בוטלה";
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

function formatAssignmentMode(mode: Shift["assignmentMode"]) {
  if (mode === "assign-now") {
    return "שיבוץ מיד לאחר יצירה";
  }

  if (mode === "assign-later") {
    return "שיבוץ בשלב מאוחר יותר";
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

export function ManageShiftDetailClient({ shift }: Props) {
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

  const hasPendingAssignments = activeRegistrations.some(
    (registration) => registration.status === "pending",
  );
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
              כאן רואים את התורנים הנוכחיים, סטטוסי השיבוץ, פרטי התורנות וכל
              הפעולות המהירות לניהול התורנות שבחרת.
            </p>
          </div>

          <div className="grid gap-4 border-t border-stone-200 bg-stone-50 p-6 md:grid-cols-3">
            <div className="rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-sm text-stone-500">מועד</p>
              <p className="mt-2 text-lg font-semibold text-stone-900">
                {formatDateTime(shift.startTime)}
              </p>
              <p className="mt-1 text-sm text-stone-600">
                סיום: {formatDateTime(shift.endTime)}
              </p>
            </div>

            <div className="rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-sm text-stone-500">תפוסה</p>
              <p className="mt-2 text-lg font-semibold text-stone-900">
                {shift.reservedSlots} מתוך {shift.capacity}
              </p>
              <p className="mt-1 text-sm text-stone-600">
                {shift.availableSlots} מקומות פנויים
              </p>
            </div>

            <div className="rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-sm text-stone-500">סטטוס תורנות</p>
              <p className="mt-2 text-lg font-semibold text-stone-900">
                {formatShiftStatus(shift.status)}
              </p>
              <p className="mt-1 text-sm text-stone-600">
                סוג: {formatShiftType(shift.shiftType)}
              </p>
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
                  יש משתמשים עם סטטוס `pending`
                </h2>
                <p className="mt-2 text-sm leading-7 text-amber-900">
                  אם צריך לעדכן את השיבוץ, אפשר לעבור למסך השיבוצים ולבצע שם שינוי
                  מלא ברשימת המשתמשים של התורנות.
                </p>
              </div>

              <Link
                href={`/manage-shifts/${shift.id}/assign`}
                className="inline-flex rounded-2xl bg-amber-700 px-5 py-3 text-sm font-medium text-white transition hover:bg-amber-800"
              >
                מעבר למסך השיבוצים
              </Link>
            </div>
          </section>
        ) : null}

        <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold tracking-[0.2em] text-stone-500">
                התורנים לתורנות הנוכחית
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
                עדיין אין משתמשים משובצים לתורנות הזו.
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
                        עדכון דרך מסך השיבוצים
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
                בקשות שלא פעילות כרגע
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
        <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold tracking-[0.2em] text-stone-500">
            פעולות מהירות
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-stone-900">
            עריכה וניהול
          </h2>

          <div className="mt-6 space-y-3">
            <Link
              href={`/manage-shifts/${shift.id}/edit`}
              className="flex items-center justify-center rounded-2xl bg-stone-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-700"
            >
              עריכת פרטי התורנות
            </Link>
            <Link
              href={`/manage-shifts/${shift.id}/assign`}
              className="flex items-center justify-center rounded-2xl border border-stone-900 bg-white px-5 py-3 text-sm font-medium text-stone-900 transition hover:bg-stone-100"
            >
              ניהול שיבוצים
            </Link>
          </div>
        </section>

        <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold tracking-[0.2em] text-stone-500">
            פרטי התורנות
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-stone-900">
            תמונת מצב מלאה
          </h2>

          <div className="mt-6 space-y-4">
            <div className="rounded-3xl border border-stone-200 bg-stone-50 p-4">
              <p className="text-sm text-stone-500">סוג תורנות</p>
              <p className="mt-1 text-lg font-semibold text-stone-900">
                {formatShiftType(shift.shiftType)}
              </p>
            </div>

            <div className="rounded-3xl border border-stone-200 bg-stone-50 p-4">
              <p className="text-sm text-stone-500">מצב שיבוץ</p>
              <p className="mt-1 text-lg font-semibold text-stone-900">
                {formatAssignmentMode(shift.assignmentMode)}
              </p>
            </div>

            <div className="rounded-3xl border border-stone-200 bg-stone-50 p-4">
              <p className="text-sm text-stone-500">מיקום</p>
              <p className="mt-1 text-base font-semibold text-stone-900">
                {shift.location || "לא הוגדר"}
              </p>
            </div>

            <div className="rounded-3xl border border-stone-200 bg-stone-50 p-4">
              <p className="text-sm text-stone-500">תיאור</p>
              <p className="mt-1 text-sm leading-7 text-stone-700">
                {shift.description || "אין תיאור נוסף לתורנות הזו."}
              </p>
            </div>

            <div className="rounded-3xl border border-stone-200 bg-stone-50 p-4">
              <p className="text-sm text-stone-500">נוצרה על ידי</p>
              <p className="mt-1 text-base font-semibold text-stone-900">
                {shift.createdBy.name ?? shift.createdBy.email}
              </p>
            </div>
          </div>
        </section>
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
