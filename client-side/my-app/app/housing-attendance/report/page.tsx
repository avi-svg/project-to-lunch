import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth";
import {
  fetchAllBackendUsers,
  BackendUsersError,
  type BackendDirectoryUser,
} from "@/lib/server-users";
import {
  fetchAllApartments,
  type BackendApartment,
} from "@/lib/server-apartments";
import { HousingAttendanceClient } from "@/components/housing-attendance-client";

export default async function HousingAttendanceReportPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id || !session.user.email) {
    redirect("/");
  }

  if (session.user.role !== "staff") {
    redirect("/dashboard");
  }

  let residents: BackendDirectoryUser[] = [];
  let apartments: BackendApartment[] = [];
  let fetchError: string | null = null;

  const [usersResult, apartmentsResult] = await Promise.allSettled([
    fetchAllBackendUsers().then((users) => users.filter((u) => u.role === "user")),
    fetchAllApartments(),
  ]);

  if (usersResult.status === "fulfilled") {
    residents = usersResult.value;
  } else {
    const err = usersResult.reason;
    fetchError =
      err instanceof BackendUsersError
        ? err.message
        : "שגיאה בטעינת רשימת הדיירים.";
  }

  if (apartmentsResult.status === "fulfilled") {
    apartments = apartmentsResult.value;
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

        <HousingAttendanceClient
          residents={residents}
          apartments={apartments}
          fetchError={fetchError}
        />
      </div>
    </main>
  );
}
