"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createShiftSwapVolunteerOffer,
  type ShiftSwapRequest,
  type ShiftSwapRequestStatus,
  type ShiftSwapVolunteerOffer,
  type ShiftSwapVolunteerOfferStatus,
  type UserRole,
  updateShiftSwapRequest,
  updateShiftSwapVolunteerOffer,
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
    return "פורסמה";
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

function formatOfferStatus(status: ShiftSwapVolunteerOfferStatus) {
  if (status === "approved") {
    return "אושר/ה כמחליף/ה";
  }

  if (status === "rejected") {
    return "נדחה";
  }

  if (status === "cancelled") {
    return "בוטל";
  }

  return "ממתין לאישור צוות";
}

function isActiveRequestStatus(status: ShiftSwapRequestStatus) {
  return status === "pending" || status === "approved";
}

function isCancellableOfferStatus(status: ShiftSwapVolunteerOfferStatus) {
  return status === "pending";
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
  const [processingKey, setProcessingKey] = useState<string | null>(null);
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
        request.requesterUserId !== currentUserId &&
        (isActiveRequestStatus(request.status) || request.myVolunteerOffer !== null),
    );
  }, [currentUserId, isStaffView, requests]);

  function applyRequestUpdate(nextRequest: ShiftSwapRequest, message: string) {
    setRequests((current) => {
      const nextRequests = current.map((request) =>
        request.id === nextRequest.id ? nextRequest : request,
      );
      onRequestsChange?.(nextRequests);
      return nextRequests;
    });
    setActionMessage(message);
  }

  async function handleRequestStatusChange(
    requestId: string,
    status: ShiftSwapRequestStatus,
  ) {
    setActionMessage("");
    setActionError("");
    setProcessingKey(`request:${requestId}:${status}`);

    try {
      const result = await updateShiftSwapRequest(requestId, { status });
      applyRequestUpdate(result.request, result.message);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "לא ניתן לעדכן את בקשת ההחלפה כרגע.",
      );
    } finally {
      setProcessingKey(null);
    }
  }

  async function handleVolunteerOfferCreate(requestId: string) {
    setActionMessage("");
    setActionError("");
    setProcessingKey(`offer:${requestId}:create`);

    try {
      const result = await createShiftSwapVolunteerOffer(requestId);
      applyRequestUpdate(result.request, result.message);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "לא ניתן לשלוח הצעת החלפה כרגע.",
      );
    } finally {
      setProcessingKey(null);
    }
  }

  async function handleVolunteerOfferStatusChange(
    requestId: string,
    offerId: string,
    status: ShiftSwapVolunteerOfferStatus,
  ) {
    setActionMessage("");
    setActionError("");
    setProcessingKey(`offer:${offerId}:${status}`);

    try {
      const result = await updateShiftSwapVolunteerOffer(requestId, offerId, {
        status,
      });
      applyRequestUpdate(result.request, result.message);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "לא ניתן לעדכן את הצעת ההחלפה כרגע.",
      );
    } finally {
      setProcessingKey(null);
    }
  }

  function renderVolunteerOfferCard(
    request: ShiftSwapRequest,
    offer: ShiftSwapVolunteerOffer,
  ) {
    const isMine = offer.volunteerUserId === currentUserId;
    const canApprove = isStaffView && offer.status === "pending" && request.status === "approved";
    const canReject = isStaffView && offer.status === "pending";
    const canCancel = isMine && isCancellableOfferStatus(offer.status);

    return (
      <article
        key={offer.id}
        className="rounded-2xl border border-stone-200 bg-white p-4"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <p className="font-medium text-stone-900">
              {offer.volunteer.name ?? offer.volunteer.email}
            </p>
            <p className="text-sm text-stone-600">{offer.volunteer.email}</p>
            <p className="text-sm text-stone-600">
              הציע/ה את עצמו/ה ב-{formatDateTime(offer.createdAt)}
            </p>
            {offer.reviewNote ? (
              <p className="text-sm text-stone-700">הערה: {offer.reviewNote}</p>
            ) : null}
          </div>

          <div className="space-y-2 lg:min-w-56">
            <span className="inline-flex rounded-full bg-stone-900 px-3 py-1 text-xs font-semibold text-white">
              {formatOfferStatus(offer.status)}
            </span>

            {canApprove || canReject || canCancel ? (
              <div className="space-y-2">
                {canApprove ? (
                  <button
                    type="button"
                    onClick={() =>
                      handleVolunteerOfferStatusChange(request.id, offer.id, "approved")
                    }
                    disabled={processingKey === `offer:${offer.id}:approved`}
                    className="w-full rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-300"
                  >
                    {processingKey === `offer:${offer.id}:approved`
                      ? "שומר..."
                      : "אישור ההחלפה"}
                  </button>
                ) : null}

                {canReject ? (
                  <button
                    type="button"
                    onClick={() =>
                      handleVolunteerOfferStatusChange(request.id, offer.id, "rejected")
                    }
                    disabled={processingKey === `offer:${offer.id}:rejected`}
                    className="w-full rounded-2xl bg-amber-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:bg-amber-300"
                  >
                    דחיית מועמדות
                  </button>
                ) : null}

                {canCancel ? (
                  <button
                    type="button"
                    onClick={() =>
                      handleVolunteerOfferStatusChange(request.id, offer.id, "cancelled")
                    }
                    disabled={processingKey === `offer:${offer.id}:cancelled`}
                    className="w-full rounded-2xl border border-rose-300 bg-white px-4 py-3 text-sm font-medium text-rose-700 transition hover:border-rose-500 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-400"
                  >
                    ביטול ההצעה שלי
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </article>
    );
  }

  function renderRequestCard(request: ShiftSwapRequest) {
    const isOwner = request.requesterUserId === currentUserId;
    const canCancelRequest = isOwner && isActiveRequestStatus(request.status);
    const canRejectRequest = isStaffView && request.status === "pending";
    const canCloseRequest = isStaffView && request.status === "approved";
    const canVolunteer =
      !isStaffView &&
      !isOwner &&
      request.status === "approved" &&
      request.myVolunteerOffer === null;

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
            <p className="text-sm leading-6 text-stone-700">
              {request.reason ??
                (request.canViewReason
                  ? "לא נכתבה סיבה לבקשת ההחלפה."
                  : "סיבת הבקשה מוצגת לאיש צוות ולמבקש/ת בלבד.")}
            </p>
            <p className="text-sm text-stone-600">
              הוגשו {request.volunteerOffersCount} הצעות החלפה
            </p>
            {request.reviewNote ? (
              <p className="rounded-2xl bg-white px-4 py-3 text-sm text-stone-700">
                הערת צוות: {request.reviewNote}
              </p>
            ) : null}
          </div>

          <div className="space-y-3 lg:min-w-64">
            <span className="inline-flex rounded-full bg-stone-900 px-3 py-1 text-xs font-semibold text-white">
              {formatSwapStatus(request.status)}
            </span>

            <p className="text-xs leading-6 text-stone-500">
              נפתחה ב-{formatDateTime(request.createdAt)}
            </p>

            {canVolunteer ? (
              <p className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
                הבקשה הזו פתוחה למתנדבים. אפשר להציע את עצמך כמחליף/ה והצוות יאשר את ההחלפה.
              </p>
            ) : null}

            {request.myVolunteerOffer ? (
              <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
                ההצעה שלך: {formatOfferStatus(request.myVolunteerOffer.status)}
              </div>
            ) : null}

            {canVolunteer ? (
              <button
                type="button"
                onClick={() => handleVolunteerOfferCreate(request.id)}
                disabled={processingKey === `offer:${request.id}:create`}
                className="w-full rounded-2xl bg-sky-700 px-4 py-3 text-sm font-medium text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-sky-300"
              >
                {processingKey === `offer:${request.id}:create`
                  ? "שולח..."
                  : "אני יכול/ה להחליף"}
              </button>
            ) : null}

            {canRejectRequest || canCloseRequest || canCancelRequest ? (
              <div className="space-y-2">
                {canRejectRequest ? (
                  <button
                    type="button"
                    onClick={() => handleRequestStatusChange(request.id, "rejected")}
                    disabled={processingKey === `request:${request.id}:rejected`}
                    className="w-full rounded-2xl bg-amber-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:bg-amber-300"
                  >
                    דחיית בקשה
                  </button>
                ) : null}

                {canCloseRequest ? (
                  <button
                    type="button"
                    onClick={() => handleRequestStatusChange(request.id, "closed")}
                    disabled={processingKey === `request:${request.id}:closed`}
                    className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm font-medium text-stone-900 transition hover:border-stone-900 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-400"
                  >
                    סגירת בקשה
                  </button>
                ) : null}

                {canCancelRequest ? (
                  <button
                    type="button"
                    onClick={() => handleRequestStatusChange(request.id, "cancelled")}
                    disabled={processingKey === `request:${request.id}:cancelled`}
                    className="w-full rounded-2xl border border-rose-300 bg-white px-4 py-3 text-sm font-medium text-rose-700 transition hover:border-rose-500 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-400"
                  >
                    ביטול בקשה
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {(request.volunteerOffers.length > 0 || request.myVolunteerOffer) && (
          <div className="mt-5 space-y-3">
            <div>
              <p className="text-sm font-semibold tracking-[0.18em] text-stone-500">
                מועמדים להחלפה
              </p>
              <h3 className="mt-2 text-lg font-semibold text-stone-900">
                {isStaffView
                  ? "הצעות שממתינות לעיון צוות"
                  : isOwner
                    ? "מי הציע/ה להחליף אותך"
                    : "הצעת ההחלפה שלך"}
              </h3>
            </div>

            <div className="space-y-3">
              {request.volunteerOffers.map((offer) =>
                renderVolunteerOfferCard(request, offer),
              )}
            </div>
          </div>
        )}
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
              {isStaffView ? "בקשות לטיפול צוות" : "בקשות החלפה פתוחות"}
            </h2>
            <p className="mt-1 text-sm text-stone-600">
              {isStaffView
                ? "כאן הצוות רואה את סיבת הבקשה, את המועמדים להחלפה, ומאשר את ההחלפה בפועל."
                : "כאן מופיעות בקשות של משתמשים אחרים שעדיין פתוחות להחלפה. מכל כרטיס אפשר להגיש התנדבות להחלפה ולעקוב אחרי ההצעה שלך."}
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
