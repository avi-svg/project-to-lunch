const { timingSafeEqual } = require('crypto');
const db = require('../db');

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const allowedRoles = new Set(['staff', 'user']);
const internalApiKeyHeader = 'x-internal-api-key';

function isValidUuid(value) {
  return uuidPattern.test(String(value));
}

function normalizeRole(role) {
  const normalized = String(role || 'user').trim().toLowerCase();

  if (normalized === 'admin') {
    return 'staff';
  }

  return allowedRoles.has(normalized) ? normalized : 'user';
}

async function getActorById(userId, client = db) {
  if (!isValidUuid(userId)) {
    return null;
  }

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

  const user = result.rows[0];

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: normalizeRole(user.role),
  };
}

function isStaffLike(role) {
  return normalizeRole(role) === 'staff';
}

function getInternalApiKeyFromRequest(req) {
  const headerValue = req.headers[internalApiKeyHeader];

  if (Array.isArray(headerValue)) {
    return headerValue[0] || '';
  }

  return typeof headerValue === 'string' ? headerValue : '';
}

function hasValidInternalApiKey(req) {
  const configuredApiKey = process.env.INTERNAL_API_KEY;
  const providedApiKey = getInternalApiKeyFromRequest(req);

  if (!configuredApiKey || !providedApiKey) {
    return false;
  }

  const configuredBuffer = Buffer.from(configuredApiKey);
  const providedBuffer = Buffer.from(providedApiKey);

  if (configuredBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(configuredBuffer, providedBuffer);
}

function canManageShift(actor, shift) {
  if (!actor || !shift) {
    return false;
  }

  return isStaffLike(actor.role) || shift.created_by_user_id === actor.id;
}

async function requireActor(req, res, next) {
  const actingUserId =
    req.body?.actingUserId ||
    req.query?.actingUserId ||
    req.headers['x-acting-user-id'];

  if (!actingUserId || !isValidUuid(actingUserId)) {
    return res.status(401).json({
      message: 'A valid actingUserId is required.',
    });
  }

  try {
    const actor = await getActorById(actingUserId);

    if (!actor) {
      return res.status(404).json({
        message: 'Acting user was not found.',
      });
    }

    req.actor = actor;
    return next();
  } catch (error) {
    return next(error);
  }
}

function requireStaff(req, res, next) {
  if (!req.actor || !isStaffLike(req.actor.role)) {
    return res.status(403).json({
      message: 'Only staff users can perform this action.',
    });
  }

  return next();
}

function requireInternalApiKey(req, res, next) {
  if (!process.env.INTERNAL_API_KEY) {
    return res.status(500).json({
      message: 'INTERNAL_API_KEY is not configured on the server.',
    });
  }

  if (!hasValidInternalApiKey(req)) {
    return res.status(401).json({
      message: `A valid ${internalApiKeyHeader} header is required.`,
    });
  }

  req.isInternalRequest = true;
  return next();
}

async function requireStaffOrInternalApiKey(req, res, next) {
  if (hasValidInternalApiKey(req)) {
    req.isInternalRequest = true;
    return next();
  }

  return requireActor(req, res, (error) => {
    if (error) {
      return next(error);
    }

    return requireStaff(req, res, next);
  });
}

module.exports = {
  canManageShift,
  getActorById,
  hasValidInternalApiKey,
  isStaffLike,
  isValidUuid,
  normalizeRole,
  requireActor,
  requireInternalApiKey,
  requireStaff,
  requireStaffOrInternalApiKey,
};
