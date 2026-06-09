const express = require('express');
const cors = require('cors');
const { randomUUID } = require('crypto');
const db = require('./db');
const appointmentsRoutes = require('./routes/appointments');
const shiftsRoutes = require('./routes/shifts');
const usersRoutes = require('./routes/users');
const apartmentsRoutes = require('./routes/apartments');
const permissionsRoutes = require('./routes/permissions');
const usersController = require('./controllers/usersController');
const { requireInternalApiKey } = require('./lib/user-roles');
const { startBirthdayWhatsAppScheduler } = require('./lib/birthday-whatsapp');
const { startShiftReminderScheduler } = require('./lib/shift-reminder-whatsapp');

const app = express();
const port = process.env.PORT || 3000;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const timePattern = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

function isValidUuid(value) {
  return uuidPattern.test(String(value));
}

function isValidDate(value) {
  return !Number.isNaN(new Date(value).getTime());
}

function isValidDayOfWeek(value) {
  return Number.isInteger(value) && value >= 0 && value <= 6;
}

function isValidTime(value) {
  return timePattern.test(String(value));
}

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'Express server is running' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/test-db', async (req, res, next) => {
  try {
    const result = await db.query('SELECT NOW() AS current_time');
    res.json({
      success: true,
      currentTime: result.rows[0].current_time,
    });
  } catch (error) {
    next(error);
  }
});

app.use('/appointments', appointmentsRoutes);
app.use('/shifts', shiftsRoutes);
app.use('/apartments', apartmentsRoutes);
app.use('/permissions', permissionsRoutes);
app.get('/internal/users', requireInternalApiKey, usersController.listUsers);
app.use('/users', usersRoutes);
app.use('/user', usersRoutes);

app.get('/availability', async (req, res, next) => {
  const { businessId } = req.query;
  const values = [];
  let whereClause = '';

  if (businessId) {
    if (!isValidUuid(businessId)) {
      return res.status(400).json({
        success: false,
        error: 'businessId must be a valid UUID',
      });
    }

    values.push(businessId);
    whereClause = 'WHERE business_id = $1';
  }

  try {
    const result = await db.query(
      `SELECT *
       FROM availability
       ${whereClause}
       ORDER BY day_of_week ASC, start_time ASC`,
      values
    );

    return res.json({
      success: true,
      availability: result.rows,
    });
  } catch (error) {
    return next(error);
  }
});

app.get('/availability/:id', async (req, res, next) => {
  const { id } = req.params;

  if (!isValidUuid(id)) {
    return res.status(400).json({
      success: false,
      error: 'Availability id must be a valid UUID',
    });
  }

  try {
    const result = await db.query('SELECT * FROM availability WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Availability entry not found',
      });
    }

    return res.json({
      success: true,
      availability: result.rows[0],
    });
  } catch (error) {
    return next(error);
  }
});

