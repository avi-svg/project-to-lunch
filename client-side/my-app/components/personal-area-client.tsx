"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import {
  STAFF_SHIFT_SETTINGS_STORAGE_KEY,
  STAFF_ZONE_STORAGE_KEY,
  communityMembers,
  defaultShiftSettings,
  findStaffMemberForUser,
  getAvailabilityForStaff,
  getStaffMemberById,
  initialMeetingRequests,
  normalizeShiftSettings,
  type MeetingRequest,
  type StaffShiftSettings,
} from "@/lib/staff-zone";
import {
  confirmShiftRegistration,
  type Shift,
  type ShiftRegistrationStatus,
  type UserRole,
} from "@/lib/shifts";

type Props = {
  currentUser: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
  };
  initialRegisteredShifts: Shift[];
  registeredShiftsError: string;
};

type StaffCreateMeetingForm = {
  communityMemberId: string;
  slotId: string;
  subject: string;
  description: string;
};

function readMeetingRequests() {
  if (typeof window === "undefined") {
    return [] as MeetingRequest[];
  }

  const raw = window.localStorage.getItem(STAFF_ZONE_STORAGE_KEY);

  if (!raw) {
    return initialMeetingRequests;
  }

  try {
    const parsed = JSON.parse(raw) as MeetingRequest[];
    return Array.isArray(parsed) ? parsed : initialMeetingRequests;
  } catch {
    return initialMeetingRequests;
  }
}

function writeMeetingRequests(requests: MeetingRequest[]) {
  window.localStorage.setItem(STAFF_ZONE_STORAGE_KEY, JSON.stringify(requests));
}

