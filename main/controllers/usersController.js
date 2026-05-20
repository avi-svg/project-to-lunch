const db = require('../db');
const {
  isStaffLike,
  isValidUuid,
  normalizeRole,
} = require('../lib/user-roles');

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value));
}

let appointmentsColumnsPromise;

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
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: normalizeRole(row.role),
  };
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
  const result = await client.query(
    `SELECT id, email, name, role
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
    const result = await db.query(
      `SELECT id, email, name, password, role, is_active
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

    if (user.password !== password) {
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
    const result = await db.query(
      `SELECT id, email, name, role
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
  const { name, email, role } = req.body || {};
  const isStaffActor = isStaffLike(req.actor?.role);

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

  if (name === undefined && email === undefined && role === undefined) {
    return res.status(400).json({
      message: 'At least one of name or email is required.',
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

  if (updates.length === 0) {
    return res.status(400).json({
      message: 'No valid user fields were provided for update.',
    });
  }

  values.push(userId);

  try {
    const result = await db.query(
      `UPDATE public.users
       SET ${updates.join(', ')}
       WHERE id = $${values.length}
       RETURNING id, email, name, role`,
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

async function upsertOAuthUser(req, res, next) {
  const { email, name } = req.body;

  if (!email || typeof email !== 'string') {
    return res.status(400).json({
      message: 'Email is required.',
    });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({
      message: 'Email must be a valid email address.',
    });
  }

  try {
    const existingResult = await db.query(
      `SELECT id, email, name, role
       FROM users
       WHERE email = $1`,
      [email]
    );

    if (existingResult.rows.length > 0) {
      return res.status(200).json(formatUser(existingResult.rows[0]));
    }

    const insertResult = await db.query(
      `INSERT INTO users (email, name, role)
       VALUES ($1, $2, 'user')
       RETURNING id, email, name, role`,
      [email, name ?? null]
    );

    return res.status(200).json(formatUser(insertResult.rows[0]));
  } catch (error) {
    if (error.code === '23505') {
      try {
        const conflictResult = await db.query(
          `SELECT id, email, name, role
           FROM users
           WHERE email = $1`,
          [email]
        );

        if (conflictResult.rows.length > 0) {
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

module.exports = {
  authenticateCredentialsUser,
  getUserById,
  upsertOAuthUser,
  getUserDashboardAppointments,
  listUsers,
  updateUser,
  updateUserRole,
};
