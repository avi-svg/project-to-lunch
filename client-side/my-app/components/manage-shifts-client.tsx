"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createShift, updateShift, type Shift } from "@/lib/shifts";
import { PRESET_EVENT_COLORS } from "@/lib/shift-colors";

type EventCategory = "dinner" | "cleaning" | "custom";
type SubmitMode = "assign-later" | "assign-now";
type Mode = "create" | "edit";

type FormState = {
  eventCategory: EventCategory;
  customEventName: string;
  isSeries: boolean;
  themeColor: string;
  allowSwapRequests: boolean;
  requireAttendanceReport: boolean;
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

function inferEventCategory(shift?: Shift | null): EventCategory {
  if (shift?.shiftType === "dinner") return "dinner";
  if (shift?.shiftType === "cleaning") return "cleaning";
  return "custom";
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
      eventCategory: "dinner",
      customEventName: "",
      isSeries: false,
      themeColor: PRESET_EVENT_COLORS[0].hex,
      allowSwapRequests: false,
      requireAttendanceReport: false,
      shiftDate: toDateInputValue(new Date()),
      startTime: "",
      durationMinutes: 45,
      capacity: 1,
      location: "",
      description: "",
    };
  }

  const startDate = new Date(initialShift.startTime);
  const category = inferEventCategory(initialShift);

  return {
    eventCategory: category,
    customEventName: category === "custom" ? initialShift.title : "",
    isSeries: initialShift.isSeries,
    themeColor: initialShift.themeColor ?? PRESET_EVENT_COLORS[0].hex,
    allowSwapRequests: initialShift.allowSwapRequests ?? false,
    requireAttendanceReport: initialShift.requireAttendanceReport ?? false,
    shiftDate: toDateInputValue(startDate),
    startTime: toTimeInputValue(startDate),
    durationMinutes: getDurationMinutesFromShift(initialShift),
    capacity: initialShift.capacity,
    location: initialShift.location ?? "",
    description: initialShift.description ?? "",
  };
}

