"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const MANAGEMENT_PREFIXES = [
  "/manage-shifts",
  "/shift-attendance",
  "/shift-swap-requests",
  "/manage-users",
  "/staff-zone",
  "/staff-shifts",
];

export function DashboardFab() {
  const pathname = usePathname();
  const isManagementPage = MANAGEMENT_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );

  if (!isManagementPage) return null;

  return (
    <Link
      href="/dashboard"
      className="fixed bottom-6 left-6 z-50 flex items-center gap-2 rounded-2xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 shadow-md transition hover:border-stone-900 hover:text-stone-900 hover:shadow-lg"
    >
      <span className="text-base leading-none">⌂</span>
      דשבורד
    </Link>
  );
}
