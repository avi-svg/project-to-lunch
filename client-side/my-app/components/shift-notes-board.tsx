"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  createShiftNote,
  getShiftNotes,
  type ShiftNote,
  type UserRole,
} from "@/lib/shifts";

type Props = {
  shiftId: string;
  currentUserId: string;
  currentUserRole: UserRole;
  title?: string;
  description?: string;
  emptyMessage?: string;
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function ShiftNotesBoard({
  shiftId,
  currentUserId,
  currentUserRole,
  title = "לוח הערות חשוב לתורנות",
  description = "אפשר לכתוב כאן הערות חופשיות ועדכונים חשובים לכל מי שרלוונטי כרגע לתורנות.",
  emptyMessage = "עדיין אין הערות לתורנות הזאת.",
}: Props) {
  const [notes, setNotes] = useState<ShiftNote[]>([]);
  const [draft, setDraft] = useState("");
  const [shouldNotifyOnWhatsApp, setShouldNotifyOnWhatsApp] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, startSubmitTransition] = useTransition();
  const isStaffUser = currentUserRole === "staff" || currentUserRole === "admin";

  useEffect(() => {
    let isMounted = true;

    async function loadNotes() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const result = await getShiftNotes(shiftId);

        if (!isMounted) {
          return;
        }

        setNotes(result.notes);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setErrorMessage(
          error instanceof Error ? error.message : "טעינת ההערות נכשלה.",
        );
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadNotes();

    return () => {
      isMounted = false;
    };
  }, [shiftId]);

  const sortedNotes = useMemo(
    () =>
      [...notes].sort(
        (left, right) =>
          new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
      ),
    [notes],
  );

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!draft.trim() || isSubmitting) {
      return;
    }

    setErrorMessage("");
    setSuccessMessage("");

    startSubmitTransition(async () => {
      try {
        const result = await createShiftNote(shiftId, {
          message: draft.trim(),
          sendWhatsAppAlert: isStaffUser ? shouldNotifyOnWhatsApp : undefined,
        });

        setNotes((current) => [...current, result.note]);
        setDraft("");
        setShouldNotifyOnWhatsApp(false);
        setSuccessMessage("ההערה נוספה ללוח.");
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "שמירת ההערה נכשלה.",
        );
      }
    });
  }

  return (
    <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
      <div>
        <p className="text-sm font-semibold tracking-[0.2em] text-stone-500">
          הערות
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-stone-900">{title}</h2>
        <p className="mt-3 text-sm leading-7 text-stone-600">{description}</p>
      </div>

      <div className="mt-6 space-y-4 rounded-[1.75rem] bg-stone-100 p-4">
        {isLoading ? (
          <div className="rounded-3xl bg-white px-5 py-6 text-sm text-stone-500 shadow-sm">
            טוען הערות...
          </div>
        ) : sortedNotes.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-stone-300 bg-white px-5 py-6 text-sm text-stone-500 shadow-sm">
            {emptyMessage}
          </div>
        ) : (
          sortedNotes.map((note) => {
            const isOwnMessage = note.author.id === currentUserId;

            return (
              <article
                key={note.id}
                className={`flex ${isOwnMessage ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[44rem] rounded-[1.5rem] px-4 py-3 shadow-sm ${
                    isOwnMessage
                      ? "bg-emerald-100 text-emerald-950"
                      : "bg-white text-stone-900"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                    <span className="font-semibold text-stone-800">
                      {note.author.name ?? note.author.email}
                    </span>
                    <span>{formatDateTime(note.createdAt)}</span>
                    {note.sendWhatsAppAlert ? (
                      <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-medium text-amber-800">
                        התרעת וואטסאפ סומנה
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-7">
                    {note.message}
                  </p>
                </div>
              </article>
            );
          })
        )}
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <label className="block space-y-2">
          <span className="text-sm font-medium text-stone-700">הערה חדשה</span>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="min-h-28 w-full rounded-3xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-stone-900"
            placeholder="כתוב כאן עדכון חשוב, תזכורת, שינוי או כל הערה שחשוב שכל המשתתפים יראו."
          />
        </label>

        {isStaffUser ? (
          <label className="flex items-start gap-3 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700">
            <input
              type="checkbox"
              checked={shouldNotifyOnWhatsApp}
              onChange={(event) => setShouldNotifyOnWhatsApp(event.target.checked)}
              className="mt-1 h-4 w-4 rounded border-stone-300"
            />
            <span>
              סמן אם בעתיד נרצה לשלוח התרעת וואטסאפ על ההערה הזאת למשתמשים
              הרלוונטיים.
            </span>
          </label>
        ) : null}

        {errorMessage ? (
          <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {errorMessage}
          </p>
        ) : null}

        {successMessage ? (
          <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {successMessage}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting || draft.trim().length === 0}
          className="w-full rounded-2xl bg-stone-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:bg-stone-400"
        >
          {isSubmitting ? "שומר הערה..." : "הוסף הערה ללוח"}
        </button>
      </form>
    </section>
  );
}
