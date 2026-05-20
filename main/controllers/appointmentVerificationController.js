const { randomUUID } = require('crypto');
const db = require('../db');
const { generateOtpCode, hashOtpCode } = require('../lib/otp');
const { sendVerificationEmail } = require('../lib/mailer');

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OTP_EXPIRY_MINUTES = Number(process.env.OTP_EXPIRY_MINUTES || 10);
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 5);
const OTP_RESEND_COOLDOWN_SECONDS = Number(
  process.env.OTP_RESEND_COOLDOWN_SECONDS || 60
);

function isValidUuid(value) {
  return uuidPattern.test(String(value));
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value));
}

function isValidDate(value) {
  return !Number.isNaN(new Date(value).getTime());
}

function maskEmail(email) {
  const [localPart, domain = ''] = String(email).split('@');
  const visiblePrefix = localPart.slice(0, 2);
  const hiddenLength = Math.max(localPart.length - visiblePrefix.length, 1);

  return `${visiblePrefix}${'*'.repeat(hiddenLength)}@${domain}`;
}

function buildExpiryDate() {
  return new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
}

function buildAppointmentPayload({ businessId, userId, startTime, endTime }) {
  return {
    businessId,
    userId,
    startTime,
    endTime,
  };
}

async function loadVerificationRecord({ verificationId, userId }) {
  return db.query(
    `SELECT *
     FROM verification_codes
     WHERE id = $1
       AND user_id = $2
     LIMIT 1`,
    [verificationId, userId]
  );
}

function validateRequestPayload({ businessId, userId, email, startTime, endTime }) {
  if (!businessId || !userId || !email || !startTime || !endTime) {
    return 'businessId, userId, email, startTime, and endTime are required.';
  }

  if (!isValidUuid(businessId) || !isValidUuid(userId)) {
    return 'businessId and userId must be valid UUIDs.';
  }

  if (!isValidEmail(email)) {
    return 'email must be a valid email address.';
  }

  if (!isValidDate(startTime) || !isValidDate(endTime)) {
    return 'startTime and endTime must be valid date-time values.';
  }

  if (new Date(startTime) >= new Date(endTime)) {
    return 'startTime must be earlier than endTime.';
  }

  return null;
}

async function requestAppointmentVerification(req, res, next) {
  const { businessId, userId, email, startTime, endTime } = req.body;
  const validationError = validateRequestPayload({
    businessId,
    userId,
    email,
    startTime,
    endTime,
  });

  if (validationError) {
    return res.status(400).json({
      message: validationError,
    });
  }

  const verificationId = randomUUID();
  const code = generateOtpCode();
  const expiresAt = buildExpiryDate();

  try {
    await db.query(
      `DELETE FROM verification_codes
       WHERE user_id = $1
         AND used_at IS NULL`,
      [userId]
    );

    await db.query(
      `INSERT INTO verification_codes (
         id,
         user_id,
         email,
         code_hash,
         appointment_payload,
         expires_at,
         attempts_count,
         max_attempts,
         last_sent_at
       )
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, 0, $7, NOW())`,
      [
        verificationId,
        userId,
        email,
        hashOtpCode(code),
        JSON.stringify(
          buildAppointmentPayload({ businessId, userId, startTime, endTime })
        ),
        expiresAt,
        OTP_MAX_ATTEMPTS,
      ]
    );

    try {
      await sendVerificationEmail({
        email,
        code,
        expiresInMinutes: OTP_EXPIRY_MINUTES,
      });
    } catch (mailError) {
      await db.query('DELETE FROM verification_codes WHERE id = $1', [
        verificationId,
      ]);
      throw mailError;
    }

    return res.status(201).json({
      message: 'Verification code sent successfully.',
      verificationRequestId: verificationId,
      expiresAt,
      maskedEmail: maskEmail(email),
    });
  } catch (error) {
    return next(error);
  }
}

async function getPendingVerification(req, res, next) {
  const { id } = req.params;
  const { userId } = req.query;

  if (!isValidUuid(id) || !isValidUuid(userId)) {
    return res.status(400).json({
      message: 'Invalid verification request.',
    });
  }

  try {
    const result = await loadVerificationRecord({
      verificationId: id,
      userId,
    });

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: 'Verification request not found.',
      });
    }

    const verification = result.rows[0];

    if (verification.used_at) {
      return res.status(410).json({
        message: 'Verification request already completed.',
      });
    }

    return res.json({
      email: maskEmail(verification.email),
      expiresAt: verification.expires_at,
      attemptsLeft: Math.max(
        verification.max_attempts - verification.attempts_count,
        0
      ),
      resendAvailableAt: new Date(
        new Date(verification.last_sent_at).getTime() +
          OTP_RESEND_COOLDOWN_SECONDS * 1000
      ),
    });
  } catch (error) {
    return next(error);
  }
}

