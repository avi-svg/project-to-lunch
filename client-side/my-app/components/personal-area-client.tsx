"use client";

import Link from "next/link";
import {
  type FormEvent,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { ShiftSwapRequestsClient } from "@/components/shift-swap-requests-client";
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
  type Shift,
  type ShiftRegistrationStatus,
  type ShiftSwapRequest,
  type UserRole,
} from "@/lib/shifts";

type PasswordForm = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

type Props = {
  currentUser: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    birthDate?: string | null;
  };
  initialRegisteredShifts: Shift[];
  registeredShiftsError: string;
  initialSwapRequests: ShiftSwapRequest[];
  swapRequestsError: string;
  initialProfileError: string;
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
    timeZone: "Asia/Jerusalem",
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatMeetingStatus(status: MeetingRequest["status"]) {
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

function getMeetingRequestPriority(request: MeetingRequest, now: number) {
  const startTime = new Date(request.requestedStartTime).getTime();
  const endTime = new Date(request.requestedEndTime).getTime();

  if (request.status === "pending") {
    return { bucket: 0, sortValue: startTime };
  }

  if (startTime <= now && now <= endTime) {
    return { bucket: 1, sortValue: endTime };
  }

  if (startTime > now) {
    return { bucket: 2, sortValue: startTime };
  }

  return { bucket: 3, sortValue: -endTime };
}

function getRegisteredShiftPriority(shift: Shift, now: number) {
  const startTime = new Date(shift.startTime).getTime();
  const endTime = new Date(shift.endTime).getTime();
  const status = shift.myRegistration?.status;

  if (status === "pending") {
    return { bucket: 0, sortValue: startTime };
  }

  if (startTime <= now && now <= endTime) {
    return { bucket: 1, sortValue: endTime };
  }

  if (startTime > now) {
    return { bucket: 2, sortValue: startTime };
  }

  return { bucket: 3, sortValue: -endTime };
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
        : "שמירת הפרטים נכשלה.";

    throw new Error(message);
  }

  return data;
}

