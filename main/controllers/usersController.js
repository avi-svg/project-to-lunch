const db = require('../db');
const {
  isStaffLike,
  isValidUuid,
  normalizeRole,
} = require('../lib/user-roles');
const { hashPassword, verifyPassword } = require('../lib/passwords');

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value));
}

function normalizePhoneValue(value) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const normalized = String(value).trim();

  return normalized.length > 0 ? normalized : null;
}

function isValidPhone(value) {
  const normalized = String(value).trim();

  if (!/^\+?[0-9()\-\s]+$/.test(normalized)) {
    return false;
  }

  const digitsOnly = normalized.replace(/\D/g, '');
  return digitsOnly.length >= 7 && digitsOnly.length <= 15;
}

function normalizeBirthDateValue(value) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function isValidBirthDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function normalizeGreetingMessage(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function formatBirthDateValue(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === 'string') {
    const normalized = value.trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      return normalized;
    }

    const parsedDate = new Date(normalized);

    if (!Number.isNaN(parsedDate.getTime())) {
      return parsedDate.toISOString().slice(0, 10);
    }
  }

  return null;
}

let appointmentsColumnsPromise;
let usersColumnsPromise;

async function getAppointmentsColumns() {
  if (!appointmentsColumnsPromise) {
    appointmentsColumnsPromise = db
      .query(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'appointments'`
      )
      .then((result) => new Set(result.rows.map((row) => row.column_name)))
      .catch((error) => {
        appointmentsColumnsPromise = null;
        throw error;
      });
  }

  return appointmentsColumnsPromise;
}

async function getUsersColumns() {
  if (!usersColumnsPromise) {
    usersColumnsPromise = db
      .query(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'users'`
      )
      .then((result) => new Set(result.rows.map((row) => row.column_name)))
      .catch((error) => {
        usersColumnsPromise = null;
        throw error;
      });
  }

  return usersColumnsPromise;
}

function mapStatus(status) {
  if (status === 'booked') {
    return 'confirmed';
  }

  if (status === 'cancelled') {
    return 'cancelled';
  }

  return 'pending';
}

function formatUser(row) {
  const formatted = {
    id: row.id,
    email: row.email,
    name: row.name,
    role: normalizeRole(row.role),
  };

  if ('phone' in row) {
    formatted.phone = typeof row.phone === 'string' ? row.phone : null;
  }

  if ('is_active' in row) {
    formatted.isActive = row.is_active !== false;
  }

  if ('password' in row) {
    formatted.hasPassword = typeof row.password === 'string' && row.password.length > 0;
  }

  if ('birth_date' in row) {
    formatted.birthDate = formatBirthDateValue(row.birth_date);
  }

  if ('apartment_id' in row) {
    formatted.apartmentId = typeof row.apartment_id === 'string' ? row.apartment_id : null;
  }

  return formatted;
}

function canAccessUser(actor, userId) {
  return Boolean(actor) && (isStaffLike(actor.role) || actor.id === userId);
}

function parseRoleInput(role) {
  const rawRole = String(role || '').trim().toLowerCase();

  if (rawRole === 'user' || rawRole === 'staff' || rawRole === 'admin') {
    return normalizeRole(rawRole);
  }

  return null;
}

function normalizeCredentialIdentifier(value) {
  return String(value || '').trim().toLowerCase();
}

async function loadUserById(userId, client = db) {
  const userColumns = await getUsersColumns();
  const selectFields = ['id', 'email', 'name', 'role'];

  if (userColumns.has('phone')) {
    selectFields.push('phone');
  }

  if (userColumns.has('birth_date')) {
    selectFields.push('birth_date');
  }

  const result = await client.query(
    `SELECT ${selectFields.join(', ')}
     FROM public.users
     WHERE id = $1
     LIMIT 1`,
    [userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return formatUser(result.rows[0]);
}

async function authenticateCredentialsUser(req, res, next) {
  const { identifier, password } = req.body || {};
  const normalizedIdentifier = normalizeCredentialIdentifier(identifier);

  if (!normalizedIdentifier || typeof password !== 'string' || password.length === 0) {
    return res.status(400).json({
      message: 'identifier and password are required.',
    });
  }

  try {
    const userColumns = await getUsersColumns();

    if (!userColumns.has('password')) {
      return res.status(500).json({
        message: 'Credential sign-in is unavailable because the users.password column is missing.',
      });
    }

    const selectFields = ['id', 'email', 'name', 'password', 'role'];

    if (userColumns.has('is_active')) {
      selectFields.push('is_active');
    }

    const result = await db.query(
      `SELECT ${selectFields.join(', ')}
       FROM public.users
       WHERE LOWER(email) = $1
          OR LOWER(COALESCE(name, '')) = $1
       LIMIT 2`,
      [normalizedIdentifier]
    );

    if (result.rows.length !== 1) {
      return res.status(401).json({
        message: 'Invalid username or password.',
      });
    }

    const user = result.rows[0];

    if (user.is_active === false || typeof user.password !== 'string') {
      return res.status(401).json({
        message: 'Invalid username or password.',
      });
    }

    const isPasswordValid = await verifyPassword(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        message: 'Invalid username or password.',
      });
    }

    return res.status(200).json(formatUser(user));
  } catch (error) {
    return next(error);
  }
}

