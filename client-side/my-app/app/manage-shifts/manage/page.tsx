import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { authOptions } from "@/auth";
import { BackendShiftsError, fetchWeekShiftsForUser } from "@/lib/server-shifts";
import type { Shift } from "@/lib/shifts";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type PageProps = {
  searchParams?: Promise<{
    view?: string;
    date?: string;
    debug?: string;
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

function isInDisplayMonth(value: string | Date, monthDate: Date) {
  return toDisplayMonthKey(value) === toDisplayMonthKey(monthDate);
}

function createCalendarDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
}

function getDisplayToday() {
  const { year, month, day } = getDatePartsInDisplayTimeZone(new Date());
  return createCalendarDate(Number(year), Number(month), Number(day));
}

function getWeekStartSunday(date = new Date()) {
  const copy = new Date(date);
  const day = copy.getUTCDay();
  const diff = -day;
  copy.setUTCDate(copy.getUTCDate() + diff);
  copy.setUTCHours(12, 0, 0, 0);
  return copy;
}

function getMonthStart(date = new Date()) {
  const copy = new Date(date);
  copy.setUTCDate(1);
  copy.setUTCHours(12, 0, 0, 0);
  return copy;
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function addMonths(date: Date, months: number) {
  const copy = new Date(date);
  copy.setUTCMonth(copy.getUTCMonth() + months);
  return copy;
}

function parseView(value?: string): CalendarView {
  return value === "month" ? "month" : "week";
}

function parseCalendarDate(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return getDisplayToday();
  }

  const [year, month, day] = value.split("-").map(Number);
  const parsedDate = createCalendarDate(year, month, day);

  if (Number.isNaN(parsedDate.getTime())) {
    return getDisplayToday();
  }

  return parsedDate;
}

function toDateParam(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function CalendarNavButton({
  action,
  view,
  date,
  debugEnabled,
  className,
  children,
}: {
  action: string;
  view: CalendarView;
  date: Date;
  debugEnabled: boolean;
  className: string;
  children: ReactNode;
}) {
  return (
    <form action={action} method="get" className="contents">
      <input type="hidden" name="view" value={view} />
      <input type="hidden" name="date" value={toDateParam(date)} />
      {debugEnabled ? <input type="hidden" name="debug" value="1" /> : null}
      <button
        type="submit"
        className={`${className} relative z-10 cursor-pointer pointer-events-auto`}
      >
        {children}
      </button>
    </form>
  );
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

function filterShiftsToSelectedWeek(shifts: Shift[], weekStart: Date) {
  const allowedDates = new Set<string>();

  for (let offset = 0; offset < 7; offset += 1) {
    allowedDates.add(toDateParam(addDays(weekStart, offset)));
  }

  return shifts.filter((shift) => allowedDates.has(toDisplayDateParam(shift.startTime)));
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

function getPendingCount(shift: Shift) {
  return shift.registrations?.filter((registration) => registration.status === "pending")
    .length ?? 0;
}

function getApprovedCount(shift: Shift) {
  return shift.registrations?.filter((registration) => registration.status === "approved")
    .length ?? 0;
}

export default async function ManageShiftsOverviewPage({ searchParams }: PageProps) {
  await connection();
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/");
  }

  if (session.user.role !== "staff") {
    redirect("/dashboard");
  }

  const resolvedSearchParams = await searchParams;
  const view = parseView(resolvedSearchParams?.view);
  const selectedDate = parseCalendarDate(resolvedSearchParams?.date);
  const debugEnabled = resolvedSearchParams?.debug === "1";
  const today = getDisplayToday();
  const currentWeekStart = getWeekStartSunday(selectedDate);
  const monthStart = getMonthStart(selectedDate);
  let shifts: Shift[] = [];
  let errorMessage = "";
  let responseWeekStart = "";
  let responseWeekEnd = "";

  try {
    if (view === "month") {
      shifts = await fetchMonthShiftsForUser(session.user.id, monthStart);
    } else {
      const weekResponse = await fetchWeekShiftsForUser(
        session.user.id,
        toDateParam(selectedDate),
      );

      responseWeekStart = weekResponse.weekStart;
      responseWeekEnd = weekResponse.weekEnd;
      shifts = filterShiftsToSelectedWeek(weekResponse.shifts, currentWeekStart);
    }
  } catch (error) {
    errorMessage =
      error instanceof BackendShiftsError
        ? error.message
        : "לא ניתן לטעון את התורנויות כרגע.";
  }

  const weekStart = currentWeekStart;
  const previousDate =
    view === "month" ? addMonths(monthStart, -1) : addDays(weekStart, -7);
  const nextDate =
    view === "month" ? addMonths(monthStart, 1) : addDays(weekStart, 7);
  const weekViewDate = getWeekStartSunday(selectedDate);
  const currentViewDate = view === "month" ? today : getWeekStartSunday(today);
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
              ניהול תורנויות
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight">
              בוחרים תורנות מתוך הלוח
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-stone-300">
              המסך הזה מרכז את כל התורנויות בפורמט של לוח שנה. כל כרטיס מוביל לעמוד
              ניהול תורנות מפורט עם תורנים, פרטים, עריכה ושיבוצים.
            </p>
          </div>

          <div className="relative z-10 flex flex-col gap-4 border-t border-stone-200 bg-stone-50 p-6">
            <div className="relative z-10 flex flex-wrap gap-3">
              <CalendarNavButton
                action="/manage-shifts/manage"
                view="week"
                date={weekViewDate}
                debugEnabled={debugEnabled}
                className={`inline-flex rounded-2xl px-5 py-3 text-sm font-medium transition ${
                  view === "week"
                    ? "bg-stone-900 text-white"
                    : "border border-stone-300 bg-white text-stone-900 hover:border-stone-900"
                }`}
              >
                תצוגה שבועית
              </CalendarNavButton>
              <CalendarNavButton
                action="/manage-shifts/manage"
                view="month"
                date={selectedDate}
                debugEnabled={debugEnabled}
                className={`inline-flex rounded-2xl px-5 py-3 text-sm font-medium transition ${
                  view === "month"
                    ? "bg-stone-900 text-white"
                    : "border border-stone-300 bg-white text-stone-900 hover:border-stone-900"
                }`}
              >
                תצוגה חודשית
              </CalendarNavButton>
              <Link
                href="/manage-shifts/create"
                className="inline-flex rounded-2xl border border-stone-900 bg-white px-5 py-3 text-sm font-medium text-stone-900 transition hover:bg-stone-100"
              >
                יצירת תורנות חדשה
              </Link>
            </div>

            <div className="relative z-10 grid gap-4 lg:grid-cols-[auto_minmax(0,1fr)_auto_auto]">
              <CalendarNavButton
                action="/manage-shifts/manage"
                view={view}
                date={previousDate}
                debugEnabled={debugEnabled}
                className="inline-flex items-center justify-center rounded-2xl border border-stone-300 bg-white px-5 py-4 text-sm font-medium text-stone-900 transition hover:border-stone-900"
              >
                {view === "month" ? "חודש קודם" : "שבוע קודם"}
              </CalendarNavButton>

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

              <CalendarNavButton
                action="/manage-shifts/manage"
                view={view}
                date={currentViewDate}
                debugEnabled={debugEnabled}
                className="inline-flex items-center justify-center rounded-2xl border border-stone-300 bg-white px-5 py-4 text-sm font-medium text-stone-900 transition hover:border-stone-900"
              >
                {view === "month" ? "החודש הנוכחי" : "השבוע הנוכחי"}
              </CalendarNavButton>

              <CalendarNavButton
                action="/manage-shifts/manage"
                view={view}
                date={nextDate}
                debugEnabled={debugEnabled}
                className="inline-flex items-center justify-center rounded-2xl border border-stone-300 bg-white px-5 py-4 text-sm font-medium text-stone-900 transition hover:border-stone-900"
              >
                {view === "month" ? "החודש הבא" : "השבוע הבא"}
              </CalendarNavButton>
            </div>
          </div>
        </section>

        {debugEnabled ? (
          <section className="rounded-[2rem] border border-amber-300 bg-amber-50 p-6 text-sm text-amber-950">
            <p className="font-semibold">Debug</p>
            <p className="mt-2">query date: {resolvedSearchParams?.date ?? "(empty)"}</p>
            <p>selectedDate: {toDateParam(selectedDate)}</p>
            <p>requestedWeekStart: {toDateParam(currentWeekStart)}</p>
            <p>displayedWeekStart: {toDateParam(weekStart)}</p>
            <p>responseWeekStart: {responseWeekStart || "(month view)"}</p>
            <p>responseWeekEnd: {responseWeekEnd || "(month view)"}</p>
            <p>previousDate href date: {toDateParam(previousDate)}</p>
            <p>nextDate href date: {toDateParam(nextDate)}</p>
            <p>shifts count: {shifts.length}</p>
          </section>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <Link
            href="/manage-shifts"
            className="inline-flex rounded-2xl border border-stone-300 bg-white px-5 py-3 text-sm font-medium text-stone-900 transition hover:border-stone-900"
          >
            חזרה לבחירת מסלול
          </Link>
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

        {view === "month" ? (
          <section className="space-y-6">
            <div>
              <p className="text-sm font-semibold tracking-[0.2em] text-stone-500">
                תצוגה חודשית
              </p>
              <h2 className="mt-2 text-3xl font-semibold text-stone-900">
                בחירת תורנות מתוך החודש
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
                const inCurrentMonth = isInDisplayMonth(day, monthStart);

                return (
                  <article
                    key={dayKey}
                    className={`min-h-40 rounded-3xl border p-4 shadow-sm ${
                      inCurrentMonth
                        ? "border-stone-200 bg-white"
                        : "border-stone-200 bg-stone-50 text-stone-400"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-lg font-semibold">{day.getDate()}</p>
                      {dayShifts.length > 0 ? (
                        <span className="rounded-full bg-stone-900 px-2.5 py-1 text-xs font-semibold text-white">
                          {dayShifts.length}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-4 space-y-2 text-sm">
                      {dayShifts.length === 0 ? (
                        <p className="text-stone-400">אין תורנויות ביום הזה.</p>
                      ) : null}

                      {dayShifts.slice(0, 2).map((shift) => {
                        const pendingCount = getPendingCount(shift);

                        return (
                          <Link
                            key={shift.id}
                            href={`/manage-shifts/${shift.id}`}
                            className="block rounded-2xl bg-stone-100 px-3 py-2 text-stone-700 transition hover:bg-stone-200"
                          >
                            <p className="truncate font-medium">{shift.title}</p>
                            <p className="mt-1 text-xs">
                              {formatInDisplayTimeZone(shift.startTime, {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                            <p className="mt-2 text-xs text-stone-500">
                              {shift.reservedSlots}/{shift.capacity} משובצים
                              {pendingCount > 0 ? `, ${pendingCount} ממתינים` : ""}
                            </p>
                          </Link>
                        );
                      })}

                      {dayShifts.length > 2 ? (
                        <p className="text-xs text-stone-500">
                          ועוד {dayShifts.length - 2} תורנויות
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
                כל התורנויות
              </p>
              <h2 className="mt-2 text-3xl font-semibold text-stone-900">
                בוחרים תורנות לניהול מתוך השבוע
              </h2>
            </div>

            {groupedShifts.length === 0 && !errorMessage ? (
              <div className="rounded-[2rem] border border-dashed border-stone-300 bg-white p-8 text-sm text-stone-600 shadow-sm">
                עדיין לא נוצרו תורנויות לשבוע הזה.
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
                    {dayShifts.length} תורנויות
                  </span>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  {dayShifts.map((shift) => {
                    const pendingCount = getPendingCount(shift);
                    const approvedCount = getApprovedCount(shift);

                    return (
                      <Link
                        key={shift.id}
                        href={`/manage-shifts/${shift.id}`}
                        className="rounded-3xl border border-stone-200 bg-stone-50 p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-stone-400 hover:bg-white"
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

                          <span className="rounded-full bg-stone-900 px-3 py-1 text-xs font-semibold text-white">
                            לניהול
                          </span>
                        </div>

                        <div className="mt-4 space-y-2 text-sm text-stone-600">
                          {shift.location ? <p>מיקום: {shift.location}</p> : null}
                          {shift.description ? <p>{shift.description}</p> : null}
                          <p>
                            תפוסה: {shift.reservedSlots} מתוך {shift.capacity}
                          </p>
                          <p>
                            {approvedCount} מאושרים
                            {pendingCount > 0 ? `, ${pendingCount} ממתינים` : ""}
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
