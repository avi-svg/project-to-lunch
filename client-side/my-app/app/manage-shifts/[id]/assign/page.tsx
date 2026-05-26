import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth";
import { ShiftAssignmentClient } from "@/components/shift-assignment-client";
import {
  BackendShiftsError,
  fetchShiftAssignmentPoolsForUser,
  fetchShiftByIdForUser,
} from "@/lib/server-shifts";
import type { BackendDirectoryUser } from "@/lib/server-users";
import type { Shift } from "@/lib/shifts";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function ManageShiftAssignmentPage({ params }: PageProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/");
  }

  if (session.user.role !== "staff") {
    redirect("/dashboard");
  }

  const { id } = await params;
  let shift: Shift | null = null;
  let defaultUsers: BackendDirectoryUser[] = [];
  let alreadyAssignedUsers: BackendDirectoryUser[] = [];
  let errorMessage = "";

  try {
    const [shiftResponse, poolsResponse] = await Promise.all([
      fetchShiftByIdForUser(session.user.id, id),
      fetchShiftAssignmentPoolsForUser(session.user.id, id),
    ]);

    shift = shiftResponse.shift;
    defaultUsers = poolsResponse.defaultUsers;
    alreadyAssignedUsers = poolsResponse.alreadyAssignedUsers;
  } catch (error) {
    if (error instanceof BackendShiftsError) {
      errorMessage = error.message;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    } else {
      errorMessage = "לא הצלחנו לטעון את נתוני השיוך כרגע.";
    }
  }

  return (
    <main className="min-h-screen bg-stone-100 px-6 py-12 text-stone-900">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/manage-shifts/${id}`}
            className="inline-flex rounded-2xl border border-stone-300 bg-white px-5 py-3 text-sm font-medium text-stone-900 transition hover:border-stone-900"
          >
            חזרה לניהול התורנות
          </Link>
          <Link
            href="/main-schedule"
            className="inline-flex rounded-2xl border border-stone-300 bg-white px-5 py-3 text-sm font-medium text-stone-900 transition hover:border-stone-900"
          >
            מעבר ללוח הראשי
          </Link>
        </div>

        {errorMessage || !shift ? (
          <section className="rounded-[2rem] border border-amber-300 bg-amber-50 p-6 shadow-sm">
            <p className="text-sm font-semibold tracking-[0.2em] text-amber-800">
              טעינת עמוד השיוך נכשלה
            </p>
            <p className="mt-3 text-sm leading-7 text-amber-900">
              {errorMessage || "לא נמצאה תורנות להצגה."}
            </p>
          </section>
        ) : (
          <ShiftAssignmentClient
            shift={shift}
            defaultUsers={defaultUsers}
            alreadyAssignedUsers={alreadyAssignedUsers}
          />
        )}
      </div>
    </main>
  );
}
