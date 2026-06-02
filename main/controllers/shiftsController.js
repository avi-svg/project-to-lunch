const { randomUUID } = require('crypto');
const db = require('../db');
const {
  canManageShift,
  isStaffLike,
  isValidUuid,
  normalizeRole,
  requireActor,
} = require('../lib/user-roles');
const {
  normalizeWhatsAppRecipient,
  sendWhatsAppTemplate,
} = require('../lib/whatsapp');

const shiftStatuses = new Set(['open', 'closed', 'cancelled', 'completed']);
const shiftTypes = new Set(['dinner', 'cleaning']);
const assignmentModes = new Set(['assign-later', 'assign-now']);
const registrationStatuses = new Set([
  'pending',
  'approved',
  'rejected',
  'cancelled',
]);
const attendanceStatuses = new Set(['pending', 'approved', 'rejected']);
const attendanceReportSources = new Set(['self', 'staff-manual', 'staff-absent']);
const swapRequestStatuses = new Set([
  'pending',
  'approved',
  'rejected',
  'cancelled',
  'closed',
]);
const swapVolunteerOfferStatuses = new Set([
  'pending',
  'approved',
  'rejected',
  'cancelled',
]);
const shiftTitlesByType = {
  dinner: 'תורנות ארוחת ערב',
  cleaning: 'תורנות ניקיון',
};
const shiftCategoriesByType = {
  dinner: 'night',
  cleaning: 'field',
};
const shiftTypesByCategory = {
  night: 'dinner',
  field: 'cleaning',
};
const DISPLAY_TIME_ZONE = 'Asia/Jerusalem';
const SHIFT_NOTIFICATION_TIME_FORMATTER = new Intl.DateTimeFormat('he-IL', {
  timeZone: DISPLAY_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const SHIFT_NOTIFICATION_WEEKDAY_FORMATTER = new Intl.DateTimeFormat('he-IL', {
  timeZone: DISPLAY_TIME_ZONE,
  weekday: 'long',
});
const SHIFT_ASSIGNMENT_TEMPLATE_NAME =
  process.env.WHATSAPP_SHIFT_ASSIGNMENT_TEMPLATE_NAME ||
  'shifts';
const SHIFT_ASSIGNMENT_TEMPLATE_LANGUAGE_CODE =
  process.env.WHATSAPP_SHIFT_ASSIGNMENT_TEMPLATE_LANGUAGE_CODE || 'he';
const SHIFT_UPDATE_TEMPLATE_NAME =
  process.env.WHATSAPP_SHIFT_UPDATE_TEMPLATE_NAME || 'shifts_update';
const SHIFT_UPDATE_TEMPLATE_LANGUAGE_CODE =
  process.env.WHATSAPP_SHIFT_UPDATE_TEMPLATE_LANGUAGE_CODE || 'he';
const ATTENDANCE_REPORT_WINDOW_MINUTES = 5;

function isValidDate(value) {
  return !Number.isNaN(new Date(value).getTime());
}

function normalizeShiftType(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const normalized = String(value).trim().toLowerCase();
  return shiftTypes.has(normalized) ? normalized : null;
}

function normalizeAssignmentMode(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const normalized = String(value).trim().toLowerCase();
  return assignmentModes.has(normalized) ? normalized : null;
}

function inferShiftTypeFromTitle(title) {
  const normalizedTitle = String(title || '').trim();

  return (
    Object.entries(shiftTitlesByType).find(([, knownTitle]) => knownTitle === normalizedTitle)?.[0] ??
    null
  );
}

function inferShiftType(row) {
  if (row?.category && shiftTypesByCategory[row.category]) {
    return shiftTypesByCategory[row.category];
  }

  return inferShiftTypeFromTitle(row?.title);
}

function getDurationMinutes(startTime, endTime) {
  if (!isValidDate(startTime) || !isValidDate(endTime)) {
    return null;
  }

  const durationMs = new Date(endTime).getTime() - new Date(startTime).getTime();

  if (durationMs <= 0) {
    return null;
  }

  return Math.round(durationMs / 60000);
}

function buildEndTimeFromDuration(startTime, durationMinutes) {
  const endDate = new Date(startTime);
  endDate.setMinutes(endDate.getMinutes() + durationMinutes);
  return endDate.toISOString();
}

function getDatePartsInDisplayTimeZone(value) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: DISPLAY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(value instanceof Date ? value : new Date(value));
  const lookup = new Map(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(lookup.get('year')),
    month: Number(lookup.get('month')),
    day: Number(lookup.get('day')),
  };
}

function parseDisplayDateInput(value) {
  if (value === undefined || value === null || value === '') {
    return getDatePartsInDisplayTimeZone(new Date());
  }

  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    const parsedDate = new Date(Date.UTC(year, month - 1, day));

    if (
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.getUTCFullYear() !== year ||
      parsedDate.getUTCMonth() !== month - 1 ||
      parsedDate.getUTCDate() !== day
    ) {
      return null;
    }

    return { year, month, day };
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return getDatePartsInDisplayTimeZone(parsedDate);
}

function getTimeZoneOffsetMinutes(timeZone, date) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset',
  });
  const timeZoneName =
    formatter.formatToParts(date).find((part) => part.type === 'timeZoneName')?.value ?? 'GMT';

  if (timeZoneName === 'GMT') {
    return 0;
  }

  const match = timeZoneName.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/);

  if (!match) {
    return 0;
  }

  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? '0');

  return sign * (hours * 60 + minutes);
}

function createUtcDateForDisplayMidnight(year, month, day) {
  let utcMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const offsetMinutes = getTimeZoneOffsetMinutes(DISPLAY_TIME_ZONE, new Date(utcMs));
    utcMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0) - offsetMinutes * 60000;
  }

  return new Date(utcMs);
}

function startOfWeekUtc(value) {
  const dateParts = parseDisplayDateInput(value);

  if (!dateParts) {
    return null;
  }

  const baseDate = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day));
  const day = baseDate.getUTCDay();
  const diffToSunday = -day;
  const weekStartDate = new Date(
    Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day)
  );

  weekStartDate.setUTCDate(weekStartDate.getUTCDate() + diffToSunday);

  return createUtcDateForDisplayMidnight(
    weekStartDate.getUTCFullYear(),
    weekStartDate.getUTCMonth() + 1,
    weekStartDate.getUTCDate()
  );
}

function endOfWeekUtc(weekStart) {
  const { year, month, day } = getDatePartsInDisplayTimeZone(weekStart);
  const weekEndDate = new Date(Date.UTC(year, month - 1, day));

  weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 7);

  return createUtcDateForDisplayMidnight(
    weekEndDate.getUTCFullYear(),
    weekEndDate.getUTCMonth() + 1,
    weekEndDate.getUTCDate()
  );
}

function startOfMonthUtc(value) {
  const dateParts = parseDisplayDateInput(value);

  if (!dateParts) {
    return null;
  }

  return createUtcDateForDisplayMidnight(dateParts.year, dateParts.month, 1);
}

function endOfMonthUtc(monthStart) {
  const { year, month } = getDatePartsInDisplayTimeZone(monthStart);
  const nextMonthYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;

  return createUtcDateForDisplayMidnight(nextMonthYear, nextMonth, 1);
}

function getAttendanceWindowStartTime(startTime) {
  const windowStart = new Date(startTime);
  windowStart.setMinutes(
    windowStart.getMinutes() - ATTENDANCE_REPORT_WINDOW_MINUTES
  );
  return windowStart;
}

function getAttendanceWindow(shift) {
  if (!shift?.start_time || !shift?.end_time) {
    return {
      startsAt: null,
      endsAt: null,
    };
  }

  return {
    startsAt: getAttendanceWindowStartTime(shift.start_time).toISOString(),
    endsAt: new Date(shift.end_time).toISOString(),
  };
}

function canReportAttendanceForShift(shift, attendance) {
  if (!shift?.start_time || !shift?.end_time || !shift?.my_registration_id) {
    return false;
  }

  if (shift.my_registration_status !== 'approved') {
    return false;
  }

  if (attendance) {
    return false;
  }

  if (shift.status === 'cancelled') {
    return false;
  }

  const now = Date.now();
  const windowStart = getAttendanceWindowStartTime(shift.start_time).getTime();
  const windowEnd = new Date(shift.end_time).getTime();

  return now >= windowStart && now <= windowEnd;
}

function canReportAttendanceManuallyForShift(shift, attendance) {
  if (!shift?.start_time || !shift?.end_time) {
    return false;
  }

  if (attendance) {
    return false;
  }

  if (shift.status === 'cancelled') {
    return false;
  }

  const now = Date.now();
  const windowStart = getAttendanceWindowStartTime(shift.start_time).getTime();

  return now >= windowStart;
}

function formatShiftRow(row) {
  const myAttendance = row.attendance_id ? formatAttendanceRow(row) : null;
  const attendanceWindow = getAttendanceWindow(row);

  return {
    id: row.id,
    title: row.title,
    shiftType: inferShiftType(row),
    assignmentMode:
      row.assignment_mode && normalizeAssignmentMode(row.assignment_mode)
        ? normalizeAssignmentMode(row.assignment_mode)
        : null,
    description: row.description,
    location: row.location,
    startTime: row.start_time,
    endTime: row.end_time,
    durationMinutes: getDurationMinutes(row.start_time, row.end_time),
    capacity: row.capacity,
    status: row.status,
    allowSwapRequests: row.allow_swap_requests ?? null,
    requireAttendanceReport: row.require_attendance_report ?? null,
    themeColor: row.theme_color ?? null,
    isSeries: Boolean(row.is_series),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: {
      id: row.created_by_user_id,
      name: row.created_by_name,
      email: row.created_by_email,
      role: normalizeRole(row.created_by_role),
    },
    reservedSlots: Number(row.reserved_slots || 0),
    availableSlots: Number(row.available_slots || 0),
    attendanceWindowStartsAt: attendanceWindow.startsAt,
    attendanceWindowEndsAt: attendanceWindow.endsAt,
    canReportAttendance: canReportAttendanceForShift(row, myAttendance),
    myRegistration: row.my_registration_id
      ? {
          id: row.my_registration_id,
          status: row.my_registration_status,
          createdAt: row.my_registration_created_at,
          reviewedAt: row.my_registration_reviewed_at,
          reviewNote: row.my_registration_review_note,
        }
      : null,
    myAttendance,
  };
}

function formatRegistrationRow(row) {
  return {
    id: row.id,
    shiftId: row.shift_id,
    userId: row.user_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note,
    user: {
      id: row.user_id,
      name: row.user_name,
      email: row.user_email,
      role: normalizeRole(row.user_role),
    },
    reviewedBy: row.reviewed_by_user_id
      ? {
          id: row.reviewed_by_user_id,
          name: row.reviewed_by_name,
          email: row.reviewed_by_email,
        }
      : null,
    attendance: row.attendance_id ? formatAttendanceRow(row) : null,
  };
}

function formatAttendanceRow(row) {
  const reportSource = attendanceReportSources.has(row.attendance_report_source)
    ? row.attendance_report_source
    : 'self';

  return {
    id: row.attendance_id,
    shiftId: row.attendance_shift_id,
    registrationId: row.attendance_registration_id,
    userId: row.attendance_user_id,
    status: row.attendance_status,
    reportSource,
    reportedAt: row.attendance_reported_at,
    createdAt: row.attendance_created_at,
    updatedAt: row.attendance_updated_at,
    reviewedAt: row.attendance_reviewed_at,
    reviewNote: row.attendance_review_note,
    user: row.attendance_user_id
      ? {
          id: row.attendance_user_id,
          name: row.attendance_user_name ?? row.user_name ?? null,
          email: row.attendance_user_email ?? row.user_email ?? null,
          role: normalizeRole(row.attendance_user_role ?? row.user_role),
        }
      : null,
    reviewedBy: row.attendance_reviewed_by_user_id
      ? {
          id: row.attendance_reviewed_by_user_id,
          name: row.attendance_reviewed_by_name,
          email: row.attendance_reviewed_by_email,
        }
      : null,
    reportedBy: row.attendance_reported_by_user_id
      ? {
          id: row.attendance_reported_by_user_id,
          name: row.attendance_reported_by_name,
          email: row.attendance_reported_by_email,
        }
      : null,
  };
}

function formatShiftNoteRow(row) {
  return {
    id: row.id,
    shiftId: row.shift_id,
    message: row.message,
    sendWhatsAppAlert: Boolean(row.notify_whatsapp),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    author: {
      id: row.author_user_id,
      name: row.author_name,
      email: row.author_email,
      role: normalizeRole(row.author_role),
    },
  };
}

function formatSwapVolunteerOfferRow(row) {
  return {
    id: row.id,
    swapRequestId: row.swap_request_id,
    volunteerUserId: row.volunteer_user_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note,
    volunteer: {
      id: row.volunteer_user_id,
      name: row.volunteer_name,
      email: row.volunteer_email,
      role: normalizeRole(row.volunteer_role),
    },
    reviewedBy: row.reviewed_by_user_id
      ? {
          id: row.reviewed_by_user_id,
          name: row.offer_reviewed_by_name,
          email: row.offer_reviewed_by_email,
        }
      : null,
  };
}

function canActorViewSwapReason(actor, row) {
  return isStaffLike(actor?.role) || row.requester_user_id === actor?.id;
}

function canActorViewVolunteerOffer(actor, row) {
  return (
    isStaffLike(actor?.role) ||
    row.requester_user_id === actor?.id ||
    row.volunteer_user_id === actor?.id
  );
}

