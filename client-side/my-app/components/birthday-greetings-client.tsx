"use client";

import Link from "next/link";
import { type FormEvent, useState, useTransition } from "react";
import type { UpcomingBirthday } from "@/lib/birthdays";
import type { BirthdayGreeting } from "@/lib/server-users";

type Props = {
  birthday: UpcomingBirthday;
  currentUserName: string;
  initialGreetings: BirthdayGreeting[];
};

const suggestionMessages = [
  "המון מזל טוב, שנה מלאה בשמחה, בריאות והצלחות קטנות וגדולות.",
  "יום הולדת שמח! שתהיה שנה מתוקה, מרגשת ומלאה באנשים טובים.",
  "מאחל/ת לך המון אור, חיוכים, שלווה והגשמת כל מה שחשוב לך באמת.",
];

function formatGreetingTime(value: string) {
  try {
    return new Intl.DateTimeFormat("he-IL", {
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function BirthdayGreetingsClient({
  birthday,
  currentUserName,
  initialGreetings,
}: Props) {
  const [greetings, setGreetings] = useState(initialGreetings);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSuggestionClick(suggestion: string) {
    setMessage(suggestion);
    setError("");
    setSuccess("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    startTransition(async () => {
      setError("");
      setSuccess("");

      try {
        const response = await fetch(
          `/api/birthdays/${birthday.user.id}/greetings`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ message }),
          },
        );

        const contentType = response.headers.get("content-type") ?? "";
        const isJson = contentType.includes("application/json");
        const data = isJson ? await response.json() : await response.text();

        if (!response.ok) {
          const nextError =
            typeof data === "object" &&
            data !== null &&
            "message" in data &&
            typeof data.message === "string"
              ? data.message
              : "לא הצלחנו לשלוח את הברכה.";

          throw new Error(nextError);
        }

        const nextGreeting =
          typeof data === "object" &&
          data !== null &&
          "greeting" in data &&
          data.greeting
            ? (data.greeting as BirthdayGreeting)
            : null;

        if (!nextGreeting) {
          throw new Error("התקבלה תשובה לא צפויה מהשרת.");
        }

        setGreetings((current) => [nextGreeting, ...current]);
        setMessage("");
        setSuccess("הברכה נוספה ללוח בהצלחה.");
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : "לא הצלחנו לשלוח את הברכה.",
        );
      }
    });
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fff5d8_0%,#ffe4f1_30%,#dff6ff_65%,#fffdf8_100%)] px-6 py-10 text-stone-900">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex flex-wrap gap-3">
          <Link
            href="/birthdays"
            className="inline-flex rounded-full border border-white/70 bg-white/85 px-5 py-3 text-sm font-semibold text-stone-900 shadow-sm transition hover:-translate-y-0.5 hover:bg-white"
          >
            חזרה ללוח ימי ההולדת
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex rounded-full border border-white/70 bg-white/85 px-5 py-3 text-sm font-semibold text-stone-900 shadow-sm transition hover:-translate-y-0.5 hover:bg-white"
          >
            לדשבורד
          </Link>
        </div>

        <section className="overflow-hidden rounded-[2rem] border border-white/80 bg-white/80 shadow-[0_25px_70px_rgba(244,114,182,0.16)] backdrop-blur">
          <div className="grid gap-8 px-8 py-10 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-5">
              <p className="text-sm font-semibold tracking-[0.28em] text-pink-500">
                GREETINGS BOARD
              </p>
              <div className="space-y-3">
                <h1 className="text-4xl font-black leading-tight text-stone-900 md:text-5xl">
                  לוח הברכות של {birthday.user.name ?? birthday.user.email}
                </h1>
                <p className="max-w-2xl text-base leading-8 text-stone-700">
                  זה המקום להשאיר מילה טובה, ברכה חמה או איחול קטן שעושה הרבה
                  שמח.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
              <article className="rounded-[1.75rem] bg-[#fff7ed] p-5 shadow-sm">
                <p className="text-sm font-semibold tracking-[0.16em] text-orange-500">
                  התאריך הקרוב
                </p>
                <p className="mt-3 text-2xl font-black text-stone-900">
                  {birthday.formattedFullDate}
                </p>
              </article>
              <article className="rounded-[1.75rem] bg-[#fff1f8] p-5 shadow-sm">
                <p className="text-sm font-semibold tracking-[0.16em] text-fuchsia-500">
                  ספירה לאחור
                </p>
                <p className="mt-3 text-2xl font-black text-stone-900">
                  {birthday.relativeLabel}
                </p>
              </article>
              <article className="rounded-[1.75rem] bg-[#eefcff] p-5 shadow-sm">
                <p className="text-sm font-semibold tracking-[0.16em] text-sky-500">
                  הברכות בלוח
                </p>
                <p className="mt-3 text-2xl font-black text-stone-900">
                  {greetings.length}
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <article className="rounded-[2rem] border border-white/80 bg-white/85 p-6 shadow-sm">
            <p className="text-sm font-semibold tracking-[0.2em] text-stone-500">
              השאירו ברכה
            </p>
            <h2 className="mt-2 text-2xl font-black text-stone-900">
              מה תרצו לאחל היום?
            </h2>
            <p className="mt-3 text-sm leading-7 text-stone-600">
              מחובר/ת בתור {currentUserName}. אפשר לכתוב ברכה אישית או להתחיל
              מהצעה מוכנה.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              {suggestionMessages.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="rounded-full border border-pink-200 bg-pink-50 px-4 py-2 text-sm font-medium text-pink-700 transition hover:border-pink-300 hover:bg-pink-100"
                >
                  השתמש/י בהצעה
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <label className="block space-y-2">
                <span className="block text-sm font-medium text-stone-700">
                  הברכה שלך
                </span>
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  rows={7}
                  maxLength={500}
                  className="w-full rounded-[1.75rem] border border-stone-200 bg-stone-50 px-5 py-4 text-sm leading-7 outline-none transition focus:border-stone-900 focus:bg-white"
                  placeholder="מזל טוב, שתהיה שנה יפה, בריאה ומשמחת..."
                  required
                />
              </label>

              <div className="flex items-center justify-between gap-4 text-xs text-stone-500">
                <span>עד 500 תווים</span>
                <span>{message.trim().length}/500</span>
              </div>

              {error ? (
                <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                  {error}
                </p>
              ) : null}

              {success ? (
                <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  {success}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={isPending || message.trim().length === 0}
                className="inline-flex rounded-full bg-[linear-gradient(135deg,#ec4899,#f97316)] px-6 py-3 text-sm font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending ? "שולח/ת ברכה..." : "פרסום הברכה בלוח"}
              </button>
            </form>
          </article>

          <article className="rounded-[2rem] border border-white/80 bg-white/85 p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold tracking-[0.2em] text-stone-500">
                  הברכות שעלו
                </p>
                <h2 className="mt-2 text-2xl font-black text-stone-900">
                  קיר הברכות
                </h2>
              </div>
              <span className="rounded-full bg-stone-100 px-4 py-2 text-sm font-semibold text-stone-700">
                {greetings.length} ברכות
              </span>
            </div>

            {greetings.length === 0 ? (
              <div className="mt-6 rounded-[1.75rem] border border-dashed border-stone-300 bg-stone-50 px-6 py-10 text-center">
                <p className="text-lg font-semibold text-stone-900">
                  עדיין לא נוספו ברכות ללוח הזה.
                </p>
                <p className="mt-3 text-sm leading-7 text-stone-600">
                  אפשר להיות הראשונים ולמלא אותו במשהו משמח.
                </p>
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                {greetings.map((greeting, index) => (
                  <article
                    key={greeting.id}
                    className={`rounded-[1.75rem] px-5 py-5 shadow-sm ${
                      index % 3 === 0
                        ? "bg-[#fff7ed]"
                        : index % 3 === 1
                          ? "bg-[#fff1f8]"
                          : "bg-[#eefcff]"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-stone-900">
                        {greeting.authorName}
                      </p>
                      <p className="text-xs font-medium text-stone-500">
                        {formatGreetingTime(greeting.createdAt)}
                      </p>
                    </div>
                    <p className="mt-4 text-sm leading-8 text-stone-700">
                      {greeting.message}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </article>
        </section>
      </div>
    </main>
  );
}
