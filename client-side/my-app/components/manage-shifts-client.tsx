"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createShift, updateShift, type Shift } from "@/lib/shifts";

type ShiftType = "dinner" | "cleaning";
type SubmitMode = "assign-later" | "assign-now";
type Mode = "create" | "edit";

type FormState = {
  shiftType: ShiftType;
  shiftDate: string;
  startTime: string;
  durationMinutes: number;
  capacity: number;
  location: string;
  description: string;
};

type FeedbackState =
  | {
      variant: "success" | "info" | "error";
      title: string;
      description: string;
    }
  | null;

const durationOptions = [30, 45, 60, 75, 90, 120] as const;

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toTimeInputValue(date: Date) {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function inferShiftType(shift?: Shift | null): ShiftType {
  if (shift?.shiftType === "cleaning") {
    return "cleaning";
  }

  return "dinner";
}

function getDurationMinutesFromShift(shift?: Shift | null) {
  if (shift?.durationMinutes && shift.durationMinutes > 0) {
    return shift.durationMinutes;
  }

  if (!shift) {
    return 45;
  }

  const duration =
    (new Date(shift.endTime).getTime() - new Date(shift.startTime).getTime()) / 60000;

  return duration > 0 ? duration : 45;
}

function createInitialFormState(initialShift?: Shift | null): FormState {
  if (!initialShift) {
    return {
      shiftType: "dinner",
      shiftDate: toDateInputValue(new Date()),
      startTime: "",
      durationMinutes: 45,
      capacity: 1,
      location: "",
      description: "",
    };
  }

  const startDate = new Date(initialShift.startTime);

  return {
    shiftType: inferShiftType(initialShift),
    shiftDate: toDateInputValue(startDate),
    startTime: toTimeInputValue(startDate),
    durationMinutes: getDurationMinutesFromShift(initialShift),
    capacity: initialShift.capacity,
    location: initialShift.location ?? "",
    description: initialShift.description ?? "",
  };
}

function getShiftTitle(shiftType: ShiftType) {
  return shiftType === "dinner" ? "תורנות ארוחת ערב" : "תורנות ניקיון";
}

function formatShiftType(shiftType: ShiftType) {
  return shiftType === "dinner" ? "ארוחת ערב" : "ניקיון";
}

function combineDateAndTime(date: string, time: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

function addMinutes(date: Date, minutes: number) {
  const nextDate = new Date(date);
  nextDate.setMinutes(nextDate.getMinutes() + minutes);
  return nextDate;
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

type Props = {
  initialShift?: Shift | null;
  mode?: Mode;
};

export function ManageShiftsClient({
  initialShift = null,
  mode = "create",
}: Props) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => createInitialFormState(initialShift));
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditMode = mode === "edit";

  const preview = useMemo(() => {
    if (!form.shiftDate || !form.startTime) {
      return null;
    }

    const startDate = combineDateAndTime(form.shiftDate, form.startTime);

    if (Number.isNaN(startDate.getTime())) {
      return null;
    }

    const endDate = addMinutes(startDate, form.durationMinutes);

    return {
      title: getShiftTitle(form.shiftType),
      startLabel: formatDateTime(startDate),
      endLabel: formatDateTime(endDate),
    };
  }, [form.durationMinutes, form.shiftDate, form.shiftType, form.startTime]);

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function handleCreate(mode: SubmitMode) {
    if (!form.shiftDate || !form.startTime) {
      setFeedback({
        variant: "error",
        title: "חסרים פרטי תזמון",
        description: "צריך לבחור תאריך ושעת התחלה לפני שמירת התורנות.",
      });
      return;
    }

    const startDate = combineDateAndTime(form.shiftDate, form.startTime);

    if (Number.isNaN(startDate.getTime())) {
      setFeedback({
        variant: "error",
        title: "תזמון לא תקין",
        description: "לא הצלחנו להבין את התאריך או השעה שנבחרו.",
      });
      return;
    }

    if (form.capacity < 1) {
      setFeedback({
        variant: "error",
        title: "כמות משובצים לא תקינה",
        description: "יש לבחור לפחות משתבץ אחד לתורנות.",
      });
      return;
    }

    const endDate = addMinutes(startDate, form.durationMinutes);
    setIsSubmitting(true);
    setFeedback(null);

    try {
      const result = await createShift({
        title: getShiftTitle(form.shiftType),
        shiftType: form.shiftType,
        assignmentMode: mode,
        description: form.description.trim() || undefined,
        location: form.location.trim() || undefined,
        startTime: startDate.toISOString(),
        endTime: endDate.toISOString(),
        durationMinutes: form.durationMinutes,
        capacity: form.capacity,
      });

      setForm(createInitialFormState());

      if (mode === "assign-later") {
        setFeedback({
          variant: "success",
          title: "התורנות נשמרה ביומן",
          description: `${result.shift.title} נוצרה ללא שיוך משתמשים, ואפשר יהיה לשבץ אליה בהמשך.`,
        });
        return;
      }

      router.push(`/manage-shifts/${result.shift.id}/assign`);
    } catch (error) {
      setFeedback({
        variant: "error",
        title: "שמירת התורנות נכשלה",
        description:
          error instanceof Error
            ? error.message
            : "לא הצלחנו לשמור את התורנות כרגע.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleEditSubmit() {
    if (!initialShift?.id) {
      return;
    }

    if (!form.shiftDate || !form.startTime) {
      setFeedback({
        variant: "error",
        title: "חסרים פרטי תזמון",
        description: "צריך לבחור תאריך ושעת התחלה לפני שמירת השינויים.",
      });
      return;
    }

    const startDate = combineDateAndTime(form.shiftDate, form.startTime);

    if (Number.isNaN(startDate.getTime())) {
      setFeedback({
        variant: "error",
        title: "תזמון לא תקין",
        description: "לא הצלחנו להבין את התאריך או השעה שנבחרו.",
      });
      return;
    }

    if (form.capacity < 1) {
      setFeedback({
        variant: "error",
        title: "כמות משובצים לא תקינה",
        description: "יש לבחור לפחות משתבץ אחד לתורנות.",
      });
      return;
    }

    const endDate = addMinutes(startDate, form.durationMinutes);
    setIsSubmitting(true);
    setFeedback(null);

    try {
      await updateShift(initialShift.id, {
        title: getShiftTitle(form.shiftType),
        shiftType: form.shiftType,
        description: form.description.trim() || undefined,
        location: form.location.trim() || undefined,
        startTime: startDate.toISOString(),
        endTime: endDate.toISOString(),
        durationMinutes: form.durationMinutes,
        capacity: form.capacity,
      });

      setFeedback({
        variant: "success",
        title: "השינויים נשמרו",
        description: "פרטי הפעילות עודכנו בהצלחה.",
      });
      router.refresh();
    } catch (error) {
      setFeedback({
        variant: "error",
        title: "עדכון הפעילות נכשל",
        description:
          error instanceof Error
            ? error.message
            : "לא הצלחנו לשמור את השינויים כרגע.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_22rem]">
      <section className="overflow-hidden rounded-[2rem] border border-stone-200 bg-white shadow-sm">
        <div className="bg-[linear-gradient(135deg,#1c1917,#57534e)] px-8 py-10 text-white">
          <p className="text-sm font-semibold tracking-[0.25em] text-stone-300">
            {isEditMode ? "עריכת פעילות" : "יצירת תורנות"}
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            {isEditMode ? "עדכון פעילות קיימת" : "פתיחת תורנות חדשה ביומן"}
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-stone-300">
            {isEditMode
              ? "אפשר לעדכן את פרטי הפעילות ואז לחזור ללוח הראשי או להמשיך לשיוך משתמשים."
              : "אפשר ליצור תורנות ארוחת ערב או תורנות ניקיון, לשמור אותה ליומן, ולהחליט אם לבצע שיוך משתמשים עכשיו או בהמשך."}
          </p>
        </div>

        <div className="space-y-8 p-8">
          <section className="space-y-4">
            <div>
              <p className="text-sm font-semibold tracking-[0.2em] text-stone-500">
                סוג התורנות
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-stone-900">
                בחר מה רוצים ליצור
              </h2>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <button
                type="button"
                onClick={() => updateForm("shiftType", "dinner")}
                className={`rounded-3xl border p-5 text-right transition ${
                  form.shiftType === "dinner"
                    ? "border-stone-900 bg-stone-900 text-white"
                    : "border-stone-200 bg-stone-50 text-stone-900 hover:border-stone-400"
                }`}
              >
                <p className="text-lg font-semibold">תורנות ארוחת ערב</p>
                <p
                  className={`mt-2 text-sm leading-6 ${
                    form.shiftType === "dinner" ? "text-stone-200" : "text-stone-600"
                  }`}
                >
                  מתאימה לפתיחת משמרת אוכל והגדרת חלון זמן ברור לשיבוץ.
                </p>
              </button>

              <button
                type="button"
                onClick={() => updateForm("shiftType", "cleaning")}
                className={`rounded-3xl border p-5 text-right transition ${
                  form.shiftType === "cleaning"
                    ? "border-stone-900 bg-stone-900 text-white"
                    : "border-stone-200 bg-stone-50 text-stone-900 hover:border-stone-400"
                }`}
              >
                <p className="text-lg font-semibold">תורנות ניקיון</p>
                <p
                  className={`mt-2 text-sm leading-6 ${
                    form.shiftType === "cleaning" ? "text-stone-200" : "text-stone-600"
                  }`}
                >
                  מתאימה לשיבוץ משמרות ניקיון סביב היום או לקראת סיום פעילות.
                </p>
              </button>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <label className="block space-y-2">
              <span className="text-sm font-medium text-stone-700">תאריך</span>
              <input
                type="date"
                value={form.shiftDate}
                onChange={(event) => updateForm("shiftDate", event.target.value)}
                className="w-full rounded-2xl border border-stone-300 px-4 py-3 outline-none transition focus:border-stone-900"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-stone-700">שעת התחלה</span>
              <input
                type="time"
                value={form.startTime}
                onChange={(event) => updateForm("startTime", event.target.value)}
                className="w-full rounded-2xl border border-stone-300 px-4 py-3 outline-none transition focus:border-stone-900"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-stone-700">משך זמן</span>
              <select
                value={String(form.durationMinutes)}
                onChange={(event) =>
                  updateForm("durationMinutes", Number(event.target.value))
                }
                className="w-full rounded-2xl border border-stone-300 px-4 py-3 outline-none transition focus:border-stone-900"
              >
                {durationOptions.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes} דקות
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-stone-700">
                כמות משובצים נדרשת
              </span>
              <input
                type="number"
                min={1}
                value={form.capacity}
                onChange={(event) =>
                  updateForm("capacity", Number(event.target.value) || 1)
                }
                className="w-full rounded-2xl border border-stone-300 px-4 py-3 outline-none transition focus:border-stone-900"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-stone-700">מיקום</span>
              <input
                type="text"
                value={form.location}
                onChange={(event) => updateForm("location", event.target.value)}
                className="w-full rounded-2xl border border-stone-300 px-4 py-3 outline-none transition focus:border-stone-900"
                placeholder="למשל: מטבח מרכזי, חדר אוכל"
              />
            </label>

            <label className="block space-y-2 md:col-span-2">
              <span className="text-sm font-medium text-stone-700">הערות</span>
              <textarea
                value={form.description}
                onChange={(event) => updateForm("description", event.target.value)}
                className="min-h-28 w-full rounded-2xl border border-stone-300 px-4 py-3 outline-none transition focus:border-stone-900"
                placeholder="הוספת הקשר קצר למי שישובץ בהמשך"
              />
            </label>
          </section>

          {isEditMode ? (
            <section className="space-y-4 rounded-3xl border border-stone-200 bg-stone-50 p-5">
              <div>
                <p className="text-sm font-semibold tracking-[0.2em] text-stone-500">
                  פעולות שמירה
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-stone-900">
                  שמירת שינויים בפעילות
                </h2>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <button
                  type="button"
                  onClick={() => void handleEditSubmit()}
                  disabled={isSubmitting}
                  className="rounded-2xl bg-stone-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:bg-stone-400"
                >
                  שמירת שינויים
                </button>

                {initialShift?.id ? (
                  <Link
                    href={`/manage-shifts/${initialShift.id}/assign`}
                    className="inline-flex items-center justify-center rounded-2xl border border-stone-900 bg-white px-5 py-3 text-sm font-medium text-stone-900 transition hover:bg-stone-100"
                  >
                    מעבר לשיוך משתמשים
                  </Link>
                ) : null}
              </div>
            </section>
          ) : (
            <section className="space-y-4 rounded-3xl border border-stone-200 bg-stone-50 p-5">
              <div>
                <p className="text-sm font-semibold tracking-[0.2em] text-stone-500">
                  פעולות שמירה
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-stone-900">
                  בחר מה לעשות אחרי היצירה
                </h2>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <button
                  type="button"
                  onClick={() => void handleCreate("assign-later")}
                  disabled={isSubmitting}
                  className="rounded-2xl bg-stone-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:bg-stone-400"
                >
                  שמירה ושיבוץ מאוחר יותר
                </button>

                <button
                  type="button"
                  onClick={() => void handleCreate("assign-now")}
                  disabled={isSubmitting}
                  className="rounded-2xl border border-stone-900 bg-white px-5 py-3 text-sm font-medium text-stone-900 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:border-stone-300 disabled:text-stone-400"
                >
                  שמירה ושיבוץ עכשיו
                </button>
              </div>

              <div className="grid gap-3 text-sm text-stone-600 lg:grid-cols-2">
                <p className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
                  שמירה ושיבוץ מאוחר יותר תיצור תורנות ביומן בלי שיוך משתמשים.
                </p>
                <p className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
                  שמירה ושיבוץ עכשיו תשמור את התורנות ותעביר לעמוד שיוך המשתמשים.
                </p>
              </div>
            </section>
          )}

          {feedback ? (
            <section
              className={`rounded-3xl border p-5 text-sm leading-7 ${
                feedback.variant === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : feedback.variant === "info"
                    ? "border-sky-200 bg-sky-50 text-sky-800"
                    : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              <p className="font-semibold">{feedback.title}</p>
              <p className="mt-2">{feedback.description}</p>
            </section>
          ) : null}
        </div>
      </section>

      <aside className="space-y-6">
        <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold tracking-[0.2em] text-stone-500">
            תצוגה מקדימה
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-stone-900">
            כך התורנות תישמר
          </h2>

          <div className="mt-6 space-y-4">
            <div className="rounded-3xl border border-stone-200 bg-stone-50 p-4">
              <p className="text-sm text-stone-500">סוג</p>
              <p className="mt-1 text-lg font-semibold text-stone-900">
                {formatShiftType(form.shiftType)}
              </p>
            </div>

            <div className="rounded-3xl border border-stone-200 bg-stone-50 p-4">
              <p className="text-sm text-stone-500">שם ביומן</p>
              <p className="mt-1 text-lg font-semibold text-stone-900">
                {getShiftTitle(form.shiftType)}
              </p>
            </div>

            <div className="rounded-3xl border border-stone-200 bg-stone-50 p-4">
              <p className="text-sm text-stone-500">זמן</p>
              {preview ? (
                <>
                  <p className="mt-1 text-base font-semibold text-stone-900">
                    התחלה: {preview.startLabel}
                  </p>
                  <p className="mt-1 text-sm text-stone-600">
                    סיום: {preview.endLabel}
                  </p>
                </>
              ) : (
                <p className="mt-1 text-sm text-stone-600">
                  בחר תאריך ושעת התחלה כדי לראות את חלון הזמן.
                </p>
              )}
            </div>

            <div className="rounded-3xl border border-stone-200 bg-stone-50 p-4">
              <p className="text-sm text-stone-500">משך וקיבולת</p>
              <p className="mt-1 text-base font-semibold text-stone-900">
                {form.durationMinutes} דקות
              </p>
              <p className="mt-1 text-sm text-stone-600">
                {form.capacity} משובצים נדרשים
              </p>
            </div>
          </div>
        </section>
      </aside>
    </div>
  );
}
