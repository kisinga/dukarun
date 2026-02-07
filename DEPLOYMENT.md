# Dukahub Deployment Guide

## Coolify Deployment Configuration

### Required Environment Variables

When deploying to Coolify (or any production environment), ensure the following environment variables are configured:

#### Asset Storage Configuration

```bash
# Asset upload directory (matches Docker volume mount)
ASSET_UPLOAD_DIR=/usr/src/app/static/assets

# Asset URL prefix - CRITICAL for production deployments behind proxy
ASSET_URL_PREFIX=https://dukarun.com/assets
```

**Why ASSET_URL_PREFIX is Required:**
According to [Vendure documentation](https://docs.vendure.io/reference/core-plugins/asset-server-plugin/asset-server-options), when deploying behind a reverse proxy (Nginx → Backend), you must explicitly set the `assetUrlPrefix`. The auto-detection mechanism is unreliable in complex proxy setups and will cause 404 errors for uploaded assets.

### Coolify UI Configuration Steps

1. **Navigate to your Dukahub application** in Coolify dashboard
2. **Go to Environment Variables** section
3. **Add/Update the following variables:**
   - `ASSET_URL_PREFIX` = `https://dukarun.com/assets`
   - `ASSET_UPLOAD_DIR` = `/usr/src/app/static/assets`
4. **Save and redeploy** the application

### Volume Persistence

Ensure Docker volumes are properly configured for asset persistence across deployments:

- `backend_assets` → `/usr/src/app/static/assets` (uploaded images, thumbnails)
- `backend_uploads` → `/usr/src/app/static/uploads` (temporary uploads)

These volumes are defined in [docker-compose.yml](docker-compose.yml) and will persist data across container restarts and redeployments.

### Network Configuration

**Current Setup:** Custom network `dukarun_services_network`

The application uses two Docker Compose files:
- `docker-compose.yml` - Application services (backend, frontend)
- `docker-compose.services.yml` - Infrastructure services (PostgreSQL, Redis, TimescaleDB)

Both share the `dukarun_services_network` for inter-service communication.

**Optional:** To use Coolify's predefined network instead:
1. Change network name from `dukarun_services_network` to `coolify` in both compose files
2. Enable "Connect to Predefined Network" in Coolify UI

### Post-Deployment Verification

After deploying with the updated configuration:

#### 1. Verify Volume Mounts

```bash
# SSH into your server or use Coolify's terminal
docker exec <backend-container-name> ls -la /usr/src/app/static/assets

# Should show: drwxr-xr-x directories for source/, preview/, cache/
```

#### 2. Test Asset Upload

1. Login to admin dashboard
2. Navigate to **Settings → Branding**
3. Upload a company logo
4. Verify the image displays correctly

#### 3. Test Asset Persistence

```bash
# Restart the backend container
docker restart <backend-container-name>

# Verify the uploaded logo still displays
# Check asset files still exist
docker exec <backend-container-name> find /usr/src/app/static/assets -type f
```

#### 4. Test Asset URLs

```bash
# Test asset accessibility via curl
curl -I https://dukarun.com/assets/preview/<id>/<filename>__preview.png

# Should return: HTTP/2 200 OK
```

### Troubleshooting

#### Assets Return 404 After Deployment

**Cause:** Volume mount path mismatch or missing ASSET_URL_PREFIX

**Solution:**
1. Verify `ASSET_UPLOAD_DIR=/usr/src/app/static/assets` in environment variables
2. Verify `ASSET_URL_PREFIX=https://dukarun.com/assets` is set
3. Check volume is mounted correctly (see verification steps above)
4. Restart backend container

#### Assets Upload Successfully But Don't Display

**Cause:** Missing or incorrect ASSET_URL_PREFIX

**Solution:**
1. Set `ASSET_URL_PREFIX=https://dukarun.com/assets` in Coolify environment variables
2. Redeploy the application
3. Clear browser cache and reload

#### Volume Data Lost After Deployment

**Cause:** Volume not properly defined or attached

**Solution:**
1. Check Coolify volume configuration
2. Verify volumes are defined in docker-compose.yml:
   ```yaml
   volumes:
     backend_assets:
       driver: local
   ```
3. Ensure volume mounts are correct in service definition

### Monitoring Asset Storage

```bash
# Check volume disk usage
docker volume inspect dukarun_backend_assets

# Check asset directory size
docker exec <backend-container-name> du -sh /usr/src/app/static/assets

# Monitor backend logs for asset operations
docker logs -f <backend-container-name> | grep -i asset
```

### Asset Upload Limits

- **Max file size:** 50MB
- **Supported image formats:** JPG, JPEG, PNG, GIF, SVG, WebP
- **Supported document formats:** PDF
- **ML model formats:** JSON, BIN, PB, H5, ONNX, TFLite

### Re-uploading Profile Images (Fresh Start)

If migrating from the old configuration or starting fresh:

1. **Company Logo:**
   - Navigate to Settings → Branding
   - Click "Upload Company Logo"
   - Select image file
   - Save changes

2. **User Profile Pictures:**
   - Navigate to Profile page
   - Click "Change Photo"
   - Select image file
   - Save changes

Assets will now persist correctly across deployments.

### Security Considerations

- Assets are served through Nginx reverse proxy with proper caching headers
- Cache duration: 1 day for backend assets
- CORS headers configured for cross-origin access
- Assets are served over HTTPS in production

### Performance Optimization

Current Nginx cache configuration (already optimized):
```nginx
location /assets/ {
  expires 1d;
  add_header Cache-Control "public, max-age=86400";
}
```

For improved performance at scale, consider:
- CDN integration (CloudFlare, AWS CloudFront)
- S3-compatible storage (MinIO, AWS S3) for multi-instance deployments
- Extended cache duration with cache-busting for static assets

## Complete Environment Variable Reference

See [.env.example](.env.example) for all available environment variables.

**Critical for Asset Fix:**
- `ASSET_UPLOAD_DIR=/usr/src/app/static/assets`
- `ASSET_URL_PREFIX=https://dukarun.com/assets`

**Other Important Variables:**
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USERNAME`, `DB_PASSWORD`
- `REDIS_HOST`, `REDIS_PORT`
- `CORS_ORIGIN`, `FRONTEND_URL`
- `COOKIE_SECRET`, `SUPERADMIN_USERNAME`, `SUPERADMIN_PASSWORD`

---

For more information, see:
- [Vendure Deployment Guide](https://docs.vendure.io/guides/deployment/)
- [Asset Server Plugin Documentation](https://docs.vendure.io/reference/core-plugins/asset-server-plugin/)
- [Docker Deployment Best Practices](https://docs.vendure.io/guides/deployment/using-docker/)
