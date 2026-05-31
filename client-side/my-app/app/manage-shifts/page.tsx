import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth";

const actions = [
  {
    href: "/manage-shifts/create",
    eyebrow: "יצירת אירוע",
    title: "פתיחת אירוע חדש",
    description:
      "מעבר לטופס המלא של יצירת האירוע, עם כל השדות והאפשרות לשמור או להמשיך לשיוך משתמשים.",
    accent: "from-stone-900 via-stone-800 to-stone-700",
  },
  {
    href: "/manage-shifts/manage",
    eyebrow: "ניהול אירועים",
    title: "כניסה למסך הניהול",
    description:
      "עמוד ייעודי לניהול אירועים, שממנו נמשיך להגדיר את תצוגת הניהול והפעולות הרלוונטיות.",
    accent: "from-amber-700 via-amber-600 to-orange-500",
  },
] as const;

export default async function ManageShiftsPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/");
  }

  if (session.user.role !== "staff") {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen bg-stone-100 px-6 py-12 text-stone-900">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex flex-wrap gap-3">
          <Link
            href="/dashboard"
            className="inline-flex rounded-2xl border border-stone-300 bg-white px-5 py-3 text-sm font-medium text-stone-900 transition hover:border-stone-900"
          >
            חזרה לדשבורד
          </Link>
          <Link
            href="/main-schedule"
            className="inline-flex rounded-2xl border border-stone-300 bg-white px-5 py-3 text-sm font-medium text-stone-900 transition hover:border-stone-900"
          >
            מעבר ללוח הראשי
          </Link>
        </div>

        <section className="overflow-hidden rounded-[2rem] border border-stone-200 bg-white shadow-sm">
          <div className="bg-[linear-gradient(140deg,#1c1917,#44403c)] px-8 py-10 text-white">
            <p className="text-sm font-semibold tracking-[0.25em] text-stone-300">
              אירועים ופעילויות
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight">
              לאן ממשיכים מכאן?
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-stone-300">
              פיצלנו את המסך לשני מסלולים ברורים: יצירת אירוע חדש או כניסה למסך
              ניהול אירועים נפרד.
            </p>
          </div>

          <div className="grid gap-6 p-8 lg:grid-cols-2">
            {actions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="group overflow-hidden rounded-[2rem] border border-stone-200 bg-stone-50 transition hover:-translate-y-0.5 hover:border-stone-400 hover:shadow-lg"
              >
                <div className={`bg-gradient-to-br ${action.accent} px-6 py-6 text-white`}>
                  <p className="text-sm font-semibold tracking-[0.2em] text-white/75">
                    {action.eyebrow}
                  </p>
                  <h2 className="mt-3 text-3xl font-semibold tracking-tight">
                    {action.title}
                  </h2>
                </div>

                <div className="space-y-5 px-6 py-6">
                  <p className="text-sm leading-7 text-stone-600">{action.description}</p>
                  <span className="inline-flex rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm font-semibold text-stone-900 transition group-hover:border-stone-900">
                    כניסה למסלול
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
