import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth";
import {
  BackendUsersError,
  fetchAllBackendUsers,
  type BackendDirectoryUser,
} from "@/lib/server-users";

function formatRole(role: BackendDirectoryUser["role"]) {
  if (role === "admin") {
    return "מנהל מערכת";
  }

  if (role === "staff") {
    return "איש צוות";
  }

  return "משתמש";
}

function roleBadgeClass(role: BackendDirectoryUser["role"]) {
  if (role === "admin") {
    return "bg-stone-900 text-white";
  }

  if (role === "staff") {
    return "bg-amber-100 text-amber-900";
  }

  return "bg-stone-100 text-stone-700";
}

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

  const admins = users.filter((user) => user.role === "admin");
  const staffUsers = users.filter((user) => user.role === "staff");
  const communityUsers = users.filter((user) => user.role === "user");

  return (
    <main className="min-h-screen bg-stone-100 px-6 py-12 text-stone-900">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex flex-wrap gap-3">
          <Link
            href="/dashboard"
            className="inline-flex rounded-2xl border border-stone-300 bg-white px-5 py-3 text-sm font-medium text-stone-900 transition hover:border-stone-900"
          >
            חזרה לדשבורד
          </Link>
        </div>

        <section className="overflow-hidden rounded-[2rem] border border-stone-200 bg-white shadow-sm">
          <div className="bg-[linear-gradient(135deg,#1c1917,#57534e)] px-8 py-10 text-white">
            <p className="text-sm font-semibold tracking-[0.25em] text-stone-300">
              ניהול משתמשים
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight">
              משתמשי המערכת מתוך מסד הנתונים
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-stone-300">
              העמוד מושך את רשימת המשתמשים מצד השרת ומציג מי מוגדר כמשתמש רגיל,
              מי איש צוות, ומי מנהל מערכת.
            </p>
          </div>
        </section>

        {errorMessage ? (
          <section className="rounded-[2rem] border border-amber-300 bg-amber-50 p-6 shadow-sm">
            <p className="text-sm font-semibold tracking-[0.2em] text-amber-800">
              טעינת משתמשים נכשלה
            </p>
            <p className="mt-3 text-sm leading-7 text-amber-900">{errorMessage}</p>
            <p className="mt-3 text-sm leading-7 text-amber-900">
              כרגע העמוד מצפה ל־`GET /users` מה־backend ולהחזרת `role` עבור כל
              משתמש.
            </p>
          </section>
        ) : (
          <>
            <section className="grid gap-4 md:grid-cols-3">
              <article className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
                <p className="text-sm font-semibold tracking-[0.2em] text-stone-500">
                  מנהלים
                </p>
                <p className="mt-3 text-3xl font-semibold text-stone-900">
                  {admins.length}
                </p>
              </article>
              <article className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
                <p className="text-sm font-semibold tracking-[0.2em] text-stone-500">
                  אנשי צוות
                </p>
                <p className="mt-3 text-3xl font-semibold text-stone-900">
                  {staffUsers.length}
                </p>
              </article>
              <article className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
                <p className="text-sm font-semibold tracking-[0.2em] text-stone-500">
                  משתמשים רגילים
                </p>
                <p className="mt-3 text-3xl font-semibold text-stone-900">
                  {communityUsers.length}
                </p>
              </article>
            </section>

            <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold tracking-[0.2em] text-stone-500">
                    רשימת משתמשים
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-stone-900">
                    {users.length === 0 ? "לא נמצאו משתמשים" : "כל המשתמשים במערכת"}
                  </h2>
                </div>
                <span className="rounded-full bg-stone-100 px-4 py-2 text-sm text-stone-700">
                  {users.length} משתמשים
                </span>
              </div>

              {users.length === 0 ? (
                <div className="mt-6 rounded-3xl border border-dashed border-stone-300 bg-stone-50 p-6 text-sm text-stone-600">
                  ה־backend ענה בהצלחה, אבל לא החזיר משתמשים להצגה.
                </div>
              ) : (
                <div className="mt-6 space-y-4">
                  {users.map((user) => (
                    <article
                      key={user.id}
                      className="flex flex-col gap-4 rounded-3xl border border-stone-200 bg-stone-50 p-5 lg:flex-row lg:items-center lg:justify-between"
                    >
                      <div className="space-y-1">
                        <p className="text-lg font-semibold text-stone-900">
                          {user.name ?? "ללא שם"}
                        </p>
                        <p className="text-sm text-stone-600">{user.email}</p>
                        <p className="text-xs text-stone-500">ID: {user.id}</p>
                      </div>

                      <span
                        className={`inline-flex rounded-full px-4 py-2 text-sm font-semibold ${roleBadgeClass(user.role)}`}
                      >
                        {formatRole(user.role)}
                      </span>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
