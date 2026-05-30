"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getPendingAppointmentVerification,
  resendAppointmentVerification,
  verifyAppointmentCode,
  type PendingAppointmentVerification,
} from "@/lib/appointments";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function VerifyAppointmentClient() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [pending, setPending] = useState<PendingAppointmentVerification | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  async function loadPendingVerification() {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const response = await getPendingAppointmentVerification();
      setPending(response);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "לא ניתן לטעון את האימות.";
      setErrorMessage(message);
      setPending(null);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadPendingVerification();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response = await verifyAppointmentCode(code);
      setSuccessMessage(response.message);
      router.push("/dashboard");
      router.refresh();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "קוד האימות אינו תקין.";
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResend() {
    setIsResending(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response = await resendAppointmentVerification();
      setSuccessMessage(response.message);
      await loadPendingVerification();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "לא ניתן לשלוח קוד חדש.";
      setErrorMessage(message);
    } finally {
      setIsResending(false);
    }
  }

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-stone-100 px-6 py-12 text-right text-stone-900"
    >
      <div className="mx-auto w-full max-w-xl rounded-[2rem] border border-stone-200 bg-white p-8 shadow-sm">
        <div className="mb-8 space-y-3">
          <p className="text-sm font-medium uppercase tracking-[0.25em] text-stone-500">
            אימות תור
          </p>
          <h1 className="text-4xl font-semibold tracking-tight">
            הזן את קוד האימות שנשלח אליך
          </h1>
          <p className="text-sm leading-6 text-stone-600">
            התור ייווצר רק אחרי אימות הקוד שנשלח לאימייל שלך.
          </p>
        </div>

        {isLoading ? (
          <p className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-600">
            טוען את פרטי האימות...
          </p>
        ) : pending ? (
          <div className="mb-6 rounded-3xl border border-stone-200 bg-stone-50 p-5 text-sm text-stone-700">
            <p>הקוד נשלח אל: {pending.email}</p>
            <p>בתוקף עד: {formatDateTime(pending.expiresAt)}</p>
            <p>ניסיונות שנותרו: {pending.attemptsLeft}</p>
          </div>
        ) : null}

        {errorMessage ? (
          <p className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </p>
        ) : null}

        {successMessage ? (
          <p className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {successMessage}
          </p>
        ) : null}

        <form className="space-y-5" onSubmit={handleSubmit}>
          <label className="space-y-2">
            <span className="text-sm font-medium">קוד אימות</span>
            <input
              required
              inputMode="numeric"
              pattern="[0-9]{4,6}"
              maxLength={6}
              className="w-full rounded-2xl border border-stone-300 px-4 py-3 text-left tracking-[0.4em] outline-none transition focus:border-stone-900"
              value={code}
              onChange={(event) =>
                setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="123456"
            />
          </label>

          <button
            type="submit"
            disabled={isSubmitting || isLoading}
            className="w-full rounded-2xl bg-stone-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:bg-stone-400"
          >
            {isSubmitting ? "מאמת..." : "אמת וצור תור"}
          </button>
        </form>

        <button
          type="button"
          onClick={handleResend}
          disabled={isResending || isLoading}
          className="mt-4 w-full rounded-2xl border border-stone-300 px-5 py-3 text-sm font-medium text-stone-900 transition hover:border-stone-900 disabled:cursor-not-allowed disabled:border-stone-200 disabled:text-stone-400"
        >
          {isResending ? "שולח קוד חדש..." : "שלח קוד מחדש"}
        </button>
      </div>
    </main>
  );
}
