-- Blog SVGs are sanitized by the super-admin uploader before storage.
update storage.buckets
set allowed_mime_types=array['image/jpeg','image/png','image/webp','image/svg+xml']
where id='blog-media';
