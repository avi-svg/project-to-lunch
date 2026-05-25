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

const navigationLinks: readonly NavigationLink[] = [
  { href: "/main-schedule", label: "לוח זמנים ראשי" },
  { href: "/birthdays", label: "ימי הולדת" },
  { href: "/manage-shifts", label: "תורנויות ופעילויות", staffOnly: true },
  { href: "/staff-shifts", label: "אזור משמרות צוות", staffOnly: true },
  { href: "/staff-zone", label: "אזור צוות", staffOnly: true },
  { href: "/personal-area", label: "אזור אישי" },
  { href: "/manage-users", label: "ניהול משתמשים", teamOnly: true },
];

function getNavigationLinks(userRole: UserRole) {
  return navigationLinks.filter(
    (link) =>
      (!link.staffOnly || userRole === "staff") &&
      (!link.teamOnly || userRole === "admin" || userRole === "staff"),
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

        <section className="flex min-h-[24rem] items-center justify-center rounded-[2rem] border border-dashed border-stone-300 bg-white/70 p-10 text-center shadow-sm">
          <div className="max-w-xl space-y-3">
            <p className="text-sm font-semibold tracking-[0.25em] text-stone-500">
              בחירת אזור
            </p>
            <h2 className="text-3xl font-semibold text-stone-900">
              בחר אזור עבודה מהתפריט הצדדי
            </h2>
            <p className="text-sm leading-7 text-stone-600">
              זהו מסך ניווט מרכזי שממנו אפשר להמשיך לכל אחד מהאזורים הפעילים
              במערכת.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
