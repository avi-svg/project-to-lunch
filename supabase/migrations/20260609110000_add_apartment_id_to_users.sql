ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS apartment_id UUID REFERENCES public.apartments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS users_apartment_id_idx ON public.users (apartment_id);
