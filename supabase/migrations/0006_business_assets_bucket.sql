-- Private storage bucket for business branding assets (logo, favicon).
-- docs/04-rls-and-security.md §"storage buckets": private-by-default, path
-- convention {business_id}/{entity}/{uuid}.{ext}. Only the backend's
-- service-role client ever touches this bucket (uploads, and generating
-- short-lived signed URLs to serve images) — the browser never gets direct
-- storage access, matching the "secret boundary" architecture (docs/02).
-- Because only service_role touches it, and service_role bypasses RLS on
-- storage.objects the same as on any other table, no additional storage
-- policies are needed here.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'business-assets',
  'business-assets',
  false,
  2097152, -- 2 MB, matches the frontend's own upload size check
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/x-icon']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
