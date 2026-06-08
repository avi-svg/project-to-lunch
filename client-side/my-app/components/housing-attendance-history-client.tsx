"use client";

import { useState, useEffect } from "react";
import type { BackendDirectoryUser } from "@/lib/server-users";

const STORAGE_KEY_PREFIX = "housing-attendance";
const SESSION_KEY = "housing-history-granted";

type PersistedResidentState = {
  attendance: "present" | "absent" | null;
  allOk: boolean | null;
  notes: string;
  apartment: string;
};

type DayRecord = {
  date: string;
  entries: Record<string, PersistedResidentState>;
};

function loadAllRecords(): DayRecord[] {
  const records: DayRecord[] = [];
  const prefix = `${STORAGE_KEY_PREFIX}-`;

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(prefix)) continue;
    const date = key.slice(prefix.length);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const entries = JSON.parse(raw) as Record<string, PersistedResidentState>;
      records.push({ date, entries });
    } catch {
      // skip malformed entries
    }
  }

  return records.sort((a, b) => b.date.localeCompare(a.date));
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

function statusLabel(s: PersistedResidentState) {
  if (s.attendance === "present" && s.allOk === true) return "נוכח · הכל בסדר";
  if (s.attendance === "present" && s.allOk === false) return "נוכח · יש בעיה";
  if (s.attendance === "present") return "נוכח";
  if (s.attendance === "absent") return "לא נוכח";
  return "לא דווח";
}

function statusColor(s: PersistedResidentState) {
  if (s.attendance === "present" && s.allOk === false)
    return "bg-amber-100 text-amber-800";
  if (s.attendance === "present") return "bg-emerald-100 text-emerald-800";
  if (s.attendance === "absent") return "bg-red-100 text-red-700";
  return "bg-stone-100 text-stone-500";
}

type Props = { residents: BackendDirectoryUser[] };