async function resendAppointmentVerification(req, res, next) {
  const { verificationRequestId, userId } = req.body;

  if (!isValidUuid(verificationRequestId) || !isValidUuid(userId)) {
    return res.status(400).json({
      message: 'Invalid verification request.',
    });
  }

  try {
    const result = await loadVerificationRecord({
      verificationId: verificationRequestId,
      userId,
    });

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: 'Verification request not found.',
      });
    }

    const verification = result.rows[0];

    if (verification.used_at) {
      return res.status(410).json({
        message: 'Verification request already completed.',
      });
    }

    if (new Date(verification.expires_at) < new Date()) {
      return res.status(410).json({
        message: 'Verification code expired. Please request a new code.',
      });
    }

    const resendAvailableAt = new Date(
      new Date(verification.last_sent_at).getTime() +
        OTP_RESEND_COOLDOWN_SECONDS * 1000
    );

    if (resendAvailableAt > new Date()) {
      return res.status(429).json({
        message: `Please wait ${OTP_RESEND_COOLDOWN_SECONDS} seconds before requesting another code.`,
      });
    }

    const code = generateOtpCode();
    const expiresAt = buildExpiryDate();

    await db.query(
      `UPDATE verification_codes
       SET code_hash = $1,
           expires_at = $2,
           attempts_count = 0,
           last_sent_at = NOW()
       WHERE id = $3`,
      [hashOtpCode(code), expiresAt, verificationRequestId]
    );

    await sendVerificationEmail({
      email: verification.email,
      code,
      expiresInMinutes: OTP_EXPIRY_MINUTES,
    });

    return res.json({
      message: 'A new verification code was sent.',
      expiresAt,
      maskedEmail: maskEmail(verification.email),
    });
  } catch (error) {
    return next(error);
  }
}

async function confirmAppointmentVerification(req, res, next) {
  const { verificationRequestId, userId, code } = req.body;

  if (!isValidUuid(verificationRequestId) || !isValidUuid(userId)) {
    return res.status(400).json({
      message: 'Invalid verification request.',
    });
  }

  if (!/^\d{4,6}$/.test(String(code))) {
    return res.status(400).json({
      message: 'Verification code must be 4 to 6 digits.',
    });
  }

  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    const verificationResult = await client.query(
      `SELECT *
       FROM verification_codes
       WHERE id = $1
         AND user_id = $2
       FOR UPDATE`,
      [verificationRequestId, userId]
    );

    if (verificationResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        message: 'Verification request not found.',
      });
    }

    const verification = verificationResult.rows[0];

    if (verification.used_at) {
      await client.query('ROLLBACK');
      return res.status(410).json({
        message: 'Verification request already completed.',
      });
    }

    if (new Date(verification.expires_at) < new Date()) {
      await client.query('ROLLBACK');
      return res.status(410).json({
        message: 'Verification code expired. Please request a new code.',
      });
    }

    if (verification.attempts_count >= verification.max_attempts) {
      await client.query('ROLLBACK');
      return res.status(429).json({
        message: 'Too many verification attempts. Please request a new code.',
      });
    }

    if (verification.code_hash !== hashOtpCode(code)) {
      await client.query(
        `UPDATE verification_codes
         SET attempts_count = attempts_count + 1
         WHERE id = $1`,
        [verificationRequestId]
      );

      await client.query('COMMIT');
      return res.status(400).json({
        message: 'Verification code is incorrect.',
      });
    }

    const payload = verification.appointment_payload;

    const appointmentResult = await client.query(
      `INSERT INTO appointments (id, business_id, user_id, start_time, end_time)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        randomUUID(),
        payload.businessId,
        payload.userId,
        payload.startTime,
        payload.endTime,
      ]
    );

    await client.query(
      `UPDATE verification_codes
       SET used_at = NOW()
       WHERE id = $1`,
      [verificationRequestId]
    );

    await client.query('COMMIT');

    return res.json({
      message: 'Appointment verified and created successfully.',
      appointment: appointmentResult.rows[0],
    });
  } catch (error) {
    await client.query('ROLLBACK');

    if (error.code === '23505') {
      return res.status(409).json({
        message: 'This appointment slot is already booked.',
      });
    }

    if (error.code === '23503') {
      return res.status(400).json({
        message: 'Referenced business or user was not found.',
      });
    }

    return next(error);
  } finally {
    client.release();
  }
}

module.exports = {
  requestAppointmentVerification,
  getPendingVerification,
  resendAppointmentVerification,
  confirmAppointmentVerification,
};