async function listUsers(req, res, next) {
  const { role, search } = req.query;
  const conditions = [];
  const values = [];

  if (role !== undefined) {
    const normalizedRole = parseRoleInput(role);

    if (!normalizedRole) {
      return res.status(400).json({
        message: 'role must be either user or staff.',
      });
    }

    if (normalizedRole === 'staff') {
      conditions.push(`LOWER(role) IN ('staff', 'admin')`);
    } else {
      values.push(normalizedRole);
      conditions.push(`LOWER(role) = $${values.length}`);
    }
  }

  if (typeof search === 'string' && search.trim().length > 0) {
    values.push(`%${search.trim()}%`);
    conditions.push(`(email ILIKE $${values.length} OR name ILIKE $${values.length})`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const userColumns = await getUsersColumns();
    const selectFields = ['id', 'email', 'name', 'role'];

    if (userColumns.has('phone')) {
      selectFields.push('phone');
    }

    if (userColumns.has('birth_date')) {
      selectFields.push('birth_date');
    }

    if (userColumns.has('password')) {
      selectFields.push('password');
    }

    if (userColumns.has('is_active')) {
      selectFields.push('is_active');
    }

    if (userColumns.has('apartment_id')) {
      selectFields.push('apartment_id');
    }

    const result = await db.query(
      `SELECT ${selectFields.join(', ')}
       FROM public.users
       ${whereClause}
       ORDER BY COALESCE(name, email) ASC, email ASC`,
      values
    );

    return res.json({
      users: result.rows.map(formatUser),
    });
  } catch (error) {
    return next(error);
  }
}

async function createUser(req, res, next) {
  const { name, email, role, password, isActive, phone, birthDate } = req.body || {};
  const normalizedRole = role === undefined ? 'user' : parseRoleInput(role);
  const normalizedPhone = normalizePhoneValue(phone);
  const normalizedBirthDate = normalizeBirthDateValue(birthDate);

  if (typeof email !== 'string' || !isValidEmail(email)) {
    return res.status(400).json({
      message: 'Email must be a valid email address.',
    });
  }

  if (normalizedRole === null) {
    return res.status(400).json({
      message: 'role must be either user or staff.',
    });
  }

  if (name !== undefined && name !== null && String(name).trim().length === 0) {
    return res.status(400).json({
      message: 'name cannot be empty.',
    });
  }

  if (password !== undefined && password !== null) {
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({
        message: 'Password must be at least 8 characters long.',
      });
    }
  }

  if (isActive !== undefined && typeof isActive !== 'boolean') {
    return res.status(400).json({
      message: 'isActive must be a boolean value.',
    });
  }

  if (normalizedPhone !== undefined && normalizedPhone !== null && !isValidPhone(normalizedPhone)) {
    return res.status(400).json({
      message: 'Phone must be a valid phone number.',
    });
  }

  if (normalizedBirthDate !== undefined && normalizedBirthDate !== null && !isValidBirthDate(normalizedBirthDate)) {
    return res.status(400).json({
      message: 'birthDate must be a valid date in YYYY-MM-DD format.',
    });
  }

  try {
    const userColumns = await getUsersColumns();
    const insertColumns = ['email', 'name', 'role'];
    const values = [String(email).trim().toLowerCase(), name ?? null, normalizedRole];
    const returningFields = ['id', 'email', 'name', 'role'];

    if (userColumns.has('phone')) {
      insertColumns.push('phone');
      values.push(normalizedPhone ?? null);
      returningFields.push('phone');
    } else if (normalizedPhone !== undefined) {
      return res.status(500).json({
        message: 'Cannot store a phone number because the users.phone column is missing.',
      });
    }

    if (userColumns.has('birth_date')) {
      insertColumns.push('birth_date');
      values.push(normalizedBirthDate ?? null);
      returningFields.push('birth_date');
    } else if (normalizedBirthDate !== undefined) {
      return res.status(500).json({
        message: 'Cannot store a birth date because the users.birth_date column is missing.',
      });
    }

    if (userColumns.has('password')) {
      insertColumns.push('password');
      values.push(password ? await hashPassword(password) : null);
      returningFields.push('password');
    } else if (password) {
      return res.status(500).json({
        message: 'Cannot store a password because the users.password column is missing.',
      });
    }

    if (userColumns.has('is_active')) {
      insertColumns.push('is_active');
      values.push(isActive ?? true);
      returningFields.push('is_active');
    }

    const placeholders = insertColumns.map((_, index) => `$${index + 1}`);

    const result = await db.query(
      `INSERT INTO public.users (${insertColumns.join(', ')})
       VALUES (${placeholders.join(', ')})
       RETURNING ${returningFields.join(', ')}`,
      values
    );

    return res.status(201).json({
      message: 'User created successfully.',
      user: formatUser(result.rows[0]),
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({
        message: 'A user with this email already exists.',
      });
    }

    return next(error);
  }
}

async function getUserById(req, res, next) {
  const { userId } = req.params;

  if (!isValidUuid(userId)) {
    return res.status(400).json({
      message: 'userId must be a valid UUID.',
    });
  }

  if (!canAccessUser(req.actor, userId)) {
    return res.status(403).json({
      message: 'You do not have permission to access this user.',
    });
  }

  try {
    const user = await loadUserById(userId);

    if (!user) {
      return res.status(404).json({
        message: 'User not found.',
      });
    }

    return res.json({ user });
  } catch (error) {
    return next(error);
  }
}

async function updateUser(req, res, next) {
  const { userId } = req.params;
  const { name, email, role, password, isActive, phone, birthDate, apartmentId } = req.body || {};
  const isStaffActor = isStaffLike(req.actor?.role);
  const normalizedPhone = normalizePhoneValue(phone);
  const normalizedBirthDate = normalizeBirthDateValue(birthDate);

  if (!isValidUuid(userId)) {
    return res.status(400).json({
      message: 'userId must be a valid UUID.',
    });
  }

  if (!canAccessUser(req.actor, userId)) {
    return res.status(403).json({
      message: 'You do not have permission to update this user.',
    });
  }

  if (
    name === undefined &&
    email === undefined &&
    role === undefined &&
    password === undefined &&
    isActive === undefined &&
    phone === undefined &&
    birthDate === undefined &&
    apartmentId === undefined
  ) {
    return res.status(400).json({
      message: 'At least one editable field is required.',
    });
  }

  if (role !== undefined) {
    return res.status(400).json({
      message: 'Role updates must be sent to PATCH /users/:userId/role.',
    });
  }

  if (email !== undefined && !isStaffActor) {
    return res.status(403).json({
      message: 'Only staff users can update email addresses.',
    });
  }

  if ((password !== undefined || isActive !== undefined) && !isStaffActor) {
    return res.status(403).json({
      message: 'Only staff users can update password or active status.',
    });
  }

  const updates = [];
  const values = [];

  if (name !== undefined) {
    if (name !== null && String(name).trim().length === 0) {
      return res.status(400).json({
        message: 'name cannot be empty.',
      });
    }

    values.push(name === null ? null : String(name).trim());
    updates.push(`name = $${values.length}`);
  }

  if (email !== undefined) {
    if (typeof email !== 'string' || !isValidEmail(email)) {
      return res.status(400).json({
        message: 'Email must be a valid email address.',
      });
    }

    values.push(String(email).trim().toLowerCase());
    updates.push(`email = $${values.length}`);
  }

  if (birthDate !== undefined) {
    if (normalizedBirthDate !== null && !isValidBirthDate(normalizedBirthDate)) {
      return res.status(400).json({
        message: 'birthDate must be a valid date in YYYY-MM-DD format.',
      });
    }
  }

  try {
    const userColumns = await getUsersColumns();

    if (phone !== undefined) {
      if (!userColumns.has('phone')) {
        return res.status(500).json({
          message: 'Cannot update phone because the users.phone column is missing.',
        });
      }

      if (normalizedPhone !== null && !isValidPhone(normalizedPhone)) {
        return res.status(400).json({
          message: 'Phone must be a valid phone number.',
        });
      }

      values.push(normalizedPhone);
      updates.push(`phone = $${values.length}`);
    }

    if (birthDate !== undefined) {
      if (!userColumns.has('birth_date')) {
        return res.status(500).json({
          message: 'Cannot update birth date because the users.birth_date column is missing.',
        });
      }

      values.push(normalizedBirthDate);
      updates.push(`birth_date = $${values.length}`);
    }

    if (password !== undefined) {
      if (!userColumns.has('password')) {
        return res.status(500).json({
          message: 'Cannot update password because the users.password column is missing.',
        });
      }

      if (password !== null && (typeof password !== 'string' || password.length < 8)) {
        return res.status(400).json({
          message: 'Password must be at least 8 characters long.',
        });
      }

      values.push(password === null ? null : await hashPassword(password));
      updates.push(`password = $${values.length}`);
    }

    if (isActive !== undefined) {
      if (!userColumns.has('is_active')) {
        return res.status(500).json({
          message: 'Cannot update active status because the users.is_active column is missing.',
        });
      }

      if (typeof isActive !== 'boolean') {
        return res.status(400).json({
          message: 'isActive must be a boolean value.',
        });
      }

      values.push(isActive);
      updates.push(`is_active = $${values.length}`);
    }

    if (apartmentId !== undefined) {
      if (!isStaffActor) {
        return res.status(403).json({
          message: 'Only staff users can update apartment assignment.',
        });
      }

      if (apartmentId !== null && !isValidUuid(apartmentId)) {
        return res.status(400).json({
          message: 'apartmentId must be a valid UUID or null.',
        });
      }

      if (apartmentId !== null) {
        const aptResult = await db.query(
          'SELECT id FROM public.apartments WHERE id = $1',
          [apartmentId]
        );

        if (aptResult.rows.length === 0) {
          return res.status(400).json({ message: 'Apartment not found.' });
        }
      }

      values.push(apartmentId);
      updates.push(`apartment_id = $${values.length}`);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        message: 'No valid user fields were provided for update.',
      });
    }

    values.push(userId);
    const returningFields = ['id', 'email', 'name', 'role'];

    if (userColumns.has('phone')) {
      returningFields.push('phone');
    }

    if (userColumns.has('birth_date')) {
      returningFields.push('birth_date');
    }

    if (userColumns.has('password')) {
      returningFields.push('password');
    }

    if (userColumns.has('is_active')) {
      returningFields.push('is_active');
    }

    if (userColumns.has('apartment_id')) {
      returningFields.push('apartment_id');
    }

    const result = await db.query(
      `UPDATE public.users
       SET ${updates.join(', ')}
       WHERE id = $${values.length}
       RETURNING ${returningFields.join(', ')}`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: 'User not found.',
      });
    }

    return res.json({
      message: 'User updated successfully.',
      user: formatUser(result.rows[0]),
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({
        message: 'A user with this email already exists.',
      });
    }

    return next(error);
  }
}

