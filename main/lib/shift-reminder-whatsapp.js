const { randomUUID } = require('crypto');
const db = require('../db');
const { normalizeWhatsAppRecipient, sendWhatsAppTemplate } = require('./whatsapp');

const REMINDER_TEMPLATE_NAME =
  process.env.WHATSAPP_SHIFT_REMINDER_TEMPLATE_NAME || 'remember';
const REMINDER_TEMPLATE_LANGUAGE_CODE =
  process.env.WHATSAPP_SHIFT_REMINDER_TEMPLATE_LANGUAGE_CODE || 'he';
const SCHEDULER_INTERVAL_MS = 60 * 1000;
// Shifts starting between (now + WINDOW_START_MIN) and (now + WINDOW_END_MIN) will be notified.
const WINDOW_START_MIN = 4;
const WINDOW_END_MIN = 6;

let schedulerInterval = null;
let schedulerRunPromise = null;

async function loadUpcomingShiftRegistrants(now) {
  const windowStart = new Date(now.getTime() + WINDOW_START_MIN * 60 * 1000);
  const windowEnd = new Date(now.getTime() + WINDOW_END_MIN * 60 * 1000);

  const result = await db.query(
    `SELECT
       s.id        AS shift_id,
       s.title     AS shift_title,
       s.start_time,
       u.id        AS user_id,
       u.name      AS user_name,
       u.phone     AS user_phone
     FROM shifts s
     JOIN shift_registrations sr ON sr.shift_id = s.id
     JOIN users u ON u.id = sr.user_id
     WHERE s.start_time BETWEEN $1 AND $2
       AND s.status NOT IN ('cancelled')
       AND sr.status = 'approved'
       AND (u.is_active IS DISTINCT FROM FALSE)
       AND u.phone IS NOT NULL
     ORDER BY s.start_time ASC, u.id ASC`,
    [windowStart.toISOString(), windowEnd.toISOString()]
  );

  return result.rows;
}

async function reserveReminderDelivery({ shiftId, userId, client = db }) {
  const result = await client.query(
    `INSERT INTO public.shift_reminder_whatsapp_notifications
       (id, shift_id, user_id, template_name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (shift_id, user_id) DO NOTHING
     RETURNING id`,
    [randomUUID(), shiftId, userId, REMINDER_TEMPLATE_NAME]
  );

  return result.rows[0]?.id ?? null;
}

async function finalizeReminderDelivery({ deliveryId, whatsappMessageId, client = db }) {
  await client.query(
    `UPDATE public.shift_reminder_whatsapp_notifications
     SET whatsapp_message_id = $2
     WHERE id = $1`,
    [deliveryId, whatsappMessageId ?? null]
  );
}

async function releaseReminderDeliveryReservation(deliveryId, client = db) {
  await client.query(
    `DELETE FROM public.shift_reminder_whatsapp_notifications WHERE id = $1`,
    [deliveryId]
  );
}

async function sendReminderToRegistrant({
  shiftId,
  shiftTitle,
  startTime,
  userId,
  userName,
  userPhone,
}) {
  if (!userPhone) {
    return { status: 'skipped_no_phone' };
  }

  const normalizedPhone = normalizeWhatsAppRecipient(userPhone);

  if (!normalizedPhone) {
    return { status: 'skipped_invalid_phone' };
  }

  const deliveryId = await reserveReminderDelivery({ shiftId, userId });

  if (!deliveryId) {
    return { status: 'already_sent' };
  }

  try {
    const result = await sendWhatsAppTemplate({
      to: normalizedPhone,
      name: REMINDER_TEMPLATE_NAME,
      languageCode: REMINDER_TEMPLATE_LANGUAGE_CODE,
      bodyParameters: [userName ?? userPhone, shiftTitle],
    });

    const whatsappMessageId =
      Array.isArray(result?.messages) && result.messages[0]?.id
        ? result.messages[0].id
        : null;

    await finalizeReminderDelivery({ deliveryId, whatsappMessageId });

    return { status: 'sent', whatsappMessageId };
  } catch (error) {
    await releaseReminderDeliveryReservation(deliveryId);
    throw error;
  }
}

async function runShiftReminderSchedulerTick({ now = new Date() } = {}) {
  const registrants = await loadUpcomingShiftRegistrants(now);

  if (registrants.length === 0) {
    return null;
  }

  const summary = {
    templateName: REMINDER_TEMPLATE_NAME,
    attempted: 0,
    sent: 0,
    alreadySent: 0,
    skippedNoPhone: 0,
    skippedInvalidPhone: 0,
    failed: 0,
    failures: [],
  };

  for (const row of registrants) {
    summary.attempted += 1;

    try {
      const result = await sendReminderToRegistrant({
        shiftId: row.shift_id,
        shiftTitle: row.shift_title,
        startTime: row.start_time,
        userId: row.user_id,
        userName: row.user_name,
        userPhone: row.user_phone,
      });

      if (result.status === 'sent') {
        summary.sent += 1;
      } else if (result.status === 'already_sent') {
        summary.alreadySent += 1;
      } else if (result.status === 'skipped_no_phone') {
        summary.skippedNoPhone += 1;
      } else if (result.status === 'skipped_invalid_phone') {
        summary.skippedInvalidPhone += 1;
      }
    } catch (error) {
      summary.failed += 1;
      summary.failures.push({
        shiftId: row.shift_id,
        userId: row.user_id,
        userName: row.user_name,
        message: error.message,
      });
    }
  }

  return summary;
}

function startShiftReminderScheduler() {
  if (schedulerInterval) {
    return schedulerInterval;
  }

  if (
    String(process.env.WHATSAPP_SHIFT_REMINDER_SCHEDULER_ENABLED || 'true').toLowerCase() ===
    'false'
  ) {
    console.log('Shift reminder WhatsApp scheduler is disabled by env.');
    return null;
  }

  const triggerTick = () => {
    if (schedulerRunPromise) {
      return schedulerRunPromise;
    }

    schedulerRunPromise = runShiftReminderSchedulerTick()
      .then((summary) => {
        if (summary && summary.attempted > 0) {
          console.log(
            `Shift reminder WhatsApp tick: sent=${summary.sent}, alreadySent=${summary.alreadySent}, failed=${summary.failed}.`
          );
        }
      })
      .catch((error) => {
        console.error('Shift reminder WhatsApp scheduler failed:', error);
      })
      .finally(() => {
        schedulerRunPromise = null;
      });

    return schedulerRunPromise;
  };

  triggerTick();
  schedulerInterval = setInterval(triggerTick, SCHEDULER_INTERVAL_MS);

  if (typeof schedulerInterval.unref === 'function') {
    schedulerInterval.unref();
  }

  console.log('Shift reminder WhatsApp scheduler started (fires every 60s).');

  return schedulerInterval;
}

module.exports = {
  runShiftReminderSchedulerTick,
  startShiftReminderScheduler,
};
