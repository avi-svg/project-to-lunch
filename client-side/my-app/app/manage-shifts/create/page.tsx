import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth";
import { ManageShiftsClient } from "@/components/manage-shifts-client";

export default async function CreateShiftPage() {
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
            href="/manage-shifts"
            className="inline-flex rounded-2xl border border-stone-300 bg-white px-5 py-3 text-sm font-medium text-stone-900 transition hover:border-stone-900"
          >
            חזרה לבחירת מסלול
          </Link>
          <Link
            href="/main-schedule"
            className="inline-flex rounded-2xl border border-stone-300 bg-white px-5 py-3 text-sm font-medium text-stone-900 transition hover:border-stone-900"
          >
            מעבר ללוח הראשי
          </Link>
        </div>

        <ManageShiftsClient />
      </div>
    </main>
  );
}