function formatSwapRequestRow(row, actor, volunteerOffers = []) {
  const visibleVolunteerOffers = volunteerOffers.filter((offer) =>
    canActorViewVolunteerOffer(actor, {
      requester_user_id: row.requester_user_id,
      volunteer_user_id: offer.volunteerUserId,
    })
  );
  const myVolunteerOffer =
    volunteerOffers.find((offer) => offer.volunteerUserId === actor?.id) ?? null;

  return {
    id: row.id,
    shiftId: row.shift_id,
    requesterUserId: row.requester_user_id,
    requesterRegistrationId: row.requester_registration_id,
    status: row.status,
    reason: canActorViewSwapReason(actor, row) ? row.reason : null,
    canViewReason: canActorViewSwapReason(actor, row),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note,
    requesterRegistrationStatus: row.requester_registration_status,
    volunteerOffersCount: volunteerOffers.length,
    volunteerOffers: visibleVolunteerOffers,
    myVolunteerOffer,
    requester: {
      id: row.requester_user_id,
      name: row.requester_name,
      email: row.requester_email,
      role: normalizeRole(row.requester_role),
    },
    reviewedBy: row.reviewed_by_user_id
      ? {
          id: row.reviewed_by_user_id,
          name: row.reviewed_by_name,
          email: row.reviewed_by_email,
        }
      : null,
    shift: {
      id: row.shift_id,
      title: row.shift_title,
      description: row.shift_description,
      location: row.shift_location,
      startTime: row.shift_start_time,
      endTime: row.shift_end_time,
      status: row.shift_status,
    },
  };
}

function formatShiftNotificationTime(value) {
  return SHIFT_NOTIFICATION_TIME_FORMATTER.format(new Date(value));
}

function formatShiftNotificationWeekday(value) {
  return SHIFT_NOTIFICATION_WEEKDAY_FORMATTER.format(new Date(value));
}

async function sendShiftAssignmentNotifications(shift, users) {
  const summary = {
    attempted: 0,
    sent: 0,
    skippedNoPhone: 0,
    skippedInvalidPhone: 0,
    failed: 0,
  };

  if (!Array.isArray(users) || users.length === 0) {
    return summary;
  }

  const notificationTasks = [];
  const shiftStartTime = shift.start_time || shift.startTime;
  const templateParametersBase = [
    null,
    shift.title,
    formatShiftNotificationWeekday(shiftStartTime),
    formatShiftNotificationTime(shiftStartTime),
  ];

  for (const user of users) {
    if (!user.phone || String(user.phone).trim().length === 0) {
      summary.skippedNoPhone += 1;
      continue;
    }

    const normalizedPhone = normalizeWhatsAppRecipient(user.phone);

    if (!normalizedPhone) {
      summary.skippedInvalidPhone += 1;
      continue;
    }

    summary.attempted += 1;
    notificationTasks.push(
      sendWhatsAppTemplate({
        to: normalizedPhone,
        name: SHIFT_ASSIGNMENT_TEMPLATE_NAME,
        languageCode: SHIFT_ASSIGNMENT_TEMPLATE_LANGUAGE_CODE,
        bodyParameters: [
          user.name ? String(user.name).trim() : 'חבר קהילה',
          templateParametersBase[1],
          templateParametersBase[2],
          templateParametersBase[3],
        ],
      })
    );
  }

  const results = await Promise.allSettled(notificationTasks);

  for (const result of results) {
    if (result.status === 'fulfilled') {
      summary.sent += 1;
      continue;
    }

    summary.failed += 1;
    console.error('Failed to send shift assignment WhatsApp notification:', result.reason);
  }

  return summary;
}

async function sendForcedShiftAssignmentNotifications(shift, users) {
  const summary = {
    attempted: 0,
    sent: 0,
    skippedNoPhone: 0,
    skippedInvalidPhone: 0,
    failed: 0,
  };

  if (!Array.isArray(users) || users.length === 0) {
    return summary;
  }

  const shiftStartTime = shift.start_time || shift.startTime;
  const shiftId = shift.id;
  const notificationTasks = [];

  for (const user of users) {
    if (!user.phone || String(user.phone).trim().length === 0) {
      summary.skippedNoPhone += 1;
      continue;
    }

    const normalizedPhone = normalizeWhatsAppRecipient(user.phone);

    if (!normalizedPhone) {
      summary.skippedInvalidPhone += 1;
      continue;
    }

    summary.attempted += 1;
    notificationTasks.push(
      sendWhatsAppTemplate({
        to: normalizedPhone,
        name: SHIFT_UPDATE_TEMPLATE_NAME,
        languageCode: SHIFT_UPDATE_TEMPLATE_LANGUAGE_CODE,
        bodyParameters: [
          user.name ? String(user.name).trim() : 'חבר קהילה',
          shift.title,
          formatShiftNotificationWeekday(shiftStartTime),
          formatShiftNotificationTime(shiftStartTime),
        ],
        buttonParameters: [shiftId],
      })
    );
  }

  const results = await Promise.allSettled(notificationTasks);

  for (const result of results) {
    if (result.status === 'fulfilled') {
      summary.sent += 1;
      continue;
    }

    summary.failed += 1;
    console.error('Failed to send forced shift update WhatsApp notification:', result.reason);
  }

  return summary;
}

function buildShiftAssignmentResponseMessage(
  notificationSummary,
  assignmentType = 'standard',
  assignmentSummary = null
) {
  if (assignmentType === 'forced') {
    return 'Shift assignments updated successfully. Forced assignments were approved immediately without sending WhatsApp approval requests.';
  }

  if (
    assignmentType === 'mixed' &&
    assignmentSummary &&
    assignmentSummary.forced > 0 &&
    assignmentSummary.standard > 0
  ) {
    return 'Shift assignments updated successfully. Forced assignments were approved immediately, while standard assignments continued through WhatsApp approval requests.';
  }

  if (!notificationSummary) {
    return 'Shift assignments updated successfully.';
  }

  const messageParts = ['Shift assignments updated successfully.'];

  if (notificationSummary.sent > 0) {
    messageParts.push(
      `WhatsApp notifications sent to ${notificationSummary.sent} assigned user(s).`
    );
  }

  if (notificationSummary.failed > 0) {
    messageParts.push(
      `${notificationSummary.failed} WhatsApp notification(s) failed to send.`
    );
  }

  if (notificationSummary.skippedNoPhone > 0) {
    messageParts.push(
      `${notificationSummary.skippedNoPhone} assigned user(s) were skipped because they do not have a phone number.`
    );
  }

  if (notificationSummary.skippedInvalidPhone > 0) {
    messageParts.push(
      `${notificationSummary.skippedInvalidPhone} assigned user(s) were skipped because their phone number is invalid for WhatsApp.`
    );
  }

  return messageParts.join(' ');
}

async function loadShiftById(shiftId, client = db) {
  return client.query(
    `SELECT
       s.*,
       creator.name AS created_by_name,
       creator.email AS created_by_email,
       creator.role AS created_by_role
     FROM public.shifts s
     JOIN public.users creator
       ON creator.id = s.created_by_user_id
     WHERE s.id = $1
     LIMIT 1`,
    [shiftId]
  );
}

async function loadShiftNotes(shiftId, client = db) {
  const result = await client.query(
    `SELECT
       sn.*,
       author.name AS author_name,
       author.email AS author_email,
       author.role AS author_role
     FROM public.shift_notes sn
     JOIN public.users author
       ON author.id = sn.author_user_id
     WHERE sn.shift_id = $1
     ORDER BY sn.created_at ASC, sn.id ASC`,
    [shiftId]
  );

  return result.rows.map(formatShiftNoteRow);
}

async function loadShiftNoteById(noteId, client = db) {
  const result = await client.query(
    `SELECT
       sn.*,
       author.name AS author_name,
       author.email AS author_email,
       author.role AS author_role
     FROM public.shift_notes sn
     JOIN public.users author
       ON author.id = sn.author_user_id
     WHERE sn.id = $1
     LIMIT 1`,
    [noteId]
  );

  return result.rows.length > 0 ? formatShiftNoteRow(result.rows[0]) : null;
}

async function actorCanAccessShiftNotes(actor, shiftId, client = db) {
  if (!actor || !isValidUuid(shiftId)) {
    return false;
  }

  if (isStaffLike(actor.role)) {
    return true;
  }

  const result = await client.query(
    `SELECT 1
     FROM public.shift_registrations
     WHERE shift_id = $1
       AND user_id = $2
       AND status IN ('pending', 'approved')
     LIMIT 1`,
    [shiftId, actor.id]
  );

  return result.rows.length > 0;
}

async function loadShiftRegistrations(shiftId, client = db) {
  const result = await client.query(
    `SELECT
       sr.*,
       u.name AS user_name,
       u.email AS user_email,
       u.role AS user_role,
       reviewer.name AS reviewed_by_name,
       reviewer.email AS reviewed_by_email,
       att.id AS attendance_id,
       att.shift_id AS attendance_shift_id,
       att.registration_id AS attendance_registration_id,
       att.user_id AS attendance_user_id,
       att.status AS attendance_status,
       att.report_source AS attendance_report_source,
       att.reported_at AS attendance_reported_at,
       att.created_at AS attendance_created_at,
       att.updated_at AS attendance_updated_at,
       att.reviewed_at AS attendance_reviewed_at,
       att.reported_by_user_id AS attendance_reported_by_user_id,
       att.reviewed_by_user_id AS attendance_reviewed_by_user_id,
       att.review_note AS attendance_review_note,
       attendance_user.name AS attendance_user_name,
       attendance_user.email AS attendance_user_email,
       attendance_user.role AS attendance_user_role,
       attendance_reporter.name AS attendance_reported_by_name,
       attendance_reporter.email AS attendance_reported_by_email,
       attendance_reviewer.name AS attendance_reviewed_by_name,
       attendance_reviewer.email AS attendance_reviewed_by_email
     FROM public.shift_registrations sr
     JOIN public.users u
       ON u.id = sr.user_id
     LEFT JOIN public.users reviewer
       ON reviewer.id = sr.reviewed_by_user_id
     LEFT JOIN public.shift_attendance att
       ON att.registration_id = sr.id
     LEFT JOIN public.users attendance_user
       ON attendance_user.id = att.user_id
     LEFT JOIN public.users attendance_reporter
       ON attendance_reporter.id = att.reported_by_user_id
     LEFT JOIN public.users attendance_reviewer
       ON attendance_reviewer.id = att.reviewed_by_user_id
     WHERE sr.shift_id = $1
     ORDER BY sr.created_at ASC`,
    [shiftId]
  );

  return result.rows.map(formatRegistrationRow);
}

async function loadFormattedRegistrationById(registrationId, client = db) {
  const result = await client.query(
    `SELECT
       sr.*,
       u.name AS user_name,
       u.email AS user_email,
       u.role AS user_role,
       reviewer.name AS reviewed_by_name,
       reviewer.email AS reviewed_by_email
     FROM public.shift_registrations sr
     JOIN public.users u
       ON u.id = sr.user_id
     LEFT JOIN public.users reviewer
       ON reviewer.id = sr.reviewed_by_user_id
     WHERE sr.id = $1
     LIMIT 1`,
    [registrationId]
  );

  return result.rows.length > 0 ? formatRegistrationRow(result.rows[0]) : null;
}

async function loadFormattedAttendanceById(attendanceId, client = db) {
  const result = await client.query(
    `SELECT
       att.id AS attendance_id,
       att.shift_id AS attendance_shift_id,
       att.registration_id AS attendance_registration_id,
       att.user_id AS attendance_user_id,
       att.status AS attendance_status,
       att.report_source AS attendance_report_source,
       att.reported_at AS attendance_reported_at,
       att.created_at AS attendance_created_at,
       att.updated_at AS attendance_updated_at,
       att.reviewed_at AS attendance_reviewed_at,
       att.reported_by_user_id AS attendance_reported_by_user_id,
       att.reviewed_by_user_id AS attendance_reviewed_by_user_id,
       att.review_note AS attendance_review_note,
       attendance_user.name AS attendance_user_name,
       attendance_user.email AS attendance_user_email,
       attendance_user.role AS attendance_user_role,
       attendance_reporter.name AS attendance_reported_by_name,
       attendance_reporter.email AS attendance_reported_by_email,
       attendance_reviewer.name AS attendance_reviewed_by_name,
       attendance_reviewer.email AS attendance_reviewed_by_email
     FROM public.shift_attendance att
     JOIN public.users attendance_user
       ON attendance_user.id = att.user_id
     LEFT JOIN public.users attendance_reporter
       ON attendance_reporter.id = att.reported_by_user_id
     LEFT JOIN public.users attendance_reviewer
       ON attendance_reviewer.id = att.reviewed_by_user_id
     WHERE att.id = $1
     LIMIT 1`,
    [attendanceId]
  );

  return result.rows.length > 0 ? formatAttendanceRow(result.rows[0]) : null;
}