export function PersonalAreaClient({
  currentUser,
  initialRegisteredShifts,
  registeredShiftsError,
  initialSwapRequests,
  swapRequestsError,
  initialProfileError,
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
  const registeredShifts = initialRegisteredShifts;
  const [swapRequests, setSwapRequests] = useState<ShiftSwapRequest[]>(
    initialSwapRequests,
  );
  const [birthDate, setBirthDate] = useState(currentUser.birthDate ?? "");
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState(initialProfileError);
  const [isProfilePending, startProfileTransition] = useTransition();
  const [passwordForm, setPasswordForm] = useState<PasswordForm>({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [isPasswordPending, startPasswordTransition] = useTransition();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 60000);

    return () => window.clearInterval(timer);
  }, []);

  const isStaffView = currentUser.role === "staff" || currentUser.role === "admin";
  const assignedStaff = useMemo(
    () => (isStaffView ? findStaffMemberForUser(currentUser) : null),
    [currentUser, isStaffView],
  );

  const visibleRequests = useMemo(() => {
    const sortRequests = (requests: MeetingRequest[]) =>
      [...requests].sort((a, b) => {
        const aPriority = getMeetingRequestPriority(a, now);
        const bPriority = getMeetingRequestPriority(b, now);

        if (aPriority.bucket !== bPriority.bucket) {
          return aPriority.bucket - bPriority.bucket;
        }

        if (aPriority.sortValue !== bPriority.sortValue) {
          return aPriority.sortValue - bPriority.sortValue;
        }

        return b.createdAt.localeCompare(a.createdAt);
      });

    if (currentUser.role === "admin") {
      return sortRequests(meetingRequests);
    }

    if (assignedStaff) {
      return sortRequests(
        meetingRequests.filter((request) => request.staffMemberId === assignedStaff.id),
      );
    }

    if (currentUser.role === "staff") {
      return sortRequests(meetingRequests);
    }

    return sortRequests(
      meetingRequests.filter((request) => request.requesterUserId === currentUser.id),
    );
  }, [assignedStaff, currentUser.id, currentUser.role, meetingRequests, now]);

  const prioritizedRegisteredShifts = useMemo(
    () =>
      [...registeredShifts].sort((a, b) => {
        const aPriority = getRegisteredShiftPriority(a, now);
        const bPriority = getRegisteredShiftPriority(b, now);

        if (aPriority.bucket !== bPriority.bucket) {
          return aPriority.bucket - bPriority.bucket;
        }

        if (aPriority.sortValue !== bPriority.sortValue) {
          return aPriority.sortValue - bPriority.sortValue;
        }

        return a.startTime.localeCompare(b.startTime);
      }),
    [now, registeredShifts],
  );

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

  const activeSwapRequestsByShiftId = useMemo(
    () =>
      new Map(
        swapRequests
          .filter(
            (request) =>
              request.requesterUserId === currentUser.id &&
              (request.status === "pending" || request.status === "approved"),
          )
          .map((request) => [request.shiftId, request]),
      ),
    [currentUser.id, swapRequests],
  );

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

  function handleProfileSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileMessage("");
    setProfileError("");

    startProfileTransition(async () => {
      try {
        const result = await parseResponse(
          await fetch(`/api/users/${currentUser.id}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              birthDate: birthDate || null,
            }),
          }),
        );

        const nextBirthDate =
          typeof result?.user?.birthDate === "string" ? result.user.birthDate : "";

        setBirthDate(nextBirthDate);
        setProfileMessage("תאריך יום ההולדת עודכן.");
      } catch (error) {
        setProfileError(
          error instanceof Error
            ? error.message
            : "לא ניתן לשמור את תאריך יום ההולדת.",
        );
      }
    });
  }

  function handlePasswordSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordMessage("");
    setPasswordError("");

    if (passwordForm.newPassword.length < 8) {
      setPasswordError("הסיסמה החדשה חייבת להכיל לפחות 8 תווים.");
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError("הסיסמה החדשה ואישורה אינם תואמים.");
      return;
    }

    startPasswordTransition(async () => {
      try {
        await parseResponse(
          await fetch("/api/housing-attendance/verify-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: passwordForm.currentPassword }),
          }),
        );

        await parseResponse(
          await fetch(`/api/users/${currentUser.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: passwordForm.newPassword }),
          }),
        );

        setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
        setPasswordMessage("הסיסמה עודכנה בהצלחה.");
      } catch (error) {
        setPasswordError(
          error instanceof Error ? error.message : "לא ניתן לעדכן את הסיסמה.",
        );
      }
    });
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
              : "כאן אפשר לעקוב אחרי התורנויות האישיות, לפתוח בקשות החלפה ולראות את סטטוס הבקשות שלך."}
          </p>
        </div>
      </section>

      <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold tracking-[0.2em] text-stone-500">
              הפרטים שלי
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-stone-900">
              עדכון יום הולדת
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-stone-600">
              אפשר לעדכן כאן את תאריך יום ההולדת כדי לשמור אותו בפרופיל האישי.
            </p>
          </div>

          <div className="rounded-3xl bg-stone-50 px-5 py-4 text-sm text-stone-600">
            <p className="font-medium text-stone-900">{currentUser.name}</p>
            <p>{currentUser.email}</p>
          </div>
        </div>

        <form onSubmit={handleProfileSave} className="mt-6 space-y-4">
          <div className="grid gap-4 md:grid-cols-[minmax(0,22rem)_auto_auto] md:items-end">
            <label className="space-y-2">
              <span className="block text-sm font-medium text-stone-700">
                תאריך יום הולדת
              </span>
              <input
                type="date"
                value={birthDate}
                onChange={(event) => setBirthDate(event.target.value)}
                className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 outline-none transition focus:border-stone-900"
              />
            </label>

            <button
              type="button"
              onClick={() => setBirthDate("")}
              disabled={isProfilePending || birthDate.length === 0}
              className="rounded-2xl border border-stone-300 bg-white px-5 py-3 text-sm font-medium text-stone-900 transition hover:border-stone-900 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-400"
            >
              נקה תאריך
            </button>

            <button
              type="submit"
              disabled={isProfilePending}
              className="rounded-2xl bg-stone-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:bg-stone-400"
            >
              {isProfilePending ? "שומר..." : "שמור"}
            </button>
          </div>

          {profileError ? (
            <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {profileError}
            </p>
          ) : null}

          {profileMessage ? (
            <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {profileMessage}
            </p>
          ) : null}
        </form>
      </section>

      {isStaffView ? (
        <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
          <div>
            <p className="text-sm font-semibold tracking-[0.2em] text-stone-500">
              אבטחה
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-stone-900">
              שינוי סיסמה
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-stone-600">
              לשינוי הסיסמה יש להזין את הסיסמה הנוכחית ואת הסיסמה החדשה.
            </p>
          </div>

          <form onSubmit={handlePasswordSave} className="mt-6 space-y-4">
            <div className="grid gap-4 md:grid-cols-[minmax(0,22rem)]">
              <label className="space-y-2">
                <span className="block text-sm font-medium text-stone-700">
                  סיסמה נוכחית
                </span>
                <input
                  type="password"
                  value={passwordForm.currentPassword}
                  onChange={(e) =>
                    setPasswordForm((f) => ({ ...f, currentPassword: e.target.value }))
                  }
                  autoComplete="current-password"
                  className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 outline-none transition focus:border-stone-900"
                />
              </label>

              <label className="space-y-2">
                <span className="block text-sm font-medium text-stone-700">
                  סיסמה חדשה
                </span>
                <input
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(e) =>
                    setPasswordForm((f) => ({ ...f, newPassword: e.target.value }))
                  }
                  autoComplete="new-password"
                  className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 outline-none transition focus:border-stone-900"
                />
              </label>

              <label className="space-y-2">
                <span className="block text-sm font-medium text-stone-700">
                  אישור סיסמה חדשה
                </span>
                <input
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(e) =>
                    setPasswordForm((f) => ({ ...f, confirmPassword: e.target.value }))
                  }
                  autoComplete="new-password"
                  className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 outline-none transition focus:border-stone-900"
                />
              </label>
            </div>

            <div>
              <button
                type="submit"
                disabled={
                  isPasswordPending ||
                  !passwordForm.currentPassword ||
                  !passwordForm.newPassword ||
                  !passwordForm.confirmPassword
                }
                className="rounded-2xl bg-stone-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:bg-stone-400"
              >
                {isPasswordPending ? "מעדכן..." : "עדכן סיסמה"}
              </button>
            </div>

            {passwordError ? (
              <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                {passwordError}
              </p>
            ) : null}

            {passwordMessage ? (
              <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                {passwordMessage}
              </p>
            ) : null}
          </form>
        </section>
      ) : null}

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
                <span className="text-sm font-medium text-stone-700">
                  משתמש קהילה
                </span>
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
        <>
          <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold tracking-[0.2em] text-stone-500">
                  תורנויות
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-stone-900">
                  {registeredShifts.length === 0
                    ? "אין לך תורנויות כרגע"
                    : "התורנויות שלי"}
                </h2>
              </div>
              <span className="rounded-full bg-stone-100 px-4 py-2 text-sm text-stone-700">
                {registeredShifts.length} תורנויות
              </span>
              <Link
                href="/my-shifts"
                className="inline-flex rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm font-medium text-stone-900 transition hover:border-stone-900"
              >
                מעבר למסך התורנויות שלי
              </Link>
            </div>

            <div className="mt-6 space-y-4">
              {registeredShiftsError ? (
                <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {registeredShiftsError}
                </p>
              ) : null}

              {registeredShifts.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-stone-300 bg-stone-50 p-6 text-sm text-stone-600">
                  ברגע שישבצו אותך לתורנויות, הן יופיעו כאן עם אפשרות לאישור
                  השתתפות או פתיחת בקשת החלפה.
                </div>
              ) : (
                prioritizedRegisteredShifts.map((shift, index) => {
                  const myRegistration = shift.myRegistration;
                  const activeSwapRequest = activeSwapRequestsByShiftId.get(shift.id);

                  if (!myRegistration) {
                    return null;
                  }

                  return (
                    <article
                      key={shift.id}
                      className={`rounded-3xl border p-5 ${
                        index === 0
                          ? "border-stone-900 bg-white shadow-lg ring-1 ring-stone-200"
                          : myRegistration.status === "approved"
                            ? "border-emerald-200 bg-emerald-50"
                            : "border-stone-200 bg-stone-50"
                      }`}
                    >
                      {index === 0 ? (
                        <div className="mb-4 inline-flex rounded-full bg-stone-900 px-3 py-2 text-xs font-semibold text-white">
                          הכי רלוונטי עכשיו
                        </div>
                      ) : null}
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-2">
                          <p className="text-lg font-semibold text-stone-900">
                            {shift.title}
                          </p>
                          <p className="text-sm text-stone-600">
                            התחלה: {formatDateTime(shift.startTime)}
                          </p>
                          <p className="text-sm text-stone-600">
                            סיום: {formatDateTime(shift.endTime)}
                          </p>
                          {shift.location ? (
                            <p className="text-sm text-stone-600">
                              מיקום: {shift.location}
                            </p>
                          ) : null}
                          {shift.description ? (
                            <p className="text-sm leading-6 text-stone-700">
                              {shift.description}
                            </p>
                          ) : null}
                        </div>

                        <div className="space-y-3 lg:min-w-72">
                          <span className="inline-flex rounded-full bg-stone-900 px-3 py-1 text-xs font-semibold text-white">
                            {formatShiftRegistrationStatus(myRegistration.status)}
                          </span>

                          {activeSwapRequest ? (
                            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                              כבר קיימת בקשת החלפה פעילה לתורנות הזו.
                            </div>
                          ) : null}

                          <div className="space-y-3">
                            <p className="text-sm text-stone-600">
                              {myRegistration.status === "pending"
                                ? "במסך הניהול של התורנות אפשר לאשר את השיבוץ, לראות מי איתך בתורנות ולהמשיך משם."
                                : myRegistration.status === "approved"
                                  ? "כל הפרטים, בקשות ההחלפה, דיווח הנוכחות וההערות נמצאים במסך הניהול של התורנות."
                                  : "פרטי התורנות והעדכונים הרלוונטיים זמינים במסך הניהול של התורנות."}
                            </p>

                            <Link
                              href={`/my-shifts/${shift.id}`}
                              className="inline-flex w-full items-center justify-center rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm font-medium text-stone-900 transition hover:border-stone-900"
                            >
                              מעבר לניהול התורנות
                            </Link>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>

          <ShiftSwapRequestsClient
            currentUserId={currentUser.id}
            currentUserRole={currentUser.role}
            initialRequests={swapRequests}
            requests={swapRequests}
            onRequestsChange={setSwapRequests}
            initialError={swapRequestsError}
            heading="בקשות החלפה"
            description="כאן אפשר לעקוב אחרי בקשות ההחלפה שלך ולראות את הבקשות הפעילות שמופיעות לידיעת שאר המשתמשים."
          />
        </>
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
            visibleRequests.map((request, index) => {
              const staffMember = getStaffMemberById(request.staffMemberId);

              return (
                <article
                  key={request.id}
                  className={`rounded-3xl border p-5 ${
                    index === 0
                      ? "border-stone-900 bg-white shadow-lg ring-1 ring-stone-200"
                      : "border-stone-200 bg-stone-50"
                  }`}
                >
                  {index === 0 ? (
                    <div className="mb-4 inline-flex rounded-full bg-stone-900 px-3 py-2 text-xs font-semibold text-white">
                      הכי רלוונטי עכשיו
                    </div>
                  ) : null}
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
                        {formatMeetingStatus(request.status)}
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