function getEventTitle(category: EventCategory, customName: string) {
  if (category === "dinner") return "תורנות ארוחת ערב";
  if (category === "cleaning") return "תורנות ניקיון";
  return customName.trim() || "אירוע מותאם אישית";
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

function isStandardCategory(category: EventCategory) {
  return category === "dinner" || category === "cleaning";
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
      title: getEventTitle(form.eventCategory, form.customEventName),
      startLabel: formatDateTime(startDate),
      endLabel: formatDateTime(endDate),
    };
  }, [
    form.durationMinutes,
    form.shiftDate,
    form.eventCategory,
    form.customEventName,
    form.startTime,
  ]);

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function buildPayload(assignMode?: SubmitMode) {
    const startDate = combineDateAndTime(form.shiftDate, form.startTime);
    const endDate = addMinutes(startDate, form.durationMinutes);
    const title = getEventTitle(form.eventCategory, form.customEventName);
    const isCustom = !isStandardCategory(form.eventCategory);

    return {
      title,
      shiftType:
        form.eventCategory === "dinner"
          ? ("dinner" as const)
          : form.eventCategory === "cleaning"
            ? ("cleaning" as const)
            : undefined,
      assignmentMode: assignMode,
      description: form.description.trim() || undefined,
      location: form.location.trim() || undefined,
      startTime: startDate.toISOString(),
      endTime: endDate.toISOString(),
      durationMinutes: form.durationMinutes,
      capacity: form.capacity,
      allowSwapRequests: isCustom ? form.allowSwapRequests : null,
      requireAttendanceReport: isCustom ? form.requireAttendanceReport : null,
      themeColor: isCustom && form.isSeries ? form.themeColor : null,
      isSeries: isCustom ? form.isSeries : false,
    };
  }

  function validateTiming() {
    if (!form.shiftDate || !form.startTime) {
      setFeedback({
        variant: "error",
        title: "חסרים פרטי תזמון",
        description: "צריך לבחור תאריך ושעת התחלה לפני שמירת האירוע.",
      });
      return false;
    }

    const startDate = combineDateAndTime(form.shiftDate, form.startTime);

    if (Number.isNaN(startDate.getTime())) {
      setFeedback({
        variant: "error",
        title: "תזמון לא תקין",
        description: "לא הצלחנו להבין את התאריך או השעה שנבחרו.",
      });
      return false;
    }

    if (form.capacity < 1) {
      setFeedback({
        variant: "error",
        title: "כמות משובצים לא תקינה",
        description: "יש לבחור לפחות משתתף אחד לאירוע.",
      });
      return false;
    }

    if (form.eventCategory === "custom" && !form.customEventName.trim()) {
      setFeedback({
        variant: "error",
        title: "חסר שם האירוע",
        description: "יש להזין שם לאירוע המותאם אישית.",
      });
      return false;
    }

    return true;
  }

  async function handleCreate(submitMode: SubmitMode) {
    if (!validateTiming()) return;

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const result = await createShift(buildPayload(submitMode));

      setForm(createInitialFormState());

      if (submitMode === "assign-later") {
        setFeedback({
          variant: "success",
          title: "האירוע נשמר ביומן",
          description: `${result.shift.title} נוצר ללא שיוך משתמשים, ואפשר יהיה לשבץ אליו בהמשך.`,
        });
        return;
      }

      router.push(`/manage-shifts/${result.shift.id}/assign`);
    } catch (error) {
      setFeedback({
        variant: "error",
        title: "שמירת האירוע נכשלה",
        description:
          error instanceof Error
            ? error.message
            : "לא הצלחנו לשמור את האירוע כרגע.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleEditSubmit() {
    if (!initialShift?.id) return;
    if (!validateTiming()) return;

    setIsSubmitting(true);
    setFeedback(null);

    try {
      await updateShift(initialShift.id, buildPayload());

      setFeedback({
        variant: "success",
        title: "השינויים נשמרו",
        description: "פרטי האירוע עודכנו בהצלחה.",
      });
      router.refresh();
    } catch (error) {
      setFeedback({
        variant: "error",
        title: "עדכון האירוע נכשל",
        description:
          error instanceof Error
            ? error.message
            : "לא הצלחנו לשמור את השינויים כרגע.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const isCustom = !isStandardCategory(form.eventCategory);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_22rem]">
      <section className="overflow-hidden rounded-[2rem] border border-stone-200 bg-white shadow-sm">
        <div className="bg-[linear-gradient(135deg,#1c1917,#57534e)] px-8 py-10 text-white">
          <p className="text-sm font-semibold tracking-[0.25em] text-stone-300">
            {isEditMode ? "עריכת אירוע" : "יצירת אירוע"}
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            {isEditMode ? "עדכון אירוע קיים" : "פתיחת אירוע חדש ביומן"}
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-stone-300">
            {isEditMode
              ? "אפשר לעדכן את פרטי האירוע ואז לחזור ללוח הראשי או להמשיך לשיוך משתמשים."
              : "בחרו סוג אירוע, הגדירו אם זה אירוע יחיד או סדרה, הוסיפו פרטים ושמרו ביומן."}
          </p>
        </div>

        <div className="space-y-8 p-8">
          {/* ── Step 1: Event type ── */}
          <section className="space-y-4">
            <div>
              <p className="text-sm font-semibold tracking-[0.2em] text-stone-500">
                שלב 1 — סוג האירוע
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-stone-900">
                בחר את סוג האירוע
              </h2>
            </div>

            <select
              value={form.eventCategory}
              onChange={(e) => updateForm("eventCategory", e.target.value as EventCategory)}
              className="w-full rounded-2xl border border-stone-300 px-4 py-3 text-stone-900 outline-none transition focus:border-stone-900 md:max-w-sm"
            >
              <option value="dinner">תורנות ארוחת ערב</option>
              <option value="cleaning">תורנות ניקיון</option>
              <option value="custom">אירוע מותאם אישית</option>
            </select>

            {isCustom ? (
              <label className="block space-y-2">
                <span className="text-sm font-medium text-stone-700">שם האירוע</span>
                <input
                  type="text"
                  value={form.customEventName}
                  onChange={(e) => updateForm("customEventName", e.target.value)}
                  className="w-full rounded-2xl border border-stone-300 px-4 py-3 outline-none transition focus:border-stone-900 md:max-w-sm"
                  placeholder="למשל: פגישת צוות, פעילות גיבוש..."
                />
              </label>
            ) : null}
          </section>

          {/* ── Step 2: Single vs Series ── */}
          <section className="space-y-4">
            <div>
              <p className="text-sm font-semibold tracking-[0.2em] text-stone-500">
                שלב 2 — יחיד או סדרה
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-stone-900">
                האם זה אירוע יחיד או חלק מסדרה?
              </h2>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => updateForm("isSeries", false)}
                className={`rounded-2xl border px-5 py-3 text-sm font-medium transition ${
                  !form.isSeries
                    ? "border-stone-900 bg-stone-900 text-white"
                    : "border-stone-200 bg-stone-50 text-stone-900 hover:border-stone-400"
                }`}
              >
                אירוע יחיד
              </button>
              <button
                type="button"
                onClick={() => updateForm("isSeries", true)}
                className={`rounded-2xl border px-5 py-3 text-sm font-medium transition ${
                  form.isSeries
                    ? "border-stone-900 bg-stone-900 text-white"
                    : "border-stone-200 bg-stone-50 text-stone-900 hover:border-stone-400"
                }`}
              >
                חלק מסדרת אירועים
              </button>
            </div>

            {isCustom && form.isSeries ? (
              <div className="space-y-3 rounded-3xl border border-stone-200 bg-stone-50 p-5">
                <p className="text-sm font-medium text-stone-700">צבע נושא לסדרה</p>
                <div className="flex flex-wrap gap-2">
                  {PRESET_EVENT_COLORS.map((color) => (
                    <button
                      key={color.hex}
                      type="button"
                      onClick={() => updateForm("themeColor", color.hex)}
                      title={color.label}
                      className={`h-8 w-8 rounded-full transition hover:scale-110 ${
                        form.themeColor === color.hex
                          ? "ring-2 ring-stone-900 ring-offset-2"
                          : ""
                      }`}
                      style={{ backgroundColor: color.hex }}
                    />
                  ))}
                </div>
                <p className="text-xs text-stone-500">
                  הצבע שנבחר:{" "}
                  <span
                    className="inline-block h-3 w-3 rounded-full align-middle"
                    style={{ backgroundColor: form.themeColor }}
                  />{" "}
                  {PRESET_EVENT_COLORS.find((c) => c.hex === form.themeColor)?.label ?? form.themeColor}
                </p>
              </div>
            ) : null}
          </section>

          {/* ── Step 3: Event properties (custom only) ── */}
          {isCustom ? (
            <section className="space-y-4">
              <div>
                <p className="text-sm font-semibold tracking-[0.2em] text-stone-500">
                  שלב 3 — מאפייני האירוע
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-stone-900">
                  הגדרות נוספות לאירוע
                </h2>
              </div>

              <div className="space-y-3">
                <label className="flex cursor-pointer items-center justify-between gap-4 rounded-3xl border border-stone-200 bg-stone-50 p-5">
                  <div>
                    <p className="font-medium text-stone-900">בקשות החלפה</p>
                    <p className="mt-1 text-sm text-stone-600">
                      משתמשים יוכלו להגיש בקשות להחלפת תורנות עם אחרים
                    </p>
                  </div>
                  <div
                    className={`relative h-6 w-11 flex-shrink-0 rounded-full transition ${
                      form.allowSwapRequests ? "bg-stone-900" : "bg-stone-300"
                    }`}
                    onClick={() => updateForm("allowSwapRequests", !form.allowSwapRequests)}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                        form.allowSwapRequests ? "right-0.5" : "left-0.5"
                      }`}
                    />
                  </div>
                </label>

                <label className="flex cursor-pointer items-center justify-between gap-4 rounded-3xl border border-stone-200 bg-stone-50 p-5">
                  <div>
                    <p className="font-medium text-stone-900">דיווח נוכחות</p>
                    <p className="mt-1 text-sm text-stone-600">
                      משתמשים יצטרכו לדווח נוכחות במהלך האירוע
                    </p>
                  </div>
                  <div
                    className={`relative h-6 w-11 flex-shrink-0 rounded-full transition ${
                      form.requireAttendanceReport ? "bg-stone-900" : "bg-stone-300"
                    }`}
                    onClick={() =>
                      updateForm("requireAttendanceReport", !form.requireAttendanceReport)
                    }
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                        form.requireAttendanceReport ? "right-0.5" : "left-0.5"
                      }`}
                    />
                  </div>
                </label>
              </div>
            </section>
          ) : null}

          {/* ── Timing & Details ── */}
          <section className="space-y-4">
            <div>
              <p className="text-sm font-semibold tracking-[0.2em] text-stone-500">
                {isCustom ? "שלב 4 — " : "שלב 3 — "}פרטי האירוע
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-stone-900">
                תזמון ופרטים
              </h2>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block space-y-2">
                <span className="text-sm font-medium text-stone-700">תאריך</span>
                <input
                  type="date"
                  value={form.shiftDate}
                  onChange={(e) => updateForm("shiftDate", e.target.value)}
                  className="w-full rounded-2xl border border-stone-300 px-4 py-3 outline-none transition focus:border-stone-900"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-stone-700">שעת התחלה</span>
                <input
                  type="time"
                  value={form.startTime}
                  onChange={(e) => updateForm("startTime", e.target.value)}
                  className="w-full rounded-2xl border border-stone-300 px-4 py-3 outline-none transition focus:border-stone-900"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-stone-700">משך זמן</span>
                <select
                  value={String(form.durationMinutes)}
                  onChange={(e) => updateForm("durationMinutes", Number(e.target.value))}
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
                  onChange={(e) =>
                    updateForm("capacity", Number(e.target.value) || 1)
                  }
                  className="w-full rounded-2xl border border-stone-300 px-4 py-3 outline-none transition focus:border-stone-900"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-stone-700">מיקום</span>
                <input
                  type="text"
                  value={form.location}
                  onChange={(e) => updateForm("location", e.target.value)}
                  className="w-full rounded-2xl border border-stone-300 px-4 py-3 outline-none transition focus:border-stone-900"
                  placeholder="למשל: מטבח מרכזי, חדר אוכל"
                />
              </label>

              <label className="block space-y-2 md:col-span-2">
                <span className="text-sm font-medium text-stone-700">הערות</span>
                <textarea
                  value={form.description}
                  onChange={(e) => updateForm("description", e.target.value)}
                  className="min-h-28 w-full rounded-2xl border border-stone-300 px-4 py-3 outline-none transition focus:border-stone-900"
                  placeholder="הוספת הקשר קצר למי שישובץ בהמשך"
                />
              </label>
            </div>
          </section>

          {/* ── Save actions ── */}
          {isEditMode ? (
            <section className="space-y-4 rounded-3xl border border-stone-200 bg-stone-50 p-5">
              <div>
                <p className="text-sm font-semibold tracking-[0.2em] text-stone-500">
                  פעולות שמירה
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-stone-900">
                  שמירת שינויים באירוע
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
                  שמירה ושיבוץ מאוחר יותר תיצור אירוע ביומן בלי שיוך משתמשים.
                </p>
                <p className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
                  שמירה ושיבוץ עכשיו תשמור את האירוע ותעביר לעמוד שיוך המשתמשים.
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
            כך האירוע יישמר
          </h2>

          <div className="mt-6 space-y-4">
            <div className="rounded-3xl border border-stone-200 bg-stone-50 p-4">
              <p className="text-sm text-stone-500">שם ביומן</p>
              <p className="mt-1 text-lg font-semibold text-stone-900">
                {getEventTitle(form.eventCategory, form.customEventName)}
              </p>
            </div>

            <div className="rounded-3xl border border-stone-200 bg-stone-50 p-4">
              <p className="text-sm text-stone-500">סוג</p>
              <div className="mt-1 flex items-center gap-2">
                {form.eventCategory === "dinner" ? (
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-800">
                    ארוחת ערב
                  </span>
                ) : form.eventCategory === "cleaning" ? (
                  <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-800">
                    ניקיון
                  </span>
                ) : (
                  <span
                    className="rounded-full px-3 py-1 text-sm font-medium text-white"
                    style={{
                      backgroundColor:
                        form.isSeries ? form.themeColor : "#57534e",
                    }}
                  >
                    {form.isSeries ? "סדרת אירועים" : "אירוע יחיד"}
                  </span>
                )}
              </div>
            </div>

            {isCustom ? (
              <div className="rounded-3xl border border-stone-200 bg-stone-50 p-4">
                <p className="text-sm text-stone-500">מאפיינים</p>
                <div className="mt-2 space-y-1 text-sm">
                  <p className={form.allowSwapRequests ? "text-stone-900" : "text-stone-400"}>
                    {form.allowSwapRequests ? "✓" : "✗"} בקשות החלפה
                  </p>
                  <p className={form.requireAttendanceReport ? "text-stone-900" : "text-stone-400"}>
                    {form.requireAttendanceReport ? "✓" : "✗"} דיווח נוכחות
                  </p>
                </div>
              </div>
            ) : null}

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