async function loadSwapVolunteerOffersByRequestIds(requestIds, client = db) {
  if (!Array.isArray(requestIds) || requestIds.length === 0) {
    return new Map();
  }

  const result = await client.query(
    `SELECT
       offer.*,
       volunteer.name AS volunteer_name,
       volunteer.email AS volunteer_email,
       volunteer.role AS volunteer_role,
       reviewer.name AS offer_reviewed_by_name,
       reviewer.email AS offer_reviewed_by_email
     FROM public.shift_swap_request_volunteers offer
     JOIN public.users volunteer
       ON volunteer.id = offer.volunteer_user_id
     LEFT JOIN public.users reviewer
       ON reviewer.id = offer.reviewed_by_user_id
     WHERE offer.swap_request_id = ANY($1::uuid[])
     ORDER BY
       CASE offer.status
         WHEN 'approved' THEN 0
         WHEN 'pending' THEN 1
         WHEN 'rejected' THEN 2
         WHEN 'cancelled' THEN 3
         ELSE 4
       END,
       offer.created_at ASC`,
    [requestIds]
  );

  const offersByRequestId = new Map();

  for (const row of result.rows) {
    const offer = formatSwapVolunteerOfferRow(row);
    const current = offersByRequestId.get(row.swap_request_id) ?? [];
    current.push(offer);
    offersByRequestId.set(row.swap_request_id, current);
  }

  return offersByRequestId;
}

