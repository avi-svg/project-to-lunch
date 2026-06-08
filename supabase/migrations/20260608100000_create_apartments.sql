CREATE TABLE IF NOT EXISTS public.apartments (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       VARCHAR     NOT NULL,
  position   INTEGER     NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS apartments_position_idx ON public.apartments (position ASC);
