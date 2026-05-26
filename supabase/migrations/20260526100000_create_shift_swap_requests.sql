DO $$
BEGIN
  CREATE TYPE public.shift_swap_request_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'cancelled',
    'closed'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.shift_swap_requests (
  id uuid PRIMARY KEY,
  shift_id uuid NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  requester_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  requester_registration_id uuid NOT NULL REFERENCES public.shift_registrations(id) ON DELETE CASCADE,
  reason text NOT NULL,
  status public.shift_swap_request_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  reviewed_at timestamptz,
  reviewed_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  review_note text,
  CONSTRAINT shift_swap_requests_reason_not_blank
    CHECK (char_length(btrim(reason)) > 0)
);

CREATE INDEX IF NOT EXISTS shift_swap_requests_shift_id_idx
  ON public.shift_swap_requests (shift_id);

CREATE INDEX IF NOT EXISTS shift_swap_requests_requester_user_id_idx
  ON public.shift_swap_requests (requester_user_id);

CREATE INDEX IF NOT EXISTS shift_swap_requests_status_idx
  ON public.shift_swap_requests (status);

CREATE UNIQUE INDEX IF NOT EXISTS shift_swap_requests_active_registration_idx
  ON public.shift_swap_requests (requester_registration_id)
  WHERE status IN ('pending', 'approved');
