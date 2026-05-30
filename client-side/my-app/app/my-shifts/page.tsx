import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth";
import {
  BackendShiftsError,
  fetchMyRegisteredShiftsForUser,
} from "@/lib/server-shifts";
import type { Shift } from "@/lib/shifts";

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

export default async function MyShiftsPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/");
  }

  if (session.user.role === "staff" || session.user.role === "admin") {
    redirect("/dashboard");
  }

  let shifts: Shift[] = [];
  let errorMessage = "";

  try {
    shifts = (await fetchMyRegisteredShiftsForUser(session.user.id)).shifts;
  } catch (error) {
    errorMessage =
      error instanceof BackendShiftsError
        ? error.message
        : "לא ניתן לטעון את התורנויות שלך כרגע.";
  }

  return (
    <main className="min-h-screen bg-stone-100 px-6 py-12 text-stone-900">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <div className="flex flex-wrap gap-3">
          <Link
            href="/dashboard"
            className="inline-flex rounded-2xl border border-stone-300 bg-white px-5 py-3 text-sm font-medium text-stone-900 transition hover:border-stone-900"
          >
            חזרה לדשבורד
          </Link>
          <Link
            href="/personal-area"
            className="inline-flex rounded-2xl border border-stone-300 bg-white px-5 py-3 text-sm font-medium text-stone-900 transition hover:border-stone-900"
          >
            מעבר לאזור האישי
          </Link>
        </div>

        <section className="overflow-hidden rounded-[2rem] border border-stone-200 bg-white shadow-sm">
          <div className="bg-[linear-gradient(145deg,#1c1917,#44403c)] px-8 py-10 text-white">
            <p className="text-sm font-semibold tracking-[0.25em] text-stone-300">
              התורנויות שלי
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight">
              ניהול תורנויות אישי
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-stone-300">
              כאן בוחרים תורנות ונכנסים למסך הניהול האישי שלה, עם נוכחות, הערות
              ובקשות החלפה.
            </p>
          </div>
        </section>

        {errorMessage ? (
          <section className="rounded-[2rem] border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700 shadow-sm">
            {errorMessage}
          </section>
        ) : null}

        <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold tracking-[0.2em] text-stone-500">
                הרשמות פעילות
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-stone-900">
                התורנויות שלך
              </h2>
            </div>
            <span className="rounded-full bg-stone-100 px-4 py-2 text-sm text-stone-700">
              {shifts.length} תורנויות
            </span>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {shifts.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-stone-300 bg-stone-50 p-8 text-sm text-stone-600 lg:col-span-2">
                עדיין אין לך תורנויות פעילות להצגה.
              </div>
            ) : (
              shifts.map((shift) => (
                <Link
                  key={shift.id}
                  href={`/my-shifts/${shift.id}`}
                  className="rounded-3xl border border-stone-200 bg-stone-50 p-5 transition hover:border-stone-900 hover:bg-white"
                >
                  <p className="text-xl font-semibold text-stone-900">{shift.title}</p>
                  <p className="mt-3 text-sm text-stone-600">
                    התחלה: {formatDateTime(shift.startTime)}
                  </p>
                  <p className="text-sm text-stone-600">
                    סיום: {formatDateTime(shift.endTime)}
                  </p>
                  {shift.location ? (
                    <p className="mt-2 text-sm text-stone-600">מיקום: {shift.location}</p>
                  ) : null}
                  <span className="mt-5 inline-flex rounded-2xl border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-900">
                    מעבר לניהול התורנות
                  </span>
                </Link>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