function readShiftSettings() {
  if (typeof window === "undefined") {
    return defaultShiftSettings;
  }

  const raw = window.localStorage.getItem(STAFF_SHIFT_SETTINGS_STORAGE_KEY);

  if (!raw) {
    return defaultShiftSettings;
  }

  try {
    return normalizeShiftSettings(JSON.parse(raw) as StaffShiftSettings);
  } catch {
    return defaultShiftSettings;
  }
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("he-IL", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatStatus(status: MeetingRequest["status"]) {
  if (status === "approved") {
    return "מאושר";
  }

  if (status === "rejected") {
    return "נדחה";
  }

  if (status === "cancelled") {
    return "בוטל";
  }

  if (status === "completed") {
    return "הושלם";
  }

  return "ממתין";
}

function formatShiftRegistrationStatus(status: ShiftRegistrationStatus) {
  if (status === "approved") {
    return "שיבוץ מאושר";
  }

  if (status === "rejected") {
    return "נדחה";
  }

  if (status === "cancelled") {
    return "בוטל";
  }

  return "ממתין לאישור שלך";
}

export function PersonalAreaClient({
  currentUser,
  initialRegisteredShifts,
  registeredShiftsError,
}: Props) {
  const isHydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [meetingRequests, setMeetingRequests] = useState<MeetingRequest[]>(() =>
    readMeetingRequests(),
  );
  const [shiftSettings] = useState<StaffShiftSettings>(() => readShiftSettings());
  const [staffCreateForm, setStaffCreateForm] = useState<StaffCreateMeetingForm>({
    communityMemberId: communityMembers[0]?.id ?? "",
    slotId: "",
    subject: "",
    description: "",
  });
  const [actionMessage, setActionMessage] = useState("");
  const [registeredShifts, setRegisteredShifts] = useState<Shift[]>(
    initialRegisteredShifts,
  );
  const [shiftActionMessage, setShiftActionMessage] = useState("");
  const [shiftActionError, setShiftActionError] = useState(registeredShiftsError);
  const [confirmingRegistrationId, setConfirmingRegistrationId] = useState<
    string | null
  >(null);

  const isStaffView = currentUser.role === "staff" || currentUser.role === "admin";
  const assignedStaff = useMemo(
    () => (isStaffView ? findStaffMemberForUser(currentUser) : null),
    [currentUser, isStaffView],
  );

  const visibleRequests = useMemo(() => {
    if (currentUser.role === "admin") {
      return [...meetingRequests].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }

    if (assignedStaff) {
      return meetingRequests
        .filter((request) => request.staffMemberId === assignedStaff.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }

    if (currentUser.role === "staff") {
      return [...meetingRequests].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }

    return meetingRequests
      .filter((request) => request.requesterUserId === currentUser.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [assignedStaff, currentUser.id, currentUser.role, meetingRequests]);

  const availableStaffSlots = useMemo(() => {
    if (!assignedStaff) {
      return [];
    }

    const blockedStartTimes = new Set(
      meetingRequests
        .filter(
          (request) =>
            request.staffMemberId === assignedStaff.id &&
            (request.status === "pending" || request.status === "approved"),
        )
        .map((request) => request.requestedStartTime),
    );

    return getAvailabilityForStaff(assignedStaff.id, shiftSettings).filter(
      (slot) => !blockedStartTimes.has(slot.startTime),
    );
  }, [assignedStaff, meetingRequests, shiftSettings]);

  function updateRequestStatus(requestId: string, status: MeetingRequest["status"]) {
    const nextRequests = meetingRequests.map((request) =>
      request.id === requestId
        ? {
            ...request,
            status,
            updatedAt: new Date().toISOString(),
            reviewedAt: new Date().toISOString(),
            reviewedBy: currentUser.id,
          }
        : request,
    );

    setMeetingRequests(nextRequests);
    writeMeetingRequests(nextRequests);
  }

  function createMeetingForCommunityMember() {
    if (!assignedStaff) {
      return;
    }

    const selectedMember = communityMembers.find(
      (member) => member.id === staffCreateForm.communityMemberId,
    );
    const selectedSlot = availableStaffSlots.find(
      (slot) => slot.id === staffCreateForm.slotId,
    );

    if (
      !selectedMember ||
      !selectedSlot ||
      !staffCreateForm.subject.trim() ||
      !staffCreateForm.description.trim()
    ) {
      return;
    }

    const nextRequest: MeetingRequest = {
      id: `request-${Date.now()}`,
      staffMemberId: assignedStaff.id,
      requesterUserId: selectedMember.id,
      requesterName: selectedMember.name,
      requesterEmail: selectedMember.email,
      requestedStartTime: selectedSlot.startTime,
      requestedEndTime: selectedSlot.endTime,
      subject: staffCreateForm.subject.trim(),
      description: staffCreateForm.description.trim(),
      status: "approved",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      reviewedAt: new Date().toISOString(),
      reviewedBy: currentUser.id,
      rejectionReason: null,
    };

    const nextRequests = [nextRequest, ...meetingRequests];
    setMeetingRequests(nextRequests);
    writeMeetingRequests(nextRequests);
    setStaffCreateForm({
      communityMemberId: communityMembers[0]?.id ?? "",
      slotId: "",
      subject: "",
      description: "",
    });
    setActionMessage("הפגישה נקבעה ונשמרה כמאושרת עבור משתמש הקהילה.");
  }

  async function handleConfirmShift(shiftId: string, registrationId: string) {
    setShiftActionMessage("");
    setShiftActionError("");
    setConfirmingRegistrationId(registrationId);

    try {
      const result = await confirmShiftRegistration(shiftId, registrationId);

      setRegisteredShifts((current) =>
        current.map((shift) => {
          if (shift.id !== shiftId || !shift.myRegistration) {
            return shift;
          }

          return {
            ...shift,
            myRegistration: {
              ...shift.myRegistration,
              status: result.registration.status,
              reviewedAt: result.registration.reviewedAt,
              reviewNote: result.registration.reviewNote,
            },
          };
        }),
      );
      setShiftActionMessage("התורנות אושרה ונשמרה לך כשריון מלא.");
    } catch (error) {
      setShiftActionError(
        error instanceof Error ? error.message : "לא ניתן לאשר את התורנות כרגע.",
      );
    } finally {
      setConfirmingRegistrationId(null);
    }
  }

  if (!isHydrated) {
    return (
      <div className="space-y-8">
        <section className="overflow-hidden rounded-[2rem] border border-stone-200 bg-white shadow-sm">
          <div className="bg-[linear-gradient(135deg,#1c1917,#57534e)] px-8 py-10 text-white">
            <p className="text-sm font-semibold tracking-[0.25em] text-stone-300">
              אזור אישי
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight">
              {isStaffView ? "טיפול בבקשות פגישה" : "הבקשות שלי"}
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-stone-300">
              טוען את הנתונים האישיים והזמינות המעודכנת.
            </p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[2rem] border border-stone-200 bg-white shadow-sm">
        <div className="bg-[linear-gradient(135deg,#1c1917,#57534e)] px-8 py-10 text-white">
          <p className="text-sm font-semibold tracking-[0.25em] text-stone-300">
            אזור אישי
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            {isStaffView ? "טיפול בבקשות פגישה" : "הבקשות שלי"}
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-stone-300">
            {isStaffView
              ? "כאן מרוכזות בקשות הפגישה שמחכות לטיפול של אנשי הצוות, יחד עם אפשרות ליזום פגישה לפי שעות העבודה שהוגדרו."
              : "כאן אפשר לעקוב אחרי בקשות הפגישה ששלחת לאנשי הצוות."}
          </p>
        </div>
      </section>

      {isStaffView ? (
        <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold tracking-[0.2em] text-stone-500">
                פעולות
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-stone-900">
                קביעת פגישה יזומה למשתמש קהילה
              </h2>
            </div>
            {assignedStaff ? (
              <span className="rounded-full bg-stone-100 px-4 py-2 text-sm text-stone-700">
                {assignedStaff.name}
              </span>
            ) : null}
          </div>

          {!assignedStaff ? (
            <div className="mt-6 rounded-3xl border border-dashed border-stone-300 bg-stone-50 p-6 text-sm text-stone-600">
              כדי לקבוע פגישה יזומה, צריך שיוך של המשתמש המחובר לאיש צוות מוגדר.
            </div>
          ) : (
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <label className="block space-y-2">
                <span className="text-sm font-medium text-stone-700">משתמש קהילה</span>
                <select
                  value={staffCreateForm.communityMemberId}
                  onChange={(event) =>
                    setStaffCreateForm((current) => ({
                      ...current,
                      communityMemberId: event.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-stone-300 px-4 py-3 outline-none transition focus:border-stone-900"
                >
                  {communityMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-stone-700">מועד פנוי</span>
                <select
                  value={staffCreateForm.slotId}
                  onChange={(event) =>
                    setStaffCreateForm((current) => ({
                      ...current,
                      slotId: event.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-stone-300 px-4 py-3 outline-none transition focus:border-stone-900"
                >
                  <option value="">בחר מועד פנוי</option>
                  {availableStaffSlots.map((slot) => (
                    <option key={slot.id} value={slot.id}>
                      {formatDateTime(slot.startTime)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-2 lg:col-span-2">
                <span className="text-sm font-medium text-stone-700">נושא הפגישה</span>
                <input
                  value={staffCreateForm.subject}
                  onChange={(event) =>
                    setStaffCreateForm((current) => ({
                      ...current,
                      subject: event.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-stone-300 px-4 py-3 outline-none transition focus:border-stone-900"
                  placeholder="למשל: פגישת מעקב, פגישת היכרות, שיחת תיאום"
                />
              </label>

              <label className="block space-y-2 lg:col-span-2">
                <span className="text-sm font-medium text-stone-700">פרטים</span>
                <textarea
                  value={staffCreateForm.description}
                  onChange={(event) =>
                    setStaffCreateForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  className="min-h-28 w-full rounded-2xl border border-stone-300 px-4 py-3 outline-none transition focus:border-stone-900"
                  placeholder="כתוב בקצרה למה הפגישה נקבעת ומה חשוב שהמשתמש יידע"
                />
              </label>

              <div className="lg:col-span-2">
                <button
                  type="button"
                  onClick={createMeetingForCommunityMember}
                  disabled={
                    !staffCreateForm.communityMemberId ||
                    !staffCreateForm.slotId ||
                    !staffCreateForm.subject.trim() ||
                    !staffCreateForm.description.trim()
                  }
                  className="w-full rounded-2xl bg-stone-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:bg-stone-400"
                >
                  קבע פגישה למשתמש קהילה
                </button>
              </div>
            </div>
          )}

          {actionMessage ? (
            <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {actionMessage}
            </p>
          ) : null}
        </section>
      ) : null}

      {!isStaffView ? (
        <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold tracking-[0.2em] text-stone-500">
              תורנויות
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-stone-900">
              {registeredShifts.length === 0 ? "אין לך תורנויות כרגע" : "התורנויות שלי"}
            </h2>
          </div>
          <span className="rounded-full bg-stone-100 px-4 py-2 text-sm text-stone-700">
            {registeredShifts.length} תורנויות
          </span>
        </div>

        {shiftActionMessage ? (
          <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {shiftActionMessage}
          </p>
        ) : null}

        {shiftActionError ? (
          <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {shiftActionError}
          </p>
        ) : null}

        <div className="mt-6 space-y-4">
          {registeredShifts.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-stone-300 bg-stone-50 p-6 text-sm text-stone-600">
              ברגע שישבצו אותך לתורנות, היא תופיע כאן עם אפשרות לאשר השתתפות.
            </div>
          ) : (
            registeredShifts.map((shift) => {
              const myRegistration = shift.myRegistration;

              if (!myRegistration) {
                return null;
              }

              return (
                <article
                  key={shift.id}
                  className={`rounded-3xl border p-5 ${
                    myRegistration.status === "approved"
                      ? "border-emerald-200 bg-emerald-50"
                      : "border-stone-200 bg-stone-50"
                  }`}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <p className="text-lg font-semibold text-stone-900">{shift.title}</p>
                      <p className="text-sm text-stone-600">
                        התחלה: {formatDateTime(shift.startTime)}
                      </p>
                      <p className="text-sm text-stone-600">
                        סיום: {formatDateTime(shift.endTime)}
                      </p>
                      {shift.location ? (
                        <p className="text-sm text-stone-600">מיקום: {shift.location}</p>
                      ) : null}
                      {shift.description ? (
                        <p className="text-sm leading-6 text-stone-700">
                          {shift.description}
                        </p>
                      ) : null}
                    </div>

                    <div className="space-y-3 lg:min-w-56">
                      <span className="inline-flex rounded-full bg-stone-900 px-3 py-1 text-xs font-semibold text-white">
                        {formatShiftRegistrationStatus(myRegistration.status)}
                      </span>

                      {myRegistration.status === "pending" ? (
                        <button
                          type="button"
                          onClick={() =>
                            handleConfirmShift(shift.id, myRegistration.id)
                          }
                          disabled={confirmingRegistrationId === myRegistration.id}
                          className="w-full rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-300"
                        >
                          {confirmingRegistrationId === myRegistration.id
                            ? "מאשר..."
                            : "אישור לתורנות"}
                        </button>
                      ) : (
                        <p className="text-sm text-stone-600">
                          {myRegistration.status === "approved"
                            ? "התורנות שמורה עבורך באופן מלא."
                            : "סטטוס התורנות עודכן על ידי הצוות."}
                        </p>
                      )}
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
        </section>
      ) : null}

      <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold tracking-[0.2em] text-stone-500">
              בקשות
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-stone-900">
              {visibleRequests.length === 0 ? "אין כרגע בקשות" : "רשימת בקשות"}
            </h2>
          </div>
          <span className="rounded-full bg-stone-100 px-4 py-2 text-sm text-stone-700">
            {visibleRequests.length} בקשות
          </span>
        </div>

        <div className="mt-6 space-y-4">
          {visibleRequests.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-stone-300 bg-stone-50 p-6 text-sm text-stone-600">
              עדיין אין בקשות להצגה באזור הזה.
            </div>
          ) : (
            visibleRequests.map((request) => {
              const staffMember = getStaffMemberById(request.staffMemberId);

              return (
                <article
                  key={request.id}
                  className="rounded-3xl border border-stone-200 bg-stone-50 p-5"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <p className="text-lg font-semibold text-stone-900">
                        {request.subject}
                      </p>
                      <p className="text-sm text-stone-600">
                        מועד מבוקש: {formatDateTime(request.requestedStartTime)}
                      </p>
                      <p className="text-sm text-stone-600">
                        איש צוות: {staffMember?.name ?? request.staffMemberId}
                      </p>
                      <p className="text-sm text-stone-600">
                        מבקש: {request.requesterName}
                      </p>
                      <p className="text-sm leading-6 text-stone-700">
                        {request.description}
                      </p>
                    </div>

                    <div className="space-y-3">
                      <span className="inline-flex rounded-full bg-stone-900 px-3 py-1 text-xs font-semibold text-white">
                        {formatStatus(request.status)}
                      </span>

                      {isStaffView && request.status === "pending" ? (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => updateRequestStatus(request.id, "approved")}
                            className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500"
                          >
                            אשר
                          </button>
                          <button
                            type="button"
                            onClick={() => updateRequestStatus(request.id, "rejected")}
                            className="rounded-2xl bg-amber-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-500"
                          >
                            דחה
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
