import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth";
import {
  fetchAllApartments,
  type BackendApartment,
} from "@/lib/server-apartments";
import {
  fetchAllBackendUsers,
  type BackendDirectoryUser,
} from "@/lib/server-users";
import { HousingApartmentsClient } from "@/components/housing-apartments-client";

export default async function HousingApartmentsPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id || !session.user.email) {
    redirect("/");
  }

  if (session.user.role !== "staff") {
    redirect("/dashboard");
  }

  let apartments: BackendApartment[] = [];
  let allResidents: BackendDirectoryUser[] = [];

  await Promise.allSettled([
    fetchAllApartments().then((a) => {
      apartments = a;
    }),
    fetchAllBackendUsers()
      .then((users) => users.filter((u) => u.role === "user"))
      .then((users) => {
        allResidents = users;
      }),
  ]);

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

        <HousingApartmentsClient
          apartments={apartments}
          allResidents={allResidents}
        />
      </div>
    </main>
  );
}
