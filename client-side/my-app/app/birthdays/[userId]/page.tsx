import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { authOptions } from "@/auth";
import { BirthdayGreetingsClient } from "@/components/birthday-greetings-client";
import {
  getBirthdayByUserId,
  getUpcomingBirthdays,
  type UpcomingBirthday,
} from "@/lib/birthdays";
import {
  BackendUsersError,
  type BirthdayGreeting,
  fetchAllBackendUsers,
  fetchBirthdayGreetingsForActor,
} from "@/lib/server-users";

type Props = {
  params: Promise<{
    userId: string;
  }>;
};

export default async function BirthdayGreetingBoardPage({ params }: Props) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/");
  }

  const { userId } = await params;
  let birthday: UpcomingBirthday | null = null;
  let greetings: BirthdayGreeting[] = [];
  let errorMessage = "";

  try {
    const users = await fetchAllBackendUsers();
    const birthdays = getUpcomingBirthdays(users);
    birthday = getBirthdayByUserId(birthdays, userId);

    if (!birthday) {
      notFound();
    }

    greetings = await fetchBirthdayGreetingsForActor(session.user.id, userId);
  } catch (error) {
    if (error instanceof BackendUsersError && error.status === 404) {
      notFound();
    }

    errorMessage =
      error instanceof Error
        ? error.message
        : "לא הצלחנו לטעון את לוח הברכות.";
  }

  if (errorMessage) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fff1c7_0%,#ffe0ec_35%,#fff8f1_100%)] px-6 py-12 text-stone-900">
        <div className="mx-auto max-w-3xl rounded-[2rem] border border-rose-200 bg-white/85 p-8 shadow-sm">
          <p className="text-sm font-semibold tracking-[0.2em] text-rose-500">
            GREETINGS BOARD ERROR
          </p>
          <h1 className="mt-3 text-3xl font-black text-stone-900">
            לא הצלחנו לטעון את לוח הברכות
          </h1>
          <p className="mt-4 text-sm leading-7 text-stone-700">{errorMessage}</p>
        </div>
      </main>
    );
  }

  if (!birthday) {
    notFound();
  }

  return (
    <BirthdayGreetingsClient
      birthday={birthday}
      currentUserName={session.user.name ?? session.user.email ?? "משתמש/ת"}
      initialGreetings={greetings}
    />
  );
}
