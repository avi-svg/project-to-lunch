import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth";
import { ManageShiftsClient } from "@/components/manage-shifts-client";
import { BackendShiftsError, fetchShiftByIdForUser } from "@/lib/server-shifts";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function EditShiftPage({ params }: PageProps) {
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

  try {
    const response = await fetchShiftByIdForUser(session.user.id, id);
    shift = response.shift;
  } catch (error) {
    errorMessage =
      error instanceof BackendShiftsError
        ? error.message
        : error instanceof Error
          ? error.message
          : "לא הצלחנו לטעון את הפעילות לעריכה.";
  }

  return (
    <main className="min-h-screen bg-stone-100 px-6 py-12 text-stone-900">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex flex-wrap gap-3">
          <Link
            href="/main-schedule"
            className="inline-flex rounded-2xl border border-stone-300 bg-white px-5 py-3 text-sm font-medium text-stone-900 transition hover:border-stone-900"
          >
            חזרה ללוח הראשי
          </Link>
          <Link
            href={`/manage-shifts/${id}`}
            className="inline-flex rounded-2xl border border-stone-300 bg-white px-5 py-3 text-sm font-medium text-stone-900 transition hover:border-stone-900"
          >
            חזרה לניהול התורנות
          </Link>
        </div>

        {errorMessage || !shift ? (
          <section className="rounded-[2rem] border border-amber-300 bg-amber-50 p-6 shadow-sm">
            <p className="text-sm font-semibold tracking-[0.2em] text-amber-800">
              טעינת פעילות לעריכה נכשלה
            </p>
            <p className="mt-3 text-sm leading-7 text-amber-900">
              {errorMessage || "לא נמצאה פעילות להצגה."}
            </p>
          </section>
        ) : (
          <ManageShiftsClient initialShift={shift} mode="edit" />
        )}
      </div>
    </main>
  );
}