async function updateUserRole(req, res, next) {
  const { userId } = req.params;
  const { role } = req.body || {};

  if (!isValidUuid(userId)) {
    return res.status(400).json({
      message: 'userId must be a valid UUID.',
    });
  }

  const normalizedRole = parseRoleInput(role);

  if (!normalizedRole) {
    return res.status(400).json({
      message: 'role must be either user or staff.',
    });
  }

  try {
    const result = await db.query(
      `UPDATE public.users
       SET role = $1
       WHERE id = $2
       RETURNING id, email, name, role`,
      [normalizedRole, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: 'User not found.',
      });
    }

    return res.json({
      message: 'User role updated successfully.',
      user: formatUser(result.rows[0]),
    });
  } catch (error) {
    return next(error);
  }
}

async function getUserDashboardAppointments(req, res, next) {
  const { userId } = req.params;

  if (!isValidUuid(userId)) {
    return res.status(400).json({
      message: 'userId must be a valid UUID.',
    });
  }

  if (!canAccessUser(req.actor, userId)) {
    return res.status(403).json({
      message: 'You do not have permission to access this user appointments list.',
    });
  }

  try {
    const columns = await getAppointmentsColumns();

    if (columns.has('booked_by_user_id') && columns.has('booked_for_user_id')) {
      const serviceSelect = columns.has('service_name')
        ? 'a.service_name'
        : `'Appointment'`;

      const detailedResult = await db.query(
        `SELECT
           a.id,
           a.start_time AS "startTime",
           a.end_time AS "endTime",
           ${serviceSelect} AS "serviceName",
           COALESCE(counterparty.name, counterparty.email, 'Unknown user') AS "counterpartyName",
           a.status,
           CASE
             WHEN a.booked_by_user_id = $1 THEN 'bookedByUser'
             ELSE 'forUser'
           END AS relationship
         FROM appointments a
         LEFT JOIN users counterparty
           ON counterparty.id = CASE
             WHEN a.booked_by_user_id = $1 THEN a.booked_for_user_id
             ELSE a.booked_by_user_id
           END
         WHERE a.booked_by_user_id = $1
            OR a.booked_for_user_id = $1
         ORDER BY a.start_time ASC`,
        [userId]
      );

      const response = {
        bookedByUser: [],
        forUser: [],
      };

      for (const row of detailedResult.rows) {
        const appointment = {
          id: row.id,
          startTime: row.startTime,
          endTime: row.endTime,
          serviceName: row.serviceName ?? 'Appointment',
          counterpartyName: row.counterpartyName,
          status: mapStatus(row.status),
          relationship: row.relationship,
        };

        if (row.relationship === 'bookedByUser') {
          response.bookedByUser.push(appointment);
        } else {
          response.forUser.push(appointment);
        }
      }

      return res.json(response);
    }

    const basicResult = await db.query(
      `SELECT
         a.id,
         a.start_time AS "startTime",
         a.end_time AS "endTime",
         a.business_id,
         a.status
       FROM appointments a
       WHERE a.user_id = $1
       ORDER BY a.start_time ASC`,
      [userId]
    );

    return res.json({
      bookedByUser: basicResult.rows.map((row) => ({
        id: row.id,
        startTime: row.startTime,
        endTime: row.endTime,
        serviceName: `Business ${row.business_id}`,
        counterpartyName: `Business ${row.business_id}`,
        status: mapStatus(row.status),
        relationship: 'bookedByUser',
      })),
      forUser: [],
    });
  } catch (error) {
    console.error('getUserDashboardAppointments error:', error);
    return next(error);
  }
}