async function loadFormattedSwapRequestById(requestId, actor, client = db) {
  const result = await client.query(
    `SELECT
       ssr.*,
       requester.name AS requester_name,
       requester.email AS requester_email,
       requester.role AS requester_role,
       reviewer.name AS reviewed_by_name,
       reviewer.email AS reviewed_by_email,
       sr.status AS requester_registration_status,
       s.title AS shift_title,
       s.description AS shift_description,
       s.location AS shift_location,
       s.start_time AS shift_start_time,
       s.end_time AS shift_end_time,
       s.status AS shift_status
     FROM public.shift_swap_requests ssr
     JOIN public.users requester
       ON requester.id = ssr.requester_user_id
     JOIN public.shift_registrations sr
       ON sr.id = ssr.requester_registration_id
     JOIN public.shifts s
       ON s.id = ssr.shift_id
     LEFT JOIN public.users reviewer
       ON reviewer.id = ssr.reviewed_by_user_id
     WHERE ssr.id = $1
     LIMIT 1`,
    [requestId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const offersByRequestId = await loadSwapVolunteerOffersByRequestIds([requestId], client);
  return formatSwapRequestRow(
    result.rows[0],
    actor,
    offersByRequestId.get(requestId) ?? []
  );
}

async function loadVisibleSwapRequestsForActor(actor, client = db) {
  const visibilityClause = isStaffLike(actor.role)
    ? ''
    : `WHERE (
         ssr.requester_user_id = $1
         OR ssr.status IN ('pending', 'approved')
       )`;
  const values = isStaffLike(actor.role) ? [] : [actor.id];

  const result = await client.query(
    `SELECT
       ssr.*,
       requester.name AS requester_name,
       requester.email AS requester_email,
       requester.role AS requester_role,
       reviewer.name AS reviewed_by_name,
       reviewer.email AS reviewed_by_email,
       sr.status AS requester_registration_status,
       s.title AS shift_title,
       s.description AS shift_description,
       s.location AS shift_location,
       s.start_time AS shift_start_time,
       s.end_time AS shift_end_time,
       s.status AS shift_status
     FROM public.shift_swap_requests ssr
     JOIN public.users requester
       ON requester.id = ssr.requester_user_id
     JOIN public.shift_registrations sr
       ON sr.id = ssr.requester_registration_id
     JOIN public.shifts s
       ON s.id = ssr.shift_id
     LEFT JOIN public.users reviewer
       ON reviewer.id = ssr.reviewed_by_user_id
     ${visibilityClause}
     ORDER BY
       CASE ssr.status
         WHEN 'pending' THEN 0
         WHEN 'approved' THEN 1
         WHEN 'closed' THEN 2
         WHEN 'rejected' THEN 3
         WHEN 'cancelled' THEN 4
         ELSE 5
       END,
       s.start_time ASC,
       ssr.created_at DESC`,
    values
  );

  const requestIds = result.rows.map((row) => row.id);
  const offersByRequestId = await loadSwapVolunteerOffersByRequestIds(requestIds, client);

  return result.rows.map((row) =>
    formatSwapRequestRow(row, actor, offersByRequestId.get(row.id) ?? [])
  );
}

async function listWeekShifts(req, res, next) {
  const weekStart = startOfWeekUtc(req.query.start);

  if (!weekStart) {
    return res.status(400).json({
      message: 'start must be a valid date.',
    });
  }

  const weekEnd = endOfWeekUtc(weekStart);

  try {
    const result = await db.query(
      `SELECT
         s.*,
         creator.name AS created_by_name,
         creator.email AS created_by_email,
         creator.role AS created_by_role,
         COALESCE(capacity.reserved_slots, 0) AS reserved_slots,
         COALESCE(capacity.available_slots, s.capacity) AS available_slots,
         my_reg.id AS my_registration_id,
         my_reg.status AS my_registration_status,
         my_reg.created_at AS my_registration_created_at,
         my_reg.reviewed_at AS my_registration_reviewed_at,
         my_reg.review_note AS my_registration_review_note
       FROM public.shifts s
       JOIN public.users creator
         ON creator.id = s.created_by_user_id
       LEFT JOIN public.shift_capacity_summary capacity
         ON capacity.shift_id = s.id
       LEFT JOIN public.shift_registrations my_reg
         ON my_reg.shift_id = s.id
        AND my_reg.user_id = $1
       WHERE s.start_time >= $2
         AND s.start_time < $3
       ORDER BY s.start_time ASC, s.created_at ASC`,
      [req.actor.id, weekStart.toISOString(), weekEnd.toISOString()]
    );

    const shifts = result.rows.map(formatShiftRow);
    const includeRegistrations = isStaffLike(req.actor.role);

    if (includeRegistrations) {
      for (const shift of shifts) {
        shift.registrations = await loadShiftRegistrations(shift.id);
      }
    }

    return res.json({
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
      shifts,
    });
  } catch (error) {
    return next(error);
  }
}

async function listMyRegisteredShifts(req, res, next) {
  try {
    const result = await db.query(
      `SELECT
         s.*,
         creator.name AS created_by_name,
         creator.email AS created_by_email,
         creator.role AS created_by_role,
         COALESCE(capacity.reserved_slots, 0) AS reserved_slots,
         COALESCE(capacity.available_slots, s.capacity) AS available_slots,
         my_reg.id AS my_registration_id,
         my_reg.status AS my_registration_status,
         my_reg.created_at AS my_registration_created_at,
         my_reg.reviewed_at AS my_registration_reviewed_at,
         my_reg.review_note AS my_registration_review_note
       FROM public.shifts s
       JOIN public.users creator
         ON creator.id = s.created_by_user_id
       JOIN public.shift_registrations my_reg
         ON my_reg.shift_id = s.id
        AND my_reg.user_id = $1
       LEFT JOIN public.shift_capacity_summary capacity
         ON capacity.shift_id = s.id
       WHERE my_reg.status IN ('pending', 'approved')
       ORDER BY s.start_time ASC, s.created_at ASC`,
      [req.actor.id]
    );

    return res.json({
      shifts: result.rows.map(formatShiftRow),
    });
  } catch (error) {
    return next(error);
  }
}

async function listShiftAttendance(req, res, next) {
  try {
    const myShiftsResult = await db.query(
      `SELECT
         s.*,
         creator.name AS created_by_name,
         creator.email AS created_by_email,
         creator.role AS created_by_role,
         COALESCE(capacity.reserved_slots, 0) AS reserved_slots,
         COALESCE(capacity.available_slots, s.capacity) AS available_slots,
         my_reg.id AS my_registration_id,
         my_reg.status AS my_registration_status,
         my_reg.created_at AS my_registration_created_at,
         my_reg.reviewed_at AS my_registration_reviewed_at,
         my_reg.review_note AS my_registration_review_note,
         att.id AS attendance_id,
         att.shift_id AS attendance_shift_id,
         att.registration_id AS attendance_registration_id,
         att.user_id AS attendance_user_id,
         att.status AS attendance_status,
         att.report_source AS attendance_report_source,
         att.reported_at AS attendance_reported_at,
         att.created_at AS attendance_created_at,
         att.updated_at AS attendance_updated_at,
         att.reviewed_at AS attendance_reviewed_at,
         att.reported_by_user_id AS attendance_reported_by_user_id,
         att.reviewed_by_user_id AS attendance_reviewed_by_user_id,
         att.review_note AS attendance_review_note,
         attendance_user.name AS attendance_user_name,
         attendance_user.email AS attendance_user_email,
         attendance_user.role AS attendance_user_role,
         attendance_reporter.name AS attendance_reported_by_name,
         attendance_reporter.email AS attendance_reported_by_email,
         attendance_reviewer.name AS attendance_reviewed_by_name,
         attendance_reviewer.email AS attendance_reviewed_by_email
       FROM public.shifts s
       JOIN public.users creator
         ON creator.id = s.created_by_user_id
       JOIN public.shift_registrations my_reg
         ON my_reg.shift_id = s.id
        AND my_reg.user_id = $1
        AND my_reg.status = 'approved'
       LEFT JOIN public.shift_capacity_summary capacity
         ON capacity.shift_id = s.id
       LEFT JOIN public.shift_attendance att
         ON att.registration_id = my_reg.id
       LEFT JOIN public.users attendance_user
         ON attendance_user.id = att.user_id
       LEFT JOIN public.users attendance_reporter
         ON attendance_reporter.id = att.reported_by_user_id
       LEFT JOIN public.users attendance_reviewer
         ON attendance_reviewer.id = att.reviewed_by_user_id
       WHERE s.status <> 'cancelled'
       ORDER BY s.start_time ASC, s.created_at ASC`,
      [req.actor.id]
    );

    let reviewShifts = [];

    if (isStaffLike(req.actor.role)) {
      const reviewShiftResult = await db.query(
        `SELECT DISTINCT
           s.*,
           creator.name AS created_by_name,
           creator.email AS created_by_email,
           creator.role AS created_by_role,
           COALESCE(capacity.reserved_slots, 0) AS reserved_slots,
           COALESCE(capacity.available_slots, s.capacity) AS available_slots,
           my_reg.id AS my_registration_id,
           my_reg.status AS my_registration_status,
           my_reg.created_at AS my_registration_created_at,
           my_reg.reviewed_at AS my_registration_reviewed_at,
           my_reg.review_note AS my_registration_review_note,
           my_att.id AS attendance_id,
           my_att.shift_id AS attendance_shift_id,
           my_att.registration_id AS attendance_registration_id,
           my_att.user_id AS attendance_user_id,
           my_att.status AS attendance_status,
           my_att.report_source AS attendance_report_source,
           my_att.reported_at AS attendance_reported_at,
           my_att.created_at AS attendance_created_at,
           my_att.updated_at AS attendance_updated_at,
           my_att.reviewed_at AS attendance_reviewed_at,
           my_att.reported_by_user_id AS attendance_reported_by_user_id,
           my_att.reviewed_by_user_id AS attendance_reviewed_by_user_id,
           my_att.review_note AS attendance_review_note,
           attendance_user.name AS attendance_user_name,
           attendance_user.email AS attendance_user_email,
           attendance_user.role AS attendance_user_role,
           attendance_reporter.name AS attendance_reported_by_name,
           attendance_reporter.email AS attendance_reported_by_email,
           attendance_reviewer.name AS attendance_reviewed_by_name,
           attendance_reviewer.email AS attendance_reviewed_by_email
         FROM public.shifts s
         JOIN public.users creator
           ON creator.id = s.created_by_user_id
         JOIN public.shift_registrations approved_reg
           ON approved_reg.shift_id = s.id
          AND approved_reg.status = 'approved'
         LEFT JOIN public.shift_capacity_summary capacity
           ON capacity.shift_id = s.id
         LEFT JOIN public.shift_registrations my_reg
           ON my_reg.shift_id = s.id
          AND my_reg.user_id = $1
         LEFT JOIN public.shift_attendance my_att
           ON my_att.registration_id = my_reg.id
         LEFT JOIN public.users attendance_user
           ON attendance_user.id = my_att.user_id
         LEFT JOIN public.users attendance_reporter
           ON attendance_reporter.id = my_att.reported_by_user_id
         LEFT JOIN public.users attendance_reviewer
           ON attendance_reviewer.id = my_att.reviewed_by_user_id
         WHERE s.start_time <= timezone('utc', now()) + interval '5 minutes'
           AND s.status <> 'cancelled'
         ORDER BY s.start_time DESC, s.created_at DESC
         LIMIT 30`,
        [req.actor.id]
      );

      reviewShifts = await Promise.all(
        reviewShiftResult.rows.map(async (row) => {
          const shift = formatShiftRow(row);
          shift.registrations = await loadShiftRegistrations(row.id);
          return shift;
        })
      );
    }

    return res.json({
      myShifts: myShiftsResult.rows.map(formatShiftRow),
      reviewShifts,
    });
  } catch (error) {
    return next(error);
  }
}

async function listSwapRequests(req, res, next) {
  try {
    const requests = await loadVisibleSwapRequestsForActor(req.actor);
    return res.json({ requests });
  } catch (error) {
    return next(error);
  }
}

async function listShiftNotes(req, res, next) {
  const { id } = req.params;

  if (!isValidUuid(id)) {
    return res.status(400).json({
      message: 'Shift id must be a valid UUID.',
    });
  }

  try {
    const shiftResult = await loadShiftById(id);

    if (shiftResult.rows.length === 0) {
      return res.status(404).json({
        message: 'Shift not found.',
      });
    }

    if (!(await actorCanAccessShiftNotes(req.actor, id))) {
      return res.status(403).json({
        message: 'You do not have permission to view notes for this shift.',
      });
    }

    return res.json({
      notes: await loadShiftNotes(id),
    });
  } catch (error) {
    return next(error);
  }
}

async function createShiftNote(req, res, next) {
  const { id } = req.params;
  const { message, sendWhatsAppAlert } = req.body || {};
  const normalizedMessage = typeof message === 'string' ? message.trim() : '';

  if (!isValidUuid(id)) {
    return res.status(400).json({
      message: 'Shift id must be a valid UUID.',
    });
  }

  if (!normalizedMessage) {
    return res.status(400).json({
      message: 'A note message is required.',
    });
  }

  const client = await db.pool.connect();

  try {
    const shiftResult = await loadShiftById(id, client);

    if (shiftResult.rows.length === 0) {
      return res.status(404).json({
        message: 'Shift not found.',
      });
    }

    if (!(await actorCanAccessShiftNotes(req.actor, id, client))) {
      return res.status(403).json({
        message: 'You do not have permission to add notes to this shift.',
      });
    }

    const noteId = randomUUID();
    const notifyWhatsApp =
      isStaffLike(req.actor.role) && sendWhatsAppAlert === true;

    await client.query(
      `INSERT INTO public.shift_notes (
         id,
         shift_id,
         author_user_id,
         message,
         notify_whatsapp
       )
       VALUES ($1, $2, $3, $4, $5)`,
      [noteId, id, req.actor.id, normalizedMessage, notifyWhatsApp]
    );

    const note = await loadShiftNoteById(noteId, client);

    return res.status(201).json({
      message: 'Shift note created successfully.',
      note,
    });
  } catch (error) {
    return next(error);
  } finally {
    client.release();
  }
}

async function createSwapRequest(req, res, next) {
  const { id } = req.params;
  const { reason } = req.body || {};
  const normalizedReason = typeof reason === 'string' ? reason.trim() : '';

  if (!isValidUuid(id)) {
    return res.status(400).json({
      message: 'Shift id must be a valid UUID.',
    });
  }

  if (!normalizedReason) {
    return res.status(400).json({
      message: 'A reason is required to create a swap request.',
    });
  }

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    const shiftResult = await client.query(
      `SELECT *
       FROM public.shifts
       WHERE id = $1
       FOR UPDATE`,
      [id]
    );

    if (shiftResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        message: 'Shift not found.',
      });
    }

    const shift = shiftResult.rows[0];

    if (shift.status === 'cancelled' || shift.status === 'completed') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: 'Swap requests can only be created for active shifts.',
      });
    }

    if (new Date(shift.start_time).getTime() <= Date.now()) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: 'Swap requests can only be created for future shifts.',
      });
    }

    const registrationResult = await client.query(
      `SELECT *
       FROM public.shift_registrations
       WHERE shift_id = $1
         AND user_id = $2
       ORDER BY created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [id, req.actor.id]
    );

    if (registrationResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        message: 'Only assigned users can create a swap request for this shift.',
      });
    }

    const registration = registrationResult.rows[0];

    if (registration.status !== 'approved') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: 'Only approved shift assignments can be published for swap.',
      });
    }

    const existingRequestResult = await client.query(
      `SELECT id
       FROM public.shift_swap_requests
       WHERE requester_registration_id = $1
         AND status IN ('pending', 'approved')
       LIMIT 1`,
      [registration.id]
    );

    if (existingRequestResult.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: 'There is already an active swap request for this shift assignment.',
      });
    }

    const requestId = randomUUID();

    await client.query(
      `INSERT INTO public.shift_swap_requests (
         id,
         shift_id,
         requester_user_id,
         requester_registration_id,
         reason,
         status
       )
       VALUES ($1, $2, $3, $4, $5, 'approved')`,
      [requestId, id, req.actor.id, registration.id, normalizedReason]
    );

    await client.query('COMMIT');

    return res.status(201).json({
      message: 'Swap request created and published successfully.',
      request: await loadFormattedSwapRequestById(requestId, req.actor),
    });
  } catch (error) {
    await client.query('ROLLBACK');

    if (error.code === '23505') {
      return res.status(409).json({
        message: 'There is already an active swap request for this shift assignment.',
      });
    }

    return next(error);
  } finally {
    client.release();
  }
}

async function createSwapVolunteerOffer(req, res, next) {
  const { requestId } = req.params;

  if (!isValidUuid(requestId)) {
    return res.status(400).json({
      message: 'Swap request id must be a valid UUID.',
    });
  }

  if (normalizeRole(req.actor.role) !== 'user') {
    return res.status(403).json({
      message: 'Only community users can volunteer to replace a shift.',
    });
  }

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    const requestResult = await client.query(
      `SELECT
         ssr.*,
         s.start_time AS shift_start_time,
         s.status AS shift_status
       FROM public.shift_swap_requests ssr
       JOIN public.shifts s
         ON s.id = ssr.shift_id
       WHERE ssr.id = $1
       FOR UPDATE`,
      [requestId]
    );

    if (requestResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        message: 'Swap request not found.',
      });
    }

    const swapRequest = requestResult.rows[0];

    if (swapRequest.requester_user_id === req.actor.id) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: 'You cannot volunteer for your own swap request.',
      });
    }

    if (swapRequest.status !== 'approved') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: 'You can only volunteer for an active published swap request.',
      });
    }

    if (
      swapRequest.shift_status === 'cancelled' ||
      swapRequest.shift_status === 'completed' ||
      new Date(swapRequest.shift_start_time).getTime() <= Date.now()
    ) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: 'This shift can no longer accept replacement volunteers.',
      });
    }

    const existingOfferResult = await client.query(
      `SELECT id
       FROM public.shift_swap_request_volunteers
       WHERE swap_request_id = $1
         AND volunteer_user_id = $2
         AND status IN ('pending', 'approved')
       LIMIT 1`,
      [requestId, req.actor.id]
    );

    if (existingOfferResult.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: 'You already volunteered for this swap request.',
      });
    }

    const existingRegistrationResult = await client.query(
      `SELECT id
       FROM public.shift_registrations
       WHERE shift_id = $1
         AND user_id = $2
         AND status IN ('pending', 'approved')
       LIMIT 1`,
      [swapRequest.shift_id, req.actor.id]
    );

    if (existingRegistrationResult.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: 'You are already assigned to this shift.',
      });
    }

    await client.query(
      `INSERT INTO public.shift_swap_request_volunteers (
         id,
         swap_request_id,
         volunteer_user_id,
         status
       )
       VALUES ($1, $2, $3, 'pending')`,
      [randomUUID(), requestId, req.actor.id]
    );

    await client.query('COMMIT');

    return res.status(201).json({
      message: 'Your replacement offer was sent to staff for review.',
      request: await loadFormattedSwapRequestById(requestId, req.actor),
    });
  } catch (error) {
    await client.query('ROLLBACK');

    if (error.code === '23505') {
      return res.status(409).json({
        message: 'You already volunteered for this swap request.',
      });
    }

    return next(error);
  } finally {
    client.release();
  }
}

async function getShiftById(req, res, next) {
  const { id } = req.params;

  if (!isValidUuid(id)) {
    return res.status(400).json({
      message: 'Shift id must be a valid UUID.',
    });
  }

  try {
    const result = await db.query(
      `SELECT
         s.*,
         creator.name AS created_by_name,
         creator.email AS created_by_email,
         creator.role AS created_by_role,
         COALESCE(capacity.reserved_slots, 0) AS reserved_slots,
         COALESCE(capacity.available_slots, s.capacity) AS available_slots,
         my_reg.id AS my_registration_id,
         my_reg.status AS my_registration_status,
         my_reg.created_at AS my_registration_created_at,
         my_reg.reviewed_at AS my_registration_reviewed_at,
         my_reg.review_note AS my_registration_review_note
       FROM public.shifts s
       JOIN public.users creator
         ON creator.id = s.created_by_user_id
       LEFT JOIN public.shift_capacity_summary capacity
         ON capacity.shift_id = s.id
       LEFT JOIN public.shift_registrations my_reg
         ON my_reg.shift_id = s.id
        AND my_reg.user_id = $2
       WHERE s.id = $1
       LIMIT 1`,
      [id, req.actor.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: 'Shift not found.',
      });
    }

    const shiftRow = result.rows[0];

    if (
      !isStaffLike(req.actor.role) &&
      !(await actorCanAccessShiftNotes(req.actor, id))
    ) {
      return res.status(403).json({
        message: 'You do not have permission to view this shift.',
      });
    }

    const shift = formatShiftRow(shiftRow);

    if (isStaffLike(req.actor.role) || shift.myRegistration) {
      shift.registrations = await loadShiftRegistrations(id);
    }

    return res.json({ shift });
  } catch (error) {
    return next(error);
  }
}

async function listShiftAssignmentPools(req, res, next) {
  const { id } = req.params;

  if (!isValidUuid(id)) {
    return res.status(400).json({
      message: 'Shift id must be a valid UUID.',
    });
  }

  if (!isStaffLike(req.actor.role)) {
    return res.status(403).json({
      message: 'Only staff users can manage shift assignment pools.',
    });
  }

  try {
    const shiftResult = await loadShiftById(id);

    if (shiftResult.rows.length === 0) {
      return res.status(404).json({
        message: 'Shift not found.',
      });
    }

    const shift = shiftResult.rows[0];

    if (!canManageShift(req.actor, shift)) {
      return res.status(403).json({
        message: 'You do not have permission to view assignment pools for this shift.',
      });
    }

    const resolvedShiftType = inferShiftType(shift);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const usersResult = await db.query(
      `SELECT
         u.id,
         u.email,
         u.name,
         u.role,
         u.phone,
         u.birth_date AS "birthDate",
         u.is_active AS "isActive",
         CASE
           WHEN $2::timestamptz IS NULL THEN FALSE
           ELSE (
             EXISTS (
               SELECT 1
               FROM public.shift_attendance sa
               JOIN public.shifts s
                 ON s.id = sa.shift_id
               WHERE sa.user_id = u.id
                 AND sa.status = 'approved'
                 AND sa.report_source != 'staff-absent'
                 AND s.start_time >= $2
                 AND (
                   (s.category = $3 OR s.title = $4)
                   OR
                   ($1 = 'cleaning' AND (s.category = $5 OR s.title = $6))
                 )
             )
             OR
             ($1 IS NOT NULL AND EXISTS (
               SELECT 1
               FROM public.shift_registrations sr
               JOIN public.shifts s
                 ON s.id = sr.shift_id
               WHERE sr.user_id = u.id
                 AND sr.status IN ('pending', 'approved')
                 AND sr.created_at >= $2
                 AND s.start_time > NOW()
                 AND (
                   ($1 = 'dinner' AND (s.category = $3 OR s.title = $4))
                   OR
                   ($1 = 'cleaning' AND (s.category = $5 OR s.title = $6))
                 )
             ))
           )
         END AS has_recent_attendance,
         COALESCE(
           (
             SELECT s.start_time
             FROM public.shift_registrations sr
             JOIN public.shifts s ON s.id = sr.shift_id
             WHERE sr.user_id = u.id
               AND sr.status IN ('pending', 'approved')
               AND sr.created_at >= $2
               AND s.start_time > NOW()
               AND $1 IS NOT NULL
               AND (
                 ($1 = 'dinner' AND (s.category = $3 OR s.title = $4))
                 OR
                 ($1 = 'cleaning' AND (s.category = $5 OR s.title = $6))
               )
             ORDER BY s.start_time ASC
             LIMIT 1
           ),
           (
             SELECT s.start_time
             FROM public.shift_attendance sa
             JOIN public.shifts s ON s.id = sa.shift_id
             WHERE sa.user_id = u.id
               AND sa.status = 'approved'
               AND sa.report_source != 'staff-absent'
               AND s.start_time >= $2
               AND (
                 (s.category = $3 OR s.title = $4)
                 OR
                 ($1 = 'cleaning' AND (s.category = $5 OR s.title = $6))
               )
             ORDER BY s.start_time DESC
             LIMIT 1
           )
         ) AS recent_shift_date
       FROM public.users u
       WHERE u.role = 'user'
       ORDER BY COALESCE(NULLIF(TRIM(u.name), ''), u.email) ASC, u.email ASC`,
      [
        resolvedShiftType,
        thirtyDaysAgo.toISOString(),
        shiftCategoriesByType.dinner,
        shiftTitlesByType.dinner,
        shiftCategoriesByType.cleaning,
        shiftTitlesByType.cleaning,
      ]
    );

    const defaultUsers = [];
    const alreadyAssignedUsers = [];

    for (const row of usersResult.rows) {
      const user = {
        id: row.id,
        email: row.email,
        name: row.name,
        role: normalizeRole(row.role),
        phone: row.phone,
        birthDate: row.birthDate,
        isActive: row.isActive,
        recentShiftDate: row.recent_shift_date ? new Date(row.recent_shift_date).toISOString() : null,
      };

      if (row.has_recent_attendance) {
        alreadyAssignedUsers.push(user);
      } else {
        defaultUsers.push(user);
      }
    }

    return res.json({
      shiftType: resolvedShiftType,
      defaultUsers,
      alreadyAssignedUsers,
    });
  } catch (error) {
    return next(error);
  }
}

async function createShift(req, res, next) {
  const {
    title,
    shiftType,
    assignmentMode,
    description,
    location,
    startTime,
    endTime,
    durationMinutes,
    capacity,
    allowSwapRequests,
    requireAttendanceReport,
    themeColor,
    isSeries,
  } = req.body || {};

  if (!isStaffLike(req.actor.role)) {
    return res.status(403).json({
      message: 'Only staff users can create shifts.',
    });
  }

  const normalizedShiftType = normalizeShiftType(shiftType);
  const normalizedAssignmentMode = normalizeAssignmentMode(assignmentMode);
  const normalizedDurationMinutes =
    durationMinutes === undefined ? null : Number(durationMinutes);
  const inferredShiftTypeFromTitle = inferShiftTypeFromTitle(title);
  const normalizedTitle = title
    ? String(title).trim()
    : normalizedShiftType
      ? shiftTitlesByType[normalizedShiftType]
      : '';
  const resolvedShiftType = normalizedShiftType ?? inferredShiftTypeFromTitle;
  const resolvedCategory = resolvedShiftType
    ? shiftCategoriesByType[resolvedShiftType]
    : 'field';
  let resolvedEndTime = endTime;

  if (shiftType !== undefined && !normalizedShiftType) {
    return res.status(400).json({
      message: 'shiftType must be one of dinner or cleaning.',
    });
  }

  if (assignmentMode !== undefined && !normalizedAssignmentMode) {
    return res.status(400).json({
      message: 'assignmentMode must be one of assign-later or assign-now.',
    });
  }

  if (
    durationMinutes !== undefined &&
    (!Number.isInteger(normalizedDurationMinutes) || normalizedDurationMinutes <= 0)
  ) {
    return res.status(400).json({
      message: 'durationMinutes must be a positive integer.',
    });
  }

  if (
    resolvedEndTime === undefined &&
    normalizedDurationMinutes !== null &&
    startTime &&
    isValidDate(startTime)
  ) {
    resolvedEndTime = buildEndTimeFromDuration(startTime, normalizedDurationMinutes);
  }

  if (!normalizedTitle || !startTime || !resolvedEndTime || capacity === undefined) {
    return res.status(400).json({
      message:
        'title or shiftType, startTime, endTime or durationMinutes, and capacity are required.',
    });
  }

  if (!isValidDate(startTime) || !isValidDate(resolvedEndTime)) {
    return res.status(400).json({
      message: 'startTime and endTime must be valid date-time values.',
    });
  }

  if (new Date(startTime) >= new Date(resolvedEndTime)) {
    return res.status(400).json({
      message: 'startTime must be earlier than endTime.',
    });
  }

  if (
    normalizedDurationMinutes !== null &&
    buildEndTimeFromDuration(startTime, normalizedDurationMinutes) !==
      new Date(resolvedEndTime).toISOString()
  ) {
    return res.status(400).json({
      message: 'endTime must match startTime plus durationMinutes.',
    });
  }

  if (!Number.isInteger(Number(capacity)) || Number(capacity) <= 0) {
    return res.status(400).json({
      message: 'capacity must be a positive integer.',
    });
  }

  try {
    const normalizedThemeColor =
      typeof themeColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(themeColor.trim())
        ? themeColor.trim()
        : null;
    const normalizedAllowSwapRequests =
      allowSwapRequests === true || allowSwapRequests === false ? allowSwapRequests : null;
    const normalizedRequireAttendanceReport =
      requireAttendanceReport === true || requireAttendanceReport === false
        ? requireAttendanceReport
        : null;
    const normalizedIsSeries = Boolean(isSeries);

    const result = await db.query(
      `INSERT INTO public.shifts (
         id,
         title,
         description,
         location,
         start_time,
         end_time,
         capacity,
         created_by_user_id,
         category,
         allow_swap_requests,
         require_attendance_report,
         theme_color,
         is_series
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        randomUUID(),
        normalizedTitle,
        description ? String(description).trim() : null,
        location ? String(location).trim() : null,
        startTime,
        resolvedEndTime,
        Number(capacity),
        req.actor.id,
        resolvedCategory,
        normalizedAllowSwapRequests,
        normalizedRequireAttendanceReport,
        normalizedThemeColor,
        normalizedIsSeries,
      ]
    );

    const createdShiftResult = await loadShiftById(result.rows[0].id);
    const shift = formatShiftRow(createdShiftResult.rows[0]);
    shift.shiftType = normalizedShiftType ?? shift.shiftType;
    shift.assignmentMode = normalizedAssignmentMode;
    shift.durationMinutes =
      normalizedDurationMinutes ?? shift.durationMinutes ?? null;

    return res.status(201).json({
      message: 'Shift created successfully.',
      shift,
    });
  } catch (error) {
    return next(error);
  }
}

