ALTER TABLE public.shift_attendance
DROP CONSTRAINT IF EXISTS shift_attendance_report_source_check;

ALTER TABLE public.shift_attendance
ADD CONSTRAINT shift_attendance_report_source_check
  CHECK (report_source IN ('self', 'staff-manual', 'staff-absent'));
