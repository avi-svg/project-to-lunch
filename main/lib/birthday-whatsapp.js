const { randomUUID } = require('crypto');
const db = require('../db');
const {
  normalizeWhatsAppRecipient,
  sendWhatsAppTemplate,
} = require('./whatsapp');

const DISPLAY_TIME_ZONE = 'Asia/Jerusalem';
const BIRTHDAY_TEMPLATE_NAME =
  process.env.WHATSAPP_BIRTHDAY_TEMPLATE_NAME || 'birthday';
const BIRTHDAY_TEMPLATE_LANGUAGE_CODE =
  process.env.WHATSAPP_BIRTHDAY_TEMPLATE_LANGUAGE_CODE || 'he';
const BIRTHDAY_SEND_HOUR = Number(
  process.env.WHATSAPP_BIRTHDAY_SEND_HOUR || '10'
);
const SCHEDULER_INTERVAL_MS = 60 * 1000;

let usersColumnsPromise = null;
let schedulerInterval = null;
let schedulerRunPromise = null;

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

function toDisplayDateString(value) {
  const { year, month, day } = getDatePartsInDisplayTimeZone(value);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getDisplayHour(value) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: DISPLAY_TIME_ZONE,
    hour: '2-digit',
    hour12: false,
  });

  return Number(formatter.format(value instanceof Date ? value : new Date(value)));
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

async function loadEligibleUsers() {
  const userColumns = await getUsersColumns();

  if (!userColumns.has('birth_date')) {
    throw new Error(
      'Cannot send birthday WhatsApp messages because the users.birth_date column is missing.'
    );
  }

  if (!userColumns.has('phone')) {
    throw new Error(
      'Cannot send birthday WhatsApp messages because the users.phone column is missing.'
    );
  }

  const selectFields = ['id', 'email', 'name', 'role', 'phone', 'birth_date'];

  if (userColumns.has('is_active')) {
    selectFields.push('is_active');
  }

  const activeCondition = userColumns.has('is_active')
    ? 'WHERE is_active IS DISTINCT FROM FALSE'
    : '';

  const result = await db.query(
    `SELECT ${selectFields.join(', ')}
     FROM public.users
     ${activeCondition}
     ORDER BY COALESCE(name, email) ASC, email ASC`
  );

  return result.rows.map((row) => ({
    id: row.id,
    email: row.email,
    name: typeof row.name === 'string' && row.name.trim().length > 0 ? row.name.trim() : null,
    role: row.role,
    phone: typeof row.phone === 'string' ? row.phone : null,
    birthDate:
      row.birth_date instanceof Date
        ? row.birth_date.toISOString().slice(0, 10)
        : typeof row.birth_date === 'string'
          ? row.birth_date.slice(0, 10)
          : null,
    isActive: row.is_active !== false,
  }));
}

function isBirthdayToday(birthDate, targetDate) {
  if (typeof birthDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    return false;
  }

  const [, month, day] = birthDate.split('-').map(Number);
  return month === targetDate.month && day === targetDate.day;
}

async function reserveBirthdayDelivery({
  birthdayUserId,
  recipientUserId,
  scheduledForDate,
  client = db,
}) {
  const result = await client.query(
    `INSERT INTO public.birthday_whatsapp_notifications (
       id,
       birthday_user_id,
       recipient_user_id,
       scheduled_for_date,
       template_name
     )
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (birthday_user_id, recipient_user_id, scheduled_for_date)
     DO NOTHING
     RETURNING id`,
    [
      randomUUID(),
      birthdayUserId,
      recipientUserId,
      scheduledForDate,
      BIRTHDAY_TEMPLATE_NAME,
    ]
  );

  return result.rows[0]?.id ?? null;
}

async function finalizeBirthdayDelivery({
  deliveryId,
  whatsappMessageId,
  client = db,
}) {
  await client.query(
    `UPDATE public.birthday_whatsapp_notifications
     SET whatsapp_message_id = $2
     WHERE id = $1`,
    [deliveryId, whatsappMessageId ?? null]
  );
}

async function releaseBirthdayDeliveryReservation(deliveryId, client = db) {
  await client.query(
    `DELETE FROM public.birthday_whatsapp_notifications
     WHERE id = $1`,
    [deliveryId]
  );
}

