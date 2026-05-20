"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import {
  defaultShiftSettings,
  getAvailabilityForStaff,
  staffMembers,
  STAFF_SHIFT_SETTINGS_STORAGE_KEY,
  type OneTimeStaffShiftRule,
  type ShiftRuleMode,
  type StaffShiftSettings,
  type WeeklyStaffShiftRule,
  WORKING_DAYS,
} from "@/lib/staff-zone";

const weekdayLabels: Record<number, string> = {
  0: "ראשון",
  1: "שני",
  2: "שלישי",
  3: "רביעי",
  4: "חמישי",
  5: "שישי",
  6: "שבת",
};

type WeeklyRuleForm = {
  dayOfWeek: string;
  mode: ShiftRuleMode;
  startTime: string;
  endTime: string;
};

type OneTimeRuleForm = {
  date: string;
  mode: ShiftRuleMode;
  startTime: string;
  endTime: string;
};

const initialWeeklyRuleForm: WeeklyRuleForm = {
  dayOfWeek: "0",
  mode: "working",
  startTime: "09:00",
  endTime: "17:00",
};

const initialOneTimeRuleForm: OneTimeRuleForm = {
  date: "",
  mode: "not-working",
  startTime: "09:00",
  endTime: "17:00",
};

function readShiftSettings() {
  if (typeof window === "undefined") {
    return defaultShiftSettings;
  }

  const raw = window.localStorage.getItem(STAFF_SHIFT_SETTINGS_STORAGE_KEY);

  if (!raw) {
    return defaultShiftSettings;
  }

  try {
    const parsed = JSON.parse(raw) as StaffShiftSettings;
    return {
      meetingDurationMinutes:
        parsed.meetingDurationMinutes || defaultShiftSettings.meetingDurationMinutes,
      weeklyRules: Array.isArray(parsed.weeklyRules)
        ? parsed.weeklyRules
        : defaultShiftSettings.weeklyRules,
      oneTimeRules: Array.isArray(parsed.oneTimeRules)
        ? parsed.oneTimeRules
        : defaultShiftSettings.oneTimeRules,
    } satisfies StaffShiftSettings;
  } catch {
    return defaultShiftSettings;
  }
}

