"use client";

import { useMemo, useState } from "react";
import {
  replaceShiftAssignments,
  type Shift,
  type ShiftRegistrationStatus,
} from "@/lib/shifts";
import type { BackendDirectoryUser } from "@/lib/server-users";

type Props = {
  shift: Shift;
  users: BackendDirectoryUser[];
};

type DragPayload =
  | {
      source: "pool";
      userId: string;
    }
  | {
      source: "assigned";
      userId: string;
    };

type AssignedUser = {
  id: string;
  email: string;
  name: string | null;
  status: ShiftRegistrationStatus;
  registrationId: string | null;
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

function formatRegistrationStatus(status: ShiftRegistrationStatus) {
  if (status === "approved") {
    return "מאושר";
  }

  if (status === "pending") {
    return "ממתין";
  }

  if (status === "rejected") {
    return "נדחה";
  }

  return "בוטל";
}

function getAssignedUsersFromShift(shift: Shift): AssignedUser[] {
  const registrations = shift.registrations ?? [];

  return registrations
    .filter(
      (registration) =>
        registration.user.role === "user" &&
        (registration.status === "approved" || registration.status === "pending"),
    )
    .map((registration) => ({
      id: registration.user.id,
      email: registration.user.email,
      name: registration.user.name,
      status: registration.status,
      registrationId: registration.id,
    }));
}

export function ShiftAssignmentClient({ shift, users }: Props) {
  const initialAssignedUsers = useMemo<AssignedUser[]>(
    () => getAssignedUsersFromShift(shift),
    [shift],
  );
  const [initialAssignedUserIds, setInitialAssignedUserIds] = useState<string[]>(
    initialAssignedUsers.map((user) => user.id),
  );
  const [assignedUsers, setAssignedUsers] = useState<AssignedUser[]>(initialAssignedUsers);
  const [activeDropZone, setActiveDropZone] = useState<"pool" | "assigned" | null>(null);
  const [feedback, setFeedback] = useState<{
    variant: "success" | "error";
    message: string;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const assignedUserIds = useMemo(
    () => new Set(assignedUsers.map((user) => user.id)),
    [assignedUsers],
  );
  const hasChanges = useMemo(() => {
    if (assignedUsers.length !== initialAssignedUserIds.length) {
      return true;
    }

    const currentIds = assignedUsers.map((user) => user.id).sort();
    const initialIds = [...initialAssignedUserIds].sort();

    return currentIds.some((userId, index) => userId !== initialIds[index]);
  }, [assignedUsers, initialAssignedUserIds]);
  const availableUsers = useMemo(
    () => users.filter((user) => !assignedUserIds.has(user.id)),
    [assignedUserIds, users],
  );
  const availableSlots = Math.max(shift.capacity - assignedUsers.length, 0);

  function readDragPayload(event: React.DragEvent<HTMLElement>) {
    const raw = event.dataTransfer.getData("application/json");

    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as DragPayload;
      if (
        parsed &&
        (parsed.source === "pool" || parsed.source === "assigned") &&
        typeof parsed.userId === "string"
      ) {
        return parsed;
      }
    } catch {}

    return null;
  }

  function handleDragStart(event: React.DragEvent<HTMLElement>, payload: DragPayload) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/json", JSON.stringify(payload));
  }

  function assignUser(userId: string) {
    if (assignedUsers.some((user) => user.id === userId) || assignedUsers.length >= shift.capacity) {
      return;
    }

    const nextUser = users.find((user) => user.id === userId);

    if (!nextUser) {
      return;
    }

    setAssignedUsers((current): AssignedUser[] => [
      ...current,
      {
        id: nextUser.id,
        email: nextUser.email,
        name: nextUser.name,
        status: "pending",
        registrationId: null,
      },
    ]);
    setFeedback(null);
  }

  function unassignUser(userId: string) {
    const assignedUser = assignedUsers.find((user) => user.id === userId);

    if (assignedUser?.status === "approved") {
      setFeedback({
        variant: "error",
        message:
          "משתמש שאישר את התורנות נעול לשינוי במסך הזה ולא ניתן להסיר אותו ישירות.",
      });
      return;
    }

    setAssignedUsers((current) => current.filter((user) => user.id !== userId));
    setFeedback(null);
  }

  async function handleSaveAssignments() {
    setIsSaving(true);
    setFeedback(null);

    try {
      const result = await replaceShiftAssignments(
        shift.id,
        assignedUsers.map((user) => user.id),
      );
      const nextAssignedUsers = getAssignedUsersFromShift(result.shift);
      setAssignedUsers(nextAssignedUsers);
      setInitialAssignedUserIds(nextAssignedUsers.map((user) => user.id));
      setFeedback({
        variant: "success",
        message:
          "השינויים נשמרו. המשתמשים ששויכו יראו את הפעילות כבקשה שממתינה לאישור השתתפות.",
      });
    } catch (error) {
      setFeedback({
        variant: "error",
        message:
          error instanceof Error
            ? error.message
            : "לא הצלחנו לשמור את השיוכים כרגע.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  function handleDropOnAssigned(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setActiveDropZone(null);
    const payload = readDragPayload(event);

    if (!payload || payload.source !== "pool") {
      return;
    }

    assignUser(payload.userId);
  }

  function handleDropOnPool(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setActiveDropZone(null);
    const payload = readDragPayload(event);

    if (!payload || payload.source !== "assigned") {
      return;
    }

    unassignUser(payload.userId);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_24rem]">
      <section className="space-y-6">
        <section className="overflow-hidden rounded-[2rem] border border-stone-200 bg-white shadow-sm">
          <div className="bg-[linear-gradient(135deg,#1c1917,#57534e)] px-8 py-10 text-white">
            <p className="text-sm font-semibold tracking-[0.25em] text-stone-300">
              שיוך משתמשים
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight">
              גרור משתמשים אל תוך התורנות
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-stone-300">
              בצד ימין נמצאת רשימת כל המשתמשים שאינם אנשי צוות. אפשר לגרור כל משתמש
              אל תוך הפעילות כדי להכין את השיבוץ.
            </p>
          </div>
        </section>

        <section
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            setActiveDropZone("assigned");
          }}
          onDragLeave={() => setActiveDropZone((current) => (current === "assigned" ? null : current))}
          onDrop={handleDropOnAssigned}
          className={`rounded-[2rem] border-2 border-dashed bg-white p-6 shadow-sm transition ${
            activeDropZone === "assigned"
              ? "border-stone-900 bg-stone-50"
              : "border-stone-300"
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold tracking-[0.2em] text-stone-500">
                התורנות הנבחרת
              </p>
              <h2 className="mt-2 text-3xl font-semibold text-stone-900">
                {shift.title}
              </h2>
              <p className="mt-3 text-sm text-stone-600">
                {formatDateTime(shift.startTime)} עד {formatDateTime(shift.endTime)}
              </p>
              {shift.location ? (
                <p className="mt-1 text-sm text-stone-600">מיקום: {shift.location}</p>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-3xl bg-stone-100 px-4 py-3 text-center">
                <p className="text-xs font-semibold tracking-[0.18em] text-stone-500">
                  קיבולת
                </p>
                <p className="mt-2 text-2xl font-semibold text-stone-900">{shift.capacity}</p>
              </div>
              <div className="rounded-3xl bg-stone-900 px-4 py-3 text-center text-white">
                <p className="text-xs font-semibold tracking-[0.18em] text-stone-300">
                  מקומות פנויים
                </p>
                <p className="mt-2 text-2xl font-semibold">{availableSlots}</p>
              </div>
            </div>
          </div>

          <div className="mt-6">
            {hasChanges ? (
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void handleSaveAssignments()}
                  disabled={isSaving}
                  className="rounded-2xl bg-stone-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:bg-stone-400"
                >
                  שמירה ועדכון המשתמשים
                </button>
                <span className="text-sm text-stone-600">
                  השיוכים השתנו ועדיין לא נשמרו.
                </span>
              </div>
            ) : null}

            {feedback ? (
              <div
                className={`mb-4 rounded-3xl border px-4 py-3 text-sm ${
                  feedback.variant === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-red-200 bg-red-50 text-red-700"
                }`}
              >
                {feedback.message}
              </div>
            ) : null}

            {assignedUsers.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-stone-300 bg-stone-50 px-6 py-10 text-center text-sm text-stone-600">
                גרור לכאן משתמשים מהרשימה הימנית כדי לשייך אותם לתורנות.
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {assignedUsers.map((user) => (
                  <article
                    key={user.id}
                    draggable={user.status !== "approved"}
                    onDragStart={(event) => {
                      if (user.status === "approved") {
                        event.preventDefault();
                        setFeedback({
                          variant: "error",
                          message:
                            "משתמש שאישר את התורנות נעול לשינוי במסך הזה ולא ניתן להסיר אותו ישירות.",
                        });
                        return;
                      }

                      handleDragStart(event, { source: "assigned", userId: user.id });
                    }}
                    className={`rounded-3xl border border-stone-200 p-5 ${
                      user.status === "approved"
                        ? "cursor-not-allowed bg-emerald-50"
                        : "cursor-grab bg-stone-50 active:cursor-grabbing"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-lg font-semibold text-stone-900">
                          {user.name ?? "ללא שם"}
                        </p>
                        <p className="text-sm text-stone-600">{user.email}</p>
                        <p className="text-xs text-stone-500">ID: {user.id}</p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          user.status === "approved"
                            ? "bg-emerald-100 text-emerald-900"
                            : "bg-amber-100 text-amber-900"
                        }`}
                      >
                        {formatRegistrationStatus(user.status)}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => unassignUser(user.id)}
                      disabled={user.status === "approved"}
                      className="mt-4 rounded-2xl border border-stone-300 px-4 py-2 text-sm font-medium text-stone-900 transition hover:border-stone-900 disabled:cursor-not-allowed disabled:border-stone-200 disabled:text-stone-400"
                    >
                      החזר לרשימה
                    </button>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      </section>

      <aside className="space-y-6">
        <section
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            setActiveDropZone("pool");
          }}
          onDragLeave={() => setActiveDropZone((current) => (current === "pool" ? null : current))}
          onDrop={handleDropOnPool}
          className={`rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm transition ${
            activeDropZone === "pool" ? "border-stone-900 bg-stone-50" : ""
          }`}
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold tracking-[0.2em] text-stone-500">
                משתמשים זמינים
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-stone-900">
                כל מי שאינו איש צוות
              </h2>
            </div>
            <span className="rounded-full bg-stone-100 px-4 py-2 text-sm text-stone-700">
              {availableUsers.length}
            </span>
          </div>

          <div className="mt-6 space-y-3">
            {availableUsers.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-sm text-stone-600">
                אין כרגע משתמשים זמינים ברשימה, או שכל המקומות כבר הוכנו לשיבוץ.
              </div>
            ) : (
              availableUsers.map((user) => (
                <article
                  key={user.id}
                  draggable
                  onDragStart={(event) =>
                    handleDragStart(event, { source: "pool", userId: user.id })
                  }
                  className="cursor-grab rounded-3xl border border-stone-200 bg-stone-50 p-4 active:cursor-grabbing"
                >
                  <p className="text-base font-semibold text-stone-900">
                    {user.name ?? "ללא שם"}
                  </p>
                  <p className="mt-1 text-sm text-stone-600">{user.email}</p>
                  <p className="mt-1 text-xs text-stone-500">גרור אל הפעילות</p>
                </article>
              ))
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}
