CREATE TABLE IF NOT EXISTS public.birthday_whatsapp_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  birthday_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  recipient_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  scheduled_for_date DATE NOT NULL,
  template_name TEXT NOT NULL,
  whatsapp_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT birthday_whatsapp_notifications_unique_delivery
    UNIQUE (birthday_user_id, recipient_user_id, scheduled_for_date)
);

CREATE INDEX IF NOT EXISTS birthday_whatsapp_notifications_date_idx
  ON public.birthday_whatsapp_notifications (scheduled_for_date DESC);

CREATE INDEX IF NOT EXISTS birthday_whatsapp_notifications_birthday_user_idx
  ON public.birthday_whatsapp_notifications (birthday_user_id, scheduled_for_date DESC);