async function listBirthdayGreetings(req, res, next) {
  const { userId } = req.params;

  if (!isValidUuid(userId)) {
    return res.status(400).json({
      message: 'userId must be a valid UUID.',
    });
  }

  try {
    const recipient = await loadUserById(userId);

    if (!recipient || recipient.role !== 'user') {
      return res.status(404).json({
        message: 'Birthday board user not found.',
      });
    }

    const result = await db.query(
      `SELECT
         g.id,
         g.message,
         g.created_at AS "createdAt",
         author.id AS "authorId",
         COALESCE(author.name, author.email, 'Someone') AS "authorName"
       FROM public.birthday_greetings g
       JOIN public.users author
         ON author.id = g.author_user_id
       WHERE g.user_id = $1
       ORDER BY g.created_at DESC`,
      [userId]
    );

    return res.json({
      greetings: result.rows,
    });
  } catch (error) {
    if (error.code === '42P01') {
      return res.status(500).json({
        message: 'The birthday_greetings table is missing from the database.',
      });
    }

    return next(error);
  }
}

async function createBirthdayGreeting(req, res, next) {
  const { userId } = req.params;
  const { message } = req.body || {};
  const normalizedMessage = normalizeGreetingMessage(message);

  if (!isValidUuid(userId)) {
    return res.status(400).json({
      message: 'userId must be a valid UUID.',
    });
  }

  if (!normalizedMessage) {
    return res.status(400).json({
      message: 'message is required.',
    });
  }

  if (normalizedMessage.length > 500) {
    return res.status(400).json({
      message: 'message must be 500 characters or fewer.',
    });
  }

  try {
    const recipient = await loadUserById(userId);

    if (!recipient || recipient.role !== 'user') {
      return res.status(404).json({
        message: 'Birthday board user not found.',
      });
    }

    const result = await db.query(
      `INSERT INTO public.birthday_greetings (user_id, author_user_id, message)
       VALUES ($1, $2, $3)
       RETURNING id, message, created_at AS "createdAt"`,
      [userId, req.actor.id, normalizedMessage]
    );

    return res.status(201).json({
      message: 'Birthday greeting created successfully.',
      greeting: {
        ...result.rows[0],
        authorId: req.actor.id,
        authorName: req.actor.name || req.actor.email,
      },
    });
  } catch (error) {
    if (error.code === '42P01') {
      return res.status(500).json({
        message: 'The birthday_greetings table is missing from the database.',
      });
    }

    return next(error);
  }
}

