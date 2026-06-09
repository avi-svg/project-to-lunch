const db = require('../db');
const { isStaffLike, isValidUuid } = require('../lib/user-roles');

const PERM_VIEW_HISTORY = 'view_housing_attendance_history';
const PERM_MANAGE = 'manage_housing_attendance_history_permissions';

async function isBootstrapped(client = db) {
  const result = await client.query(
    `SELECT EXISTS(
       SELECT 1 FROM public.staff_permissions WHERE permission = $1
     ) AS bootstrapped`,
    [PERM_MANAGE]
  );
  return result.rows[0].bootstrapped === true;
}

async function actorCanManage(actorId, client = db) {
  const bootstrapped = await isBootstrapped(client);

  if (!bootstrapped) {
    return true;
  }

  const result = await client.query(
    `SELECT EXISTS(
       SELECT 1 FROM public.staff_permissions
       WHERE user_id = $1 AND permission = $2
     ) AS has_permission`,
    [actorId, PERM_MANAGE]
  );

  return result.rows[0].has_permission === true;
}

async function getPermissionsStatus(req, res, next) {
  const permission = req.query.permission || PERM_VIEW_HISTORY;

  if (permission !== PERM_VIEW_HISTORY && permission !== PERM_MANAGE) {
    return res.status(400).json({ message: 'Invalid permission type.' });
  }

  try {
    const bootstrapped = await isBootstrapped();

    const result = await db.query(
      `SELECT
         sp.user_id AS "userId",
         sp.permission,
         sp.created_at AS "grantedAt",
         sp.granted_by_user_id AS "grantedById",
         COALESCE(u.name, u.email) AS "userName",
         u.email AS "userEmail",
         COALESCE(gb.name, gb.email) AS "grantedByName"
       FROM public.staff_permissions sp
       JOIN public.users u ON u.id = sp.user_id
       LEFT JOIN public.users gb ON gb.id = sp.granted_by_user_id
       WHERE sp.permission = $1
       ORDER BY COALESCE(u.name, u.email) ASC`,
      [permission]
    );

    return res.json({
      isBootstrapped: bootstrapped,
      permission,
      permissions: result.rows,
    });
  } catch (error) {
    return next(error);
  }
}

async function bootstrapPermissions(req, res, next) {
  const { managerUserIds } = req.body || {};

  if (!Array.isArray(managerUserIds) || managerUserIds.length === 0) {
    return res.status(400).json({ message: 'managerUserIds must be a non-empty array.' });
  }

  for (const uid of managerUserIds) {
    if (!isValidUuid(uid)) {
      return res.status(400).json({ message: `Invalid userId: ${uid}` });
    }
  }

  try {
    const alreadyBootstrapped = await isBootstrapped();

    if (alreadyBootstrapped) {
      return res.status(409).json({ message: 'Permissions have already been bootstrapped.' });
    }

    const staffCheck = await db.query(
      `SELECT id FROM public.users
       WHERE id = ANY($1::uuid[]) AND LOWER(role) IN ('staff', 'admin')`,
      [managerUserIds]
    );

    if (staffCheck.rows.length !== managerUserIds.length) {
      return res.status(400).json({ message: 'All managerUserIds must belong to staff members.' });
    }

    for (const uid of managerUserIds) {
      await db.query(
        `INSERT INTO public.staff_permissions (user_id, permission, granted_by_user_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, permission) DO NOTHING`,
        [uid, PERM_MANAGE, req.actor.id]
      );
    }

    return res.status(201).json({ message: 'Bootstrap completed successfully.' });
  } catch (error) {
    return next(error);
  }
}

async function grantPermission(req, res, next) {
  const { targetUserId, permission } = req.body || {};

  if (!isValidUuid(targetUserId)) {
    return res.status(400).json({ message: 'targetUserId must be a valid UUID.' });
  }

  if (permission !== PERM_VIEW_HISTORY && permission !== PERM_MANAGE) {
    return res.status(400).json({ message: 'Invalid permission type.' });
  }

  try {
    const canManage = await actorCanManage(req.actor.id);

    if (!canManage) {
      return res.status(403).json({ message: 'You do not have permission to manage permissions.' });
    }

    const targetUser = await db.query(
      `SELECT id, role FROM public.users WHERE id = $1`,
      [targetUserId]
    );

    if (targetUser.rows.length === 0) {
      return res.status(404).json({ message: 'Target user not found.' });
    }

    if (!isStaffLike(targetUser.rows[0].role)) {
      return res.status(400).json({ message: 'Permissions can only be granted to staff members.' });
    }

    await db.query(
      `INSERT INTO public.staff_permissions (user_id, permission, granted_by_user_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, permission) DO NOTHING`,
      [targetUserId, permission, req.actor.id]
    );

    return res.status(201).json({ message: 'Permission granted successfully.' });
  } catch (error) {
    return next(error);
  }
}

async function revokePermission(req, res, next) {
  const { targetUserId } = req.params;
  const permission = req.query.permission || PERM_VIEW_HISTORY;

  if (!isValidUuid(targetUserId)) {
    return res.status(400).json({ message: 'targetUserId must be a valid UUID.' });
  }

  if (permission !== PERM_VIEW_HISTORY && permission !== PERM_MANAGE) {
    return res.status(400).json({ message: 'Invalid permission type.' });
  }

  try {
    const canManage = await actorCanManage(req.actor.id);

    if (!canManage) {
      return res.status(403).json({ message: 'You do not have permission to manage permissions.' });
    }

    const result = await db.query(
      `DELETE FROM public.staff_permissions
       WHERE user_id = $1 AND permission = $2`,
      [targetUserId, permission]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Permission entry not found.' });
    }

    return res.json({ message: 'Permission revoked successfully.' });
  } catch (error) {
    return next(error);
  }
}

async function checkMyPermission(req, res, next) {
  const permission = req.query.permission || PERM_VIEW_HISTORY;

  if (permission !== PERM_VIEW_HISTORY && permission !== PERM_MANAGE) {
    return res.status(400).json({ message: 'Invalid permission type.' });
  }

  try {
    const bootstrapped = await isBootstrapped();

    if (!bootstrapped) {
      return res.json({ hasPermission: true, isBootstrapped: false });
    }

    const result = await db.query(
      `SELECT EXISTS(
         SELECT 1 FROM public.staff_permissions
         WHERE user_id = $1 AND permission = $2
       ) AS has_permission`,
      [req.actor.id, permission]
    );

    return res.json({
      hasPermission: result.rows[0].has_permission === true,
      isBootstrapped: true,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  bootstrapPermissions,
  checkMyPermission,
  grantPermission,
  getPermissionsStatus,
  revokePermission,
};
