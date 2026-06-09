"use client";

import { useState, useTransition } from "react";
import type { PermissionEntry } from "@/lib/server-permissions";
import {
  PERM_VIEW_HOUSING_HISTORY,
  PERM_MANAGE_HOUSING_HISTORY,
} from "@/lib/server-permissions";
import type { BackendDirectoryUser } from "@/lib/server-users";

type Props = {
  currentUserId: string;
  isBootstrapped: boolean;
  initialViewPermissions: PermissionEntry[];
  initialManagePermissions: PermissionEntry[];
  allStaff: BackendDirectoryUser[];
};

async function parseResponse(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const data = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const message =
      typeof data === "object" &&
      data !== null &&
      "message" in data &&
      typeof (data as { message: unknown }).message === "string"
        ? (data as { message: string }).message
        : "הפעולה נכשלה.";
    throw new Error(message);
  }

  return data;
}

export function ManagePermissionsClient({
  currentUserId,
  isBootstrapped: initialIsBootstrapped,
  initialViewPermissions,
  initialManagePermissions,
  allStaff,
}: Props) {
  const [isBootstrapped, setIsBootstrapped] = useState(initialIsBootstrapped);
  const [viewPermissions, setViewPermissions] = useState<PermissionEntry[]>(initialViewPermissions);
  const [managePermissions, setManagePermissions] = useState<PermissionEntry[]>(initialManagePermissions);
  const [selectedManagerIds, setSelectedManagerIds] = useState<Set<string>>(
    () => new Set(allStaff.map((s) => s.id)),
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const viewPermissionUserIds = new Set(viewPermissions.map((p) => p.userId));
  const managePermissionUserIds = new Set(managePermissions.map((p) => p.userId));

  function toggleManagerSelection(userId: string) {
    setSelectedManagerIds((current) => {
      const next = new Set(current);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  }

  function handleBootstrap() {
    const managerIds = Array.from(selectedManagerIds);

    if (managerIds.length === 0) {
      setErrorMessage("יש לבחור לפחות מנהל הרשאות אחד.");
      return;
    }

    setErrorMessage("");
    setSuccessMessage("");

    startTransition(async () => {
      try {
        await parseResponse(
          await fetch("/api/permissions/bootstrap", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ managerUserIds: managerIds }),
          }),
        );

        const newManageEntries: PermissionEntry[] = allStaff
          .filter((s) => selectedManagerIds.has(s.id))
          .map((s) => ({
            userId: s.id,
            permission: PERM_MANAGE_HOUSING_HISTORY,
            grantedAt: new Date().toISOString(),
            grantedById: currentUserId,
            userName: s.name ?? s.email,
            userEmail: s.email,
            grantedByName: null,
          }));

        setManagePermissions(newManageEntries);
        setIsBootstrapped(true);
        setSuccessMessage("ניהול ההרשאות הופעל בהצלחה. מעכשיו רק האנשים שנבחרו יכולים לנהל הרשאות.");
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "לא ניתן להפעיל את ניהול ההרשאות.",
        );
      }
    });
  }

  function handleToggleViewPermission(targetUser: BackendDirectoryUser) {
    const hasPermission = viewPermissionUserIds.has(targetUser.id);
    setErrorMessage("");
    setSuccessMessage("");

    startTransition(async () => {
      try {
        if (hasPermission) {
          await parseResponse(
            await fetch(
              `/api/permissions/${targetUser.id}?permission=${PERM_VIEW_HOUSING_HISTORY}`,
              { method: "DELETE" },
            ),
          );
          setViewPermissions((current) =>
            current.filter((p) => p.userId !== targetUser.id),
          );
        } else {
          await parseResponse(
            await fetch("/api/permissions", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                targetUserId: targetUser.id,
                permission: PERM_VIEW_HOUSING_HISTORY,
              }),
            }),
          );
          setViewPermissions((current) => [
            ...current,
            {
              userId: targetUser.id,
              permission: PERM_VIEW_HOUSING_HISTORY,
              grantedAt: new Date().toISOString(),
              grantedById: currentUserId,
              userName: targetUser.name ?? targetUser.email,
              userEmail: targetUser.email,
              grantedByName: null,
            },
          ]);
        }
        setSuccessMessage("ההרשאה עודכנה בהצלחה.");
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "לא ניתן לעדכן את ההרשאה.",
        );
      }
    });
  }

  function handleToggleManagePermission(targetUser: BackendDirectoryUser) {
    const hasPermission = managePermissionUserIds.has(targetUser.id);
    setErrorMessage("");
    setSuccessMessage("");

    startTransition(async () => {
      try {
        if (hasPermission) {
          await parseResponse(
            await fetch(
              `/api/permissions/${targetUser.id}?permission=${PERM_MANAGE_HOUSING_HISTORY}`,
              { method: "DELETE" },
            ),
          );
          setManagePermissions((current) =>
            current.filter((p) => p.userId !== targetUser.id),
          );
        } else {
          await parseResponse(
            await fetch("/api/permissions", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                targetUserId: targetUser.id,
                permission: PERM_MANAGE_HOUSING_HISTORY,
              }),
            }),
          );
          setManagePermissions((current) => [
            ...current,
            {
              userId: targetUser.id,
              permission: PERM_MANAGE_HOUSING_HISTORY,
              grantedAt: new Date().toISOString(),
              grantedById: currentUserId,
              userName: targetUser.name ?? targetUser.email,
              userEmail: targetUser.email,
              grantedByName: null,
            },
          ]);
        }
        setSuccessMessage("ההרשאה עודכנה בהצלחה.");
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "לא ניתן לעדכן את ההרשאה.",
        );
      }
    });
  }

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[2rem] border border-stone-200 bg-white shadow-sm">
        <div className="bg-[linear-gradient(135deg,#1c1917,#57534e)] px-8 py-10 text-white">
          <p className="text-sm font-semibold tracking-[0.25em] text-stone-300">
            ניהול הרשאות
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            הרשאות גישה לאנשי צוות
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-stone-300">
            {isBootstrapped
              ? "כאן ניתן לנהל מי מאנשי הצוות יכול לצפות בהיסטוריית דיווחי הנוכחות בדיור, ומי יכול לנהל הרשאות אלה."
              : "לפני שמתחילים, יש לבחור מי מאנשי הצוות יוכל לנהל הרשאות בעתיד. לאחר הבחירה, רק הנבחרים יוכלו לשנות הרשאות."}
          </p>
        </div>
      </section>

      {errorMessage ? (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {errorMessage}
        </p>
      ) : null}

      {successMessage ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {successMessage}
        </p>
      ) : null}

      {!isBootstrapped ? (
        <section className="rounded-[2rem] border border-amber-200 bg-white p-6 shadow-sm">
          <div className="mb-6">
            <p className="text-sm font-semibold tracking-[0.2em] text-amber-600">
              הגדרה ראשונית
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-stone-900">
              בחר מנהלי הרשאות
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-stone-600">
              בחר מי מאנשי הצוות יקבל הרשאת ניהול. רק הם יוכלו לשנות הרשאות בעתיד.
              כברירת מחדל כולם נבחרים — אפשר לבטל סימון לאנשים שלא אמורים לנהל.
            </p>
          </div>

          <div className="space-y-3">
            {allStaff.map((member) => (
              <label
                key={member.id}
                className="flex cursor-pointer items-center gap-4 rounded-2xl border border-stone-200 bg-stone-50 px-5 py-4 transition hover:border-stone-400"
              >
                <input
                  type="checkbox"
                  checked={selectedManagerIds.has(member.id)}
                  onChange={() => toggleManagerSelection(member.id)}
                  className="h-4 w-4 rounded border-stone-300 accent-stone-900"
                />
                <div className="flex-1">
                  <p className="font-medium text-stone-900">
                    {member.name ?? member.email}
                  </p>
                  {member.name ? (
                    <p className="text-sm text-stone-500">{member.email}</p>
                  ) : null}
                </div>
              </label>
            ))}
          </div>

          <div className="mt-6">
            <button
              type="button"
              onClick={handleBootstrap}
              disabled={isPending || selectedManagerIds.size === 0}
              className="rounded-2xl bg-stone-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:bg-stone-400"
            >
              {isPending ? "מגדיר..." : `אשר בחירה (${selectedManagerIds.size} נבחרו)`}
            </button>
          </div>
        </section>
      ) : (
        <>
          <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
            <div className="mb-6">
              <p className="text-sm font-semibold tracking-[0.2em] text-stone-500">
                הרשאת צפייה
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-stone-900">
                גישה להיסטוריית נוכחות בדיור
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-stone-600">
                אנשי צוות עם הרשאה זו יכולים לצפות בעמוד היסטוריית דיווחי הנוכחות בדיור.
              </p>
            </div>

            <div className="space-y-3">
              {allStaff.map((member) => {
                const hasPermission = viewPermissionUserIds.has(member.id);
                return (
                  <div
                    key={member.id}
                    className="flex items-center gap-4 rounded-2xl border border-stone-200 bg-stone-50 px-5 py-4"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-stone-900">
                        {member.name ?? member.email}
                      </p>
                      {member.name ? (
                        <p className="text-sm text-stone-500">{member.email}</p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleViewPermission(member)}
                      disabled={isPending}
                      className={`rounded-xl px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed ${
                        hasPermission
                          ? "bg-emerald-100 text-emerald-800 hover:bg-rose-100 hover:text-rose-800"
                          : "bg-stone-100 text-stone-600 hover:bg-emerald-100 hover:text-emerald-800"
                      }`}
                    >
                      {hasPermission ? "יש גישה — לחץ לביטול" : "אין גישה — לחץ להענקה"}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
            <div className="mb-6">
              <p className="text-sm font-semibold tracking-[0.2em] text-stone-500">
                הרשאת ניהול
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-stone-900">
                ניהול הרשאות נוכחות בדיור
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-stone-600">
                אנשי צוות עם הרשאה זו יכולים להיכנס לעמוד זה ולנהל מי רשאי לצפות בהיסטוריה.
              </p>
            </div>

            <div className="space-y-3">
              {allStaff.map((member) => {
                const hasPermission = managePermissionUserIds.has(member.id);
                return (
                  <div
                    key={member.id}
                    className="flex items-center gap-4 rounded-2xl border border-stone-200 bg-stone-50 px-5 py-4"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-stone-900">
                        {member.name ?? member.email}
                      </p>
                      {member.name ? (
                        <p className="text-sm text-stone-500">{member.email}</p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleManagePermission(member)}
                      disabled={isPending}
                      className={`rounded-xl px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed ${
                        hasPermission
                          ? "bg-emerald-100 text-emerald-800 hover:bg-rose-100 hover:text-rose-800"
                          : "bg-stone-100 text-stone-600 hover:bg-emerald-100 hover:text-emerald-800"
                      }`}
                    >
                      {hasPermission ? "מנהל הרשאות — לחץ לביטול" : "לא מנהל — לחץ להענקה"}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
