CREATE TABLE IF NOT EXISTS public.staff_permissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  permission VARCHAR(100) NOT NULL,
  granted_by_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, permission)
);

INSERT INTO public.staff_permissions (user_id, permission)
SELECT id, 'view_housing_attendance_history'
FROM public.users
WHERE LOWER(role) IN ('staff', 'admin')
ON CONFLICT (user_id, permission) DO NOTHING;