app.post('/availability', async (req, res, next) => {
  const { businessId, dayOfWeek, startTime, endTime } = req.body;

  if (!businessId || dayOfWeek === undefined || !startTime || !endTime) {
    return res.status(400).json({
      success: false,
      error: 'businessId, dayOfWeek, startTime, and endTime are required',
    });
  }

  if (!isValidUuid(businessId)) {
    return res.status(400).json({
      success: false,
      error: 'businessId must be a valid UUID',
    });
  }

  if (!isValidDayOfWeek(Number(dayOfWeek))) {
    return res.status(400).json({
      success: false,
      error: 'dayOfWeek must be an integer between 0 and 6',
    });
  }

  if (!isValidTime(startTime) || !isValidTime(endTime)) {
    return res.status(400).json({
      success: false,
      error: 'startTime and endTime must be valid time values',
    });
  }

  if (startTime >= endTime) {
    return res.status(400).json({
      success: false,
      error: 'startTime must be earlier than endTime',
    });
  }

  try {
    const result = await db.query(
      `INSERT INTO availability (id, business_id, day_of_week, start_time, end_time)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [randomUUID(), businessId, Number(dayOfWeek), startTime, endTime]
    );

    return res.status(201).json({
      success: true,
      availability: result.rows[0],
    });
  } catch (error) {
    if (error.code === '23503') {
      return res.status(400).json({
        success: false,
        error: 'businessId does not match an existing business',
      });
    }

    return next(error);
  }
});

app.put('/availability/:id', async (req, res, next) => {
  const { id } = req.params;
  const { dayOfWeek, startTime, endTime } = req.body;
  const updates = [];
  const values = [];

  if (!isValidUuid(id)) {
    return res.status(400).json({
      success: false,
      error: 'Availability id must be a valid UUID',
    });
  }

  if (dayOfWeek === undefined && !startTime && !endTime) {
    return res.status(400).json({
      success: false,
      error: 'At least one of dayOfWeek, startTime, or endTime is required',
    });
  }

  if (dayOfWeek !== undefined && !isValidDayOfWeek(Number(dayOfWeek))) {
    return res.status(400).json({
      success: false,
      error: 'dayOfWeek must be an integer between 0 and 6',
    });
  }

  if (startTime && !isValidTime(startTime)) {
    return res.status(400).json({
      success: false,
      error: 'startTime must be a valid time value',
    });
  }

  if (endTime && !isValidTime(endTime)) {
    return res.status(400).json({
      success: false,
      error: 'endTime must be a valid time value',
    });
  }

  try {
    const existingResult = await db.query('SELECT * FROM availability WHERE id = $1', [id]);

    if (existingResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Availability entry not found',
      });
    }

    const existingAvailability = existingResult.rows[0];
    const nextStartTime = startTime || existingAvailability.start_time;
    const nextEndTime = endTime || existingAvailability.end_time;

    if (nextStartTime >= nextEndTime) {
      return res.status(400).json({
        success: false,
        error: 'startTime must be earlier than endTime',
      });
    }

    if (dayOfWeek !== undefined) {
      values.push(Number(dayOfWeek));
      updates.push(`day_of_week = $${values.length}`);
    }

    if (startTime) {
      values.push(startTime);
      updates.push(`start_time = $${values.length}`);
    }

    if (endTime) {
      values.push(endTime);
      updates.push(`end_time = $${values.length}`);
    }

    values.push(id);

    const result = await db.query(
      `UPDATE availability
       SET ${updates.join(', ')}
       WHERE id = $${values.length}
       RETURNING *`,
      values
    );

    return res.json({
      success: true,
      availability: result.rows[0],
    });
  } catch (error) {
    return next(error);
  }
});

app.delete('/availability/:id', async (req, res, next) => {
  const { id } = req.params;

  if (!isValidUuid(id)) {
    return res.status(400).json({
      success: false,
      error: 'Availability id must be a valid UUID',
    });
  }

  try {
    const result = await db.query('DELETE FROM availability WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Availability entry not found',
      });
    }

    return res.json({
      success: true,
      availability: result.rows[0],
    });
  } catch (error) {
    return next(error);
  }
});

app.get('/waitlist', async (req, res, next) => {
  const { businessId, userId } = req.query;
  const conditions = [];
  const values = [];

  if (businessId) {
    if (!isValidUuid(businessId)) {
      return res.status(400).json({
        success: false,
        error: 'businessId must be a valid UUID',
      });
    }

    values.push(businessId);
    conditions.push(`business_id = $${values.length}`);
  }

  if (userId) {
    if (!isValidUuid(userId)) {
      return res.status(400).json({
        success: false,
        error: 'userId must be a valid UUID',
      });
    }

    values.push(userId);
    conditions.push(`user_id = $${values.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const result = await db.query(
      `SELECT *
       FROM waitlist
       ${whereClause}
       ORDER BY desired_time ASC, created_at ASC`,
      values
    );

    return res.json({
      success: true,
      waitlist: result.rows,
    });
  } catch (error) {
    return next(error);
  }
});

app.get('/waitlist/:id', async (req, res, next) => {
  const { id } = req.params;

  if (!isValidUuid(id)) {
    return res.status(400).json({
      success: false,
      error: 'Waitlist id must be a valid UUID',
    });
  }

  try {
    const result = await db.query('SELECT * FROM waitlist WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Waitlist entry not found',
      });
    }

    return res.json({
      success: true,
      waitlistEntry: result.rows[0],
    });
  } catch (error) {
    return next(error);
  }
});

app.post('/waitlist', async (req, res, next) => {
  const { businessId, userId, desiredTime } = req.body;

  if (!businessId || !userId || !desiredTime) {
    return res.status(400).json({
      success: false,
      error: 'businessId, userId, and desiredTime are required',
    });
  }

  if (!isValidUuid(businessId) || !isValidUuid(userId)) {
    return res.status(400).json({
      success: false,
      error: 'businessId and userId must be valid UUIDs',
    });
  }

  if (!isValidDate(desiredTime)) {
    return res.status(400).json({
      success: false,
      error: 'desiredTime must be a valid date-time value',
    });
  }

  try {
    const result = await db.query(
      `INSERT INTO waitlist (id, business_id, user_id, desired_time)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [randomUUID(), businessId, userId, desiredTime]
    );

    return res.status(201).json({
      success: true,
      waitlistEntry: result.rows[0],
    });
  } catch (error) {
    if (error.code === '23503') {
      if (error.constraint === 'waitlist_business_id_fkey') {
        return res.status(400).json({
          success: false,
          error: 'businessId does not match an existing business',
        });
      }

      if (error.constraint === 'waitlist_user_id_fkey') {
        return res.status(400).json({
          success: false,
          error: 'userId does not match an existing user',
        });
      }
    }

    return next(error);
  }
});

app.delete('/waitlist/:id', async (req, res, next) => {
  const { id } = req.params;

  if (!isValidUuid(id)) {
    return res.status(400).json({
      success: false,
      error: 'Waitlist id must be a valid UUID',
    });
  }

  try {
    const result = await db.query('DELETE FROM waitlist WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Waitlist entry not found',
      });
    }

    return res.json({
      success: true,
      waitlistEntry: result.rows[0],
    });
  } catch (error) {
    return next(error);
  }
});

app.use((error, req, res, next) => {
  console.error('Request error:', error);
  res.status(500).json({
    success: false,
    error: 'Database query failed',
  });
});

async function startServer() {
  try {
    await db.testConnection();
    console.log('PostgreSQL connected');

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
  startBirthdayWhatsAppScheduler();
  startShiftReminderScheduler();
});
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

async function shutdown() {
  try {
    await db.pool.end();
    console.log('PostgreSQL pool closed');
    process.exit(0);
  } catch (error) {
    console.error('Error while closing PostgreSQL pool:', error);
    process.exit(1);
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

startServer();
