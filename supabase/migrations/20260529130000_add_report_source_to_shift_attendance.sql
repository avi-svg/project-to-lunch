ALTER TABLE public.shift_attendance
ADD COLUMN IF NOT EXISTS report_source TEXT NOT NULL DEFAULT 'self';

ALTER TABLE public.shift_attendance
ADD COLUMN IF NOT EXISTS reported_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

UPDATE public.shift_attendance
SET reported_by_user_id = user_id
WHERE reported_by_user_id IS NULL
  AND report_source = 'self';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'shift_attendance_report_source_check'
      AND conrelid = 'public.shift_attendance'::regclass
  ) THEN
    ALTER TABLE public.shift_attendance
    ADD CONSTRAINT shift_attendance_report_source_check
      CHECK (report_source IN ('self', 'staff-manual'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS shift_attendance_reported_by_user_id_idx
  ON public.shift_attendance (reported_by_user_id);
