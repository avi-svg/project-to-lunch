import Link from "next/link";
import type { UpcomingBirthday } from "@/lib/birthdays";

type Props = {
  birthdays: UpcomingBirthday[];
};

function formatAgeLabel(turnsAge: number | null) {
  if (turnsAge === null || turnsAge <= 0) {
    return "יום מיוחד בדרך";
  }

  return `חוגג/ת ${turnsAge}`;
}

export function BirthdaysBoard({ birthdays }: Props) {
  const nextBirthday = birthdays[0] ?? null;
  const todayCount = birthdays.filter((birthday) => birthday.daysUntil === 0).length;
  const thisWeekCount = birthdays.filter((birthday) => birthday.daysUntil <= 7).length;
  const thisMonthCount = birthdays.filter((birthday) => birthday.daysUntil <= 30).length;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fff1c7_0%,#ffe0ec_30%,#ffd7b5_58%,#fff8f1_100%)] px-6 py-10 text-stone-900">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <div className="flex flex-wrap gap-3">
          <Link
            href="/dashboard"
            className="inline-flex rounded-full border border-white/70 bg-white/80 px-5 py-3 text-sm font-semibold text-stone-900 shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:bg-white"
          >
            חזרה ללוח הבקרה
          </Link>
        </div>

        <section className="overflow-hidden rounded-[2rem] border border-white/70 bg-white/75 shadow-[0_25px_80px_rgba(204,93,41,0.18)] backdrop-blur">
          <div className="grid gap-8 px-8 py-10 lg:grid-cols-[1.4fr_0.9fr]">
            <div className="space-y-5">
              <p className="text-sm font-semibold tracking-[0.28em] text-rose-500">
                BIRTHDAY BOARD
              </p>
              <div className="space-y-3">
                <h1 className="max-w-3xl text-4xl font-black leading-tight text-stone-900 md:text-5xl">
                  לוח ימי הולדת צבעוני עם כל החגיגות הקרובות בקהילה
                </h1>
                <p className="max-w-2xl text-base leading-8 text-stone-700">
                  כאן רואים רק את המשתמשים הרגילים, מסודרים לפי התאריך הקרוב הבא.
                  מכל כרטיס אפשר לעבור ישר ללוח הברכות האישי שלהם.
                </p>
              </div>

              {nextBirthday ? (
                <div className="rounded-[1.75rem] bg-[linear-gradient(135deg,#fb7185,#f97316,#facc15)] p-[1px] shadow-lg">
                  <div className="rounded-[1.7rem] bg-white/90 px-6 py-5">
                    <p className="text-sm font-semibold tracking-[0.2em] text-rose-500">
                      הבא בתור
                    </p>
                    <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div>
                        <h2 className="text-3xl font-black text-stone-900">
                          {nextBirthday.user.name ?? nextBirthday.user.email}
                        </h2>
                        <p className="mt-2 text-sm text-stone-600">
                          {nextBirthday.formattedFullDate} • {nextBirthday.relativeLabel}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-orange-600">
                          {formatAgeLabel(nextBirthday.turnsAge)}
                        </p>
                      </div>
                      <Link
                        href={`/birthdays/${nextBirthday.user.id}`}
                        className="inline-flex items-center justify-center rounded-full bg-stone-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-stone-700"
                      >
                        מעבר ללוח הברכות
                      </Link>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
              <article className="rounded-[1.75rem] border border-white/70 bg-[#fff8ef] p-5 shadow-sm">
                <p className="text-sm font-semibold tracking-[0.16em] text-orange-500">
                  היום
                </p>
                <p className="mt-3 text-4xl font-black text-stone-900">{todayCount}</p>
                <p className="mt-2 text-sm text-stone-600">ימי הולדת שמתרחשים היום</p>
              </article>
              <article className="rounded-[1.75rem] border border-white/70 bg-[#fff3fb] p-5 shadow-sm">
                <p className="text-sm font-semibold tracking-[0.16em] text-fuchsia-500">
                  השבוע
                </p>
                <p className="mt-3 text-4xl font-black text-stone-900">{thisWeekCount}</p>
                <p className="mt-2 text-sm text-stone-600">חגיגות בתוך 7 הימים הקרובים</p>
              </article>
              <article className="rounded-[1.75rem] border border-white/70 bg-[#f4fbff] p-5 shadow-sm">
                <p className="text-sm font-semibold tracking-[0.16em] text-sky-500">
                  החודש הקרוב
                </p>
                <p className="mt-3 text-4xl font-black text-stone-900">{thisMonthCount}</p>
                <p className="mt-2 text-sm text-stone-600">ימי הולדת בתוך 30 יום</p>
              </article>
            </div>
          </div>
        </section>

        {birthdays.length === 0 ? (
          <section className="rounded-[2rem] border border-dashed border-orange-300 bg-white/80 px-8 py-14 text-center shadow-sm">
            <p className="text-lg font-semibold text-stone-900">
              עדיין אין תאריכי לידה להצגה.
            </p>
            <p className="mt-3 text-sm leading-7 text-stone-600">
              ברגע שיוזנו תאריכי לידה למשתמשים, הלוח יתמלא אוטומטית בימי ההולדת הקרובים.
            </p>
          </section>
        ) : (
          <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {birthdays.map((birthday, index) => (
              <article
                key={birthday.user.id}
                className="relative overflow-hidden rounded-[2rem] border border-white/80 bg-white/88 p-6 shadow-[0_18px_45px_rgba(15,23,42,0.08)]"
              >
                <div
                  className={`absolute inset-x-0 top-0 h-2 ${
                    index % 3 === 0
                      ? "bg-[linear-gradient(90deg,#fb7185,#f97316)]"
                      : index % 3 === 1
                        ? "bg-[linear-gradient(90deg,#22c55e,#38bdf8)]"
                        : "bg-[linear-gradient(90deg,#e879f9,#facc15)]"
                  }`}
                />

                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold tracking-[0.18em] text-stone-500">
                      {birthday.relativeLabel}
                    </p>
                    <h2 className="mt-3 text-2xl font-black text-stone-900">
                      {birthday.user.name ?? birthday.user.email}
                    </h2>
                    <p className="mt-2 text-sm text-stone-600">
                      {birthday.formattedShortDate}
                    </p>
                  </div>

                  <div className="rounded-[1.5rem] bg-stone-900 px-4 py-3 text-center text-white shadow-sm">
                    <p className="text-xs font-semibold tracking-[0.18em] text-stone-300">
                      עוד
                    </p>
                    <p className="mt-1 text-3xl font-black">{birthday.daysUntil}</p>
                  </div>
                </div>

                <div className="mt-6 rounded-[1.5rem] bg-stone-50 px-4 py-4">
                  <p className="text-sm font-semibold text-stone-700">
                    {formatAgeLabel(birthday.turnsAge)}
                  </p>
                  <p className="mt-2 text-sm leading-7 text-stone-600">
                    {birthday.user.email}
                  </p>
                </div>

                <Link
                  href={`/birthdays/${birthday.user.id}`}
                  className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-[linear-gradient(135deg,#ef4444,#f59e0b)] px-5 py-3 text-sm font-semibold text-white transition hover:brightness-105"
                >
                  פתיחת לוח הברכות
                </Link>
              </article>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
