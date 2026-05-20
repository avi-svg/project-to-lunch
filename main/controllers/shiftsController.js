const { randomUUID } = require('crypto');
const db = require('../db');
const {
  canManageShift,
  isStaffLike,
  isValidUuid,
  normalizeRole,
  requireActor,
} = require('../lib/user-roles');

const shiftStatuses = new Set(['open', 'closed', 'cancelled', 'completed']);
const shiftTypes = new Set(['dinner', 'cleaning']);
const assignmentModes = new Set(['assign-later', 'assign-now']);
const registrationStatuses = new Set([
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

function startOfWeekUtc(value) {
  const date = value ? new Date(value) : new Date();

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const utcDate = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  const day = utcDate.getUTCDay();
  const diffToSunday = -day;

  utcDate.setUTCDate(utcDate.getUTCDate() + diffToSunday);
  utcDate.setUTCHours(0, 0, 0, 0);

  return utcDate;
}

function endOfWeekUtc(weekStart) {
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
  return weekEnd;
}

function formatShiftRow(row) {
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
    myRegistration: row.my_registration_id
      ? {
          id: row.my_registration_id,
          status: row.my_registration_status,
          createdAt: row.my_registration_created_at,
          reviewedAt: row.my_registration_reviewed_at,
          reviewNote: row.my_registration_review_note,
        }
      : null,
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
  };
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

async function loadShiftRegistrations(shiftId, client = db) {
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

    const shift = formatShiftRow(result.rows[0]);

    if (isStaffLike(req.actor.role)) {
      shift.registrations = await loadShiftRegistrations(id);
    }

    return res.json({ shift });
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
         category
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
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
  const { title, description, location, startTime, endTime, capacity, status } =
    req.body;

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
    status === undefined
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
           status = $7
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

async function replaceShiftAssignments(req, res, next) {
  const { id } = req.params;
  const { userIds } = req.body || {};

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

  if (!isStaffLike(req.actor.role)) {
    return res.status(403).json({
      message: 'Only staff users can assign users to shifts.',
    });
  }

  const normalizedUserIds = Array.from(new Set(userIds.map((value) => String(value))));

  if (!normalizedUserIds.every((userId) => isValidUuid(userId))) {
    return res.status(400).json({
      message: 'All userIds must be valid UUIDs.',
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
            `SELECT id, role
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

    for (const userId of effectiveSelectedUserIds) {
      const registration = existingRegistrationsByUserId.get(userId);

      if (!registration) {
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
        continue;
      }

      if (registration.status === 'pending' || registration.status === 'approved') {
        continue;
      }

      await client.query(
        `UPDATE public.shift_registrations
         SET status = 'pending',
             reviewed_at = NULL,
             reviewed_by_user_id = NULL,
             review_note = NULL
         WHERE id = $1`,
        [registration.id]
      );
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

    return res.json({
      message: 'Shift assignments updated successfully.',
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

async function approveRegistration(req, res, next) {
  return updateRegistrationStatus(req, res, next, 'approved');
}

async function rejectRegistration(req, res, next) {
  return updateRegistrationStatus(req, res, next, 'rejected');
}

async function cancelRegistration(req, res, next) {
  return updateRegistrationStatus(req, res, next, 'cancelled');
}

module.exports = {
  approveRegistration,
  cancelRegistration,
  confirmOwnRegistration,
  createShift,
  getShiftById,
  listMyRegisteredShifts,
  listWeekShifts,
  replaceShiftAssignments,
  registerForShift,
  rejectRegistration,
  requireActor,
  updateShift,
};
