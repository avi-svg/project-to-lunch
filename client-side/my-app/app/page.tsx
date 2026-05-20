"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";

export default function Home() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const isAuthenticated = status === "authenticated" && Boolean(session?.user?.id);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [credentialsError, setCredentialsError] = useState("");
  const [isSubmittingCredentials, setIsSubmittingCredentials] = useState(false);
  const [isSubmittingGoogle, setIsSubmittingGoogle] = useState(false);

  async function handleCredentialsSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!identifier.trim() || !password) {
      setCredentialsError("יש למלא שם משתמש או אימייל וסיסמה.");
      return;
    }

    setIsSubmittingCredentials(true);
    setCredentialsError("");

    try {
      const result = await signIn("credentials", {
        identifier: identifier.trim(),
        password,
        redirect: false,
        callbackUrl: "/dashboard",
      });

      if (!result || result.error) {
        setCredentialsError("שם המשתמש או הסיסמה שגויים.");
        return;
      }

      router.push(result.url ?? "/dashboard");
      router.refresh();
    } catch {
      setCredentialsError("לא ניתן לבצע התחברות כרגע.");
    } finally {
      setIsSubmittingCredentials(false);
    }
  }

  async function handleGoogleSignIn() {
    setIsSubmittingGoogle(true);
    await signIn("google", { callbackUrl: "/dashboard" });
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f5f5f4_0%,#e7e5e4_100%)] px-6 py-12 text-stone-900">
      <div className="mx-auto grid min-h-[calc(100vh-6rem)] w-full max-w-6xl items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-[2.5rem] border border-stone-300 bg-white/90 p-10 shadow-[0_30px_80px_rgba(28,25,23,0.12)] backdrop-blur">
          <p className="text-sm font-semibold tracking-[0.25em] text-stone-500">
            מערכת תורנויות חכמה
          </p>
          <h1 className="mt-4 max-w-3xl text-5xl font-semibold tracking-tight text-stone-950">
            לוח שבועי אחד לתורנויות פתוחות, הרשמה עצמית ואישורים מהירים של הצוות.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-stone-600">
            אנשי צוות פותחים תורנויות, משתמשים נרשמים למקומות פנויים, והמנהלים
            רואים הכול במקום אחד בלי אקסלים, קבוצות הודעות או תיאומים ידניים.
          </p>

          <div className="mt-10">
            {status === "loading" ? (
              <span className="rounded-2xl bg-stone-900 px-5 py-3 text-sm font-medium text-white">
                בודק חיבור...
              </span>
            ) : isAuthenticated ? (
              <div className="flex flex-wrap gap-4">
                <Link
                  href="/dashboard"
                  className="rounded-2xl bg-stone-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-700"
                >
                  מעבר לדשבורד
                </Link>
                <button
                  type="button"
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="rounded-2xl border border-stone-300 px-5 py-3 text-sm font-medium text-stone-900 transition hover:border-stone-900"
                >
                  התנתקות
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                <form onSubmit={handleCredentialsSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <label
                      htmlFor="identifier"
                      className="block text-sm font-medium text-stone-700"
                    >
                      שם משתמש או אימייל
                    </label>
                    <input
                      id="identifier"
                      value={identifier}
                      onChange={(event) => setIdentifier(event.target.value)}
                      className="w-full rounded-2xl border border-stone-300 px-4 py-3 outline-none transition focus:border-stone-900"
                      placeholder="הקלד שם משתמש או אימייל"
                      autoComplete="username"
                    />
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="password"
                      className="block text-sm font-medium text-stone-700"
                    >
                      סיסמה
                    </label>
                    <input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="w-full rounded-2xl border border-stone-300 px-4 py-3 outline-none transition focus:border-stone-900"
                      placeholder="הקלד סיסמה"
                      autoComplete="current-password"
                    />
                  </div>

                  {credentialsError ? (
                    <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {credentialsError}
                    </p>
                  ) : null}

                  <button
                    type="submit"
                    disabled={isSubmittingCredentials}
                    className="w-full rounded-2xl bg-stone-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:bg-stone-400"
                  >
                    {isSubmittingCredentials ? "מתחבר..." : "התחברות עם סיסמה"}
                  </button>
                </form>

                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-stone-200" />
                  <span className="text-sm text-stone-500">או</span>
                  <div className="h-px flex-1 bg-stone-200" />
                </div>

                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={isSubmittingGoogle}
                  className="w-full rounded-2xl border border-stone-300 bg-white px-5 py-3 text-sm font-medium text-stone-900 transition hover:border-stone-900 disabled:cursor-not-allowed disabled:bg-stone-100"
                >
                  {isSubmittingGoogle ? "מעביר ל-Google..." : "התחברות עם Google"}
                </button>
              </div>
            )}
          </div>
        </section>

        <section className="grid gap-4">
          <article className="rounded-[2rem] border border-stone-300 bg-white p-6 shadow-sm">
            <p className="text-sm font-semibold tracking-[0.2em] text-stone-500">
              תצוגה נקייה
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-stone-900">
              כל המערכת מרוכזת במקום אחד
            </h2>
            <p className="mt-3 text-sm leading-6 text-stone-600">
              מסך בית פשוט וברור שמכוון ישר לכניסה למערכת ולעבודה השוטפת, בלי
              זרימות צדדיות ובלי תלות בשירותים חיצוניים מיותרים.
            </p>
          </article>

          <article className="rounded-[2rem] border border-stone-300 bg-white p-6 shadow-sm">
            <p className="text-sm font-semibold tracking-[0.2em] text-stone-500">
              אנשי צוות
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-stone-900">
              פותחים תורנויות ומאשרים נרשמים במהירות
            </h2>
            <p className="mt-3 text-sm leading-6 text-stone-600">
              כל תורנות כוללת קיבולת, ספירת נרשמים בזמן אמת ותור ברור של בקשות
              שממתינות לאישור.
            </p>
          </article>

          <article className="rounded-[2rem] border border-stone-300 bg-white p-6 shadow-sm">
            <p className="text-sm font-semibold tracking-[0.2em] text-stone-500">
              משתמשים
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-stone-900">
              נרשמים בקלות ועוקבים אחרי סטטוס האישור
            </h2>
            <p className="mt-3 text-sm leading-6 text-stone-600">
              משתמשים יכולים לראות תורנויות פתוחות, לתפוס מקום ולעקוב אחרי כל
              הרשמה משלב ההמתנה ועד לאישור.
            </p>
          </article>

          <article className="rounded-[2rem] border border-stone-300 bg-[linear-gradient(135deg,#292524,#57534e)] p-6 text-white shadow-sm">
            <p className="text-sm font-semibold tracking-[0.2em] text-stone-300">
              מנהל מערכת
            </p>
            <h2 className="mt-3 text-2xl font-semibold">
              שליטה מלאה על כל המערכת
            </h2>
            <p className="mt-3 text-sm leading-6 text-stone-200">
              מנהל המערכת יורש את כל יכולות אנשי הצוות ויכול לנהל את כלל
              התורנויות וההרשמות ממקום אחד.
            </p>
          </article>
        </section>
      </div>
    </main>
  );
}