function writeShiftSettings(settings: StaffShiftSettings) {
  window.localStorage.setItem(STAFF_SHIFT_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("he-IL", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatMode(mode: ShiftRuleMode) {
  return mode === "working" ? "עובד" : "לא עובד";
}

export function StaffShiftsClient() {
  const isHydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [selectedStaffId, setSelectedStaffId] = useState(staffMembers[0]?.id ?? "");
  const [settings, setSettings] = useState<StaffShiftSettings>(() => readShiftSettings());
  const [weeklyRuleForm, setWeeklyRuleForm] =
    useState<WeeklyRuleForm>(initialWeeklyRuleForm);
  const [oneTimeRuleForm, setOneTimeRuleForm] =
    useState<OneTimeRuleForm>(initialOneTimeRuleForm);
  const [successMessage, setSuccessMessage] = useState("");

  const selectedStaff = useMemo(
    () => staffMembers.find((member) => member.id === selectedStaffId) ?? staffMembers[0] ?? null,
    [selectedStaffId],
  );

  const weeklyRules = useMemo(
    () =>
      settings.weeklyRules
        .filter((rule) => rule.staffMemberId === selectedStaffId)
        .sort((a, b) =>
          a.dayOfWeek === b.dayOfWeek
            ? a.startTime.localeCompare(b.startTime)
            : a.dayOfWeek - b.dayOfWeek,
        ),
    [selectedStaffId, settings.weeklyRules],
  );

  const oneTimeRules = useMemo(
    () =>
      settings.oneTimeRules
        .filter((rule) => rule.staffMemberId === selectedStaffId)
        .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`)),
    [selectedStaffId, settings.oneTimeRules],
  );

  const previewSlots = useMemo(
    () => getAvailabilityForStaff(selectedStaffId, settings).slice(0, 10),
    [selectedStaffId, settings],
  );

  function persistSettings(nextSettings: StaffShiftSettings, message: string) {
    setSettings(nextSettings);
    writeShiftSettings(nextSettings);
    setSuccessMessage(message);
  }

  function addWeeklyRule() {
    const nextRule: WeeklyStaffShiftRule = {
      id: `weekly-${Date.now()}`,
      staffMemberId: selectedStaffId,
      dayOfWeek: Number(weeklyRuleForm.dayOfWeek),
      mode: weeklyRuleForm.mode,
      startTime: weeklyRuleForm.startTime,
      endTime: weeklyRuleForm.endTime,
    };

    const nextSettings = {
      ...settings,
      weeklyRules: [...settings.weeklyRules, nextRule],
    };

    persistSettings(nextSettings, "החוק השבועי נשמר בהצלחה.");
    setWeeklyRuleForm(initialWeeklyRuleForm);
  }

  function addOneTimeRule() {
    const nextRule: OneTimeStaffShiftRule = {
      id: `one-time-${Date.now()}`,
      staffMemberId: selectedStaffId,
      date: oneTimeRuleForm.date,
      mode: oneTimeRuleForm.mode,
      startTime: oneTimeRuleForm.startTime,
      endTime: oneTimeRuleForm.endTime,
    };

    const nextSettings = {
      ...settings,
      oneTimeRules: [...settings.oneTimeRules, nextRule],
    };

    persistSettings(nextSettings, "החריגה החד-פעמית נשמרה בהצלחה.");
    setOneTimeRuleForm(initialOneTimeRuleForm);
  }

  function removeWeeklyRule(ruleId: string) {
    const nextSettings = {
      ...settings,
      weeklyRules: settings.weeklyRules.filter((rule) => rule.id !== ruleId),
    };

    persistSettings(nextSettings, "החוק השבועי הוסר.");
  }

  function removeOneTimeRule(ruleId: string) {
    const nextSettings = {
      ...settings,
      oneTimeRules: settings.oneTimeRules.filter((rule) => rule.id !== ruleId),
    };

    persistSettings(nextSettings, "החריגה החד-פעמית הוסרה.");
  }

  if (!isHydrated) {
    return (
      <div className="space-y-8">
        <section className="overflow-hidden rounded-[2rem] border border-stone-200 bg-white shadow-sm">
          <div className="bg-[linear-gradient(135deg,#1c1917,#57534e)] px-8 py-10 text-white">
            <p className="text-sm font-semibold tracking-[0.25em] text-stone-300">
              אזור משמרות צוות
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight">
              הגדרת שעות עבודה וזמינות
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-stone-300">
              טוען את הגדרות המשמרות והחריגים.
            </p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[2rem] border border-stone-200 bg-white shadow-sm">
        <div className="bg-[linear-gradient(135deg,#1c1917,#57534e)] px-8 py-10 text-white">
          <p className="text-sm font-semibold tracking-[0.25em] text-stone-300">
            אזור משמרות צוות
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            הגדרת שעות עבודה וזמינות
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-stone-300">
            כאן מגדירים שעות שבהן איש הצוות עובד או לא עובד. הזמינות שנוצרת כאן
            היא הבסיס לפגישות במערכת, בחלונות של 45 דקות.
          </p>
        </div>
      </section>

      <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold tracking-[0.2em] text-stone-500">
              בחירת איש צוות
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-stone-900">
              עריכת משמרות ושעות
            </h2>
          </div>
          <span className="rounded-full bg-stone-100 px-4 py-2 text-sm text-stone-700">
            משך פגישה: {settings.meetingDurationMinutes} דקות
          </span>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {staffMembers.map((member) => (
            <button
              key={member.id}
              type="button"
              onClick={() => {
                setSelectedStaffId(member.id);
                setSuccessMessage("");
              }}
              className={`rounded-3xl border p-5 text-right transition ${
                member.id === selectedStaffId
                  ? "border-stone-900 bg-stone-900 text-white"
                  : "border-stone-200 bg-stone-50 text-stone-900 hover:border-stone-900"
              }`}
            >
              <p className="text-lg font-semibold">{member.name}</p>
              <p className="mt-2 text-sm opacity-80">{member.title}</p>
            </button>
          ))}
        </div>

        {successMessage ? (
          <p className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {successMessage}
          </p>
        ) : null}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-6">
          <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
            <div className="mb-5">
              <p className="text-sm font-semibold tracking-[0.2em] text-stone-500">
                חוקים שבועיים
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-stone-900">
                {selectedStaff?.name}
              </h2>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <label className="block space-y-2">
                <span className="text-sm font-medium text-stone-700">יום</span>
                <select
                  value={weeklyRuleForm.dayOfWeek}
                  onChange={(event) =>
                    setWeeklyRuleForm((current) => ({
                      ...current,
                      dayOfWeek: event.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-stone-300 px-4 py-3 outline-none transition focus:border-stone-900"
                >
                  {WORKING_DAYS.map((day) => (
                    <option key={day} value={day}>
                      {weekdayLabels[day]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-stone-700">סוג</span>
                <select
                  value={weeklyRuleForm.mode}
                  onChange={(event) =>
                    setWeeklyRuleForm((current) => ({
                      ...current,
                      mode: event.target.value as ShiftRuleMode,
                    }))
                  }
                  className="w-full rounded-2xl border border-stone-300 px-4 py-3 outline-none transition focus:border-stone-900"
                >
                  <option value="working">עובד</option>
                  <option value="not-working">לא עובד</option>
                </select>
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-stone-700">התחלה</span>
                <input
                  type="time"
                  value={weeklyRuleForm.startTime}
                  onChange={(event) =>
                    setWeeklyRuleForm((current) => ({
                      ...current,
                      startTime: event.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-stone-300 px-4 py-3 outline-none transition focus:border-stone-900"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-stone-700">סיום</span>
                <input
                  type="time"
                  value={weeklyRuleForm.endTime}
                  onChange={(event) =>
                    setWeeklyRuleForm((current) => ({
                      ...current,
                      endTime: event.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-stone-300 px-4 py-3 outline-none transition focus:border-stone-900"
                />
              </label>
            </div>

            <button
              type="button"
              onClick={addWeeklyRule}
              disabled={weeklyRuleForm.endTime <= weeklyRuleForm.startTime}
              className="mt-5 w-full rounded-2xl bg-stone-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:bg-stone-400"
            >
              הוסף חוק שבועי
            </button>

            <div className="mt-6 space-y-3">
              {weeklyRules.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-5 text-sm text-stone-600">
                  עדיין לא הוגדרו חוקים שבועיים.
                </div>
              ) : (
                weeklyRules.map((rule) => (
                  <article
                    key={rule.id}
                    className="flex items-center justify-between gap-4 rounded-2xl border border-stone-200 bg-stone-50 p-4"
                  >
                    <div className="text-sm text-stone-700">
                      <p className="font-semibold text-stone-900">
                        {weekdayLabels[rule.dayOfWeek]} | {formatMode(rule.mode)}
                      </p>
                      <p className="mt-1">
                        {rule.startTime} - {rule.endTime}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeWeeklyRule(rule.id)}
                      className="rounded-2xl border border-red-300 px-4 py-2 text-sm font-medium text-red-700 transition hover:border-red-500 hover:text-red-800"
                    >
                      הסר
                    </button>
                  </article>
                ))
              )}
            </div>
          </section>

          <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
            <div className="mb-5">
              <p className="text-sm font-semibold tracking-[0.2em] text-stone-500">
                חריגה חד-פעמית
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-stone-900">
                שעות ספציפיות לתאריך מסוים
              </h2>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <label className="block space-y-2">
                <span className="text-sm font-medium text-stone-700">תאריך</span>
                <input
                  type="date"
                  value={oneTimeRuleForm.date}
                  onChange={(event) =>
                    setOneTimeRuleForm((current) => ({
                      ...current,
                      date: event.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-stone-300 px-4 py-3 outline-none transition focus:border-stone-900"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-stone-700">סוג</span>
                <select
                  value={oneTimeRuleForm.mode}
                  onChange={(event) =>
                    setOneTimeRuleForm((current) => ({
                      ...current,
                      mode: event.target.value as ShiftRuleMode,
                    }))
                  }
                  className="w-full rounded-2xl border border-stone-300 px-4 py-3 outline-none transition focus:border-stone-900"
                >
                  <option value="working">עובד</option>
                  <option value="not-working">לא עובד</option>
                </select>
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-stone-700">התחלה</span>
                <input
                  type="time"
                  value={oneTimeRuleForm.startTime}
                  onChange={(event) =>
                    setOneTimeRuleForm((current) => ({
                      ...current,
                      startTime: event.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-stone-300 px-4 py-3 outline-none transition focus:border-stone-900"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-stone-700">סיום</span>
                <input
                  type="time"
                  value={oneTimeRuleForm.endTime}
                  onChange={(event) =>
                    setOneTimeRuleForm((current) => ({
                      ...current,
                      endTime: event.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-stone-300 px-4 py-3 outline-none transition focus:border-stone-900"
                />
              </label>
            </div>

            <button
              type="button"
              onClick={addOneTimeRule}
              disabled={
                !oneTimeRuleForm.date ||
                oneTimeRuleForm.endTime <= oneTimeRuleForm.startTime
              }
              className="mt-5 w-full rounded-2xl bg-stone-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:bg-stone-400"
            >
              הוסף חריגה חד-פעמית
            </button>

            <div className="mt-6 space-y-3">
              {oneTimeRules.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-5 text-sm text-stone-600">
                  עדיין לא הוגדרו חריגות חד-פעמיות.
                </div>
              ) : (
                oneTimeRules.map((rule) => (
                  <article
                    key={rule.id}
                    className="flex items-center justify-between gap-4 rounded-2xl border border-stone-200 bg-stone-50 p-4"
                  >
                    <div className="text-sm text-stone-700">
                      <p className="font-semibold text-stone-900">
                        {rule.date} | {formatMode(rule.mode)}
                      </p>
                      <p className="mt-1">
                        {rule.startTime} - {rule.endTime}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeOneTimeRule(rule.id)}
                      className="rounded-2xl border border-red-300 px-4 py-2 text-sm font-medium text-red-700 transition hover:border-red-500 hover:text-red-800"
                    >
                      הסר
                    </button>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
            <div className="mb-5">
              <p className="text-sm font-semibold tracking-[0.2em] text-stone-500">
                תצוגה מקדימה
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-stone-900">
                הזמינות הקרובה של {selectedStaff?.name}
              </h2>
            </div>

            {previewSlots.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-sm text-stone-600">
                לפי ההגדרות הנוכחיות אין עדיין חלונות זמינות קרובים.
              </div>
            ) : (
              <div className="space-y-3">
                {previewSlots.map((slot) => (
                  <article
                    key={slot.id}
                    className="rounded-2xl border border-stone-200 bg-stone-50 p-4 text-sm text-stone-700"
                  >
                    <p className="font-semibold text-stone-900">
                      {formatDateTime(slot.startTime)}
                    </p>
                    <p className="mt-1 text-xs text-stone-500">
                      עד {formatDateTime(slot.endTime)}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-semibold tracking-[0.2em] text-stone-500">
              חוקים שנקבעו
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-stone-900">
              עקרונות העבודה שהוגדרו
            </h2>
            <ul className="mt-5 space-y-3 text-sm leading-6 text-stone-600">
              <li>ימי העבודה הנתמכים כרגע הם ראשון עד חמישי.</li>
              <li>אורך פגישה שממנו נגזרת הזמינות הוא 45 דקות.</li>
              <li>אפשר להגדיר גם שעות עבודה וגם שעות אי-עבודה.</li>
              <li>אפשר ליצור חריגה חד-פעמית לתאריך ספציפי.</li>
              <li>בשלב זה כל איש צוות יכול לערוך את שעותיהם של אנשי צוות אחרים.</li>
            </ul>
          </section>
        </div>
      </section>
    </div>
  );
}