async function updateShift(req, res, next) {
  const { id } = req.params;
  const {
    title,
    description,
    location,
    startTime,
    endTime,
    capacity,
    status,
    allowSwapRequests,
    requireAttendanceReport,
    themeColor,
    isSeries,
  } = req.body;

  if (!isValidUuid(id)) {
    return res.status(400).json({
      message: 'Shift id must be a valid UUID.',
    });
  }

  if (
    title === undefined &&
    description === undefined &&
    location === undefined &&
    startTime === undefined &&
    endTime === undefined &&
    capacity === undefined &&
    status === undefined &&
    allowSwapRequests === undefined &&
    requireAttendanceReport === undefined &&
    themeColor === undefined &&
    isSeries === undefined
  ) {
    return res.status(400).json({
      message:
        'At least one of title, description, location, startTime, endTime, capacity, or status is required.',
    });
  }

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    const existingResult = await loadShiftById(id, client);

    if (existingResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        message: 'Shift not found.',
      });
    }

    const shift = existingResult.rows[0];

    if (!canManageShift(req.actor, shift)) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        message: 'You do not have permission to update this shift.',
      });
    }

    const nextTitle = title !== undefined ? String(title).trim() : shift.title;
    const nextAllowSwapRequests =
      allowSwapRequests === true || allowSwapRequests === false
        ? allowSwapRequests
        : allowSwapRequests === null
          ? null
          : shift.allow_swap_requests ?? null;
    const nextRequireAttendanceReport =
      requireAttendanceReport === true || requireAttendanceReport === false
        ? requireAttendanceReport
        : requireAttendanceReport === null
          ? null
          : shift.require_attendance_report ?? null;
    const nextThemeColor =
      themeColor !== undefined
        ? typeof themeColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(themeColor.trim())
          ? themeColor.trim()
          : null
        : shift.theme_color ?? null;
    const nextIsSeries =
      isSeries !== undefined ? Boolean(isSeries) : Boolean(shift.is_series);
    const nextDescription =
      description !== undefined
        ? description === null
          ? null
          : String(description).trim()
        : shift.description;
    const nextLocation =
      location !== undefined
        ? location === null
          ? null
          : String(location).trim()
        : shift.location;
    const nextStartTime = startTime !== undefined ? startTime : shift.start_time;
    const nextEndTime = endTime !== undefined ? endTime : shift.end_time;
    const nextCapacity =
      capacity !== undefined ? Number(capacity) : Number(shift.capacity);
    const nextStatus = status !== undefined ? String(status).trim().toLowerCase() : shift.status;

    if (!nextTitle) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: 'title cannot be empty.',
      });
    }

    if (!isValidDate(nextStartTime) || !isValidDate(nextEndTime)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: 'startTime and endTime must be valid date-time values.',
      });
    }

    if (new Date(nextStartTime) >= new Date(nextEndTime)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: 'startTime must be earlier than endTime.',
      });
    }

    if (!Number.isInteger(nextCapacity) || nextCapacity <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: 'capacity must be a positive integer.',
      });
    }

    if (!shiftStatuses.has(nextStatus)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: 'status must be one of open, closed, cancelled, completed.',
      });
    }

    const reservedSlotsResult = await client.query(
      `SELECT COUNT(*)::int AS reserved_slots
       FROM public.shift_registrations
       WHERE shift_id = $1
         AND status IN ('pending', 'approved')`,
      [id]
    );

    const reservedSlots = reservedSlotsResult.rows[0].reserved_slots;

    if (nextCapacity < reservedSlots) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message:
          'capacity cannot be smaller than the number of pending and approved registrations.',
      });
    }

    await client.query(
      `UPDATE public.shifts
       SET title = $1,
           description = $2,
           location = $3,
           start_time = $4,
           end_time = $5,
           capacity = $6,
           status = $7,
           allow_swap_requests = $9,
           require_attendance_report = $10,
           theme_color = $11,
           is_series = $12
       WHERE id = $8`,
      [
        nextTitle,
        nextDescription,
        nextLocation,
        nextStartTime,
        nextEndTime,
        nextCapacity,
        nextStatus,
        id,
        nextAllowSwapRequests,
        nextRequireAttendanceReport,
        nextThemeColor,
        nextIsSeries,
      ]
    );

    await client.query('COMMIT');

    const updatedShiftResult = await loadShiftById(id);
    const formattedShift = formatShiftRow({
      ...updatedShiftResult.rows[0],
      reserved_slots: reservedSlots,
      available_slots: Math.max(nextCapacity - reservedSlots, 0),
    });

    return res.json({
      message: 'Shift updated successfully.',
      shift: formattedShift,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally {
    client.release();
  }
}

async function deleteShift(req, res, next) {
  const { id } = req.params;

  if (!isValidUuid(id)) {
    return res.status(400).json({
      message: 'Shift id must be a valid UUID.',
    });
  }

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    const existingResult = await loadShiftById(id, client);

    if (existingResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        message: 'Shift not found.',
      });
    }

    const shift = existingResult.rows[0];

    if (!canManageShift(req.actor, shift)) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        message: 'You do not have permission to delete this shift.',
      });
    }

    await client.query(
      `DELETE FROM public.shift_swap_request_volunteers
       WHERE swap_request_id IN (
         SELECT id
         FROM public.shift_swap_requests
         WHERE shift_id = $1
            OR requester_registration_id IN (
              SELECT id
              FROM public.shift_registrations
              WHERE shift_id = $1
            )
       )`,
      [id]
    );

    await client.query(
      `DELETE FROM public.shift_attendance
       WHERE shift_id = $1
          OR registration_id IN (
            SELECT id
            FROM public.shift_registrations
            WHERE shift_id = $1
          )`,
      [id]
    );

    await client.query(
      `DELETE FROM public.shift_swap_requests
       WHERE shift_id = $1
          OR requester_registration_id IN (
            SELECT id
            FROM public.shift_registrations
            WHERE shift_id = $1
          )`,
      [id]
    );

    await client.query(
      `DELETE FROM public.shift_registrations
       WHERE shift_id = $1`,
      [id]
    );

    await client.query(
      `DELETE FROM public.shifts
       WHERE id = $1`,
      [id]
    );

    await client.query('COMMIT');

    return res.json({
      message: 'Shift deleted successfully.',
      deletedShiftId: id,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally {
    client.release();
  }
}

async function registerForShift(req, res, next) {
  const { id } = req.params;

  if (!isValidUuid(id)) {
    return res.status(400).json({
      message: 'Shift id must be a valid UUID.',
    });
  }

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    const shiftResult = await client.query(
      `SELECT *
       FROM public.shifts
       WHERE id = $1
       FOR UPDATE`,
      [id]
    );

    if (shiftResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        message: 'Shift not found.',
      });
    }

    const shift = shiftResult.rows[0];

    if (shift.status !== 'open') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: 'Only open shifts can accept new registrations.',
      });
    }

    const existingRegistrationResult = await client.query(
      `SELECT *
       FROM public.shift_registrations
       WHERE shift_id = $1
         AND user_id = $2
       LIMIT 1`,
      [id, req.actor.id]
    );

    if (existingRegistrationResult.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: 'You already have a registration for this shift.',
      });
    }

    const reservedSlotsResult = await client.query(
      `SELECT COUNT(*)::int AS reserved_slots
       FROM public.shift_registrations
       WHERE shift_id = $1
         AND status IN ('pending', 'approved')`,
      [id]
    );

    const reservedSlots = reservedSlotsResult.rows[0].reserved_slots;

    if (reservedSlots >= shift.capacity) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: 'This shift is already full.',
      });
    }

    const registrationId = randomUUID();

    await client.query(
      `INSERT INTO public.shift_registrations (
         id,
         shift_id,
         user_id,
         status
       )
       VALUES ($1, $2, $3, 'pending')`,
      [registrationId, id, req.actor.id]
    );

    await client.query('COMMIT');

    const registrationResult = await client.query(
      `SELECT
         sr.*,
         u.name AS user_name,
         u.email AS user_email,
         u.role AS user_role,
         reviewer.name AS reviewed_by_name,
         reviewer.email AS reviewed_by_email
       FROM public.shift_registrations sr
       JOIN public.users u
         ON u.id = sr.user_id
       LEFT JOIN public.users reviewer
         ON reviewer.id = sr.reviewed_by_user_id
       WHERE sr.id = $1
       LIMIT 1`,
      [registrationId]
    );

    return res.status(201).json({
      message: 'Registered for shift successfully. Approval is pending.',
      registration: formatRegistrationRow(registrationResult.rows[0]),
    });
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally {
    client.release();
  }
}