async function upsertOAuthUser(req, res, next) {
  const { email, name } = req.body;
  const normalizedEmail = typeof email === 'string' ? String(email).trim().toLowerCase() : '';

  if (!normalizedEmail) {
    return res.status(400).json({
      message: 'Email is required.',
    });
  }

  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({
      message: 'Email must be a valid email address.',
    });
  }

  try {
    const userColumns = await getUsersColumns();
    const selectFields = ['id', 'email', 'name', 'role'];

    if (userColumns.has('phone')) {
      selectFields.push('phone');
    }

    if (userColumns.has('birth_date')) {
      selectFields.push('birth_date');
    }

    if (userColumns.has('is_active')) {
      selectFields.push('is_active');
    }

    const existingResult = await db.query(
      `SELECT ${selectFields.join(', ')}
       FROM users
       WHERE email = $1`,
      [normalizedEmail]
    );

    if (existingResult.rows.length > 0) {
      if (existingResult.rows[0].is_active === false) {
        return res.status(403).json({
          message: 'This user account is inactive.',
        });
      }

      return res.status(200).json(formatUser(existingResult.rows[0]));
    }

    const insertColumns = ['email', 'name', 'role'];
    const insertValues = [normalizedEmail, name ?? null, 'user'];
    const returningFields = ['id', 'email', 'name', 'role'];

    if (userColumns.has('phone')) {
      insertColumns.push('phone');
      insertValues.push(null);
      returningFields.push('phone');
    }

    if (userColumns.has('birth_date')) {
      insertColumns.push('birth_date');
      insertValues.push(null);
      returningFields.push('birth_date');
    }

    if (userColumns.has('is_active')) {
      insertColumns.push('is_active');
      insertValues.push(true);
      returningFields.push('is_active');
    }

    const placeholders = insertColumns.map((_, index) => `$${index + 1}`);

    const insertResult = await db.query(
      `INSERT INTO users (${insertColumns.join(', ')})
       VALUES (${placeholders.join(', ')})
       RETURNING ${returningFields.join(', ')}`,
      insertValues
    );

    return res.status(200).json(formatUser(insertResult.rows[0]));
  } catch (error) {
    if (error.code === '23505') {
      try {
        const userColumns = await getUsersColumns();
        const selectFields = ['id', 'email', 'name', 'role'];

        if (userColumns.has('phone')) {
          selectFields.push('phone');
        }

        if (userColumns.has('birth_date')) {
          selectFields.push('birth_date');
        }

        if (userColumns.has('is_active')) {
          selectFields.push('is_active');
        }

        const conflictResult = await db.query(
          `SELECT ${selectFields.join(', ')}
           FROM users
           WHERE email = $1`,
          [normalizedEmail]
        );

        if (conflictResult.rows.length > 0) {
          if (conflictResult.rows[0].is_active === false) {
            return res.status(403).json({
              message: 'This user account is inactive.',
            });
          }

          return res.status(200).json(formatUser(conflictResult.rows[0]));
        }
      } catch (lookupError) {
        return next(lookupError);
      }
    }

    console.error('upsertOAuthUser error:', error);
    return res.status(500).json({
      message: 'Failed to create or fetch OAuth user.',
    });
  }
}

async function verifyOwnPassword(req, res, next) {
  const { password } = req.body || {};

  if (typeof password !== 'string' || password.length === 0) {
    return res.status(400).json({ message: 'password is required.' });
  }

  try {
    const userColumns = await getUsersColumns();

    if (!userColumns.has('password')) {
      return res.status(400).json({ message: 'Password authentication is not available.' });
    }

    const result = await db.query(
      `SELECT password FROM public.users WHERE id = $1 LIMIT 1`,
      [req.actor.id]
    );

    if (result.rows.length === 0 || typeof result.rows[0].password !== 'string') {
      return res.status(401).json({ message: 'Invalid password.' });
    }

    const isValid = await verifyPassword(password, result.rows[0].password);

    if (!isValid) {
      return res.status(401).json({ message: 'Invalid password.' });
    }

    return res.json({ verified: true });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  authenticateCredentialsUser,
  createBirthdayGreeting,
  createUser,
  getUserById,
  listBirthdayGreetings,
  upsertOAuthUser,
  getUserDashboardAppointments,
  listUsers,
  updateUser,
  updateUserRole,
  verifyOwnPassword,
};