export function HousingAttendanceHistoryClient({ residents }: Props) {
  const [granted, setGranted] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [records, setRecords] = useState<DayRecord[]>([]);
  const [view, setView] = useState<"date" | "resident">("date");
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [expandedResident, setExpandedResident] = useState<string | null>(null);

  useEffect(() => {
    setIsHydrated(true);
    if (sessionStorage.getItem(SESSION_KEY) === "true") {
      setGranted(true);
      setRecords(loadAllRecords());
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) {
      setError("הסיסמה נדרשת.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/housing-attendance/verify-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = (await res.json()) as { granted?: boolean; message?: string };

      if (!res.ok || !data.granted) {
        setError(data.message ?? "שגיאה לא צפויה.");
        return;
      }

      sessionStorage.setItem(SESSION_KEY, "true");
      setGranted(true);
      setRecords(loadAllRecords());
    } catch {
      setError("לא ניתן לאמת את הסיסמה כרגע.");
    } finally {
      setLoading(false);
    }
  }

  const residentById = new Map(residents.map((r) => [r.id, r]));

  function residentName(id: string) {
    const r = residentById.get(id);
    return r?.name ?? r?.email ?? id;
  }

  // Collect all resident IDs that appear across all records
  const allResidentIds = [
    ...new Set(records.flatMap((r) => Object.keys(r.entries))),
  ];

  if (!isHydrated) {
    return (
      <section className="overflow-hidden rounded-[2rem] border border-stone-200 bg-white shadow-sm">
        <div className="bg-[linear-gradient(135deg,#1c1917,#57534e)] px-8 py-10 text-white">
          <p className="text-sm font-semibold tracking-[0.25em] text-stone-300">
            היסטוריה
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            דיווחים קודמים
          </h1>
          <p className="mt-4 text-sm leading-7 text-stone-300">טוען…</p>
        </div>
      </section>
    );
  }

  if (!granted) {
    return (
      <div className="space-y-6">
        <section className="overflow-hidden rounded-[2rem] border border-stone-200 bg-white shadow-sm">
          <div className="bg-[linear-gradient(135deg,#1c1917,#57534e)] px-8 py-10 text-white">
            <p className="text-sm font-semibold tracking-[0.25em] text-stone-300">
              היסטוריה
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight">
              דיווחים קודמים
            </h1>
            <p className="mt-4 text-sm leading-7 text-stone-300">
              צפייה בדיווחי הנוכחות של הימים הקודמים.
            </p>
          </div>
        </section>

        <section className="rounded-[2rem] border border-stone-200 bg-white p-8 shadow-sm">
          <div className="mx-auto max-w-sm">
            <p className="mb-6 text-center text-sm font-semibold tracking-[0.2em] text-stone-500">
              נדרשת סיסמה לצפייה
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block space-y-2">
                <span className="text-sm font-medium text-stone-700">
                  הסיסמה האישית שלך למערכת
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError("");
                  }}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full rounded-2xl border border-stone-300 px-4 py-3 text-center text-lg tracking-[0.3em] outline-none transition focus:border-stone-900"
                />
              </label>

              {error && (
                <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading || !password}
                className="w-full rounded-2xl bg-stone-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:bg-stone-400"
              >
                {loading ? "בודק…" : "כניסה"}
              </button>
            </form>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] border border-stone-200 bg-white shadow-sm">
        <div className="bg-[linear-gradient(135deg,#1c1917,#57534e)] px-8 py-10 text-white">
          <p className="text-sm font-semibold tracking-[0.25em] text-stone-300">
            היסטוריה
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            דיווחים קודמים
          </h1>
          <p className="mt-4 text-sm leading-7 text-stone-300">
            {records.length} ימים מדווחים נמצאו.
          </p>
        </div>
      </section>

      {records.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-5 py-10 text-center text-sm text-stone-500">
          לא נמצאו דיווחים שמורים בדפדפן זה.
        </div>
      ) : (
        <>
          {/* Tab switcher */}
          <div className="flex rounded-2xl border border-stone-200 bg-white p-1.5 shadow-sm">
            <button
              type="button"
              onClick={() => setView("date")}
              className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition ${
                view === "date"
                  ? "bg-stone-900 text-white"
                  : "text-stone-600 hover:text-stone-900"
              }`}
            >
              לפי תאריך
            </button>
            <button
              type="button"
              onClick={() => setView("resident")}
              className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition ${
                view === "resident"
                  ? "bg-stone-900 text-white"
                  : "text-stone-600 hover:text-stone-900"
              }`}
            >
              לפי דייר
            </button>
          </div>

          {/* By date */}
          {view === "date" && (
            <div className="space-y-3">
              {records.map((record) => {
                const isOpen = expandedDate === record.date;
                const entries = Object.entries(record.entries);
                const presentCount = entries.filter(
                  ([, s]) => s.attendance === "present",
                ).length;
                const absentCount = entries.filter(
                  ([, s]) => s.attendance === "absent",
                ).length;

                return (
                  <div
                    key={record.date}
                    className="overflow-hidden rounded-[2rem] border border-stone-200 bg-white shadow-sm"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedDate(isOpen ? null : record.date)
                      }
                      className="flex w-full items-center justify-between gap-4 px-6 py-5 text-right transition hover:bg-stone-50"
                    >
                      <div>
                        <p className="font-semibold text-stone-900">
                          {formatDate(record.date)}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-2 text-xs">
                          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-emerald-800">
                            נוכחים: {presentCount}
                          </span>
                          <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-red-700">
                            לא נוכחים: {absentCount}
                          </span>
                          <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-stone-600">
                            לא דווח:{" "}
                            {entries.length - presentCount - absentCount}
                          </span>
                        </div>
                      </div>
                      <span
                        className="shrink-0 text-stone-400 transition-transform"
                        style={{
                          display: "inline-block",
                          transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                        }}
                      >
                        ▾
                      </span>
                    </button>

                    {isOpen && (
                      <div className="border-t border-stone-100">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-stone-100 bg-stone-50 text-xs font-semibold uppercase tracking-wide text-stone-400">
                              <th className="px-6 py-3 text-right">דייר</th>
                              <th className="px-6 py-3 text-right">סטטוס</th>
                              <th className="px-6 py-3 text-right">דירה</th>
                              <th className="px-6 py-3 text-right">פרטים</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-stone-100">
                            {entries.map(([userId, state]) => (
                              <tr key={userId} className="hover:bg-stone-50">
                                <td className="px-6 py-3 font-medium text-stone-900">
                                  {residentName(userId)}
                                </td>
                                <td className="px-6 py-3">
                                  <span
                                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColor(state)}`}
                                  >
                                    {statusLabel(state)}
                                  </span>
                                </td>
                                <td className="px-6 py-3 text-stone-500">
                                  {state.apartment || "—"}
                                </td>
                                <td className="px-6 py-3 text-stone-500">
                                  {state.notes || "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* By resident */}
          {view === "resident" && (
            <div className="space-y-3">
              {allResidentIds.map((userId) => {
                const isOpen = expandedResident === userId;
                const history = records
                  .map((r) => ({ date: r.date, state: r.entries[userId] }))
                  .filter((h) => h.state !== undefined);

                const lastPresent = history.find(
                  (h) => h.state?.attendance === "present",
                );

                return (
                  <div
                    key={userId}
                    className="overflow-hidden rounded-[2rem] border border-stone-200 bg-white shadow-sm"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedResident(isOpen ? null : userId)
                      }
                      className="flex w-full items-center justify-between gap-4 px-6 py-5 text-right transition hover:bg-stone-50"
                    >
                      <div>
                        <p className="font-semibold text-stone-900">
                          {residentName(userId)}
                        </p>
                        <p className="mt-1 text-xs text-stone-400">
                          {history.length} ימים מדווחים
                          {lastPresent
                            ? ` · נוכח לאחרונה ${formatDate(lastPresent.date)}`
                            : ""}
                        </p>
                      </div>
                      <span
                        className="shrink-0 text-stone-400 transition-transform"
                        style={{
                          display: "inline-block",
                          transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                        }}
                      >
                        ▾
                      </span>
                    </button>

                    {isOpen && (
                      <div className="border-t border-stone-100">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-stone-100 bg-stone-50 text-xs font-semibold uppercase tracking-wide text-stone-400">
                              <th className="px-6 py-3 text-right">תאריך</th>
                              <th className="px-6 py-3 text-right">סטטוס</th>
                              <th className="px-6 py-3 text-right">דירה</th>
                              <th className="px-6 py-3 text-right">פרטים</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-stone-100">
                            {history.map(({ date, state }) => (
                              <tr key={date} className="hover:bg-stone-50">
                                <td className="px-6 py-3 font-medium text-stone-900">
                                  {formatDate(date)}
                                </td>
                                <td className="px-6 py-3">
                                  <span
                                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColor(state)}`}
                                  >
                                    {statusLabel(state)}
                                  </span>
                                </td>
                                <td className="px-6 py-3 text-stone-500">
                                  {state.apartment || "—"}
                                </td>
                                <td className="px-6 py-3 text-stone-500">
                                  {state.notes || "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
