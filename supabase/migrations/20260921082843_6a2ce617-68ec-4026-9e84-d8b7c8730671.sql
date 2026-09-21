-- 1. Hide ownership tokens from Data API readers (column-level privileges)
REVOKE SELECT (anon_token, share_token, user_id) ON public.brand_kits FROM anon;
REVOKE SELECT (anon_token, share_token, user_id) ON public.brand_kits FROM authenticated;

-- 2. Design doc versions: readable only by their creator
DROP POLICY IF EXISTS "Authenticated users can view all design doc versions" ON public.design_doc_versions;
CREATE POLICY "Users view own design doc versions"
ON public.design_doc_versions
FOR SELECT
TO authenticated
USING (auth.uid() = created_by);

-- 3. Profiles: no longer world-readable
DROP POLICY IF EXISTS "Profiles viewable by everyone" ON public.profiles;
CREATE POLICY "Users view own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
REVOKE SELECT ON public.profiles FROM anon;

-- 4. SECURITY DEFINER functions should not be callable through the API
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated;