import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth";
import { StaffZoneClient } from "@/components/staff-zone-client";

export default async function StaffZonePage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id || !session.user.email) {
    redirect("/");
  }

  if (session.user.role !== "staff") {
    redirect("/dashboard");
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

        <StaffZoneClient
          currentUser={{
            id: session.user.id,
            name: session.user.name ?? "משתמש",
            email: session.user.email,
            role: session.user.role ?? "user",
          }}
        />
      </div>
    </main>
  );
}
