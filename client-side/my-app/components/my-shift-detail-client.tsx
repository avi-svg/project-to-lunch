"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ShiftNotesBoard } from "@/components/shift-notes-board";
import { ShiftSwapRequestsClient } from "@/components/shift-swap-requests-client";
import {
  confirmShiftRegistration,
  createShiftSwapRequest,
  type Shift,
  type ShiftRegistrationStatus,
  type ShiftSwapRequest,
  type UserRole,
} from "@/lib/shifts";

type Props = {
  shift: Shift;
  currentUser: {
    id: string;
    name: string;
    role: UserRole;
  };
  initialShiftSwapRequests: ShiftSwapRequest[];
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

function formatRegistrationStatus(status: ShiftRegistrationStatus) {
  if (status === "approved") {
    return "השיבוץ שלך מאושר";
  }

  if (status === "pending") {
    return "השיבוץ שלך ממתין לאישור";
  }

  if (status === "rejected") {
    return "השיבוץ שלך נדחה";
  }

  return "השיבוץ שלך בוטל";
}

export function MyShiftDetailClient({
  shift,
  currentUser,
  initialShiftSwapRequests,
}: Props) {
  const [currentShift, setCurrentShift] = useState(shift);
  const [swapRequests, setSwapRequests] = useState(initialShiftSwapRequests);
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);
  const [isCreatingSwap, setIsCreatingSwap] = useState(false);
  const [isSwapFormOpen, setIsSwapFormOpen] = useState(false);
  const [swapReasonDraft, setSwapReasonDraft] = useState("");

  const myRegistration = currentShift.myRegistration;
  const activeRegistrations = useMemo(
    () =>
      (currentShift.registrations ?? []).filter(
        (registration) =>
          registration.status === "approved" || registration.status === "pending",
      ),
    [currentShift.registrations],
  );
  const activeOwnSwapRequest = useMemo(
    () =>
      swapRequests.find(
        (request) =>
          request.requesterUserId === currentUser.id &&
          (request.status === "pending" || request.status === "approved"),
      ) ?? null,
    [currentUser.id, swapRequests],
  );

  async function handleConfirmRegistration() {
    if (!myRegistration || isConfirming) {
      return;
    }

    setActionError("");
    setActionMessage("");
    setIsConfirming(true);

    try {
      const result = await confirmShiftRegistration(currentShift.id, myRegistration.id);
      setCurrentShift((current) => ({
        ...current,
        myRegistration: {
          id: result.registration.id,
          status: result.registration.status,
          createdAt: result.registration.createdAt,
          reviewedAt: result.registration.reviewedAt,
          reviewNote: result.registration.reviewNote,
        },
      }));
      setActionMessage("אישרת את התורנות בהצלחה.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "אישור התורנות נכשל.");
    } finally {
      setIsConfirming(false);
    }
  }

  async function handleCreateSwapRequest() {
    if (!swapReasonDraft.trim() || isCreatingSwap) {
      return;
    }

    setActionError("");
    setActionMessage("");
    setIsCreatingSwap(true);

    try {
      const result = await createShiftSwapRequest(currentShift.id, {
        reason: swapReasonDraft.trim(),
      });
      setSwapRequests((current) => [result.request, ...current]);
      setSwapReasonDraft("");
      setIsSwapFormOpen(false);
      setActionMessage("בקשת ההחלפה נשלחה בהצלחה.");
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "יצירת בקשת ההחלפה נכשלה.",
      );
    } finally {
      setIsCreatingSwap(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_24rem]">
      <section className="space-y-6">
        <section className="overflow-hidden rounded-[2rem] border border-stone-200 bg-white shadow-sm">
          <div className="bg-[linear-gradient(135deg,#1c1917,#57534e)] px-8 py-10 text-white">
            <p className="text-sm font-semibold tracking-[0.25em] text-stone-300">
              התורנות שלי
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight">{currentShift.title}</h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-stone-300">
              כאן רואים את פרטי התורנות, מי משתתף איתך, דיווח נוכחות, בקשות
              החלפה והערות חשובות לתורנות הזאת.
            </p>
          </div>

          <div className="grid gap-4 border-t border-stone-200 bg-stone-50 p-6 md:grid-cols-2">
            <div className="rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-sm text-stone-500">מועד התורנות</p>
              <p className="mt-2 text-lg font-semibold text-stone-900">
                {formatDateTime(currentShift.startTime)}
              </p>
              <p className="mt-1 text-sm text-stone-600">
                סיום: {formatDateTime(currentShift.endTime)}
              </p>
              {currentShift.location ? (
                <p className="mt-3 text-sm text-stone-600">
                  מיקום: {currentShift.location}
                </p>
              ) : null}
              {currentShift.description ? (
                <p className="mt-3 text-sm leading-7 text-stone-700">
                  {currentShift.description}
                </p>
              ) : null}
            </div>

            <div className="rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-sm text-stone-500">פעולות זמינות</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  href={`/shift-attendance?shiftId=${encodeURIComponent(currentShift.id)}`}
                  className="inline-flex rounded-2xl bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-700"
                >
                  מעבר לדיווח נוכחות
                </Link>
                <Link
                  href={`/shift-swap-requests?shiftId=${encodeURIComponent(currentShift.id)}`}
                  className="inline-flex rounded-2xl border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-900 transition hover:border-stone-900"
                >
                  מעבר לבקשות ההחלפה
                </Link>
              </div>

              {myRegistration ? (
                <p className="mt-4 text-sm text-stone-600">
                  {formatRegistrationStatus(myRegistration.status)}
                </p>
              ) : null}
            </div>
          </div>
        </section>

        {actionError ? (
          <section className="rounded-[2rem] border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 shadow-sm">
            {actionError}
          </section>
        ) : null}

        {actionMessage ? (
          <section className="rounded-[2rem] border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 shadow-sm">
            {actionMessage}
          </section>
        ) : null}

        {myRegistration?.status === "pending" ? (
          <section className="rounded-[2rem] border border-amber-200 bg-amber-50 p-6 shadow-sm">
            <p className="text-sm font-semibold tracking-[0.2em] text-amber-700">
              נדרש אישור
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-amber-950">
              צריך לאשר את ההשתתפות שלך בתורנות
            </h2>
            <p className="mt-2 text-sm leading-7 text-amber-900">
              אחרי האישור, התורנות תופיע אצלך כמלאה ותוכל גם לפרסם בקשת החלפה אם
              יהיה צורך.
            </p>
            <button
              type="button"
              onClick={handleConfirmRegistration}
              disabled={isConfirming}
              className="mt-5 inline-flex rounded-2xl bg-amber-700 px-5 py-3 text-sm font-medium text-white transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:bg-amber-300"
            >
              {isConfirming ? "מאשר..." : "אישור השתתפות בתורנות"}
            </button>
          </section>
        ) : null}

        <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold tracking-[0.2em] text-stone-500">
                משתתפים בתורנות
              </p>
              <h2 className="mt-2 text-3xl font-semibold text-stone-900">
                מי יהיה איתך בתורנות
              </h2>
            </div>
            <span className="rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white">
              {activeRegistrations.length} משתתפים
            </span>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {activeRegistrations.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-stone-300 bg-stone-50 px-6 py-10 text-center text-sm text-stone-600 md:col-span-2">
                עדיין אין משתתפים פעילים לתורנות הזאת.
              </div>
            ) : (
              activeRegistrations.map((registration) => (
                <article
                  key={registration.id}
                  className="rounded-3xl border border-stone-200 bg-stone-50 p-5"
                >
                  <p className="text-lg font-semibold text-stone-900">
                    {registration.user.name ?? "ללא שם"}
                    {registration.userId === currentUser.id ? " (את/ה)" : ""}
                  </p>
                  <p className="mt-1 text-sm text-stone-600">
                    {registration.user.email}
                  </p>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold tracking-[0.2em] text-stone-500">
                בקשת החלפה
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-stone-900">
                ניהול החלפה לתורנות הזאת
              </h2>
            </div>
          </div>

          {activeOwnSwapRequest ? (
            <div className="mt-5 rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm leading-7 text-amber-900">
              כבר קיימת בקשת החלפה פעילה לתורנות הזאת.
            </div>
          ) : myRegistration?.status === "approved" ? (
            <div className="mt-5 space-y-4">
              <button
                type="button"
                onClick={() => setIsSwapFormOpen((current) => !current)}
                className="inline-flex rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm font-medium text-stone-900 transition hover:border-stone-900"
              >
                {isSwapFormOpen ? "סגירת טופס ההחלפה" : "יצירת בקשת החלפה לתורנות"}
              </button>

              {isSwapFormOpen ? (
                <div className="rounded-3xl border border-stone-200 bg-stone-50 p-5">
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-stone-700">
                      למה צריך החלפה?
                    </span>
                    <textarea
                      value={swapReasonDraft}
                      onChange={(event) => setSwapReasonDraft(event.target.value)}
                      className="min-h-28 w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-stone-900"
                      placeholder="כתוב כאן בקצרה למה צריך מחליף/ה לתורנות הזאת."
                    />
                  </label>

                  <button
                    type="button"
                    onClick={handleCreateSwapRequest}
                    disabled={isCreatingSwap || swapReasonDraft.trim().length === 0}
                    className="mt-4 w-full rounded-2xl bg-stone-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:bg-stone-400"
                  >
                    {isCreatingSwap ? "שולח..." : "שליחת בקשת החלפה"}
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mt-5 rounded-3xl border border-stone-200 bg-stone-50 p-5 text-sm leading-7 text-stone-600">
              אפשר לפתוח בקשת החלפה רק אחרי שהשיבוץ לתורנות אושר.
            </div>
          )}
        </section>

        <ShiftSwapRequestsClient
          currentUserId={currentUser.id}
          currentUserRole={currentUser.role}
          initialRequests={swapRequests}
          requests={swapRequests}
          onRequestsChange={setSwapRequests}
          heading="בקשות החלפה לתורנות"
          description="כאן אפשר לראות את כל בקשות ההחלפה של התורנות הזאת."
        />
      </section>

      <aside className="space-y-6">
        <ShiftNotesBoard
          shiftId={currentShift.id}
          currentUserId={currentUser.id}
          currentUserRole={currentUser.role}
          title="לוח הערות חשוב לתורנות"
          description="כאן רואים הערות ועדכונים חשובים של התורנות ויכולים להוסיף הודעה חדשה."
        />
      </aside>
    </div>
  );
}
