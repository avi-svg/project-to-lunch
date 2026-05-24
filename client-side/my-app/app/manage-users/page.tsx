import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth";
import { ManageUsersClient } from "@/components/manage-users-client";
import {
  BackendUsersError,
  fetchAllBackendUsers,
  type BackendDirectoryUser,
} from "@/lib/server-users";

export default async function ManageUsersPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/");
  }

  if (session.user.role !== "admin" && session.user.role !== "staff") {
    redirect("/dashboard");
  }

  let users: BackendDirectoryUser[] = [];
  let errorMessage = "";

  try {
    users = await fetchAllBackendUsers();
  } catch (error) {
    if (error instanceof BackendUsersError && error.status === 401) {
      errorMessage =
        "ה־backend דחה את הקריאה לרשימת המשתמשים. כדי שהעמוד יעבוד מול ה־DB צריך לאפשר ל־frontend server לגשת ל־GET /users.";
    } else if (error instanceof Error) {
      errorMessage = error.message;
    } else {
      errorMessage = "לא הצלחנו לטעון את רשימת המשתמשים מהשרת.";
    }
  }

  if (errorMessage) {
    return (
      <main className="min-h-screen bg-stone-100 px-6 py-12 text-stone-900">
        <div className="mx-auto max-w-4xl rounded-[2rem] border border-amber-300 bg-amber-50 p-6 shadow-sm">
          <p className="text-sm font-semibold tracking-[0.2em] text-amber-800">
            טעינת משתמשים נכשלה
          </p>
          <p className="mt-3 text-sm leading-7 text-amber-900">{errorMessage}</p>
          <p className="mt-3 text-sm leading-7 text-amber-900">
            כרגע העמוד מצפה ל־`GET /users` מה־backend ולהחזרת `role` עבור כל
            משתמש.
          </p>
        </div>
      </main>
    );
  }

  return <ManageUsersClient initialUsers={users} />;
}
