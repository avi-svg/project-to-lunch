import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth";
import { BackendShiftsError, fetchWeekShiftsForUser } from "@/lib/server-shifts";
import type { Shift, ShiftRegistrationStatus } from "@/lib/shifts";

type PageProps = {
  searchParams?: Promise<{
    view?: string;
    date?: string;
  }>;
};

type CalendarView = "week" | "month";
const DISPLAY_TIME_ZONE = "Asia/Jerusalem";

function formatInDisplayTimeZone(
  value: string | Date,
  options: Intl.DateTimeFormatOptions,
) {
  return new Intl.DateTimeFormat("he-IL", {
    ...options,
    timeZone: DISPLAY_TIME_ZONE,
  }).format(typeof value === "string" ? new Date(value) : value);
}

function getDatePartsInDisplayTimeZone(value: string | Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: DISPLAY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(typeof value === "string" ? new Date(value) : value);
  const lookup = new Map(parts.map((part) => [part.type, part.value]));

  return {
    year: lookup.get("year") ?? "0000",
    month: lookup.get("month") ?? "00",
    day: lookup.get("day") ?? "00",
  };
}

function toDisplayDateParam(value: string | Date) {
  const { year, month, day } = getDatePartsInDisplayTimeZone(value);
  return `${year}-${month}-${day}`;
}

function toDisplayMonthKey(value: string | Date) {
  const { year, month } = getDatePartsInDisplayTimeZone(value);
  return `${year}-${month}`;
}

function getWeekStartSunday(date = new Date()) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = -day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function getMonthStart(date = new Date()) {
  const copy = new Date(date);
  copy.setDate(1);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function addMonths(date: Date, months: number) {
  const copy = new Date(date);
  copy.setMonth(copy.getMonth() + months);
  return copy;
}

function parseView(value?: string): CalendarView {
  return value === "month" ? "month" : "week";
}

function parseCalendarDate(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date();
  }

  const [year, month, day] = value.split("-").map(Number);
  const parsedDate = new Date(year, month - 1, day);

  if (Number.isNaN(parsedDate.getTime())) {
    return new Date();
  }

  return parsedDate;
}

