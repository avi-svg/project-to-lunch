"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState, useTransition } from "react";
import type { BackendDirectoryUser } from "@/lib/server-users";

type Props = {
  initialUsers: BackendDirectoryUser[];
};

type CreateFormState = {
  name: string;
  email: string;
  role: BackendDirectoryUser["role"];
  password: string;
  isActive: boolean;
};

type UserCardProps = {
  user: BackendDirectoryUser;
  onUserUpdated: (user: BackendDirectoryUser) => void;
};

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

function createInitialFormState(): CreateFormState {
  return {
    name: "",
    email: "",
    role: "user",
    password: "",
    isActive: true,
  };
}

async function parseResponse(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const data = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const message =
      typeof data === "object" &&
      data !== null &&
      "message" in data &&
      typeof data.message === "string"
        ? data.message
        : "הפעולה נכשלה.";

    throw new Error(message);
  }

  return data;
}

function UserCard({ user, onUserUpdated }: UserCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(user.name ?? "");
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState<BackendDirectoryUser["role"]>(
    user.role === "admin" ? "staff" : user.role,
  );
  const [isActive, setIsActive] = useState(user.isActive ?? true);
  const [password, setPassword] = useState("");
  const [hasPassword, setHasPassword] = useState(Boolean(user.hasPassword));
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function submitChanges(payload: Record<string, unknown>, successMessage: string) {
    startTransition(async () => {
      setMessage("");
      setError("");

      try {
        const result = await parseResponse(
          await fetch(`/api/users/${user.id}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          }),
        );

        const updatedUser = result.user as BackendDirectoryUser;
        onUserUpdated(updatedUser);
        if (updatedUser.hasPassword !== undefined) {
          setHasPassword(updatedUser.hasPassword);
        }
        setPassword("");
        setMessage(successMessage);
        router.refresh();
      } catch (submitError) {
        setError(
          submitError instanceof Error ? submitError.message : "העדכון נכשל.",
        );
      }
    });
  }

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const payload: Record<string, unknown> = {
      name: name.trim() || null,
      email: email.trim(),
      role,
      isActive,
    };

    if (password.trim().length > 0) {
      payload.password = password;
    }

    submitChanges(payload, "המשתמש עודכן.");
  }

  function handleRemovePassword() {
    submitChanges({ password: null }, "הסיסמה הוסרה.");
  }

  return (
    <article className="rounded-3xl border border-stone-200 bg-stone-50 p-5">
      <form onSubmit={handleSave} className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-lg font-semibold text-stone-900">
              {name || "ללא שם"}
            </p>
            <p className="text-sm text-stone-600">{email}</p>
            <p className="mt-1 text-xs text-stone-500">ID: {user.id}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex rounded-full px-4 py-2 text-sm font-semibold ${roleBadgeClass(role)}`}
            >
              {formatRole(role)}
            </span>
            <span
              className={`inline-flex rounded-full px-4 py-2 text-sm font-medium ${
                isActive
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-rose-100 text-rose-800"
              }`}
            >
              {isActive ? "פעיל" : "מושבת"}
            </span>
            <span className="inline-flex rounded-full bg-stone-200 px-4 py-2 text-sm text-stone-700">
              {hasPassword ? "עם סיסמה" : "ללא סיסמה"}
            </span>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="block text-sm font-medium text-stone-700">שם</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 outline-none transition focus:border-stone-900"
              placeholder="שם מלא"
            />
          </label>

          <label className="space-y-2">
            <span className="block text-sm font-medium text-stone-700">
              אימייל
            </span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 outline-none transition focus:border-stone-900"
              placeholder="name@example.com"
            />
          </label>

          <label className="space-y-2">
            <span className="block text-sm font-medium text-stone-700">תפקיד</span>
            <select
              value={role}
              onChange={(event) =>
                setRole(event.target.value as BackendDirectoryUser["role"])
              }
              className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 outline-none transition focus:border-stone-900"
            >
              <option value="user">משתמש</option>
              <option value="staff">איש צוות</option>
            </select>
          </label>

          <label className="flex items-center gap-3 rounded-2xl border border-stone-300 bg-white px-4 py-3">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-sm font-medium text-stone-700">
              המשתמש פעיל ויכול להיכנס
            </span>
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-[1fr_auto]">
          <label className="space-y-2">
            <span className="block text-sm font-medium text-stone-700">
              סיסמה חדשה
            </span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 outline-none transition focus:border-stone-900"
              placeholder="השאר ריק אם לא רוצים לשנות"
            />
          </label>

          <button
            type="button"
            onClick={handleRemovePassword}
            disabled={isPending || !hasPassword}
            className="self-end rounded-2xl border border-stone-300 bg-white px-5 py-3 text-sm font-medium text-stone-900 transition hover:border-stone-900 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-400"
          >
            הסר סיסמה
          </button>
        </div>

        <p className="text-xs leading-6 text-stone-500">
          אם נשמרת סיסמה, המשתמש יוכל להיכנס גם עם טופס הסיסמה במסך הבית. אם
          השדה ריק, המשתמש נשאר ללא סיסמה ויוכל להשתמש בהתחברות Google לפי
          האימייל שלו.
        </p>

        {error ? (
          <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </p>
        ) : null}

        {message ? (
          <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {message}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isPending}
          className="rounded-2xl bg-stone-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:bg-stone-400"
        >
          {isPending ? "שומר..." : "שמור שינויים"}
        </button>
      </form>
    </article>
  );
}

export function ManageUsersClient({ initialUsers }: Props) {
  const router = useRouter();
  const [users, setUsers] = useState(initialUsers);
  const [createForm, setCreateForm] = useState<CreateFormState>(
    createInitialFormState,
  );
  const [createMessage, setCreateMessage] = useState("");
  const [createError, setCreateError] = useState("");
  const [isCreating, startCreateTransition] = useTransition();

  const admins = useMemo(
    () => users.filter((user) => user.role === "admin"),
    [users],
  );
  const staffUsers = useMemo(
    () => users.filter((user) => user.role === "staff"),
    [users],
  );
  const communityUsers = useMemo(
    () => users.filter((user) => user.role === "user"),
    [users],
  );

  function handleUserUpdated(updatedUser: BackendDirectoryUser) {
    setUsers((current) =>
      current.map((user) =>
        user.id === updatedUser.id ? { ...user, ...updatedUser } : user,
      ),
    );
  }

  function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    startCreateTransition(async () => {
      setCreateError("");
      setCreateMessage("");

      try {
        const payload = {
          name: createForm.name.trim() || null,
          email: createForm.email.trim(),
          role: createForm.role,
          isActive: createForm.isActive,
          ...(createForm.password.trim()
            ? { password: createForm.password }
            : {}),
        };

        const result = await parseResponse(
          await fetch("/api/users", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          }),
        );

        setUsers((current) => {
          const nextUsers = [...current, result.user as BackendDirectoryUser];

          return nextUsers.sort((left, right) => {
            const leftLabel = (left.name ?? left.email).toLowerCase();
            const rightLabel = (right.name ?? right.email).toLowerCase();

            return leftLabel.localeCompare(rightLabel);
          });
        });
        setCreateForm(createInitialFormState());
        setCreateMessage("המשתמש נוצר בהצלחה.");
        router.refresh();
      } catch (submitError) {
        setCreateError(
          submitError instanceof Error ? submitError.message : "יצירת המשתמש נכשלה.",
        );
      }
    });
  }

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
              יצירה וניהול של משתמשי המערכת
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-stone-300">
              אפשר ליצור כאן משתמשים ידנית, לקבוע מי פעיל, להוסיף או להסיר
              סיסמה, ולעדכן תפקידים מבלי לחכות שמשתמש יתחבר בפעם הראשונה.
            </p>
          </div>
        </section>

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
          <div className="max-w-3xl">
            <p className="text-sm font-semibold tracking-[0.2em] text-stone-500">
              הוספת משתמש
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-stone-900">
              יצירת משתמש חדש ידנית
            </h2>
            <p className="mt-3 text-sm leading-7 text-stone-600">
              אפשר להשאיר את שדה הסיסמה ריק כדי ליצור משתמש שייכנס דרך Google,
              או להוסיף סיסמה כדי לאפשר גם התחברות עם שם משתמש או אימייל.
            </p>
          </div>

          <form onSubmit={handleCreateUser} className="mt-6 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="block text-sm font-medium text-stone-700">
                  שם
                </span>
                <input
                  value={createForm.name}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 outline-none transition focus:border-stone-900"
                  placeholder="שם מלא"
                />
              </label>

              <label className="space-y-2">
                <span className="block text-sm font-medium text-stone-700">
                  אימייל
                </span>
                <input
                  type="email"
                  value={createForm.email}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 outline-none transition focus:border-stone-900"
                  placeholder="name@example.com"
                  required
                />
              </label>

              <label className="space-y-2">
                <span className="block text-sm font-medium text-stone-700">
                  תפקיד
                </span>
                <select
                  value={createForm.role}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      role: event.target.value as BackendDirectoryUser["role"],
                    }))
                  }
                  className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 outline-none transition focus:border-stone-900"
                >
                  <option value="user">משתמש</option>
                  <option value="staff">איש צוות</option>
                </select>
              </label>

              <label className="space-y-2">
                <span className="block text-sm font-medium text-stone-700">
                  סיסמה ראשונית
                </span>
                <input
                  type="password"
                  value={createForm.password}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      password: event.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 outline-none transition focus:border-stone-900"
                  placeholder="אופציונלי, לפחות 8 תווים"
                />
              </label>
            </div>

            <label className="flex items-center gap-3 rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3">
              <input
                type="checkbox"
                checked={createForm.isActive}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    isActive: event.target.checked,
                  }))
                }
                className="h-4 w-4"
              />
              <span className="text-sm font-medium text-stone-700">
                המשתמש ייווצר כפעיל
              </span>
            </label>

            {createError ? (
              <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                {createError}
              </p>
            ) : null}

            {createMessage ? (
              <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                {createMessage}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={isCreating}
              className="rounded-2xl bg-stone-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:bg-stone-400"
            >
              {isCreating ? "יוצר..." : "צור משתמש"}
            </button>
          </form>
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
              לא נמצאו משתמשים להצגה.
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              {users.map((user) => (
                <UserCard
                  key={user.id}
                  user={user}
                  onUserUpdated={handleUserUpdated}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
