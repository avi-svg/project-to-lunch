CREATE TABLE IF NOT EXISTS public.shift_notes (
  id uuid PRIMARY KEY,
  shift_id uuid NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  message text NOT NULL,
  notify_whatsapp boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT shift_notes_message_not_blank
    CHECK (char_length(btrim(message)) > 0)
);

CREATE INDEX IF NOT EXISTS shift_notes_shift_id_created_at_idx
  ON public.shift_notes (shift_id, created_at ASC);

CREATE INDEX IF NOT EXISTS shift_notes_author_user_id_idx
  ON public.shift_notes (author_user_id);