function toDateParam(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateTime(value: string) {
  return formatInDisplayTimeZone(value, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDayLabel(value: string | Date) {
  return formatInDisplayTimeZone(value, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function formatMonthLabel(date: Date) {
  return formatInDisplayTimeZone(date, {
    month: "long",
    year: "numeric",
  });
}

function formatWeekRange(start: Date) {
  const end = addDays(start, 6);
  return `${formatInDisplayTimeZone(start, { day: "numeric", month: "long" })} - ${formatInDisplayTimeZone(end, { day: "numeric", month: "long" })}`;
}

function formatRegistrationStatus(status: ShiftRegistrationStatus) {
  if (status === "approved") {
    return "משויך ומאושר";
  }

  if (status === "pending") {
    return "ממתין לאישור";
  }

  if (status === "rejected") {
    return "נדחה";
  }

  return "בוטל";
}

function groupShiftsByDay(shifts: Shift[]) {
  const groups = new Map<string, Shift[]>();

  for (const shift of shifts) {
    const key = toDisplayDateParam(shift.startTime);
    const existing = groups.get(key) ?? [];
    existing.push(shift);
    groups.set(key, existing);
  }

  return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
}

function buildMonthGrid(monthDate: Date) {
  const monthStart = getMonthStart(monthDate);
  const monthEnd = addDays(getMonthStart(addMonths(monthDate, 1)), -1);
  const gridStart = getWeekStartSunday(monthStart);
  const gridEnd = addDays(getWeekStartSunday(monthEnd), 6);
  const days: Date[] = [];

  for (let cursor = new Date(gridStart); cursor <= gridEnd; cursor = addDays(cursor, 1)) {
    days.push(new Date(cursor));
  }

  return days;
}

async function fetchMonthShiftsForUser(userId: string, monthDate: Date) {
  const monthStart = getMonthStart(monthDate);
  const monthEnd = addDays(getMonthStart(addMonths(monthDate, 1)), -1);
  const firstWeekStart = getWeekStartSunday(monthStart);
  const lastWeekStart = getWeekStartSunday(monthEnd);
  const collectedShifts = new Map<string, Shift>();
  const targetMonthKey = toDisplayMonthKey(monthStart);

  for (
    let cursor = new Date(firstWeekStart);
    cursor <= lastWeekStart;
    cursor = addDays(cursor, 7)
  ) {
    const response = await fetchWeekShiftsForUser(userId, toDateParam(cursor));

    for (const shift of response.shifts) {
      if (toDisplayMonthKey(shift.startTime) === targetMonthKey) {
        collectedShifts.set(shift.id, shift);
      }
    }
  }

  return Array.from(collectedShifts.values()).sort((a, b) =>
    a.startTime.localeCompare(b.startTime),
  );
}

export default async function MainSchedulePage({ searchParams }: PageProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/");
  }

  const resolvedSearchParams = await searchParams;
  const view = parseView(resolvedSearchParams?.view);
  const selectedDate = parseCalendarDate(resolvedSearchParams?.date);
  const today = new Date();
  const isStaffUser = session.user.role === "staff";

  const weekStart = getWeekStartSunday(selectedDate);
  const monthStart = getMonthStart(selectedDate);
  const previousDate =
    view === "month" ? addMonths(monthStart, -1) : addDays(weekStart, -7);
  const nextDate =
    view === "month" ? addMonths(monthStart, 1) : addDays(weekStart, 7);

  let shifts: Shift[] = [];
  let errorMessage = "";

  try {
    shifts =
      view === "month"
        ? await fetchMonthShiftsForUser(session.user.id, monthStart)
        : (await fetchWeekShiftsForUser(session.user.id, toDateParam(weekStart))).shifts;
  } catch (error) {
    errorMessage =
      error instanceof BackendShiftsError
        ? error.message
        : "לא ניתן לטעון את הפעילויות כרגע.";
  }

  const myActivities = shifts.filter((shift) => Boolean(shift.myRegistration));
  const groupedShifts = groupShiftsByDay(shifts);
  const monthDays = buildMonthGrid(monthStart);
  const shiftsByDay = new Map<string, Shift[]>();

  for (const shift of shifts) {
    const key = toDisplayDateParam(shift.startTime);
    const existing = shiftsByDay.get(key) ?? [];
    existing.push(shift);
    shiftsByDay.set(key, existing);
  }

  return (
    <main className="min-h-screen bg-stone-100 px-6 py-12 text-stone-900">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <section className="overflow-hidden rounded-[2rem] border border-stone-200 bg-white shadow-sm">
          <div className="bg-[linear-gradient(135deg,#1c1917,#44403c)] px-8 py-10 text-white">
            <p className="text-sm font-semibold tracking-[0.25em] text-stone-300">
              לוח זמנים ראשי
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight">
              כל פעילויות הקהילה במקום אחד
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-stone-300">
              אפשר לעבור בין תצוגה שבועית לתצוגה חודשית. בתצוגה החודשית מוצגים
              פחות פרטים, כדי לקבל מבט רחב ומהיר על כל הפעילויות.
            </p>
          </div>

          <div className="flex flex-col gap-4 border-t border-stone-200 bg-stone-50 p-6">
            <div className="flex flex-wrap gap-3">
              <Link
                href={`/main-schedule?view=week&date=${toDateParam(selectedDate)}`}
                className={`inline-flex rounded-2xl px-5 py-3 text-sm font-medium transition ${
                  view === "week"
                    ? "bg-stone-900 text-white"
                    : "border border-stone-300 bg-white text-stone-900 hover:border-stone-900"
                }`}
              >
                תצוגה שבועית
              </Link>
              <Link
                href={`/main-schedule?view=month&date=${toDateParam(selectedDate)}`}
                className={`inline-flex rounded-2xl px-5 py-3 text-sm font-medium transition ${
                  view === "month"
                    ? "bg-stone-900 text-white"
                    : "border border-stone-300 bg-white text-stone-900 hover:border-stone-900"
                }`}
              >
                תצוגה חודשית
              </Link>
            </div>

            <div className="grid gap-4 lg:grid-cols-[auto_minmax(0,1fr)_auto_auto]">
              <Link
                href={`/main-schedule?view=${view}&date=${toDateParam(previousDate)}`}
                className="inline-flex items-center justify-center rounded-2xl border border-stone-300 bg-white px-5 py-4 text-sm font-medium text-stone-900 transition hover:border-stone-900"
              >
                {view === "month" ? "חודש קודם" : "שבוע קודם"}
              </Link>

              <div className="rounded-3xl bg-white p-4 shadow-sm">
                <p className="text-sm text-stone-500">
                  {view === "month" ? "החודש המוצג" : "השבוע המוצג"}
                </p>
                <p className="mt-2 text-2xl font-semibold text-stone-900">
                  {view === "month"
                    ? formatMonthLabel(monthStart)
                    : formatWeekRange(weekStart)}
                </p>
                <p className="mt-1 text-sm text-stone-500">
                  {view === "month"
                    ? `תחילת חודש: ${formatDayLabel(monthStart)}`
                    : `תחילת שבוע: ${formatDayLabel(weekStart)}`}
                </p>
              </div>

              <Link
                href={`/main-schedule?view=${view}&date=${toDateParam(today)}`}
                className="inline-flex items-center justify-center rounded-2xl border border-stone-300 bg-white px-5 py-4 text-sm font-medium text-stone-900 transition hover:border-stone-900"
              >
                {view === "month" ? "החודש הנוכחי" : "השבוע הנוכחי"}
              </Link>

              <Link
                href={`/main-schedule?view=${view}&date=${toDateParam(nextDate)}`}
                className="inline-flex items-center justify-center rounded-2xl border border-stone-300 bg-white px-5 py-4 text-sm font-medium text-stone-900 transition hover:border-stone-900"
              >
                {view === "month" ? "חודש הבא" : "שבוע הבא"}
              </Link>
            </div>
          </div>
        </section>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/dashboard"
            className="inline-flex rounded-2xl border border-stone-300 bg-white px-5 py-3 text-sm font-medium text-stone-900 transition hover:border-stone-900"
          >
            חזרה לדשבורד
          </Link>
        </div>

        {errorMessage ? (
          <section className="rounded-[2rem] border border-red-200 bg-red-50 p-6 text-sm text-red-700">
            {errorMessage}
          </section>
        ) : null}

        {view === "week" && myActivities.length > 0 ? (
          <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold tracking-[0.2em] text-stone-500">
                  משויך אליי
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-stone-900">
                  הפעילויות שלך בשבוע הזה
                </h2>
              </div>
              <span className="rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white">
                {myActivities.length} פעילות
              </span>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {myActivities.map((shift) => (
                <article
                  key={shift.id}
                  className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-xl font-semibold text-stone-900">
                        {shift.title}
                      </h3>
                      <p className="mt-2 text-sm text-stone-700">
                        {formatDateTime(shift.startTime)}
                      </p>
                    </div>
                    <span className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">
                      {formatRegistrationStatus(shift.myRegistration!.status)}
                    </span>
                  </div>

                  {shift.location ? (
                    <p className="mt-3 text-sm text-stone-600">
                      מיקום: {shift.location}
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {view === "month" ? (
          <section className="space-y-6">
            <div>
              <p className="text-sm font-semibold tracking-[0.2em] text-stone-500">
                תצוגה חודשית
              </p>
              <h2 className="mt-2 text-3xl font-semibold text-stone-900">
                מבט חודשי מצומצם
              </h2>
            </div>

            <div className="grid gap-3 md:grid-cols-7">
              {["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"].map(
                (dayName) => (
                  <div
                    key={dayName}
                    className="rounded-2xl bg-stone-200 px-3 py-2 text-center text-sm font-semibold text-stone-700"
                  >
                    {dayName}
                  </div>
                ),
              )}

              {monthDays.map((day) => {
                const dayKey = toDateParam(day);
                const dayShifts = shiftsByDay.get(dayKey) ?? [];
                const myDayShifts = dayShifts.filter((shift) =>
                  Boolean(shift.myRegistration),
                );
                const inCurrentMonth = isSameMonth(day, monthStart);

                return (
                  <article
                    key={dayKey}
                    className={`min-h-36 rounded-3xl border p-4 shadow-sm ${
                      inCurrentMonth
                        ? "border-stone-200 bg-white"
                        : "border-stone-200 bg-stone-50 text-stone-400"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-lg font-semibold">{day.getDate()}</p>
                      {myDayShifts.length > 0 ? (
                        <span className="rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white">
                          {myDayShifts.length} שלי
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-4 space-y-2 text-sm">
                      <p className="font-medium text-stone-700">
                        {dayShifts.length} פעילות
                      </p>

                      {dayShifts.slice(0, 2).map((shift) => (
                        <div
                          key={shift.id}
                          className={`rounded-2xl px-3 py-2 ${
                            shift.myRegistration
                              ? "bg-emerald-50 text-emerald-800"
                              : "bg-stone-100 text-stone-700"
                          }`}
                        >
                          <p className="truncate font-medium">{shift.title}</p>
                          <p className="mt-1 text-xs">
                            {formatInDisplayTimeZone(shift.startTime, {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                          {isStaffUser ? (
                            <div className="mt-2 flex flex-wrap gap-2 text-xs">
                              <Link
                                href={`/manage-shifts/${shift.id}/edit`}
                                className="rounded-full bg-white px-2.5 py-1 font-medium text-stone-700 hover:bg-stone-200"
                              >
                                עריכה
                              </Link>
                              <Link
                                href={`/manage-shifts/${shift.id}/assign`}
                                className="rounded-full bg-white px-2.5 py-1 font-medium text-stone-700 hover:bg-stone-200"
                              >
                                שיוך
                              </Link>
                            </div>
                          ) : null}
                        </div>
                      ))}

                      {dayShifts.length > 2 ? (
                        <p className="text-xs text-stone-500">
                          ועוד {dayShifts.length - 2} פעילויות
                        </p>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : (
          <section className="space-y-6">
            <div>
              <p className="text-sm font-semibold tracking-[0.2em] text-stone-500">
                כל הפעילויות
              </p>
              <h2 className="mt-2 text-3xl font-semibold text-stone-900">
                פעילויות הקהילה בשבוע הנבחר
              </h2>
            </div>

            {groupedShifts.length === 0 && !errorMessage ? (
              <div className="rounded-[2rem] border border-dashed border-stone-300 bg-white p-8 text-sm text-stone-600 shadow-sm">
                עדיין לא נוספו פעילויות לשבוע הזה.
              </div>
            ) : null}

            {groupedShifts.map(([day, dayShifts]) => (
              <section
                key={day}
                className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm"
              >
                <div className="mb-5 flex items-center justify-between gap-4">
                  <h3 className="text-2xl font-semibold text-stone-900">
                    {formatDayLabel(day)}
                  </h3>
                  <span className="text-sm text-stone-500">
                    {dayShifts.length} פעילות
                  </span>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  {dayShifts.map((shift) => (
                    <article
                      key={shift.id}
                      className={`rounded-3xl border p-5 shadow-sm transition ${
                        shift.myRegistration
                          ? "border-emerald-200 bg-emerald-50"
                          : "border-stone-200 bg-stone-50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h4 className="text-xl font-semibold text-stone-900">
                            {shift.title}
                          </h4>
                          <p className="mt-2 text-sm text-stone-600">
                            {formatDateTime(shift.startTime)}
                          </p>
                          <p className="text-sm text-stone-600">
                            סיום: {formatDateTime(shift.endTime)}
                          </p>
                        </div>

                        {shift.myRegistration ? (
                          <span className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">
                            {formatRegistrationStatus(shift.myRegistration.status)}
                          </span>
                        ) : (
                          <span className="rounded-full bg-stone-200 px-3 py-1 text-xs font-semibold text-stone-700">
                            פעילות כללית
                          </span>
                        )}
                      </div>

                      <div className="mt-4 space-y-2 text-sm text-stone-600">
                        {shift.location ? <p>מיקום: {shift.location}</p> : null}
                        {shift.description ? <p>{shift.description}</p> : null}
                        <p>
                          יוצר הפעילות: {shift.createdBy.name ?? shift.createdBy.email}
                        </p>
                        <p>
                          תפוסה: {shift.reservedSlots} מתוך {shift.capacity}
                        </p>
                        {isStaffUser ? (
                          <div className="flex flex-wrap gap-3 pt-2">
                            <Link
                              href={`/manage-shifts/${shift.id}/edit`}
                              className="inline-flex rounded-2xl border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-900 transition hover:border-stone-900"
                            >
                              עריכת פעילות
                            </Link>
                            <Link
                              href={`/manage-shifts/${shift.id}/assign`}
                              className="inline-flex rounded-2xl border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-900 transition hover:border-stone-900"
                            >
                              שיוך משתמשים
                            </Link>
                          </div>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
