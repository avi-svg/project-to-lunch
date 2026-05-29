import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth";
import { ManageShiftDetailClient } from "@/components/manage-shift-detail-client";
import {
  BackendShiftsError,
  fetchShiftByIdForUser,
  fetchShiftSwapRequestsForUser,
} from "@/lib/server-shifts";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function ManageSingleShiftPage({ params }: PageProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/");
  }

  if (session.user.role !== "staff") {
    redirect("/dashboard");
  }

  const { id } = await params;
  let errorMessage = "";
  let shift = null;
  let activeSwapRequestsCount = 0;

  try {
    const response = await fetchShiftByIdForUser(session.user.id, id);
    shift = response.shift;
  } catch (error) {
    errorMessage =
      error instanceof BackendShiftsError
        ? error.message
        : error instanceof Error
          ? error.message
          : "לא הצלחנו לטעון את פרטי התורנות.";
  }

  if (!errorMessage && shift) {
    try {
      const swapRequestsResponse = await fetchShiftSwapRequestsForUser(
        session.user.id,
      );
      activeSwapRequestsCount = swapRequestsResponse.requests.filter(
        (request) =>
          request.shift.id === id &&
          (request.status === "pending" || request.status === "approved"),
      ).length;
    } catch {
      activeSwapRequestsCount = 0;
    }
  }

  return (
    <main className="min-h-screen bg-stone-100 px-6 py-12 text-stone-900">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <div className="flex flex-wrap gap-3">
          <Link
            href="/manage-shifts/manage"
            className="inline-flex rounded-2xl border border-stone-300 bg-white px-5 py-3 text-sm font-medium text-stone-900 transition hover:border-stone-900"
          >
            חזרה ללוח ניהול תורנויות
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
              טעינת עמוד ניהול התורנות נכשלה
            </p>
            <p className="mt-3 text-sm leading-7 text-amber-900">
              {errorMessage || "לא נמצאה תורנות להצגה."}
            </p>
          </section>
        ) : (
          <ManageShiftDetailClient
            shift={shift}
            activeSwapRequestsCount={activeSwapRequestsCount}
          />
        )}
      </div>
    </main>
  );
}
