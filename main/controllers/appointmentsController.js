const { randomUUID } = require('crypto');
const db = require('../db');

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const appointmentStatuses = ['booked', 'cancelled', 'completed', 'no_show'];

function isValidUuid(value) {
  return uuidPattern.test(String(value));
}

function isValidDate(value) {
  return !Number.isNaN(new Date(value).getTime());
}

async function listAppointments(req, res, next) {
  const { businessId, userId, status } = req.query;
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

  if (status) {
    if (!appointmentStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'status must be one of booked, cancelled, completed, no_show',
      });
    }

    values.push(status);
    conditions.push(`status = $${values.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    const result = await db.query(
      `SELECT *
       FROM appointments
       ${whereClause}
       ORDER BY start_time ASC`,
      values
    );

    return res.json({
      success: true,
      appointments: result.rows,
    });
  } catch (error) {
    return next(error);
  }
}

async function getAppointmentById(req, res, next) {
  const { id } = req.params;

  if (!isValidUuid(id)) {
    return res.status(400).json({
      success: false,
      error: 'Appointment id must be a valid UUID',
    });
  }

  try {
    const result = await db.query('SELECT * FROM appointments WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Appointment not found',
      });
    }

    return res.json({
      success: true,
      appointment: result.rows[0],
    });
  } catch (error) {
    return next(error);
  }
}

async function createAppointment(req, res, next) {
  const { businessId, userId, startTime, endTime } = req.body;
  const startDate = new Date(startTime);
  const endDate = new Date(endTime);

  if (!businessId || !userId || !startTime || !endTime) {
    return res.status(400).json({
      success: false,
      error: 'businessId, userId, startTime, and endTime are required',
    });
  }

  if (!isValidUuid(businessId) || !isValidUuid(userId)) {
    return res.status(400).json({
      success: false,
      error: 'businessId and userId must be valid UUIDs',
    });
  }

  if (!isValidDate(startTime) || !isValidDate(endTime)) {
    return res.status(400).json({
      success: false,
      error: 'startTime and endTime must be valid date-time values',
    });
  }

  if (startDate >= endDate) {
    return res.status(400).json({
      success: false,
      error: 'startTime must be earlier than endTime',
    });
  }

  try {
    const result = await db.query(
      `INSERT INTO appointments (id, business_id, user_id, start_time, end_time)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [randomUUID(), businessId, userId, startTime, endTime]
    );

    return res.status(201).json({
      success: true,
      appointment: result.rows[0],
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        error: 'This appointment slot is already booked',
      });
    }

    if (error.code === '22P02') {
      return res.status(400).json({
        success: false,
        error: 'Invalid appointment data format',
      });
    }

    if (error.code === '23503') {
      if (error.constraint === 'appointments_business_id_fkey') {
        return res.status(400).json({
          success: false,
          error: 'businessId does not match an existing business',
        });
      }

      if (error.constraint === 'appointments_user_id_fkey') {
        return res.status(400).json({
          success: false,
          error: 'userId does not match an existing user',
        });
      }

      return res.status(400).json({
        success: false,
        error: 'Referenced record does not exist',
      });
    }

    return next(error);
  }
}

async function updateAppointment(req, res, next) {
  const { id } = req.params;
  const { startTime, endTime, status } = req.body;
  const updates = [];
  const values = [];

  if (!isValidUuid(id)) {
    return res.status(400).json({
      success: false,
      error: 'Appointment id must be a valid UUID',
    });
  }

  if (!startTime && !endTime && !status) {
    return res.status(400).json({
      success: false,
      error: 'At least one of startTime, endTime, or status is required',
    });
  }

  if (startTime && !isValidDate(startTime)) {
    return res.status(400).json({
      success: false,
      error: 'startTime must be a valid date-time value',
    });
  }

  if (endTime && !isValidDate(endTime)) {
    return res.status(400).json({
      success: false,
      error: 'endTime must be a valid date-time value',
    });
  }

  if (status && !appointmentStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      error: 'status must be one of booked, cancelled, completed, no_show',
    });
  }

  try {
    const existingResult = await db.query('SELECT * FROM appointments WHERE id = $1', [id]);

    if (existingResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Appointment not found',
      });
    }

    const existingAppointment = existingResult.rows[0];
    const nextStartTime = startTime || existingAppointment.start_time;
    const nextEndTime = endTime || existingAppointment.end_time;

    if (new Date(nextStartTime) >= new Date(nextEndTime)) {
      return res.status(400).json({
        success: false,
        error: 'startTime must be earlier than endTime',
      });
    }

    if (startTime) {
      values.push(startTime);
      updates.push(`start_time = $${values.length}`);
    }

    if (endTime) {
      values.push(endTime);
      updates.push(`end_time = $${values.length}`);
    }

    if (status) {
      values.push(status);
      updates.push(`status = $${values.length}`);
    }

    values.push(id);

    const result = await db.query(
      `UPDATE appointments
       SET ${updates.join(', ')}
       WHERE id = $${values.length}
       RETURNING *`,
      values
    );

    return res.json({
      success: true,
      appointment: result.rows[0],
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        error: 'This appointment slot is already booked',
      });
    }

    return next(error);
  }
}

async function cancelAppointment(req, res, next) {
  const { id } = req.params;
  const userId =
    typeof req.body?.userId === 'string' && req.body.userId.length > 0
      ? req.body.userId
      : null;

  if (!isValidUuid(id)) {
    return res.status(400).json({
      success: false,
      error: 'Appointment id must be a valid UUID',
    });
  }

  if (userId && !isValidUuid(userId)) {
    return res.status(400).json({
      success: false,
      error: 'userId must be a valid UUID',
    });
  }

  try {
    let result;

    if (userId) {
      result = await db.query(
        `UPDATE appointments
         SET status = $1
         WHERE id = $2
           AND user_id = $3
         RETURNING *`,
        ['cancelled', id, userId]
      );
    } else {
      result = await db.query(
        `UPDATE appointments
         SET status = $1
         WHERE id = $2
         RETURNING *`,
        ['cancelled', id]
      );
    }

    if (result.rows.length === 0) {
      return res.status(userId ? 404 : 404).json({
        success: false,
        error: userId
          ? 'Appointment not found for this user'
          : 'Appointment not found',
      });
    }

    return res.json({
      success: true,
      appointment: result.rows[0],
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listAppointments,
  getAppointmentById,
  createAppointment,
  updateAppointment,
  cancelAppointment,
};
