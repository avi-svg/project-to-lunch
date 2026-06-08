"use client";

import { useState, useEffect } from "react";
import type { BackendDirectoryUser } from "@/lib/server-users";
import type { BackendApartment } from "@/lib/server-apartments";

const STORAGE_KEY_PREFIX = "housing-attendance";

type PersistedResidentState = {
  attendance: "present" | "absent" | null;
  allOk: boolean | null;
  notes: string;
  apartment: string;
};

type ResidentUiState = PersistedResidentState & {
  isEditExpanded: boolean;
  showAllOkPrompt: boolean;
  showAbsentForm: boolean;
  draftNotes: string;
};

function makeDefault(): ResidentUiState {
  return {
    attendance: null,
    allOk: null,
    notes: "",
    apartment: "",
    isEditExpanded: false,
    showAllOkPrompt: false,
    showAbsentForm: false,
    draftNotes: "",
  };
}

function todayDate() {
  return new Date().toLocaleDateString("en-CA");
}

function loadFromStorage(
  date: string,
  residents: BackendDirectoryUser[],
): Record<string, ResidentUiState> {
  const result: Record<string, ResidentUiState> = {};
  for (const r of residents) {
    result[r.id] = makeDefault();
  }
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}-${date}`);
    if (!raw) return result;
    const parsed = JSON.parse(raw) as Record<string, PersistedResidentState>;
    for (const r of residents) {
      const saved = parsed[r.id];
      if (saved) {
        result[r.id] = {
          ...makeDefault(),
          attendance: saved.attendance ?? null,
          allOk: saved.allOk ?? null,
          notes: saved.notes ?? "",
          apartment: saved.apartment ?? "",
          draftNotes: saved.notes ?? "",
        };
      }
    }
  } catch {
    // fall through to defaults
  }
  return result;
}

function saveToStorage(date: string, states: Record<string, ResidentUiState>) {
  try {
    const persisted: Record<string, PersistedResidentState> = {};
    for (const [id, s] of Object.entries(states)) {
      persisted[id] = {
        attendance: s.attendance,
        allOk: s.allOk,
        notes: s.notes,
        apartment: s.apartment,
      };
    }
    localStorage.setItem(
      `${STORAGE_KEY_PREFIX}-${date}`,
      JSON.stringify(persisted),
    );
  } catch {
    // ignore storage errors
  }
}

type Props = {
  residents: BackendDirectoryUser[];
  apartments: BackendApartment[];
  fetchError: string | null;
};

export function HousingAttendanceClient({ residents, apartments, fetchError }: Props) {
  const [selectedDate, setSelectedDate] = useState(todayDate);
  const [states, setStates] = useState<Record<string, ResidentUiState>>(() => {
    const initial: Record<string, ResidentUiState> = {};
    for (const r of residents) initial[r.id] = makeDefault();
    return initial;
  });
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
    setStates(loadFromStorage(todayDate(), residents));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isHydrated) return;
    setStates(loadFromStorage(selectedDate, residents));
  }, [selectedDate]); // eslint-disable-line react-hooks/exhaustive-deps

  function update(
    userId: string,
    patch: Partial<ResidentUiState>,
    persist = true,
  ) {
    setStates((prev) => {
      const next = {
        ...prev,
        [userId]: { ...(prev[userId] ?? makeDefault()), ...patch },
      };
      if (persist) saveToStorage(selectedDate, next);
      return next;
    });
  }

  function handlePresent(userId: string) {
    update(userId, {
      attendance: "present",
      allOk: null,
      showAllOkPrompt: true,
      showAbsentForm: false,
    });
  }

  function handleAllOk(userId: string, ok: boolean) {
    update(userId, { allOk: ok, showAllOkPrompt: false });
  }

  function handleAbsent(userId: string) {
    const current = states[userId] ?? makeDefault();
    update(
      userId,
      {
        attendance: "absent",
        allOk: null,
        showAllOkPrompt: false,
        showAbsentForm: true,
        draftNotes: current.notes,
      },
      true,
    );
  }

  function handleSaveNotes(userId: string) {
    const current = states[userId] ?? makeDefault();
    update(userId, { notes: current.draftNotes, showAbsentForm: false });
  }

  const totalPresent = Object.values(states).filter(
    (s) => s.attendance === "present",
  ).length;
  const totalAbsent = Object.values(states).filter(
    (s) => s.attendance === "absent",
  ).length;
  const totalUnmarked = residents.length - totalPresent - totalAbsent;

  if (!isHydrated) {
    return (
      <section className="overflow-hidden rounded-[2rem] border border-stone-200 bg-white shadow-sm">
        <div className="bg-[linear-gradient(135deg,#1c1917,#57534e)] px-8 py-10 text-white">
          <p className="text-sm font-semibold tracking-[0.25em] text-stone-300">
            דיווח נוכחות
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            נוכחות בדיור
          </h1>
          <p className="mt-4 text-sm leading-7 text-stone-300">טוען נתונים…</p>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] border border-stone-200 bg-white shadow-sm">
        <div className="bg-[linear-gradient(135deg,#1c1917,#57534e)] px-8 py-10 text-white">
          <p className="text-sm font-semibold tracking-[0.25em] text-stone-300">
            דיווח נוכחות
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            נוכחות בדיור
          </h1>
          <p className="mt-4 text-sm leading-7 text-stone-300">
            מלא את נוכחות הדיירים לפי תאריך. הנתונים נשמרים מקומית.
          </p>
        </div>
      </section>

      <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
        <label className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <span className="text-sm font-semibold text-stone-700 whitespace-nowrap">
            תאריך הדיווח
          </span>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-2xl border border-stone-300 px-4 py-2 text-sm outline-none transition focus:border-stone-900"
          />
        </label>

        {residents.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-800">
              נוכחים: {totalPresent}
            </span>
            <span className="rounded-full bg-red-100 px-3 py-1 text-red-800">
              לא נוכחים: {totalAbsent}
            </span>
            <span className="rounded-full bg-stone-100 px-3 py-1 text-stone-600">
              לא דווח: {totalUnmarked}
            </span>
          </div>
        )}
      </section>

      {fetchError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {fetchError}
        </div>
      ) : residents.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-5 py-8 text-center text-sm text-stone-500">
          אין דיירים במערכת כרגע.
        </div>
      ) : (
        <div className="space-y-4">
          {residents.map((resident) => {
            const s = states[resident.id] ?? makeDefault();
            const displayName = resident.name ?? resident.email;

            return (
              <article
                key={resident.id}
                className="rounded-[2rem] border border-stone-200 bg-white shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 px-6 pt-6 pb-4">
                  <div>
                    <p className="text-base font-semibold text-stone-900">
                      {displayName}
                    </p>
                    {resident.name && (
                      <p className="mt-0.5 text-sm text-stone-500">
                        {resident.email}
                      </p>
                    )}
                    {s.apartment && (
                      <p className="mt-1 text-xs text-stone-400">{s.apartment}</p>
                    )}
                  </div>

                  <AttendanceBadge state={s} />
                </div>

                <div className="border-t border-stone-100 px-6 py-4">
                  <button
                    type="button"
                    onClick={() =>
                      update(
                        resident.id,
                        { isEditExpanded: !s.isEditExpanded },
                        false,
                      )
                    }
                    className="flex items-center gap-2 text-sm font-medium text-stone-600 transition hover:text-stone-900"
                  >
                    <span
                      className={`transition-transform ${s.isEditExpanded ? "rotate-180" : ""}`}
                    >
                      ▾
                    </span>
                    עריכת פרטי הדייר
                  </button>

                  {s.isEditExpanded && (
                    <div className="mt-4 space-y-3 rounded-2xl border border-stone-100 bg-stone-50 p-4">
                      <label className="flex flex-col gap-1.5">
                        <span className="text-sm font-medium text-stone-700">
                          דירה
                        </span>
                        <select
                          value={s.apartment}
                          onChange={(e) =>
                            update(resident.id, { apartment: e.target.value })
                          }
                          className="rounded-2xl border border-stone-300 bg-white px-4 py-2.5 text-sm outline-none transition focus:border-stone-900"
                        >
                          <option value="">בחר דירה…</option>
                          {apartments.map((apt) => (
                            <option key={apt.id} value={apt.name}>
                              {apt.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  )}
                </div>

                <div className="border-t border-stone-100 px-6 py-4 space-y-4">
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => handlePresent(resident.id)}
                      className={`rounded-2xl border px-5 py-2.5 text-sm font-medium transition ${
                        s.attendance === "present"
                          ? "border-emerald-600 bg-emerald-600 text-white"
                          : "border-stone-300 bg-white text-stone-900 hover:border-emerald-600 hover:text-emerald-700"
                      }`}
                    >
                      נוכח בדיור
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAbsent(resident.id)}
                      className={`rounded-2xl border px-5 py-2.5 text-sm font-medium transition ${
                        s.attendance === "absent"
                          ? "border-red-600 bg-red-600 text-white"
                          : "border-stone-300 bg-white text-stone-900 hover:border-red-500 hover:text-red-600"
                      }`}
                    >
                      לא נוכח בדיור
                    </button>
                  </div>

                  {s.showAllOkPrompt && (
                    <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4">
                      <p className="mb-3 text-sm font-semibold text-stone-800">
                        הכל בסדר?
                      </p>
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => handleAllOk(resident.id, true)}
                          className="rounded-2xl border border-emerald-400 bg-emerald-50 px-5 py-2 text-sm font-medium text-emerald-800 transition hover:bg-emerald-100"
                        >
                          כן, הכל בסדר
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAllOk(resident.id, false)}
                          className="rounded-2xl border border-amber-400 bg-amber-50 px-5 py-2 text-sm font-medium text-amber-800 transition hover:bg-amber-100"
                        >
                          לא, יש בעיה
                        </button>
                      </div>
                    </div>
                  )}

                  {s.showAbsentForm && (
                    <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4 space-y-3">
                      <label className="block space-y-1.5">
                        <span className="text-sm font-medium text-stone-700">
                          פרטים נוספים
                        </span>
                        <textarea
                          value={s.draftNotes}
                          onChange={(e) =>
                            update(
                              resident.id,
                              { draftNotes: e.target.value },
                              false,
                            )
                          }
                          rows={3}
                          placeholder="למשל: יצא לחופשה, אשפוז, לינה חוץ…"
                          className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-stone-900 resize-none"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => handleSaveNotes(resident.id)}
                        className="rounded-2xl bg-stone-900 px-5 py-2 text-sm font-medium text-white transition hover:bg-stone-700"
                      >
                        שמור
                      </button>
                    </div>
                  )}

                  {s.attendance === "absent" &&
                    !s.showAbsentForm &&
                    s.notes && (
                      <p className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-600">
                        {s.notes}
                      </p>
                    )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AttendanceBadge({ state }: { state: ResidentUiState }) {
  if (state.attendance === "present" && state.allOk === true) {
    return (
      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
        נוכח · הכל בסדר
      </span>
    );
  }
  if (state.attendance === "present" && state.allOk === false) {
    return (
      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
        נוכח · יש בעיה
      </span>
    );
  }
  if (state.attendance === "present" && state.allOk === null) {
    return (
      <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-600">
        נוכח
      </span>
    );
  }
  if (state.attendance === "absent") {
    return (
      <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
        לא נוכח
      </span>
    );
  }
  return (
    <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-500">
      לא דווח
    </span>
  );
}
