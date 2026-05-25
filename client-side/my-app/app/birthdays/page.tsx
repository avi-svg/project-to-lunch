import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth";
import { BirthdaysBoard } from "@/components/birthdays-board";
import {
  getUpcomingBirthdays,
  type UpcomingBirthday,
} from "@/lib/birthdays";
import {
  BackendUsersError,
  fetchAllBackendUsers,
} from "@/lib/server-users";

export default async function BirthdaysPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/");
  }

  let birthdays: UpcomingBirthday[] = [];
  let errorMessage = "";

  try {
    const users = await fetchAllBackendUsers();
    birthdays = getUpcomingBirthdays(users);
  } catch (error) {
    errorMessage =
      error instanceof BackendUsersError || error instanceof Error
        ? error.message
        : "לא הצלחנו לטעון את נתוני ימי ההולדת.";
  }

  if (errorMessage) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fff1c7_0%,#ffe0ec_35%,#fff8f1_100%)] px-6 py-12 text-stone-900">
        <div className="mx-auto max-w-3xl rounded-[2rem] border border-rose-200 bg-white/85 p-8 shadow-sm">
          <p className="text-sm font-semibold tracking-[0.2em] text-rose-500">
            BIRTHDAY BOARD ERROR
          </p>
          <h1 className="mt-3 text-3xl font-black text-stone-900">
            לא הצלחנו לטעון את לוח ימי ההולדת
          </h1>
          <p className="mt-4 text-sm leading-7 text-stone-700">{errorMessage}</p>
        </div>
      </main>
    );
  }

  return <BirthdaysBoard birthdays={birthdays} />;
}
