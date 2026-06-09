import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth";

export default async function HousingAttendanceLandingPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id || !session.user.email) {
    redirect("/");
  }

  if (session.user.role !== "staff") {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen bg-stone-100 px-6 py-12 text-stone-900">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <div className="flex flex-wrap gap-3">
          <Link
            href="/dashboard"
            className="inline-flex rounded-2xl border border-stone-300 bg-white px-5 py-3 text-sm font-medium text-stone-900 transition hover:border-stone-900"
          >
            חזרה לדשבורד
          </Link>
        </div>

        <section className="overflow-hidden rounded-[2rem] border border-stone-200 bg-white shadow-sm">
          <div className="bg-[linear-gradient(135deg,#1c1917,#57534e)] px-8 py-10 text-white">
            <p className="text-sm font-semibold tracking-[0.25em] text-stone-300">
              דיור
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight">
              נוכחות בדיור
            </h1>
            <p className="mt-4 text-sm leading-7 text-stone-300">
              דיווח יומי על נוכחות הדיירים, צפייה בדיווחים קודמים וניהול הדירות.
            </p>
          </div>
        </section>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            href="/housing-attendance/report"
            className="group overflow-hidden rounded-[2rem] border border-stone-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-stone-400 hover:shadow-lg"
          >
            <div className="bg-gradient-to-br from-violet-800 via-purple-700 to-fuchsia-600 px-6 py-8 text-white">
              <p className="text-sm font-semibold tracking-[0.2em] text-white/80">
                דיווח
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">
                דיווח נוכחות
              </h2>
            </div>
            <div className="space-y-5 px-6 py-6">
              <p className="text-sm leading-7 text-stone-600">
                מלא את נוכחות הדיירים להיום — סמן כל דייר כנוכח או לא נוכח,
                ורשום פרטים במידת הצורך.
              </p>
              <span className="inline-flex rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm font-semibold text-stone-900 transition group-hover:border-stone-900">
                כניסה לדיווח
              </span>
            </div>
          </Link>

          <Link
            href="/housing-attendance/history"
            className="group overflow-hidden rounded-[2rem] border border-stone-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-stone-400 hover:shadow-lg"
          >
            <div className="bg-gradient-to-br from-stone-700 via-stone-600 to-stone-500 px-6 py-8 text-white">
              <p className="text-sm font-semibold tracking-[0.2em] text-white/80">
                היסטוריה
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">
                דיווחים קודמים
              </h2>
            </div>
            <div className="space-y-5 px-6 py-6">
              <p className="text-sm leading-7 text-stone-600">
                צפייה בדיווחי הנוכחות של הימים הקודמים — לפי תאריך, דייר או
                דירה.
              </p>
              <span className="inline-flex rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm font-semibold text-stone-900 transition group-hover:border-stone-900">
                צפייה בהיסטוריה
              </span>
            </div>
          </Link>

          <Link
            href="/housing-attendance/apartments"
            className="group overflow-hidden rounded-[2rem] border border-stone-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-stone-400 hover:shadow-lg"
          >
            <div className="bg-gradient-to-br from-emerald-800 via-teal-700 to-cyan-600 px-6 py-8 text-white">
              <p className="text-sm font-semibold tracking-[0.2em] text-white/80">
                ניהול
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">
                ניהול דירות
              </h2>
            </div>
            <div className="space-y-5 px-6 py-6">
              <p className="text-sm leading-7 text-stone-600">
                הוספה ועריכה של דירות, שיוך דיירים לדירות וצפייה בפרטי כל דירה.
              </p>
              <span className="inline-flex rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm font-semibold text-stone-900 transition group-hover:border-stone-900">
                כניסה לניהול
              </span>
            </div>
          </Link>
        </div>
      </div>
    </main>
  );
}
