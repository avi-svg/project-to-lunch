"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import {
  defaultShiftSettings,
  getAvailabilityForStaff,
  getStaffMemberById,
  initialMeetingRequests,
  normalizeShiftSettings,
  staffMembers,
  STAFF_SHIFT_SETTINGS_STORAGE_KEY,
  STAFF_ZONE_STORAGE_KEY,
  type MeetingRequest,
  type StaffAvailabilitySlot,
  type StaffShiftSettings,
} from "@/lib/staff-zone";
import type { UserRole } from "@/lib/shifts";

type Props = {
  currentUser: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
  };
};

type RequestFormState = {
  subject: string;
  description: string;
};

const initialFormState: RequestFormState = {
  subject: "",
  description: "",
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
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
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

export function StaffZoneClient({ currentUser }: Props) {
  const isHydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const [selectedStaffId, setSelectedStaffId] = useState(staffMembers[0]?.id ?? "");
  const [selectedSlot, setSelectedSlot] = useState<StaffAvailabilitySlot | null>(null);
  const [form, setForm] = useState<RequestFormState>(initialFormState);
  const [meetingRequests, setMeetingRequests] = useState<MeetingRequest[]>(() =>
    readMeetingRequests(),
  );
  const [shiftSettings] = useState<StaffShiftSettings>(() => readShiftSettings());
  const [successMessage, setSuccessMessage] = useState("");

  const selectedStaff = useMemo(
    () => getStaffMemberById(selectedStaffId) ?? staffMembers[0] ?? null,
    [selectedStaffId],
  );

  const staffAvailability = useMemo(() => {
    const approvedOrPending = new Set(
      meetingRequests
        .filter(
          (request) =>
            request.staffMemberId === selectedStaffId &&
            (request.status === "pending" || request.status === "approved"),
        )
        .map((request) => request.requestedStartTime),
    );

    return getAvailabilityForStaff(selectedStaffId, shiftSettings).filter(
      (slot) => !approvedOrPending.has(slot.startTime),
    );
  }, [meetingRequests, selectedStaffId, shiftSettings]);

  const selectedStaffRequests = useMemo(
    () =>
      meetingRequests
        .filter((request) => request.staffMemberId === selectedStaffId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [meetingRequests, selectedStaffId],
  );

  function handleSubmitRequest() {
    if (!selectedStaff || !selectedSlot || !form.subject.trim() || !form.description.trim()) {
      return;
    }

    const nextRequest: MeetingRequest = {
      id: `request-${Date.now()}`,
      staffMemberId: selectedStaff.id,
      requesterUserId: currentUser.id,
      requesterName: currentUser.name,
      requesterEmail: currentUser.email,
      requestedStartTime: selectedSlot.startTime,
      requestedEndTime: selectedSlot.endTime,
      subject: form.subject.trim(),
      description: form.description.trim(),
      status: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      reviewedAt: null,
      reviewedBy: null,
      rejectionReason: null,
    };

    const nextRequests = [nextRequest, ...meetingRequests];
    setMeetingRequests(nextRequests);
    writeMeetingRequests(nextRequests);
    setSelectedSlot(null);
    setForm(initialFormState);
    setSuccessMessage("בקשת הפגישה נשלחה לטיפול איש הצוות.");
  }

  if (!isHydrated) {
    return (
      <div className="space-y-8">
        <section className="overflow-hidden rounded-[2rem] border border-stone-200 bg-white shadow-sm">
          <div className="bg-[linear-gradient(135deg,#1c1917,#57534e)] px-8 py-10 text-white">
            <p className="text-sm font-semibold tracking-[0.25em] text-stone-300">
              אזור צוות
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight">
              קביעת פגישה עם אנשי הצוות
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-stone-300">
              טוען את הזמינות והפגישות של אנשי הצוות.
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
            אזור צוות
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            קביעת פגישה עם אנשי הצוות
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-stone-300">
            בוחרים איש צוות, רואים מועדים פנויים שנגזרו ממשמרות העבודה, ושולחים
            בקשת פגישה לטיפול.
          </p>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-6">
          <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
            <div className="mb-5">
              <p className="text-sm font-semibold tracking-[0.2em] text-stone-500">
                אנשי צוות
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-stone-900">
                בחר איש צוות
              </h2>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {staffMembers.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => {
                    setSelectedStaffId(member.id);
                    setSelectedSlot(null);
                    setSuccessMessage("");
                  }}
                  className={`rounded-3xl border p-5 text-right transition ${
                    member.id === selectedStaffId
                      ? "border-stone-900 bg-stone-900 text-white"
                      : "border-stone-200 bg-stone-50 text-stone-900 hover:border-stone-900"
                  }`}
                >
                  <p className="text-lg font-semibold">{member.name}</p>
                  <p className="mt-2 text-sm opacity-80">{member.title}</p>
                  <p className="mt-1 text-sm opacity-80">{member.area}</p>
                  <p className="mt-4 text-sm leading-6 opacity-90">{member.bio}</p>
                </button>
              ))}
            </div>
          </section>

          {selectedStaff ? (
            <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold tracking-[0.2em] text-stone-500">
                    זמינות
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-stone-900">
                    מועדים פנויים אצל {selectedStaff.name}
                  </h2>
                </div>
                <div className="rounded-2xl bg-stone-100 px-4 py-3 text-sm text-stone-600">
                  {staffAvailability.length} מועדים פנויים
                </div>
              </div>

              {staffAvailability.length === 0 ? (
                <p className="mt-6 rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-sm text-stone-600">
                  כרגע אין מועדים פנויים. אפשר לעדכן אותם דרך אזור משמרות צוות.
                </p>
              ) : (
                <div className="mt-6 grid gap-3 md:grid-cols-2">
                  {staffAvailability.slice(0, 10).map((slot) => (
                    <button
                      key={slot.id}
                      type="button"
                      onClick={() => {
                        setSelectedSlot(slot);
                        setSuccessMessage("");
                      }}
                      className={`rounded-2xl border px-4 py-4 text-right transition ${
                        selectedSlot?.id === slot.id
                          ? "border-emerald-600 bg-emerald-50"
                          : "border-stone-200 bg-stone-50 hover:border-stone-900"
                      }`}
                    >
                      <p className="text-sm font-semibold text-stone-900">
                        {formatDateTime(slot.startTime)}
                      </p>
                      <p className="mt-1 text-xs text-stone-500">
                        עד {formatDateTime(slot.endTime)}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </section>
          ) : null}
        </div>

        <div className="space-y-6">
          <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
            <div>
              <p className="text-sm font-semibold tracking-[0.2em] text-stone-500">
                בקשת פגישה
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-stone-900">
                פרטי הבקשה
              </h2>
            </div>

            {selectedStaff && selectedSlot ? (
              <div className="mt-5 rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-stone-700">
                <p className="font-semibold text-stone-900">
                  נבחר מועד אצל {selectedStaff.name}
                </p>
                <p className="mt-2">{formatDateTime(selectedSlot.startTime)}</p>
              </div>
            ) : (
              <div className="mt-5 rounded-3xl border border-dashed border-stone-300 bg-stone-50 p-5 text-sm text-stone-600">
                בחר איש צוות ואז מועד פנוי כדי לשלוח בקשת פגישה.
              </div>
            )}

            {successMessage ? (
              <p className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {successMessage}
              </p>
            ) : null}

            <div className="mt-5 space-y-4">
              <label className="block space-y-2">
                <span className="text-sm font-medium text-stone-700">נושא</span>
                <input
                  value={form.subject}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, subject: event.target.value }))
                  }
                  className="w-full rounded-2xl border border-stone-300 px-4 py-3 outline-none transition focus:border-stone-900"
                  placeholder="למשל: שיחת היכרות, תמיכה, תיאום נושא קהילתי"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-stone-700">תיאור הבקשה</span>
                <textarea
                  value={form.description}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  className="min-h-32 w-full rounded-2xl border border-stone-300 px-4 py-3 outline-none transition focus:border-stone-900"
                  placeholder="כתוב בקצרה מה מטרת הפגישה ומה חשוב לאיש הצוות לדעת מראש"
                />
              </label>

              <button
                type="button"
                onClick={handleSubmitRequest}
                disabled={!selectedSlot || !form.subject.trim() || !form.description.trim()}
                className="w-full rounded-2xl bg-stone-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:bg-stone-400"
              >
                שליחת בקשת פגישה
              </button>
            </div>
          </section>

          <section className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold tracking-[0.2em] text-stone-500">
                  מעקב
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-stone-900">
                  בקשות אחרונות לאיש הצוות
                </h2>
              </div>
              <span className="rounded-full bg-stone-100 px-4 py-2 text-sm text-stone-700">
                {selectedStaffRequests.length} בקשות
              </span>
            </div>

            <div className="mt-5 space-y-3">
              {selectedStaffRequests.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-4 py-5 text-sm text-stone-600">
                  עדיין אין בקשות שמוצגות עבור איש הצוות הזה.
                </p>
              ) : (
                selectedStaffRequests.slice(0, 5).map((request) => (
                  <article
                    key={request.id}
                    className="rounded-2xl border border-stone-200 bg-stone-50 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-stone-900">{request.subject}</p>
                        <p className="mt-1 text-sm text-stone-600">
                          {request.requesterName}
                        </p>
                      </div>
                      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                        {formatStatus(request.status)}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-stone-600">
                      {formatDateTime(request.requestedStartTime)}
                    </p>
                  </article>
                ))
              )}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
