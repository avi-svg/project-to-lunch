"use client";

import { useEffect, useMemo, useState } from "react";
import {
  type ShiftSwapRequest,
  type ShiftSwapRequestStatus,
  type UserRole,
  updateShiftSwapRequest,
} from "@/lib/shifts";

type Props = {
  currentUserId: string;
  currentUserRole: UserRole;
  initialRequests: ShiftSwapRequest[];
  requests?: ShiftSwapRequest[];
  onRequestsChange?: (requests: ShiftSwapRequest[]) => void;
  initialError?: string;
  heading?: string;
  description?: string;
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("he-IL", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatSwapStatus(status: ShiftSwapRequestStatus) {
  if (status === "approved") {
    return "אושרה לעיון הצוות";
  }

  if (status === "rejected") {
    return "נדחתה";
  }

  if (status === "cancelled") {
    return "בוטלה";
  }

  if (status === "closed") {
    return "נסגרה";
  }

  return "ממתינה לטיפול";
}

function isActiveStatus(status: ShiftSwapRequestStatus) {
  return status === "pending" || status === "approved";
}

export function ShiftSwapRequestsClient({
  currentUserId,
  currentUserRole,
  initialRequests,
  requests: controlledRequests,
  onRequestsChange,
  initialError = "",
  heading = "בקשות החלפה",
  description = "כאן אפשר לראות את בקשות ההחלפה הפעילות, לעקוב אחרי הבקשות שלך ולנהל אותן מול הצוות.",
}: Props) {
  const [requests, setRequests] = useState(initialRequests);
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState(initialError);
  const [updatingRequestId, setUpdatingRequestId] = useState<string | null>(null);
  const isStaffView = currentUserRole === "staff" || currentUserRole === "admin";

  useEffect(() => {
    if (controlledRequests) {
      setRequests(controlledRequests);
    }
  }, [controlledRequests]);

  const myRequests = useMemo(
    () => requests.filter((request) => request.requesterUserId === currentUserId),
    [currentUserId, requests],
  );
  const boardRequests = useMemo(() => {
    if (isStaffView) {
      return requests;
    }

    return requests.filter(
      (request) =>
        request.requesterUserId !== currentUserId && isActiveStatus(request.status),
    );
  }, [currentUserId, isStaffView, requests]);

  async function handleStatusChange(
    requestId: string,
    status: ShiftSwapRequestStatus,
  ) {
    setActionMessage("");
    setActionError("");
    setUpdatingRequestId(requestId);

    try {
      const result = await updateShiftSwapRequest(requestId, { status });
      setRequests((current) => {
        const nextRequests = current.map((request) =>
          request.id === requestId ? result.request : request,
        );
        onRequestsChange?.(nextRequests);
        return nextRequests;
      });
      setActionMessage(result.message);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "לא ניתן לעדכן את בקשת ההחלפה כרגע.",
      );
    } finally {
      setUpdatingRequestId(null);
    }
  }

  function renderRequestCard(request: ShiftSwapRequest) {
    const isOwner = request.requesterUserId === currentUserId;
    const canCancel = isOwner && isActiveStatus(request.status);
    const canApprove = isStaffView && request.status === "pending";
    const canReject = isStaffView && request.status === "pending";
    const canClose = isStaffView && request.status === "approved";

    return (
      <article
        key={request.id}
        className="rounded-3xl border border-stone-200 bg-stone-50 p-5"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <p className="text-lg font-semibold text-stone-900">
              {request.shift.title}
            </p>
            <p className="text-sm text-stone-600">
              התחלה: {formatDateTime(request.shift.startTime)}
            </p>
            <p className="text-sm text-stone-600">
              סיום: {formatDateTime(request.shift.endTime)}
            </p>
            <p className="text-sm text-stone-600">
              מבקש/ת: {request.requester.name ?? request.requester.email}
            </p>
            {request.shift.location ? (
              <p className="text-sm text-stone-600">מיקום: {request.shift.location}</p>
            ) : null}
            <p className="text-sm leading-6 text-stone-700">{request.reason}</p>
            {request.reviewNote ? (
              <p className="rounded-2xl bg-white px-4 py-3 text-sm text-stone-700">
                הערת צוות: {request.reviewNote}
              </p>
            ) : null}
          </div>

          <div className="space-y-3 lg:min-w-56">
            <span className="inline-flex rounded-full bg-stone-900 px-3 py-1 text-xs font-semibold text-white">
              {formatSwapStatus(request.status)}
            </span>

            <p className="text-xs leading-6 text-stone-500">
              נפתחה ב-{formatDateTime(request.createdAt)}
            </p>

            {canApprove || canReject || canClose || canCancel ? (
              <div className="space-y-2">
                {canApprove ? (
                  <button
                    type="button"
                    onClick={() => handleStatusChange(request.id, "approved")}
                    disabled={updatingRequestId === request.id}
                    className="w-full rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-300"
                  >
                    {updatingRequestId === request.id ? "שומר..." : "אישור לפרסום"}
                  </button>
                ) : null}

                {canReject ? (
                  <button
                    type="button"
                    onClick={() => handleStatusChange(request.id, "rejected")}
                    disabled={updatingRequestId === request.id}
                    className="w-full rounded-2xl bg-amber-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:bg-amber-300"
                  >
                    דחיית בקשה
                  </button>
                ) : null}

                {canClose ? (
                  <button
                    type="button"
                    onClick={() => handleStatusChange(request.id, "closed")}
                    disabled={updatingRequestId === request.id}
                    className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm font-medium text-stone-900 transition hover:border-stone-900 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-400"
                  >
                    סגירת בקשה
                  </button>
                ) : null}

                {canCancel ? (
                  <button
                    type="button"
                    onClick={() => handleStatusChange(request.id, "cancelled")}
                    disabled={updatingRequestId === request.id}
                    className="w-full rounded-2xl border border-rose-300 bg-white px-4 py-3 text-sm font-medium text-rose-700 transition hover:border-rose-500 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-400"
                  >
                    ביטול בקשה
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </article>
    );
  }

  return (
    <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold tracking-[0.2em] text-stone-500">
            החלפות תורנות
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-stone-900">{heading}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-stone-600">
            {description}
          </p>
        </div>
        <span className="rounded-full bg-stone-100 px-4 py-2 text-sm text-stone-700">
          {requests.length} בקשות
        </span>
      </div>

      {actionMessage ? (
        <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {actionMessage}
        </p>
      ) : null}

      {actionError ? (
        <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {actionError}
        </p>
      ) : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-stone-900">הבקשות שלי</h2>
            <p className="mt-1 text-sm text-stone-600">
              מעקב אחרי בקשות ההחלפה שפתחת מהתורנויות האישיות שלך.
            </p>
          </div>

          {myRequests.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-stone-300 bg-stone-50 p-6 text-sm text-stone-600">
              עדיין לא פתחת בקשת החלפה.
            </div>
          ) : (
            myRequests.map(renderRequestCard)
          )}
        </div>

        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-stone-900">
              {isStaffView ? "בקשות לטיפול צוות" : "לידיעת שאר המשתמשים"}
            </h2>
            <p className="mt-1 text-sm text-stone-600">
              {isStaffView
                ? "כאן הצוות מאשר, דוחה או סוגר בקשות החלפה פתוחות."
                : "כאן מוצגות הבקשות הפעילות כדי שכל המשתמשים יוכלו לדעת על צורך בהחלפה."}
            </p>
          </div>

          {boardRequests.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-stone-300 bg-stone-50 p-6 text-sm text-stone-600">
              {isStaffView
                ? "אין כרגע בקשות החלפה להצגה."
                : "אין כרגע בקשות החלפה פעילות להצגה."}
            </div>
          ) : (
            boardRequests.map(renderRequestCard)
          )}
        </div>
      </div>
    </section>
  );
}