async function reportAttendance(req, res, next) {
  const { id } = req.params;

  if (!isValidUuid(id)) {
    return res.status(400).json({
      message: 'Shift id must be a valid UUID.',
    });
  }

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    const shiftResult = await client.query(
      `SELECT *
       FROM public.shifts
       WHERE id = $1
       FOR UPDATE`,
      [id]
    );

    if (shiftResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        message: 'Shift not found.',
      });
    }

    const shift = shiftResult.rows[0];

    if (shift.status === 'cancelled') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: 'Attendance cannot be reported for a cancelled shift.',
      });
    }

    const registrationResult = await client.query(
      `SELECT *
       FROM public.shift_registrations
       WHERE shift_id = $1
         AND user_id = $2
       ORDER BY created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [id, req.actor.id]
    );

    if (registrationResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        message: 'Only users assigned to this shift can report attendance.',
      });
    }

    const registration = registrationResult.rows[0];

    if (registration.status !== 'approved') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: 'Attendance can only be reported for approved shift assignments.',
      });
    }

    const windowStart = getAttendanceWindowStartTime(shift.start_time).getTime();
    const windowEnd = new Date(shift.end_time).getTime();
    const now = Date.now();

    if (now < windowStart || now > windowEnd) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message:
          'Attendance can be reported from five minutes before the shift starts until the shift ends.',
      });
    }

    const attendanceResult = await client.query(
      `SELECT id
       FROM public.shift_attendance
       WHERE registration_id = $1
       LIMIT 1
       FOR UPDATE`,
      [registration.id]
    );

    if (attendanceResult.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: 'Attendance for this shift has already been reported.',
      });
    }

    const attendanceId = randomUUID();

    await client.query(
      `INSERT INTO public.shift_attendance (
         id,
         shift_id,
         registration_id,
         user_id,
         status,
         reported_at
       )
       VALUES ($1, $2, $3, $4, 'pending', timezone('utc', now()))`,
      [attendanceId, id, registration.id, req.actor.id]
    );

    await client.query('COMMIT');

    return res.status(201).json({
      message: 'Attendance reported successfully. Staff approval is pending.',
      attendance: await loadFormattedAttendanceById(attendanceId),
    });
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally {
    client.release();
  }
}

async function reportAttendanceManually(req, res, next) {
  const { id, registrationId } = req.params;

  if (!isValidUuid(id) || !isValidUuid(registrationId)) {
    return res.status(400).json({
      message: 'Shift id and registration id must be valid UUIDs.',
    });
  }

  if (!isStaffLike(req.actor.role)) {
    return res.status(403).json({
      message: 'Only staff users can report attendance manually.',
    });
  }

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    const shiftResult = await client.query(
      `SELECT *
       FROM public.shifts
       WHERE id = $1
       FOR UPDATE`,
      [id]
    );

    if (shiftResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        message: 'Shift not found.',
      });
    }

    const shift = shiftResult.rows[0];

    if (
      !canReportAttendanceManuallyForShift(shift, null)
    ) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message:
          'Manual attendance can only be added from five minutes before the shift starts and later.',
      });
    }

    const registrationResult = await client.query(
      `SELECT *
       FROM public.shift_registrations
       WHERE id = $1
         AND shift_id = $2
       LIMIT 1
       FOR UPDATE`,
      [registrationId, id]
    );

    if (registrationResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        message: 'Registration not found.',
      });
    }

    const registration = registrationResult.rows[0];

    if (registration.status !== 'approved') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: 'Manual attendance can only be added for approved registrations.',
      });
    }

    const existingAttendanceResult = await client.query(
      `SELECT id
       FROM public.shift_attendance
       WHERE registration_id = $1
       LIMIT 1
       FOR UPDATE`,
      [registrationId]
    );

    if (existingAttendanceResult.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: 'Attendance has already been recorded for this registration.',
      });
    }

    const attendanceId = randomUUID();

    await client.query(
      `INSERT INTO public.shift_attendance (
         id,
         shift_id,
         registration_id,
         user_id,
         status,
         report_source,
         reported_at,
         reported_by_user_id,
         reviewed_at,
         reviewed_by_user_id
       )
       VALUES (
         $1,
         $2,
         $3,
         $4,
         'approved',
         'staff-manual',
         timezone('utc', now()),
         $5,
         timezone('utc', now()),
         $5
       )`,
      [attendanceId, id, registrationId, registration.user_id, req.actor.id]
    );

    await client.query('COMMIT');

    return res.status(201).json({
      message: 'Attendance was marked manually by staff.',
      attendance: await loadFormattedAttendanceById(attendanceId),
    });
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally {
    client.release();
  }
}

async function reportAttendanceAbsent(req, res, next) {
  const { id, registrationId } = req.params;

  if (!isValidUuid(id) || !isValidUuid(registrationId)) {
    return res.status(400).json({
      message: 'Shift id and registration id must be valid UUIDs.',
    });
  }

  if (!isStaffLike(req.actor.role)) {
    return res.status(403).json({
      message: 'Only staff users can mark attendance as absent.',
    });
  }

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    const shiftResult = await client.query(
      `SELECT *
       FROM public.shifts
       WHERE id = $1
       FOR UPDATE`,
      [id]
    );

    if (shiftResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        message: 'Shift not found.',
      });
    }

    const shift = shiftResult.rows[0];

    if (!canReportAttendanceManuallyForShift(shift, null)) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message:
          'Absent attendance can only be recorded from five minutes before the shift starts and later.',
      });
    }

    const registrationResult = await client.query(
      `SELECT *
       FROM public.shift_registrations
       WHERE id = $1
         AND shift_id = $2
       LIMIT 1
       FOR UPDATE`,
      [registrationId, id]
    );

    if (registrationResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        message: 'Registration not found.',
      });
    }

    const registration = registrationResult.rows[0];

    if (registration.status !== 'approved') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: 'Absent attendance can only be recorded for approved registrations.',
      });
    }

    const existingAttendanceResult = await client.query(
      `SELECT id
       FROM public.shift_attendance
       WHERE registration_id = $1
       LIMIT 1
       FOR UPDATE`,
      [registrationId]
    );

    if (existingAttendanceResult.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: 'Attendance has already been recorded for this registration.',
      });
    }

    const attendanceId = randomUUID();

    await client.query(
      `INSERT INTO public.shift_attendance (
         id,
         shift_id,
         registration_id,
         user_id,
         status,
         report_source,
         reported_at,
         reported_by_user_id,
         reviewed_at,
         reviewed_by_user_id
       )
       VALUES (
         $1,
         $2,
         $3,
         $4,
         'approved',
         'staff-absent',
         timezone('utc', now()),
         $5,
         timezone('utc', now()),
         $5
       )`,
      [attendanceId, id, registrationId, registration.user_id, req.actor.id]
    );

    await client.query('COMMIT');

    return res.status(201).json({
      message: 'Attendance was marked as absent by staff.',
      attendance: await loadFormattedAttendanceById(attendanceId),
    });
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally {
    client.release();
  }
}

async function replaceShiftAssignments(req, res, next) {
  const { id } = req.params;
  const {
    userIds,
    assignmentType: rawAssignmentType,
    assignmentTypesByUserId: rawAssignmentTypesByUserId,
  } = req.body || {};
  const defaultAssignmentType =
    rawAssignmentType === 'forced' ? 'forced' : rawAssignmentType === 'standard' || rawAssignmentType == null
      ? 'standard'
      : null;

  if (!isValidUuid(id)) {
    return res.status(400).json({
      message: 'Shift id must be a valid UUID.',
    });
  }

  if (!Array.isArray(userIds)) {
    return res.status(400).json({
      message: 'userIds must be an array of user ids.',
    });
  }

  if (!defaultAssignmentType) {
    return res.status(400).json({
      message: "assignmentType must be either 'standard' or 'forced'.",
    });
  }

  if (
    rawAssignmentTypesByUserId != null &&
    (
      typeof rawAssignmentTypesByUserId !== 'object' ||
      Array.isArray(rawAssignmentTypesByUserId)
    )
  ) {
    return res.status(400).json({
      message: 'assignmentTypesByUserId must be an object keyed by user id.',
    });
  }

  if (!isStaffLike(req.actor.role)) {
    return res.status(403).json({
      message: 'Only staff users can assign users to shifts.',
    });
  }

  const normalizedUserIds = Array.from(new Set(userIds.map((value) => String(value))));
  const requestedUserIdsSet = new Set(normalizedUserIds);
  const normalizedAssignmentTypesByUserId = new Map();

  if (!normalizedUserIds.every((userId) => isValidUuid(userId))) {
    return res.status(400).json({
      message: 'All userIds must be valid UUIDs.',
    });
  }

  const assignmentTypeEntries = Object.entries(rawAssignmentTypesByUserId || {});

  for (const [userId, value] of assignmentTypeEntries) {
    if (!requestedUserIdsSet.has(userId)) {
      continue;
    }

    if (value !== 'standard' && value !== 'forced') {
      return res.status(400).json({
        message: "assignmentTypesByUserId values must be either 'standard' or 'forced'.",
      });
    }

    normalizedAssignmentTypesByUserId.set(userId, value);
  }

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    const shiftResult = await client.query(
      `SELECT *
       FROM public.shifts
       WHERE id = $1
       FOR UPDATE`,
      [id]
    );

    if (shiftResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        message: 'Shift not found.',
      });
    }

    const shift = shiftResult.rows[0];

    if (!canManageShift(req.actor, shift)) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        message: 'You do not have permission to update assignments for this shift.',
      });
    }

    const targetUsersResult =
      normalizedUserIds.length === 0
        ? { rows: [] }
        : await client.query(
            `SELECT id, role, name, email, phone
             FROM public.users
             WHERE id = ANY($1::uuid[])`,
            [normalizedUserIds]
          );

    if (targetUsersResult.rows.length !== normalizedUserIds.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: 'One or more selected users were not found.',
      });
    }

    if (
      targetUsersResult.rows.some((user) => normalizeRole(user.role) !== 'user')
    ) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: 'Only non-staff users can be assigned to a shift.',
      });
    }

    const existingRegistrationsResult = await client.query(
      `SELECT
         sr.*,
         u.role AS user_role
       FROM public.shift_registrations sr
       JOIN public.users u
         ON u.id = sr.user_id
       WHERE sr.shift_id = $1
       FOR UPDATE`,
      [id]
    );

    const existingRegistrations = existingRegistrationsResult.rows.filter(
      (registration) => normalizeRole(registration.user_role) === 'user'
    );
    const protectedApprovedRegistrations = existingRegistrations.filter(
      (registration) => registration.status === 'approved'
    );
    const effectiveSelectedUserIds = Array.from(
      new Set([
        ...normalizedUserIds,
        ...protectedApprovedRegistrations.map((registration) => registration.user_id),
      ])
    );

    if (effectiveSelectedUserIds.length > Number(shift.capacity)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message:
          'Assigned users cannot exceed shift capacity. Approved assignments remain locked until handled outside the assignment screen.',
      });
    }

    const existingRegistrationsByUserId = new Map(
      existingRegistrations.map((registration) => [registration.user_id, registration])
    );
    const targetUsersById = new Map(
      targetUsersResult.rows.map((user) => [user.id, user])
    );
    const usersToNotifyById = new Map();
    const forcedUsersToNotifyById = new Map();
    const forcedReviewNote = 'Force assigned by staff.';
    const assignmentSummary = {
      standard: 0,
      forced: 0,
      preservedApproved: 0,
    };

    for (const userId of normalizedUserIds) {
      const existingRegistration = existingRegistrationsByUserId.get(userId);

      if (existingRegistration && existingRegistration.status === 'approved') {
        continue;
      }

      const selectedAssignmentType =
        normalizedAssignmentTypesByUserId.get(userId) || defaultAssignmentType;

      if (selectedAssignmentType === 'forced') {
        assignmentSummary.forced += 1;
      } else {
        assignmentSummary.standard += 1;
      }
    }

    for (const userId of effectiveSelectedUserIds) {
      const registration = existingRegistrationsByUserId.get(userId);
      const selectedAssignmentType =
        normalizedAssignmentTypesByUserId.get(userId) || defaultAssignmentType;
      const nextSelectedStatus =
        selectedAssignmentType === 'forced' ? 'approved' : 'pending';

      if (!registration) {
        if (selectedAssignmentType === 'forced') {
          await client.query(
            `INSERT INTO public.shift_registrations (
               id,
               shift_id,
               user_id,
               status,
               reviewed_at,
               reviewed_by_user_id,
               review_note
             )
             VALUES ($1, $2, $3, 'approved', NOW(), $4, $5)`,
            [randomUUID(), id, userId, req.actor.id, forcedReviewNote]
          );
        } else {
          await client.query(
            `INSERT INTO public.shift_registrations (
               id,
               shift_id,
               user_id,
               status,
               reviewed_at,
               reviewed_by_user_id,
               review_note
             )
             VALUES ($1, $2, $3, 'pending', NULL, NULL, NULL)`,
            [randomUUID(), id, userId]
          );
        }

        const targetUser = targetUsersById.get(userId);

        if (targetUser && selectedAssignmentType === 'standard') {
          usersToNotifyById.set(userId, targetUser);
        }

        if (targetUser && selectedAssignmentType === 'forced') {
          forcedUsersToNotifyById.set(userId, targetUser);
        }

        continue;
      }

      if (registration.status === 'approved') {
        if (!requestedUserIdsSet.has(userId)) {
          assignmentSummary.preservedApproved += 1;
        }
        continue;
      }

      if (registration.status === 'pending') {
        if (selectedAssignmentType === 'standard') {
          continue;
        }

        await client.query(
          `UPDATE public.shift_registrations
           SET status = 'approved',
               reviewed_at = NOW(),
               reviewed_by_user_id = $2,
               review_note = $3
           WHERE id = $1`,
          [registration.id, req.actor.id, forcedReviewNote]
        );

        const targetUserPending = targetUsersById.get(userId);
        if (targetUserPending) {
          forcedUsersToNotifyById.set(userId, targetUserPending);
        }
        continue;
      }

      await client.query(
        `UPDATE public.shift_registrations
         SET status = $2,
             reviewed_at = ${selectedAssignmentType === 'forced' ? 'NOW()' : 'NULL'},
             reviewed_by_user_id = ${selectedAssignmentType === 'forced' ? '$3' : 'NULL'},
             review_note = ${selectedAssignmentType === 'forced' ? '$4' : 'NULL'}
         WHERE id = $1`,
        selectedAssignmentType === 'forced'
          ? [registration.id, nextSelectedStatus, req.actor.id, forcedReviewNote]
          : [registration.id, nextSelectedStatus]
      );

      const targetUser = targetUsersById.get(userId);

      if (targetUser && selectedAssignmentType === 'standard') {
        usersToNotifyById.set(userId, targetUser);
      }

      if (targetUser && selectedAssignmentType === 'forced') {
        forcedUsersToNotifyById.set(userId, targetUser);
      }
    }

    const selectedUserIdsSet = new Set(effectiveSelectedUserIds);

    for (const registration of existingRegistrations) {
      if (
        selectedUserIdsSet.has(registration.user_id) ||
        registration.status !== 'pending'
      ) {
        continue;
      }

      await client.query(
        `UPDATE public.shift_registrations
         SET status = 'cancelled',
             reviewed_at = NOW(),
             reviewed_by_user_id = $2,
             review_note = $3
         WHERE id = $1`,
        [
          registration.id,
          req.actor.id,
          'Removed from shift assignments by staff.',
        ]
      );
    }

    await client.query('COMMIT');

    const updatedShiftResult = await loadShiftById(id);
    const reservedSlotsResult = await db.query(
      `SELECT COUNT(*)::int AS reserved_slots
       FROM public.shift_registrations
       WHERE shift_id = $1
         AND status IN ('pending', 'approved')`,
      [id]
    );
    const reservedSlots = reservedSlotsResult.rows[0].reserved_slots;
    const formattedShift = formatShiftRow({
      ...updatedShiftResult.rows[0],
      reserved_slots: reservedSlots,
      available_slots: Math.max(Number(updatedShiftResult.rows[0].capacity) - reservedSlots, 0),
    });
    formattedShift.registrations = await loadShiftRegistrations(id);
    const appliedAssignmentType =
      assignmentSummary.forced > 0 && assignmentSummary.standard > 0
        ? 'mixed'
        : assignmentSummary.forced > 0
          ? 'forced'
          : 'standard';
    const notificationSummary =
      assignmentSummary.standard > 0
        ? await sendShiftAssignmentNotifications(
            updatedShiftResult.rows[0],
            Array.from(usersToNotifyById.values())
          )
        : undefined;
    const forcedNotificationSummary =
      assignmentSummary.forced > 0
        ? await sendForcedShiftAssignmentNotifications(
            updatedShiftResult.rows[0],
            Array.from(forcedUsersToNotifyById.values())
          )
        : undefined;

    return res.json({
      message: buildShiftAssignmentResponseMessage(
        notificationSummary,
        appliedAssignmentType,
        assignmentSummary
      ),
      appliedAssignmentType,
      assignmentSummary,
      notificationSummary,
      forcedNotificationSummary,
      shift: formattedShift,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally {
    client.release();
  }
}

async function confirmOwnRegistration(req, res, next) {
  const { id, registrationId } = req.params;

  if (!isValidUuid(id) || !isValidUuid(registrationId)) {
    return res.status(400).json({
      message: 'Shift id and registration id must be valid UUIDs.',
    });
  }

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    const shiftResult = await client.query(
      `SELECT *
       FROM public.shifts
       WHERE id = $1
       FOR UPDATE`,
      [id]
    );

    if (shiftResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        message: 'Shift not found.',
      });
    }

    const registrationResult = await client.query(
      `SELECT *
       FROM public.shift_registrations
       WHERE id = $1
         AND shift_id = $2
       FOR UPDATE`,
      [registrationId, id]
    );

    if (registrationResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        message: 'Registration not found.',
      });
    }

    const registration = registrationResult.rows[0];

    if (registration.user_id !== req.actor.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        message: 'You do not have permission to confirm this registration.',
      });
    }

    if (registration.status === 'approved') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: 'Registration is already approved.',
      });
    }

    if (registration.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: 'Only pending registrations can be confirmed.',
      });
    }

    await client.query(
      `UPDATE public.shift_registrations
       SET status = 'approved',
           reviewed_at = NOW(),
           reviewed_by_user_id = NULL,
           review_note = NULL
       WHERE id = $1`,
      [registrationId]
    );

    await client.query('COMMIT');

    const formattedRegistration = await loadFormattedRegistrationById(
      registrationId
    );

    return res.json({
      message: 'Registration confirmed successfully.',
      registration: formattedRegistration,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally {
    client.release();
  }
}

async function updateAttendanceStatus(req, res, next, nextStatus) {
  const { id, attendanceId } = req.params;
  const { reviewNote } = req.body || {};
  const normalizedReviewNote =
    reviewNote === undefined || reviewNote === null
      ? null
      : String(reviewNote).trim() || null;

  if (!isValidUuid(id) || !isValidUuid(attendanceId)) {
    return res.status(400).json({
      message: 'Shift id and attendance id must be valid UUIDs.',
    });
  }

  if (!isStaffLike(req.actor.role)) {
    return res.status(403).json({
      message: 'Only staff users can review attendance.',
    });
  }

  if (!attendanceStatuses.has(nextStatus)) {
    return res.status(400).json({
      message: 'Attendance status must be one of pending, approved, rejected.',
    });
  }

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    const shiftResult = await client.query(
      `SELECT *
       FROM public.shifts
       WHERE id = $1
       FOR UPDATE`,
      [id]
    );

    if (shiftResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        message: 'Shift not found.',
      });
    }

    const shift = shiftResult.rows[0];

    if (Date.now() < getAttendanceWindowStartTime(shift.start_time).getTime()) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message:
          'Attendance can only be reviewed from five minutes before the shift starts and later.',
      });
    }

    const attendanceResult = await client.query(
      `SELECT att.*
       FROM public.shift_attendance att
       WHERE att.id = $1
         AND att.shift_id = $2
       FOR UPDATE`,
      [attendanceId, id]
    );

    if (attendanceResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        message: 'Attendance record not found.',
      });
    }

    await client.query(
      `UPDATE public.shift_attendance
       SET status = $2,
           updated_at = timezone('utc', now()),
           reviewed_at = timezone('utc', now()),
           reviewed_by_user_id = $3,
           review_note = $4
       WHERE id = $1`,
      [attendanceId, nextStatus, req.actor.id, normalizedReviewNote]
    );

    await client.query('COMMIT');

    return res.json({
      message:
        nextStatus === 'approved'
          ? 'Attendance approved successfully.'
          : 'Attendance was rejected.',
      attendance: await loadFormattedAttendanceById(attendanceId),
    });
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally {
    client.release();
  }
}

async function updateRegistrationStatus(req, res, next, nextStatus) {
  const { id, registrationId } = req.params;
  const { reviewNote } = req.body || {};

  if (!isValidUuid(id) || !isValidUuid(registrationId)) {
    return res.status(400).json({
      message: 'Shift id and registration id must be valid UUIDs.',
    });
  }

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    const shiftResult = await client.query(
      `SELECT *
       FROM public.shifts
       WHERE id = $1
       FOR UPDATE`,
      [id]
    );

    if (shiftResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        message: 'Shift not found.',
      });
    }

    const shift = shiftResult.rows[0];

    if (nextStatus === 'approved' || nextStatus === 'rejected') {
      if (!canManageShift(req.actor, shift)) {
        await client.query('ROLLBACK');
        return res.status(403).json({
          message: 'You do not have permission to review registrations for this shift.',
        });
      }
    }

    const registrationResult = await client.query(
      `SELECT *
       FROM public.shift_registrations
       WHERE id = $1
         AND shift_id = $2
       FOR UPDATE`,
      [registrationId, id]
    );

    if (registrationResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        message: 'Registration not found.',
      });
    }

    const registration = registrationResult.rows[0];

    if (nextStatus === 'cancelled') {
      const canCancelOwn =
        registration.user_id === req.actor.id &&
        ['pending', 'approved'].includes(registration.status);
      const canManagerCancel = canManageShift(req.actor, shift);

      if (!canCancelOwn && !canManagerCancel) {
        await client.query('ROLLBACK');
        return res.status(403).json({
          message: 'You do not have permission to cancel this registration.',
        });
      }
    }

    if (!registrationStatuses.has(nextStatus)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: 'Invalid registration status.',
      });
    }

    if (registration.status === nextStatus) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: `Registration is already ${nextStatus}.`,
      });
    }

    await client.query(
      `UPDATE public.shift_registrations
       SET status = $1::public.shift_registration_status,
           reviewed_at = CASE
             WHEN $1::text IN ('approved', 'rejected', 'cancelled') THEN NOW()
             ELSE reviewed_at
           END,
           reviewed_by_user_id = CASE
             WHEN $1::text IN ('approved', 'rejected', 'cancelled') THEN $2
             ELSE reviewed_by_user_id
           END,
           review_note = $3
       WHERE id = $4`,
      [
        nextStatus,
        nextStatus === 'cancelled' && registration.user_id === req.actor.id && !canManageShift(req.actor, shift)
          ? null
          : req.actor.id,
        reviewNote ? String(reviewNote).trim() : null,
        registrationId,
      ]
    );

    await client.query('COMMIT');

    return res.json({
      message: `Registration ${nextStatus} successfully.`,
      registration: await loadFormattedRegistrationById(registrationId),
    });
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally {
    client.release();
  }
}

async function updateSwapVolunteerOfferStatus(req, res, next) {
  const { requestId, offerId } = req.params;
  const { status, reviewNote } = req.body || {};
  const normalizedStatus = typeof status === 'string' ? status.trim().toLowerCase() : '';
  const normalizedReviewNote =
    typeof reviewNote === 'string' && reviewNote.trim().length > 0
      ? reviewNote.trim()
      : null;

  if (!isValidUuid(requestId) || !isValidUuid(offerId)) {
    return res.status(400).json({
      message: 'Swap request id and volunteer offer id must be valid UUIDs.',
    });
  }

  if (!swapVolunteerOfferStatuses.has(normalizedStatus)) {
    return res.status(400).json({
      message: 'Invalid volunteer offer status.',
    });
  }

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    const requestResult = await client.query(
      `SELECT
         ssr.*,
         s.start_time AS shift_start_time,
         s.status AS shift_status
       FROM public.shift_swap_requests ssr
       JOIN public.shifts s
         ON s.id = ssr.shift_id
       WHERE ssr.id = $1
       FOR UPDATE`,
      [requestId]
    );

    if (requestResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        message: 'Swap request not found.',
      });
    }

    const swapRequest = requestResult.rows[0];
    const isStaffActor = isStaffLike(req.actor.role);

    const offerResult = await client.query(
      `SELECT *
       FROM public.shift_swap_request_volunteers
       WHERE id = $1
         AND swap_request_id = $2
       FOR UPDATE`,
      [offerId, requestId]
    );

    if (offerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        message: 'Volunteer offer not found.',
      });
    }

    const offer = offerResult.rows[0];
    const isOfferOwner = offer.volunteer_user_id === req.actor.id;

    if (normalizedStatus === 'cancelled') {
      if (!isOfferOwner && !isStaffActor) {
        await client.query('ROLLBACK');
        return res.status(403).json({
          message: 'You do not have permission to cancel this volunteer offer.',
        });
      }
    } else if (!isStaffActor) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        message: 'Only staff users can review volunteer offers.',
      });
    }

    if (offer.status === normalizedStatus) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: `Volunteer offer is already ${normalizedStatus}.`,
      });
    }

    if (
      ['rejected', 'cancelled'].includes(offer.status) &&
      normalizedStatus !== 'cancelled'
    ) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: 'This volunteer offer can no longer be changed.',
      });
    }

    if (normalizedStatus === 'approved') {
      if (swapRequest.status !== 'approved') {
        await client.query('ROLLBACK');
        return res.status(409).json({
          message: 'Only active published swap requests can be approved.',
        });
      }

      if (
        swapRequest.shift_status === 'cancelled' ||
        swapRequest.shift_status === 'completed' ||
        new Date(swapRequest.shift_start_time).getTime() <= Date.now()
      ) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          message: 'This shift can no longer be swapped.',
        });
      }

      const requesterRegistrationResult = await client.query(
        `SELECT *
         FROM public.shift_registrations
         WHERE id = $1
         FOR UPDATE`,
        [swapRequest.requester_registration_id]
      );

      if (requesterRegistrationResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          message: 'Requester registration not found.',
        });
      }

      const requesterRegistration = requesterRegistrationResult.rows[0];

      if (requesterRegistration.status !== 'approved') {
        await client.query('ROLLBACK');
        return res.status(409).json({
          message: 'The original assignment is no longer active.',
        });
      }

      const volunteerRegistrationResult = await client.query(
        `SELECT *
         FROM public.shift_registrations
         WHERE shift_id = $1
           AND user_id = $2
         ORDER BY created_at DESC
         LIMIT 1
         FOR UPDATE`,
        [swapRequest.shift_id, offer.volunteer_user_id]
      );

      const volunteerRegistration = volunteerRegistrationResult.rows[0] ?? null;

      if (
        volunteerRegistration &&
        ['pending', 'approved'].includes(volunteerRegistration.status)
      ) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          message: 'This volunteer is already assigned to the shift.',
        });
      }

      if (volunteerRegistration) {
        await client.query(
          `UPDATE public.shift_registrations
           SET status = 'approved',
               reviewed_at = NOW(),
               reviewed_by_user_id = $2,
               review_note = $3
           WHERE id = $1`,
          [
            volunteerRegistration.id,
            req.actor.id,
            'Approved as a replacement volunteer by staff.',
          ]
        );
      } else {
        await client.query(
          `INSERT INTO public.shift_registrations (
             id,
             shift_id,
             user_id,
             status,
             reviewed_at,
             reviewed_by_user_id,
             review_note
           )
           VALUES ($1, $2, $3, 'approved', NOW(), $4, $5)`,
          [
            randomUUID(),
            swapRequest.shift_id,
            offer.volunteer_user_id,
            req.actor.id,
            'Approved as a replacement volunteer by staff.',
          ]
        );
      }

      await client.query(
        `UPDATE public.shift_registrations
         SET status = 'cancelled',
             reviewed_at = NOW(),
             reviewed_by_user_id = $2,
             review_note = $3
         WHERE id = $1`,
        [
          requesterRegistration.id,
          req.actor.id,
          'Shift swap approved by staff.',
        ]
      );

      await client.query(
        `UPDATE public.shift_swap_request_volunteers
         SET status = 'approved',
             updated_at = NOW(),
             reviewed_at = NOW(),
             reviewed_by_user_id = $2,
             review_note = $3
         WHERE id = $1`,
        [offerId, req.actor.id, normalizedReviewNote]
      );

      await client.query(
        `UPDATE public.shift_swap_request_volunteers
         SET status = 'rejected',
             updated_at = NOW(),
             reviewed_at = NOW(),
             reviewed_by_user_id = $2,
             review_note = 'Another volunteer was approved for this swap.'
         WHERE swap_request_id = $1
           AND id <> $3
           AND status IN ('pending', 'approved')`,
        [requestId, req.actor.id, offerId]
      );

      await client.query(
        `UPDATE public.shift_swap_requests
         SET status = 'closed',
             updated_at = NOW(),
             reviewed_at = NOW(),
             reviewed_by_user_id = $2,
             review_note = $3
         WHERE id = $1`,
        [requestId, req.actor.id, normalizedReviewNote]
      );

      await client.query('COMMIT');

      return res.json({
        message: 'Shift swap approved successfully.',
        request: await loadFormattedSwapRequestById(requestId, req.actor),
      });
    }

    await client.query(
      `UPDATE public.shift_swap_request_volunteers
       SET status = $1::public.shift_swap_volunteer_status,
           updated_at = NOW(),
           reviewed_at = CASE
             WHEN $1::text = 'cancelled' AND $2 IS NULL THEN reviewed_at
             ELSE NOW()
           END,
           reviewed_by_user_id = CASE
             WHEN $1::text = 'cancelled' AND $2 IS NULL THEN reviewed_by_user_id
             ELSE $2
           END,
           review_note = $3
       WHERE id = $4`,
      [
        normalizedStatus,
        normalizedStatus === 'cancelled' && isOfferOwner && !isStaffActor
          ? null
          : req.actor.id,
        normalizedReviewNote,
        offerId,
      ]
    );

    await client.query('COMMIT');

    return res.json({
      message: `Volunteer offer ${normalizedStatus} successfully.`,
      request: await loadFormattedSwapRequestById(requestId, req.actor),
    });
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally {
    client.release();
  }
}

async function updateSwapRequestStatus(req, res, next) {
  const { requestId } = req.params;
  const { status, reviewNote } = req.body || {};
  const normalizedStatus = typeof status === 'string' ? status.trim().toLowerCase() : '';
  const normalizedReviewNote =
    typeof reviewNote === 'string' && reviewNote.trim().length > 0
      ? reviewNote.trim()
      : null;

  if (!isValidUuid(requestId)) {
    return res.status(400).json({
      message: 'Swap request id must be a valid UUID.',
    });
  }

  if (!swapRequestStatuses.has(normalizedStatus)) {
    return res.status(400).json({
      message: 'Invalid swap request status.',
    });
  }

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    const requestResult = await client.query(
      `SELECT
         ssr.*,
         s.start_time AS shift_start_time,
         s.status AS shift_status
       FROM public.shift_swap_requests ssr
       JOIN public.shifts s
         ON s.id = ssr.shift_id
       WHERE ssr.id = $1
       FOR UPDATE`,
      [requestId]
    );

    if (requestResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        message: 'Swap request not found.',
      });
    }

    const swapRequest = requestResult.rows[0];
    const isOwner = swapRequest.requester_user_id === req.actor.id;
    const isStaffActor = isStaffLike(req.actor.role);

    if (normalizedStatus === 'cancelled') {
      if (!isOwner && !isStaffActor) {
        await client.query('ROLLBACK');
        return res.status(403).json({
          message: 'You do not have permission to cancel this swap request.',
        });
      }
    } else if (!isStaffActor) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        message: 'Only staff users can review swap requests.',
      });
    }

    if (swapRequest.status === normalizedStatus) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: `Swap request is already ${normalizedStatus}.`,
      });
    }

    if (
      ['cancelled', 'rejected', 'closed'].includes(swapRequest.status) &&
      normalizedStatus !== 'closed'
    ) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: 'This swap request is already closed and cannot be reopened.',
      });
    }

    if (
      (swapRequest.shift_status === 'cancelled' || swapRequest.shift_status === 'completed') &&
      normalizedStatus !== 'closed'
    ) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: 'This shift is no longer active, so the swap request can only be closed.',
      });
    }

    await client.query(
      `UPDATE public.shift_swap_requests
       SET status = $1::public.shift_swap_request_status,
           updated_at = NOW(),
           reviewed_at = CASE
             WHEN $1::text = 'cancelled' AND $2 IS NULL THEN reviewed_at
             ELSE NOW()
           END,
           reviewed_by_user_id = CASE
             WHEN $1::text = 'cancelled' AND $2 IS NULL THEN reviewed_by_user_id
             ELSE $2
           END,
           review_note = $3
       WHERE id = $4`,
      [
        normalizedStatus,
        normalizedStatus === 'cancelled' && isOwner && !isStaffActor ? null : req.actor.id,
        normalizedReviewNote,
        requestId,
      ]
    );

    if (['rejected', 'cancelled', 'closed'].includes(normalizedStatus)) {
      await client.query(
        `UPDATE public.shift_swap_request_volunteers
         SET status = CASE
               WHEN $2::text = 'cancelled' THEN 'cancelled'::public.shift_swap_volunteer_status
               ELSE 'rejected'::public.shift_swap_volunteer_status
             END,
             updated_at = NOW(),
             reviewed_at = NOW(),
             reviewed_by_user_id = $1,
             review_note = COALESCE(review_note, 'The swap request is no longer active.')
         WHERE swap_request_id = $3
           AND status IN ('pending', 'approved')`,
        [req.actor.id, normalizedStatus, requestId]
      );
    }

    await client.query('COMMIT');

    return res.json({
      message: `Swap request ${normalizedStatus} successfully.`,
      request: await loadFormattedSwapRequestById(requestId, req.actor),
    });
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally {
    client.release();
  }
}

async function approveRegistration(req, res, next) {
  return updateRegistrationStatus(req, res, next, 'approved');
}

async function rejectRegistration(req, res, next) {
  return updateRegistrationStatus(req, res, next, 'rejected');
}

async function cancelRegistration(req, res, next) {
  return updateRegistrationStatus(req, res, next, 'cancelled');
}

async function approveAttendance(req, res, next) {
  return updateAttendanceStatus(req, res, next, 'approved');
}

async function rejectAttendance(req, res, next) {
  return updateAttendanceStatus(req, res, next, 'rejected');
}

async function overrideAttendance(req, res, next) {
  const { id, attendanceId } = req.params;
  const { markAs } = req.body || {};

  if (!isValidUuid(id) || !isValidUuid(attendanceId)) {
    return res.status(400).json({
      message: 'Shift id and attendance id must be valid UUIDs.',
    });
  }

  if (!isStaffLike(req.actor.role)) {
    return res.status(403).json({
      message: 'Only staff users can override attendance.',
    });
  }

  if (markAs !== 'present' && markAs !== 'absent') {
    return res.status(400).json({
      message: "markAs must be either 'present' or 'absent'.",
    });
  }

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    const shiftResult = await client.query(
      `SELECT *
       FROM public.shifts
       WHERE id = $1
       FOR UPDATE`,
      [id]
    );

    if (shiftResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Shift not found.' });
    }

    const shift = shiftResult.rows[0];

    if (Date.now() < getAttendanceWindowStartTime(shift.start_time).getTime()) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: 'Attendance can only be overridden from five minutes before the shift starts and later.',
      });
    }

    const attendanceResult = await client.query(
      `SELECT att.*
       FROM public.shift_attendance att
       WHERE att.id = $1
         AND att.shift_id = $2
       FOR UPDATE`,
      [attendanceId, id]
    );

    if (attendanceResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Attendance record not found.' });
    }

    const newReportSource = markAs === 'present' ? 'staff-manual' : 'staff-absent';

    await client.query(
      `UPDATE public.shift_attendance
       SET report_source = $2,
           status = 'approved',
           updated_at = timezone('utc', now()),
           reported_at = timezone('utc', now()),
           reported_by_user_id = $3,
           reviewed_at = timezone('utc', now()),
           reviewed_by_user_id = $3,
           review_note = NULL
       WHERE id = $1`,
      [attendanceId, newReportSource, req.actor.id]
    );

    await client.query('COMMIT');

    return res.json({
      message: markAs === 'present' ? 'Attendance overridden to present.' : 'Attendance overridden to absent.',
      attendance: await loadFormattedAttendanceById(attendanceId),
    });
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally {
    client.release();
  }
}

async function addUserAttendance(req, res, next) {
  const { id } = req.params;
  const { userId } = req.body || {};

  if (!isValidUuid(id)) {
    return res.status(400).json({ message: 'Shift id must be a valid UUID.' });
  }

  if (!isValidUuid(userId)) {
    return res.status(400).json({ message: 'userId must be a valid UUID.' });
  }

  if (!isStaffLike(req.actor.role)) {
    return res.status(403).json({
      message: 'Only staff users can add attendance for other users.',
    });
  }

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    const shiftResult = await client.query(
      `SELECT *
       FROM public.shifts
       WHERE id = $1
       FOR UPDATE`,
      [id]
    );

    if (shiftResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Shift not found.' });
    }

    const shift = shiftResult.rows[0];

    if (!canReportAttendanceManuallyForShift(shift, null)) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: 'Attendance can only be added from five minutes before the shift starts and later.',
      });
    }

    const userResult = await client.query(
      `SELECT id, role FROM public.users WHERE id = $1 LIMIT 1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'User not found.' });
    }

    const existingAttendanceResult = await client.query(
      `SELECT sa.id
       FROM public.shift_attendance sa
       JOIN public.shift_registrations sr ON sr.id = sa.registration_id
       WHERE sr.shift_id = $1
         AND sr.user_id = $2
       LIMIT 1`,
      [id, userId]
    );

    if (existingAttendanceResult.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: 'Attendance has already been recorded for this user.',
      });
    }

    let registrationId;

    const approvedRegistrationResult = await client.query(
      `SELECT id
       FROM public.shift_registrations
       WHERE shift_id = $1
         AND user_id = $2
         AND status = 'approved'
       LIMIT 1
       FOR UPDATE`,
      [id, userId]
    );

    if (approvedRegistrationResult.rows.length > 0) {
      registrationId = approvedRegistrationResult.rows[0].id;
    } else {
      registrationId = randomUUID();
      await client.query(
        `INSERT INTO public.shift_registrations (
           id,
           shift_id,
           user_id,
           status,
           reviewed_at,
           reviewed_by_user_id
         )
         VALUES ($1, $2, $3, 'approved', timezone('utc', now()), $4)`,
        [registrationId, id, userId, req.actor.id]
      );
    }

    const attendanceId = randomUUID();

    await client.query(
      `INSERT INTO public.shift_attendance (
         id,
         shift_id,
         registration_id,
         user_id,
         status,
         report_source,
         reported_at,
         reported_by_user_id,
         reviewed_at,
         reviewed_by_user_id
       )
       VALUES (
         $1, $2, $3, $4,
         'approved', 'staff-manual',
         timezone('utc', now()), $5,
         timezone('utc', now()), $5
       )`,
      [attendanceId, id, registrationId, userId, req.actor.id]
    );

    await client.query('COMMIT');

    return res.status(201).json({
      message: 'User was added as present.',
      registration: await loadFormattedRegistrationById(registrationId),
      attendance: await loadFormattedAttendanceById(attendanceId),
    });
  } catch (error) {
    await client.query('ROLLBACK');
    return next(error);
  } finally {
    client.release();
  }
}

module.exports = {
  approveAttendance,
  approveRegistration,
  cancelRegistration,
  confirmOwnRegistration,
  createSwapRequest,
  createSwapVolunteerOffer,
  createShiftNote,
  createShift,
  deleteShift,
  getShiftById,
  listShiftNotes,
  listShiftAttendance,
  listShiftAssignmentPools,
  listMyRegisteredShifts,
  listSwapRequests,
  listWeekShifts,
  replaceShiftAssignments,
  addUserAttendance,
  overrideAttendance,
  reportAttendance,
  reportAttendanceAbsent,
  reportAttendanceManually,
  registerForShift,
  rejectAttendance,
  rejectRegistration,
  requireActor,
  updateSwapVolunteerOfferStatus,
  updateSwapRequestStatus,
  updateShift,
};
