import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth";
import { PersonalAreaClient } from "@/components/personal-area-client";
import {
  BackendShiftsError,
  fetchMyRegisteredShiftsForUser,
} from "@/lib/server-shifts";
import type { Shift } from "@/lib/shifts";

export default async function PersonalAreaPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id || !session.user.email) {
    redirect("/");
  }

  const isStaffUser = session.user.role === "staff";
  let registeredShifts: Shift[] = [];
  let shiftsErrorMessage = "";

  if (!isStaffUser) {
    try {
      registeredShifts = (
        await fetchMyRegisteredShiftsForUser(session.user.id)
      ).shifts;
    } catch (error) {
      shiftsErrorMessage =
        error instanceof BackendShiftsError
          ? error.message
          : "לא ניתן לטעון את התורנויות האישיות כרגע.";
    }
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
          {isStaffUser ? (
            <Link
              href="/staff-zone"
              className="inline-flex rounded-2xl border border-stone-300 bg-white px-5 py-3 text-sm font-medium text-stone-900 transition hover:border-stone-900"
            >
              מעבר לאזור הצוות
            </Link>
          ) : null}
        </div>

        <PersonalAreaClient
          currentUser={{
            id: session.user.id,
            name: session.user.name ?? "משתמש",
            email: session.user.email,
            role: session.user.role ?? "user",
          }}
          initialRegisteredShifts={registeredShifts}
          registeredShiftsError={shiftsErrorMessage}
        />
      </div>
    </main>
  );
}
