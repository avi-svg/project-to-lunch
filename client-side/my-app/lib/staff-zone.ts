export type StaffRole = "staff" | "admin";

export type StaffMember = {
  id: string;
  name: string;
  title: string;
  area: string;
  bio: string;
  email: string;
  role: StaffRole;
  isActive: boolean;
};

export type MeetingRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled"
  | "completed";

export type MeetingRequest = {
  id: string;
  staffMemberId: string;
  requesterUserId: string;
  requesterName: string;
  requesterEmail: string;
  requestedStartTime: string;
  requestedEndTime: string;
  subject: string;
  description: string;
  status: MeetingRequestStatus;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  rejectionReason: string | null;
};

export type CommunityMember = {
  id: string;
  name: string;
  email: string;
};

export type ShiftRuleMode = "working" | "not-working";

export type WeeklyStaffShiftRule = {
  id: string;
  staffMemberId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  mode: ShiftRuleMode;
};

export type OneTimeStaffShiftRule = {
  id: string;
  staffMemberId: string;
  date: string;
  startTime: string;
  endTime: string;
  mode: ShiftRuleMode;
};

export type StaffShiftSettings = {
  meetingDurationMinutes: number;
  weeklyRules: WeeklyStaffShiftRule[];
  oneTimeRules: OneTimeStaffShiftRule[];
};

export type StaffAvailabilitySlot = {
  id: string;
  staffMemberId: string;
  startTime: string;
  endTime: string;
  isBookable: boolean;
};

type TimeWindow = {
  startMinutes: number;
  endMinutes: number;
};

export const STAFF_ZONE_STORAGE_KEY = "staff-zone-meeting-requests";
export const STAFF_SHIFT_SETTINGS_STORAGE_KEY = "staff-zone-shift-settings";
export const WORKING_DAYS = [0, 1, 2, 3, 4] as const;

export const communityMembers: CommunityMember[] = [
  {
    id: "community-dana",
    name: "דנה ישראלי",
    email: "dana@example.com",
  },
  {
    id: "community-omer",
    name: "עומר לוי",
    email: "omer@example.com",
  },
  {
    id: "community-yael",
    name: "יעל כהן",
    email: "yael@example.com",
  },
];

export const staffMembers: StaffMember[] = [
  {
    id: "staff-rina",
    name: "רינה כהן",
    title: "רכזת קהילה",
    area: "קהילה ורווחה",
    bio: "מלווה חברי קהילה, פגישות אישיות ותיאום צרכים שוטפים.",
    email: "rina@community.local",
    role: "staff",
    isActive: true,
  },
  {
    id: "staff-yuval",
    name: "יובל לוי",
    title: "אחראי תפעול",
    area: "תפעול ולוגיסטיקה",
    bio: "מטפל בנושאי תשתיות, ציוד, אירועים וליווי שוטף של משימות קהילה.",
    email: "yuval@community.local",
    role: "staff",
    isActive: true,
  },
  {
    id: "staff-noa",
    name: "נועה ברק",
    title: "מנהלת מערכת",
    area: "ניהול והכוונה",
    bio: "מטפלת במקרים מורכבים, תיאום רוחבי וקבלת החלטות מערכתיות.",
    email: "noa@community.local",
    role: "admin",
    isActive: true,
  },
];

export const defaultShiftSettings: StaffShiftSettings = {
  meetingDurationMinutes: 45,
  weeklyRules: [
    {
      id: "weekly-rina-sunday",
      staffMemberId: "staff-rina",
      dayOfWeek: 0,
      startTime: "09:00",
      endTime: "14:00",
      mode: "working",
    },
    {
      id: "weekly-rina-tuesday",
      staffMemberId: "staff-rina",
      dayOfWeek: 2,
      startTime: "10:00",
      endTime: "16:00",
      mode: "working",
    },
    {
      id: "weekly-yuval-monday",
      staffMemberId: "staff-yuval",
      dayOfWeek: 1,
      startTime: "09:00",
      endTime: "15:00",
      mode: "working",
    },
    {
      id: "weekly-yuval-wednesday",
      staffMemberId: "staff-yuval",
      dayOfWeek: 3,
      startTime: "11:00",
      endTime: "17:00",
      mode: "working",
    },
    {
      id: "weekly-noa-thursday",
      staffMemberId: "staff-noa",
      dayOfWeek: 4,
      startTime: "09:30",
      endTime: "16:30",
      mode: "working",
    },
    {
      id: "weekly-noa-thursday-break",
      staffMemberId: "staff-noa",
      dayOfWeek: 4,
      startTime: "12:15",
      endTime: "13:45",
      mode: "not-working",
    },
  ],
  oneTimeRules: [],
};

