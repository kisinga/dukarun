# General Troubleshooting

## SSH tunnels

- Observability: `ssh -L 3301:localhost:3301 user@server`
- Vendure admin: `ssh -L 3000:localhost:3000 user@server`

## Backend: `EACCES permission denied, mkdir '/app/static/assets'`

The app runs as a non-root user but the asset directory was created as root.

The backend image's `docker-entrypoint.sh` creates `ASSET_UPLOAD_DIR`, chowns it, then starts the app. Rebuild the backend image to pick up the entrypoint.

Use `ASSET_UPLOAD_DIR=/usr/src/app/static/assets` for the standard backend Dockerfile. If your platform uses a different `WORKDIR` (e.g. `/app`), set `ASSET_UPLOAD_DIR` to match and mount the volume at the same path.

## Reset Vendure superadmin password

```bash
psql -U vendure -d vendure
```

```sql
BEGIN;
DELETE FROM public.session WHERE "userId" = 1;
DELETE FROM public.authentication_method WHERE "userId" = 1;
DELETE FROM public.user_roles_role WHERE "userId" = 1;
DELETE FROM public.history_entry WHERE "administratorId" = 1;
DELETE FROM public.administrator WHERE id = 1;
DELETE FROM public."user" WHERE id = 1;
COMMIT;
```

## Start fresh (destroys all data)

```bash
docker compose down -v
docker compose -f docker-compose.services.yml down -v
docker container prune -f

# Remove specific volumes, or all unused volumes:
docker volume prune -f
# docker volume rm dukarun_postgres_data dukarun_timescaledb_audit_data \
#   dukarun_redis_data dukarun_backend_assets dukarun_backend_uploads \
#   dukarun_signoz_data dukarun_clickhouse_data

docker network prune -f
```
