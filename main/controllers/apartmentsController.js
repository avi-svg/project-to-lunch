const { randomUUID } = require('crypto');
const db = require('../db');
const { requireActor, requireStaff, isStaffLike, isValidUuid } = require('../lib/user-roles');

function formatApartment(row) {
  return {
    id: row.id,
    name: row.name,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listApartments(req, res, next) {
  try {
    const result = await db.query(
      `SELECT id, name, position, created_at, updated_at
       FROM public.apartments
       ORDER BY position ASC, name ASC`
    );

    return res.json({
      apartments: result.rows.map(formatApartment),
    });
  } catch (error) {
    return next(error);
  }
}

async function createApartment(req, res, next) {
  const { name, position } = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ message: 'name is required.' });
  }

  const nextPosition =
    position !== undefined && Number.isInteger(Number(position))
      ? Number(position)
      : 0;

  try {
    const result = await db.query(
      `INSERT INTO public.apartments (id, name, position)
       VALUES ($1, $2, $3)
       RETURNING id, name, position, created_at, updated_at`,
      [randomUUID(), name.trim(), nextPosition]
    );

    return res.status(201).json({ apartment: formatApartment(result.rows[0]) });
  } catch (error) {
    return next(error);
  }
}

async function updateApartment(req, res, next) {
  const { id } = req.params;

  if (!isValidUuid(id)) {
    return res.status(400).json({ message: 'Invalid apartment id.' });
  }

  const { name, position } = req.body;
  const updates = [];
  const values = [];

  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ message: 'name must be a non-empty string.' });
    }
    values.push(name.trim());
    updates.push(`name = $${values.length}`);
  }

  if (position !== undefined) {
    if (!Number.isInteger(Number(position))) {
      return res.status(400).json({ message: 'position must be an integer.' });
    }
    values.push(Number(position));
    updates.push(`position = $${values.length}`);
  }

  if (updates.length === 0) {
    return res.status(400).json({ message: 'At least one of name or position is required.' });
  }

  values.push(new Date().toISOString());
  updates.push(`updated_at = $${values.length}`);

  values.push(id);

  try {
    const result = await db.query(
      `UPDATE public.apartments
       SET ${updates.join(', ')}
       WHERE id = $${values.length}
       RETURNING id, name, position, created_at, updated_at`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Apartment not found.' });
    }

    return res.json({ apartment: formatApartment(result.rows[0]) });
  } catch (error) {
    return next(error);
  }
}

async function deleteApartment(req, res, next) {
  const { id } = req.params;

  if (!isValidUuid(id)) {
    return res.status(400).json({ message: 'Invalid apartment id.' });
  }

  try {
    const result = await db.query(
      `DELETE FROM public.apartments WHERE id = $1 RETURNING id`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Apartment not found.' });
    }

    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listApartments,
  createApartment,
  updateApartment,
  deleteApartment,
  requireActor,
  requireStaff,
};
