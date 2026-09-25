DO $$
DECLARE
  target_user_id uuid;
BEGIN
  SELECT id INTO target_user_id
  FROM auth.users
  WHERE lower(email) = lower('mcm@reardonsystems.com')
  ORDER BY created_at DESC
  LIMIT 1;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'Target account not found';
  END IF;

  UPDATE public.brand_kits
  SET user_id = target_user_id
  WHERE user_id IS NULL;
END
$$;