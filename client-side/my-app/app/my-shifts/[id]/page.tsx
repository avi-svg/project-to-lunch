import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth";
import { MyShiftDetailClient } from "@/components/my-shift-detail-client";
import {
  BackendShiftsError,
  fetchShiftByIdForUser,
  fetchShiftSwapRequestsForUser,
} from "@/lib/server-shifts";
import type { Shift, ShiftSwapRequest } from "@/lib/shifts";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function MyShiftPage({ params }: PageProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/");
  }

  if (session.user.role === "staff" || session.user.role === "admin") {
    redirect("/dashboard");
  }

  const { id } = await params;
  let shift: Shift | null = null;
  let shiftSwapRequests: ShiftSwapRequest[] = [];
  let errorMessage = "";

  try {
    const [shiftResponse, swapRequestsResponse] = await Promise.all([
      fetchShiftByIdForUser(session.user.id, id),
      fetchShiftSwapRequestsForUser(session.user.id),
    ]);

    shift = shiftResponse.shift;
    shiftSwapRequests = swapRequestsResponse.requests.filter(
      (request) => request.shift.id === id,
    );
  } catch (error) {
    errorMessage =
      error instanceof BackendShiftsError
        ? error.message
        : "לא ניתן לטעון את פרטי התורנות כרגע.";
  }

  return (
    <main className="min-h-screen bg-stone-100 px-6 py-12 text-stone-900">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <div className="flex flex-wrap gap-3">
          <Link
            href="/my-shifts"
            className="inline-flex rounded-2xl border border-stone-300 bg-white px-5 py-3 text-sm font-medium text-stone-900 transition hover:border-stone-900"
          >
            חזרה לתורנויות שלי
          </Link>
          <Link
            href="/personal-area"
            className="inline-flex rounded-2xl border border-stone-300 bg-white px-5 py-3 text-sm font-medium text-stone-900 transition hover:border-stone-900"
          >
            מעבר לאזור האישי
          </Link>
        </div>

        {errorMessage || !shift ? (
          <section className="rounded-[2rem] border border-amber-300 bg-amber-50 p-6 shadow-sm">
            <p className="text-sm font-semibold tracking-[0.2em] text-amber-800">
              טעינת עמוד התורנות נכשלה
            </p>
            <p className="mt-3 text-sm leading-7 text-amber-900">
              {errorMessage || "לא נמצאה תורנות להצגה."}
            </p>
          </section>
        ) : (
          <MyShiftDetailClient
            shift={shift}
            currentUser={{
              id: session.user.id,
              name: session.user.name ?? "משתמש",
              role: session.user.role ?? "user",
            }}
            initialShiftSwapRequests={shiftSwapRequests}
          />
        )}
      </div>
    </main>
  );
}
