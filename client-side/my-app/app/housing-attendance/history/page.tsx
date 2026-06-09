import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth";
import {
  fetchAllBackendUsers,
  type BackendDirectoryUser,
} from "@/lib/server-users";
import {
  checkMyPermission,
  PERM_VIEW_HOUSING_HISTORY,
} from "@/lib/server-permissions";
import { HousingAttendanceHistoryClient } from "@/components/housing-attendance-history-client";

export default async function HousingAttendanceHistoryPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id || !session.user.email) {
    redirect("/");
  }

  if (session.user.role !== "staff") {
    redirect("/dashboard");
  }

  try {
    const permCheck = await checkMyPermission(session.user.id, PERM_VIEW_HOUSING_HISTORY);
    if (permCheck.isBootstrapped && !permCheck.hasPermission) {
      redirect("/dashboard");
    }
  } catch {
    redirect("/dashboard");
  }

  let residents: BackendDirectoryUser[] = [];

  try {
    const allUsers = await fetchAllBackendUsers();
    residents = allUsers.filter((u) => u.role === "user");
  } catch {
    // History still works — resident names will fall back to IDs
  }

  return (
    <main className="min-h-screen bg-stone-100 px-6 py-12 text-stone-900">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <div className="flex flex-wrap gap-3">
          <Link
            href="/housing-attendance"
            className="inline-flex rounded-2xl border border-stone-300 bg-white px-5 py-3 text-sm font-medium text-stone-900 transition hover:border-stone-900"
          >
            חזרה
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex rounded-2xl border border-stone-300 bg-white px-5 py-3 text-sm font-medium text-stone-900 transition hover:border-stone-900"
          >
            חזרה לדשבורד
          </Link>
        </div>

        <HousingAttendanceHistoryClient residents={residents} />
      </div>
    </main>
  );
}
