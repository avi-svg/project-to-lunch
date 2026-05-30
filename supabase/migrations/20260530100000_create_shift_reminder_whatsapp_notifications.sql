CREATE TABLE IF NOT EXISTS public.shift_reminder_whatsapp_notifications (
  id UUID PRIMARY KEY,
  shift_id UUID NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  template_name TEXT NOT NULL,
  whatsapp_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (shift_id, user_id)
);
