ALTER TABLE public.brand_kits
  ADD COLUMN owner_token_hash text;

CREATE INDEX brand_kits_owner_token_hash_idx
  ON public.brand_kits (owner_token_hash)
  WHERE owner_token_hash IS NOT NULL;

ALTER TABLE public.design_doc_versions
  ADD COLUMN owner_token_hash text;

CREATE INDEX design_doc_versions_owner_token_hash_idx
  ON public.design_doc_versions (owner_token_hash)
  WHERE owner_token_hash IS NOT NULL;

REVOKE SELECT (owner_token_hash) ON public.brand_kits FROM anon, authenticated;
REVOKE SELECT (owner_token_hash) ON public.design_doc_versions FROM anon, authenticated;