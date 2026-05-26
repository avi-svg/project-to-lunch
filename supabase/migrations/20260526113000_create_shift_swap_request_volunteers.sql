DO $$
BEGIN
  CREATE TYPE public.shift_swap_volunteer_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'cancelled'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.shift_swap_request_volunteers (
  id uuid PRIMARY KEY,
  swap_request_id uuid NOT NULL REFERENCES public.shift_swap_requests(id) ON DELETE CASCADE,
  volunteer_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status public.shift_swap_volunteer_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  reviewed_at timestamptz,
  reviewed_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  review_note text
);

CREATE INDEX IF NOT EXISTS shift_swap_request_volunteers_request_id_idx
  ON public.shift_swap_request_volunteers (swap_request_id);

CREATE INDEX IF NOT EXISTS shift_swap_request_volunteers_user_id_idx
  ON public.shift_swap_request_volunteers (volunteer_user_id);

CREATE INDEX IF NOT EXISTS shift_swap_request_volunteers_status_idx
  ON public.shift_swap_request_volunteers (status);

CREATE UNIQUE INDEX IF NOT EXISTS shift_swap_request_volunteers_active_user_idx
  ON public.shift_swap_request_volunteers (swap_request_id, volunteer_user_id)
  WHERE status IN ('pending', 'approved');

CREATE UNIQUE INDEX IF NOT EXISTS shift_swap_request_volunteers_single_approved_idx
  ON public.shift_swap_request_volunteers (swap_request_id)
  WHERE status = 'approved';
