"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import type { UserRole } from "@/lib/shifts";

type Props = {
  userName: string;
  userRole: UserRole;
};

type NavigationLink = {
  href: string;
  label: string;
  staffOnly?: boolean;
  teamOnly?: boolean;
};

type QuickAction = {
  href: string;
  eyebrow: string;
  title: string;
  description: string;
  accent: string;
  staffOnly?: boolean;
};

const navigationLinks: readonly NavigationLink[] = [
  { href: "/main-schedule", label: "לוח זמנים ראשי" },
  { href: "/birthdays", label: "ימי הולדת" },
  { href: "/shift-attendance", label: "נוכחות בתורנות" },
  { href: "/manage-shifts", label: "תורנויות ופעילויות", staffOnly: true },
  { href: "/staff-shifts", label: "אזור משמרות צוות", staffOnly: true },
  { href: "/staff-zone", label: "אזור צוות", staffOnly: true },
  { href: "/personal-area", label: "אזור אישי" },
  { href: "/shift-swap-requests", label: "בקשות החלפה" },
  { href: "/manage-users", label: "ניהול משתמשים", teamOnly: true },
];

const quickActions: readonly QuickAction[] = [
  {
    href: "/personal-area",
    eyebrow: "מעקב אישי",
    title: "התורנויות שלי",
    description:
      "כניסה מהירה לאזור האישי כדי לאשר תורנות, לעדכן פרטים ולפתוח בקשת החלפה במקרה הצורך.",
    accent: "from-stone-900 via-stone-800 to-stone-700",
  },
  {
    href: "/shift-swap-requests",
    eyebrow: "בקשות החלפה",
    title: "לוח ניהול החלפות",
    description:
      "מסך ייעודי לבקשות החלפה: המשתמשים רואים את הבקשות הפעילות והצוות יכול לעקוב, לדחות או לסגור טיפול.",
    accent: "from-amber-700 via-orange-600 to-rose-500",
  },
  {
    href: "/shift-attendance",
    eyebrow: "נוכחות",
    title: "דיווח ואישור תורנויות",
    description:
      "המשתמשים מדווחים על נוכחות החל מחמש דקות לפני תחילת התורנות ועד סיומה, והצוות מאשר את הרשימה לאחר מכן.",
    accent: "from-sky-800 via-cyan-700 to-teal-500",
  },
  {
    href: "/manage-shifts",
    eyebrow: "צוות",
    title: "ניהול תורנויות",
    description:
      "לצוות: יצירה, ניהול ושיבוץ תורנויות ופעילויות מתוך מסכי הניהול הייעודיים.",
    accent: "from-emerald-700 via-emerald-600 to-lime-500",
    staffOnly: true,
  },
];

function getNavigationLinks(userRole: UserRole) {
  return navigationLinks.filter(
    (link) =>
      (!link.staffOnly || userRole === "staff" || userRole === "admin") &&
      (!link.teamOnly || userRole === "admin" || userRole === "staff"),
  );
}

function getQuickActions(userRole: UserRole) {
  return quickActions.filter(
    (action) => !action.staffOnly || userRole === "staff" || userRole === "admin",
  );
}

function formatRole(role: UserRole) {
  if (role === "admin") {
    return "מנהל מערכת";
  }

  if (role === "staff") {
    return "איש צוות";
  }

  return "משתמש";
}

export function DashboardClient({ userName, userRole }: Props) {
  return (
    <main className="min-h-screen bg-stone-100 px-6 py-12 text-stone-900">
      <div className="mx-auto grid w-full max-w-7xl gap-8 xl:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="space-y-6 xl:sticky xl:top-8 xl:self-start">
          <section className="overflow-hidden rounded-[2rem] border border-stone-200 bg-white shadow-sm">
            <div className="bg-[linear-gradient(160deg,#1c1917,#57534e)] px-6 py-8 text-white">
              <p className="text-xs font-semibold tracking-[0.28em] text-stone-300">
                ניווט
              </p>
              <h1 className="mt-3 text-2xl font-semibold">לוח הבקרה</h1>
              <div className="mt-5 space-y-1 text-sm text-stone-200">
                <p className="text-lg font-medium text-white">{userName}</p>
                <p>תפקיד: {formatRole(userRole)}</p>
              </div>
            </div>

            <nav className="space-y-3 p-4">
              {getNavigationLinks(userRole).map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="block rounded-2xl border border-stone-200 px-4 py-3 text-sm font-semibold text-stone-900 transition hover:border-stone-900 hover:bg-stone-50"
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            <div className="border-t border-stone-200 p-4">
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/" })}
                className="w-full rounded-2xl border border-stone-300 px-4 py-3 text-sm font-medium text-stone-900 transition hover:border-stone-900"
              >
                התנתקות
              </button>
            </div>
          </section>
        </aside>

        <section className="space-y-6">
          <section className="overflow-hidden rounded-[2rem] border border-stone-200 bg-white shadow-sm">
            <div className="bg-[linear-gradient(145deg,#1c1917,#44403c)] px-8 py-10 text-white">
              <p className="text-sm font-semibold tracking-[0.25em] text-stone-300">
                מרכז עבודה
              </p>
              <h2 className="mt-3 text-4xl font-semibold tracking-tight">
                כל המסלולים המרכזיים במקום אחד
              </h2>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-stone-300">
                הוספנו גם אזור ייעודי לבקשות החלפה, כך שאפשר לפתוח בקשה מהאזור
                האישי ולנהל אותה ממסך מרכזי בדשבורד.
              </p>
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
            {getQuickActions(userRole).map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="group overflow-hidden rounded-[2rem] border border-stone-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-stone-400 hover:shadow-lg"
              >
                <div className={`bg-gradient-to-br ${action.accent} px-6 py-6 text-white`}>
                  <p className="text-sm font-semibold tracking-[0.2em] text-white/80">
                    {action.eyebrow}
                  </p>
                  <h3 className="mt-3 text-3xl font-semibold tracking-tight">
                    {action.title}
                  </h3>
                </div>

                <div className="space-y-5 px-6 py-6">
                  <p className="text-sm leading-7 text-stone-600">
                    {action.description}
                  </p>
                  <span className="inline-flex rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm font-semibold text-stone-900 transition group-hover:border-stone-900">
                    כניסה לאזור
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
