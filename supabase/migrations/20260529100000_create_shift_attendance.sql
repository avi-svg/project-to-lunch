DO $$
BEGIN
  CREATE TYPE public.shift_attendance_status AS ENUM (
    'pending',
    'approved',
    'rejected'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.shift_attendance (
  id uuid PRIMARY KEY,
  shift_id uuid NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  registration_id uuid NOT NULL REFERENCES public.shift_registrations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status public.shift_attendance_status NOT NULL DEFAULT 'pending',
  reported_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  reviewed_at timestamptz,
  reviewed_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  review_note text,
  CONSTRAINT shift_attendance_unique_registration UNIQUE (registration_id)
);

CREATE INDEX IF NOT EXISTS shift_attendance_shift_id_idx
  ON public.shift_attendance (shift_id);

CREATE INDEX IF NOT EXISTS shift_attendance_user_id_idx
  ON public.shift_attendance (user_id);

CREATE INDEX IF NOT EXISTS shift_attendance_status_idx
  ON public.shift_attendance (status);