function getStartOfDay(date = new Date()) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseTimeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);

  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return hours * 60 + minutes;
}

function normalizeWindow(window: TimeWindow) {
  if (window.endMinutes <= window.startMinutes) {
    return null;
  }

  return window;
}

function mergeWindows(windows: TimeWindow[]) {
  const sorted = windows
    .map(normalizeWindow)
    .filter((window): window is TimeWindow => Boolean(window))
    .sort((a, b) => a.startMinutes - b.startMinutes);

  const merged: TimeWindow[] = [];

  for (const window of sorted) {
    const previous = merged.at(-1);

    if (!previous || window.startMinutes > previous.endMinutes) {
      merged.push({ ...window });
      continue;
    }

    previous.endMinutes = Math.max(previous.endMinutes, window.endMinutes);
  }

  return merged;
}

function subtractWindow(base: TimeWindow, blocked: TimeWindow) {
  if (
    blocked.endMinutes <= base.startMinutes ||
    blocked.startMinutes >= base.endMinutes
  ) {
    return [base];
  }

  const pieces: TimeWindow[] = [];

  if (blocked.startMinutes > base.startMinutes) {
    pieces.push({
      startMinutes: base.startMinutes,
      endMinutes: blocked.startMinutes,
    });
  }

  if (blocked.endMinutes < base.endMinutes) {
    pieces.push({
      startMinutes: blocked.endMinutes,
      endMinutes: base.endMinutes,
    });
  }

  return pieces;
}

function subtractWindows(baseWindows: TimeWindow[], blockedWindows: TimeWindow[]) {
  let current = mergeWindows(baseWindows);

  for (const blocked of mergeWindows(blockedWindows)) {
    current = current.flatMap((window) => subtractWindow(window, blocked));
  }

  return mergeWindows(current);
}

function ruleToWindow(rule: { startTime: string; endTime: string }) {
  const startMinutes = parseTimeToMinutes(rule.startTime);
  const endMinutes = parseTimeToMinutes(rule.endTime);

  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
    return null;
  }

  return {
    startMinutes,
    endMinutes,
  };
}

function buildSlotsForDate(
  date: Date,
  staffMemberId: string,
  windows: TimeWindow[],
  meetingDurationMinutes: number,
) {
  const slots: StaffAvailabilitySlot[] = [];

  for (const window of windows) {
    for (
      let startMinutes = window.startMinutes;
      startMinutes + meetingDurationMinutes <= window.endMinutes;
      startMinutes += meetingDurationMinutes
    ) {
      const start = new Date(date);
      start.setMinutes(startMinutes, 0, 0);

      const end = new Date(start);
      end.setMinutes(end.getMinutes() + meetingDurationMinutes);

      slots.push({
        id: `${staffMemberId}-${start.toISOString()}`,
        staffMemberId,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        isBookable: true,
      });
    }
  }

  return slots;
}

export function normalizeShiftSettings(settings?: Partial<StaffShiftSettings> | null) {
  return {
    meetingDurationMinutes:
      settings?.meetingDurationMinutes && settings.meetingDurationMinutes > 0
        ? settings.meetingDurationMinutes
        : defaultShiftSettings.meetingDurationMinutes,
    weeklyRules: Array.isArray(settings?.weeklyRules)
      ? settings.weeklyRules
      : defaultShiftSettings.weeklyRules,
    oneTimeRules: Array.isArray(settings?.oneTimeRules)
      ? settings.oneTimeRules
      : defaultShiftSettings.oneTimeRules,
  } satisfies StaffShiftSettings;
}

