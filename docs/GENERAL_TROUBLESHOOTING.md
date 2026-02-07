- OBSERVABILITY: `ssh -L 3301:localhost:3301 user@server`
- VENDURE: `ssh -L 3000:localhost:3000 user@server`

# Backend: EACCES permission denied, mkdir '.../static/assets'

If the backend entrypoint fails with:

```text
Entrypoint failed: Error: EACCES: permission denied, mkdir '/app/static/assets'
```

- **Cause:** The app runs as a non-root user; the asset directory is created by Docker (or a volume) as root-owned, so Vendure’s AssetServerPlugin cannot create or write to it.
- **Fix (this repo):** The backend image includes a `docker-entrypoint.sh` that runs as root, creates `ASSET_UPLOAD_DIR` (and uploads dir), chowns them to the app user, then starts the app. Rebuild the backend image so the new entrypoint is used.
- **Path:** Use `ASSET_UPLOAD_DIR=/usr/src/app/static/assets` when running the standard backend Dockerfile (WORKDIR is `/usr/src/app`). If your platform uses a different WORKDIR (e.g. `/app`), set `ASSET_UPLOAD_DIR` to that path (e.g. `/app/static/assets`) and ensure the volume is mounted at the same path; the entrypoint will create and chown that path.

# Manually Reset vendure superadmin password

```bash
psql -U vendure -d vendure


SELECT
  a.id           AS admin_id,
  u.id           AS user_id,
  u.identifier   AS login_identifier,
  a."emailAddress"
FROM public.administrator a
JOIN public."user" u ON a."userId" = u.id
ORDER BY a.id;

BEGIN;
DELETE FROM public.session WHERE "userId" = 1;
DELETE FROM public.authentication_method WHERE "userId" = 1;
DELETE FROM public.user_roles_role WHERE "userId" = 1;
DELETE FROM public.history_entry WHERE "administratorId" = 1;
DELETE FROM public.administrator WHERE id = 1;
DELETE FROM public."user" WHERE id = 1;
COMMIT;
`
```

Start afresh

```bash

# Stop and remove everything including volumes
docker compose down -v
docker compose -f docker-compose.services.yml down -v
# Remove any stopped containers that might still reference volumes
docker container prune -f

# If volumes are still in use, check which containers are using them
# docker ps -a | grep <container_name>
# docker rm -f <container_id>

# Remove all volumes (WARNING: This deletes ALL data)
# This is the safest option as it removes unused volumes
# Remove all volumes (WARNING: This deletes ALL data)
docker volume prune -f

# Or remove specific volumes if you want to keep others
docker volume rm dukarun_postgres_data
docker volume rm dukarun_timescaledb_audit_data
docker volume rm dukarun_redis_data
docker volume rm dukarun_backend_assets
docker volume rm dukarun_backend_uploads
docker volume rm dukarun_signoz_data
docker volume rm dukarun_clickhouse_data

# Clean up networks
docker network prune -f
```