async function sendBirthdayTemplateToRecipient({
  birthdayUser,
  recipientUser,
  scheduledForDate,
  client = db,
}) {
  if (!recipientUser.phone) {
    return { status: 'skipped_no_phone' };
  }

  const normalizedPhone = normalizeWhatsAppRecipient(recipientUser.phone);

  if (!normalizedPhone) {
    return { status: 'skipped_invalid_phone' };
  }

  const deliveryId = await reserveBirthdayDelivery({
    birthdayUserId: birthdayUser.id,
    recipientUserId: recipientUser.id,
    scheduledForDate,
    client,
  });

  if (!deliveryId) {
    return { status: 'already_sent' };
  }

  try {
    const result = await sendWhatsAppTemplate({
      to: normalizedPhone,
      name: BIRTHDAY_TEMPLATE_NAME,
      languageCode: BIRTHDAY_TEMPLATE_LANGUAGE_CODE,
      bodyParameters: [birthdayUser.name ?? birthdayUser.email],
    });

    const whatsappMessageId =
      Array.isArray(result?.messages) && result.messages[0]?.id
        ? result.messages[0].id
        : null;

    await finalizeBirthdayDelivery({
      deliveryId,
      whatsappMessageId,
      client,
    });

    return { status: 'sent', whatsappMessageId };
  } catch (error) {
    await releaseBirthdayDeliveryReservation(deliveryId, client);
    throw error;
  }
}

async function sendBirthdayAnnouncementsForDate({
  date = new Date(),
  force = false,
} = {}) {
  const users = await loadEligibleUsers();
  const targetDate = getDatePartsInDisplayTimeZone(date);
  const scheduledForDate = toDisplayDateString(date);
  const recipients = users.filter((user) => user.isActive !== false);
  const birthdayUsers = users.filter((user) => isBirthdayToday(user.birthDate, targetDate));

  const summary = {
    scheduledForDate,
    templateName: BIRTHDAY_TEMPLATE_NAME,
    birthdayUsersCount: birthdayUsers.length,
    recipientsCount: recipients.length,
    attempted: 0,
    sent: 0,
    alreadySent: 0,
    skippedNoPhone: 0,
    skippedInvalidPhone: 0,
    failed: 0,
    failures: [],
  };

  if (!force && getDisplayHour(date) < BIRTHDAY_SEND_HOUR) {
    return {
      ...summary,
      skipped: true,
      message: `Birthday broadcast is scheduled for ${String(BIRTHDAY_SEND_HOUR).padStart(2, '0')}:00 ${DISPLAY_TIME_ZONE}.`,
    };
  }

  if (birthdayUsers.length === 0) {
    return {
      ...summary,
      skipped: true,
      message: 'No birthdays matched the selected date.',
    };
  }

  for (const birthdayUser of birthdayUsers) {
    for (const recipientUser of recipients) {
      if (recipientUser.id === birthdayUser.id) {
        continue;
      }

      summary.attempted += 1;

      try {
        const deliveryResult = await sendBirthdayTemplateToRecipient({
          birthdayUser,
          recipientUser,
          scheduledForDate,
        });

        if (deliveryResult.status === 'sent') {
          summary.sent += 1;
          continue;
        }

        if (deliveryResult.status === 'already_sent') {
          summary.alreadySent += 1;
          continue;
        }

        if (deliveryResult.status === 'skipped_no_phone') {
          summary.skippedNoPhone += 1;
          continue;
        }

        if (deliveryResult.status === 'skipped_invalid_phone') {
          summary.skippedInvalidPhone += 1;
          continue;
        }
      } catch (error) {
        summary.failed += 1;
        summary.failures.push({
          birthdayUserId: birthdayUser.id,
          birthdayUserName: birthdayUser.name ?? birthdayUser.email,
          recipientUserId: recipientUser.id,
          recipientUserName: recipientUser.name ?? recipientUser.email,
          message: error.message,
        });
      }
    }
  }

  return summary;
}

async function runBirthdaySchedulerTick({ force = false, now = new Date() } = {}) {
  if (!force && getDisplayHour(now) < BIRTHDAY_SEND_HOUR) {
    return null;
  }

  return sendBirthdayAnnouncementsForDate({
    date: now,
    force,
  });
}

function startBirthdayWhatsAppScheduler() {
  if (schedulerInterval) {
    return schedulerInterval;
  }

  if (String(process.env.WHATSAPP_BIRTHDAY_SCHEDULER_ENABLED || 'true').toLowerCase() === 'false') {
    console.log('Birthday WhatsApp scheduler is disabled by env.');
    return null;
  }

  const triggerTick = () => {
    if (schedulerRunPromise) {
      return schedulerRunPromise;
    }

    schedulerRunPromise = runBirthdaySchedulerTick()
      .then((summary) => {
        if (summary && !summary.skipped) {
          console.log(
            `Birthday WhatsApp broadcast finished for ${summary.scheduledForDate}: sent=${summary.sent}, alreadySent=${summary.alreadySent}, failed=${summary.failed}.`
          );
        }
      })
      .catch((error) => {
        console.error('Birthday WhatsApp scheduler failed:', error);
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

  console.log(
    `Birthday WhatsApp scheduler started. Daily send hour: ${String(BIRTHDAY_SEND_HOUR).padStart(2, '0')}:00 (${DISPLAY_TIME_ZONE}).`
  );

  return schedulerInterval;
}

module.exports = {
  runBirthdaySchedulerTick,
  sendBirthdayAnnouncementsForDate,
  startBirthdayWhatsAppScheduler,
};