export function getStaffMemberById(staffMemberId: string) {
  return staffMembers.find((member) => member.id === staffMemberId) ?? null;
}

export function findStaffMemberForUser(user: {
  email?: string | null;
  name?: string | null;
}) {
  const normalizedEmail = user.email?.trim().toLowerCase() ?? "";
  const normalizedName = user.name?.trim().toLowerCase() ?? "";

  return (
    staffMembers.find(
      (member) =>
        member.email.trim().toLowerCase() === normalizedEmail ||
        member.name.trim().toLowerCase() === normalizedName,
    ) ?? null
  );
}

export function getAvailabilityForStaff(
  staffMemberId: string,
  settings: StaffShiftSettings = defaultShiftSettings,
  fromDate = new Date(),
  numberOfDays = 21,
) {
  const normalizedSettings = normalizeShiftSettings(settings);
  const slots: StaffAvailabilitySlot[] = [];
  const startDate = getStartOfDay(fromDate);

  for (let dayOffset = 0; dayOffset < numberOfDays; dayOffset += 1) {
    const currentDate = addDays(startDate, dayOffset);
    const dateKey = toDateKey(currentDate);
    const dayOfWeek = currentDate.getDay();

    const weeklyWorkingWindows = normalizedSettings.weeklyRules
      .filter(
        (rule) =>
          rule.staffMemberId === staffMemberId &&
          rule.dayOfWeek === dayOfWeek &&
          rule.mode === "working",
      )
      .map(ruleToWindow)
      .filter((window): window is TimeWindow => Boolean(window));

    const weeklyNotWorkingWindows = normalizedSettings.weeklyRules
      .filter(
        (rule) =>
          rule.staffMemberId === staffMemberId &&
          rule.dayOfWeek === dayOfWeek &&
          rule.mode === "not-working",
      )
      .map(ruleToWindow)
      .filter((window): window is TimeWindow => Boolean(window));

    const oneTimeWorkingWindows = normalizedSettings.oneTimeRules
      .filter(
        (rule) =>
          rule.staffMemberId === staffMemberId &&
          rule.date === dateKey &&
          rule.mode === "working",
      )
      .map(ruleToWindow)
      .filter((window): window is TimeWindow => Boolean(window));

    const oneTimeNotWorkingWindows = normalizedSettings.oneTimeRules
      .filter(
        (rule) =>
          rule.staffMemberId === staffMemberId &&
          rule.date === dateKey &&
          rule.mode === "not-working",
      )
      .map(ruleToWindow)
      .filter((window): window is TimeWindow => Boolean(window));

    const mergedWorkingWindows = mergeWindows([
      ...weeklyWorkingWindows,
      ...oneTimeWorkingWindows,
    ]);

    const availableWindows = subtractWindows(mergedWorkingWindows, [
      ...weeklyNotWorkingWindows,
      ...oneTimeNotWorkingWindows,
    ]);

    slots.push(
      ...buildSlotsForDate(
        currentDate,
        staffMemberId,
        availableWindows,
        normalizedSettings.meetingDurationMinutes,
      ),
    );
  }

  return slots;
}

const initialSeedAvailability = getAvailabilityForStaff("staff-rina", defaultShiftSettings);

export const initialMeetingRequests: MeetingRequest[] = [
  {
    id: "request-seed-1",
    staffMemberId: "staff-rina",
    requesterUserId: "seed-user-1",
    requesterName: "דנה ישראלי",
    requesterEmail: "dana@example.com",
    requestedStartTime:
      initialSeedAvailability[0]?.startTime ?? new Date().toISOString(),
    requestedEndTime:
      initialSeedAvailability[0]?.endTime ?? new Date().toISOString(),
    subject: "שיחת היכרות",
    description: "רוצה לתאם שיחה על השתלבות בפעילויות הקהילה.",
    status: "pending",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    reviewedAt: null,
    reviewedBy: null,
    rejectionReason: null,
  },
];
