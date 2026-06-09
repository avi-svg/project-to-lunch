const { randomUUID } = require('crypto');
const db = require('../db');
const { requireActor, requireStaff, isValidUuid } = require('../lib/user-roles');

function formatApartment(row) {
  return {
    id: row.id,
    name: row.name,
    address: row.address ?? null,
    gender: row.gender ?? null,
    position: row.position,
    residents: Array.isArray(row.residents) ? row.residents : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeGender(value) {
  if (value === 'male' || value === 'female') return value;
  return null;
}

async function listApartments(req, res, next) {
  try {
    const result = await db.query(
      `SELECT
         a.id, a.name, a.address, a.gender, a.position, a.created_at, a.updated_at,
         COALESCE(
           json_agg(
             json_build_object('id', u.id, 'name', u.name, 'email', u.email)
             ORDER BY u.name
           ) FILTER (WHERE u.id IS NOT NULL),
           '[]'
         ) AS residents
       FROM public.apartments a
       LEFT JOIN public.users u ON u.apartment_id = a.id AND u.role = 'user'
       GROUP BY a.id
       ORDER BY a.position ASC, a.name ASC`
    );

    return res.json({ apartments: result.rows.map(formatApartment) });
  } catch (error) {
    return next(error);
  }
}

async function createApartment(req, res, next) {
  const { name, address, gender, position } = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ message: 'name is required.' });
  }

  const nextPosition =
    position !== undefined && Number.isInteger(Number(position))
      ? Number(position)
      : 0;

  try {
    const result = await db.query(
      `INSERT INTO public.apartments (id, name, address, gender, position)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, address, gender, position, created_at, updated_at`,
      [
        randomUUID(),
        name.trim(),
        address && typeof address === 'string' ? address.trim() || null : null,
        normalizeGender(gender),
        nextPosition,
      ]
    );

    const row = result.rows[0];
    return res.status(201).json({
      apartment: { ...formatApartment(row), residents: [] },
    });
  } catch (error) {
    return next(error);
  }
}

async function updateApartment(req, res, next) {
  const { id } = req.params;

  if (!isValidUuid(id)) {
    return res.status(400).json({ message: 'Invalid apartment id.' });
  }

  const { name, address, gender, position } = req.body;
  const updates = [];
  const values = [];

  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ message: 'name must be a non-empty string.' });
    }
    values.push(name.trim());
    updates.push(`name = $${values.length}`);
  }

  if (address !== undefined) {
    values.push(address && typeof address === 'string' ? address.trim() || null : null);
    updates.push(`address = $${values.length}`);
  }

  if (gender !== undefined) {
    const normalized = normalizeGender(gender);
    if (gender !== null && !normalized) {
      return res.status(400).json({ message: "gender must be 'male', 'female', or null." });
    }
    values.push(normalized);
    updates.push(`gender = $${values.length}`);
  }

  if (position !== undefined) {
    if (!Number.isInteger(Number(position))) {
      return res.status(400).json({ message: 'position must be an integer.' });
    }
    values.push(Number(position));
    updates.push(`position = $${values.length}`);
  }

  if (updates.length === 0) {
    return res.status(400).json({ message: 'At least one field is required.' });
  }

  values.push(new Date().toISOString());
  updates.push(`updated_at = $${values.length}`);
  values.push(id);

  try {
    const result = await db.query(
      `UPDATE public.apartments
       SET ${updates.join(', ')}
       WHERE id = $${values.length}
       RETURNING id, name, address, gender, position, created_at, updated_at`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Apartment not found.' });
    }

    // Fetch residents for the updated apartment
    const residentsResult = await db.query(
      `SELECT id, name, email FROM public.users WHERE apartment_id = $1 AND role = 'user' ORDER BY name`,
      [id]
    );

    return res.json({
      apartment: {
        ...formatApartment(result.rows[0]),
        residents: residentsResult.rows,
      },
    });
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
