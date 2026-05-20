DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.users
    WHERE role IN ('admin', 'staff')
  ) THEN
    RAISE EXCEPTION 'Cannot seed recurring shifts because no admin/staff user exists for created_by_user_id.';
  END IF;
END
$$;

WITH creator AS (
  SELECT id
  FROM public.users
  WHERE role IN ('admin', 'staff')
  ORDER BY
    CASE role
      WHEN 'admin' THEN 0
      ELSE 1
    END,
    created_at ASC NULLS LAST,
    email ASC
  LIMIT 1
),
shift_dates AS (
  SELECT generate_series(
    current_date::timestamp,
    (current_date + interval '1 year' - interval '1 day')::timestamp,
    interval '1 day'
  )::date AS shift_date
),
planned_shifts AS (
  SELECT
    U&'\05EA\05D5\05E8\05E0\05D5\05EA \05D0\05E8\05D5\05D7\05EA \05E2\05E8\05D1'::text AS title,
    U&'\05DE\05D5\05E2\05D3\05D5\05DF'::text AS location,
    'night'::public.shift_category AS category,
    make_timestamptz(
      EXTRACT(YEAR FROM shift_date)::int,
      EXTRACT(MONTH FROM shift_date)::int,
      EXTRACT(DAY FROM shift_date)::int,
      16,
      30,
      0,
      'Asia/Jerusalem'
    ) AS start_time,
    make_timestamptz(
      EXTRACT(YEAR FROM shift_date)::int,
      EXTRACT(MONTH FROM shift_date)::int,
      EXTRACT(DAY FROM shift_date)::int,
      18,
      0,
      0,
      'Asia/Jerusalem'
    ) AS end_time,
    4 AS capacity
  FROM shift_dates
  WHERE EXTRACT(DOW FROM shift_date) = 0

  UNION ALL

  SELECT
    U&'\05EA\05D5\05E8\05E0\05D5\05EA \05E0\05D9\05E7\05D9\05D5\05DF'::text AS title,
    U&'\05DE\05D5\05E2\05D3\05D5\05DF'::text AS location,
    'field'::public.shift_category AS category,
    make_timestamptz(
      EXTRACT(YEAR FROM shift_date)::int,
      EXTRACT(MONTH FROM shift_date)::int,
      EXTRACT(DAY FROM shift_date)::int,
      16,
      0,
      0,
      'Asia/Jerusalem'
    ) AS start_time,
    make_timestamptz(
      EXTRACT(YEAR FROM shift_date)::int,
      EXTRACT(MONTH FROM shift_date)::int,
      EXTRACT(DAY FROM shift_date)::int,
      17,
      0,
      0,
      'Asia/Jerusalem'
    ) AS end_time,
    4 AS capacity
  FROM shift_dates
  WHERE EXTRACT(DOW FROM shift_date) = 2
)
INSERT INTO public.shifts (
  title,
  description,
  location,
  start_time,
  end_time,
  capacity,
  created_by_user_id,
  category
)
SELECT
  planned_shifts.title,
  NULL AS description,
  planned_shifts.location,
  planned_shifts.start_time,
  planned_shifts.end_time,
  planned_shifts.capacity,
  creator.id,
  planned_shifts.category
FROM planned_shifts
CROSS JOIN creator
WHERE NOT EXISTS (
  SELECT 1
  FROM public.shifts existing
  WHERE existing.title = planned_shifts.title
    AND COALESCE(existing.location, '') = planned_shifts.location
    AND existing.category = planned_shifts.category
    AND existing.start_time = planned_shifts.start_time
    AND existing.end_time = planned_shifts.end_time
);
