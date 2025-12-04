# Backend Scripts

## backfill-channel-id-stock-entities.sql

Adds channelId to stock entities (stock_purchase, inventory_stock_adjustment, purchase_payment) for existing data.

### When to Use

Run this script **BEFORE** deploying the new backend version that includes the `AddChannelIdToStockEntities8000000000012` migration on systems with existing data.

### What It Does

1. Adds `channelId` columns as NULLABLE
2. Backfills values from ledger journal entries (for purchases)
3. Falls back to default channel for records without ledger entries
4. Sets columns to NOT NULL
5. Adds foreign key constraints and indexes

### Usage

**Via Docker (recommended for production):**

```bash
docker exec -i <postgres-container> psql -U vendure -d vendure < backfill-channel-id-stock-entities.sql
```

**Via SSH to production:**

```bash
cat backfill-channel-id-stock-entities.sql | ssh user@server "docker exec -i postgres_container psql -U vendure -d vendure"
```

**Direct psql:**

```bash
PGPASSWORD=vendure psql -h <host> -U vendure -d vendure -f backfill-channel-id-stock-entities.sql
```

### Notes

- Script is **idempotent** - safe to run multiple times
- Uses transactions - if anything fails, all changes are rolled back
- After running, the TypeORM migration will detect columns already exist and skip

---

# ML Model Deployment Scripts

## deploy-ml-model.js

Automated ML model deployment to Vendure channels with versioning and tagging.

### Quick Start

```bash
node deploy-ml-model.js \
  --channel=2 \
  --version=1.0.0 \
  --model=./path/to/model.json \
  --weights=./path/to/weights.bin \
  --metadata=./path/to/metadata.json \
  --token=YOUR_ADMIN_TOKEN
```

### Prerequisites

1. **Dependencies**: `node-fetch`, `form-data` (install via `npm install` in backend/)
2. **Admin Token**: Get from Vendure Admin UI or via login mutation
3. **Model Files**: Three required files (model.json, weights.bin, metadata.json)
4. **Channel ID**: Find in Settings → Channels

### Getting Admin Token

**Option 1: Via GraphiQL**

```graphql
mutation {
  login(username: "admin@example.com", password: "your-password") {
    ... on CurrentUser {
      id
      identifier
      channels {
        token
      }
    }
  }
}
```

**Option 2: From Admin UI**

```
Settings → Administrators → API Tokens → Create New Token
```

### What It Does

1. **Uploads 3 files** to Assets with tags:
   - `ml-model` (category)
   - `channel-{id}` (permanent ownership)
   - `v{version}` (semantic version)
   - `trained-{YYYY-MM-DD}` (training date)

2. **Assigns to channel** (permanent relationship)

3. **Activates version** by updating Channel custom fields:
   - `mlModelJsonId`
   - `mlModelBinId`
   - `mlMetadataId`

### Architecture

**Active Model:**

- Determined by Asset IDs in Channel.customFields
- Frontend queries these IDs to load the model

**Versioning:**

- Multiple versions can coexist as separate assets
- Tags track version and training date
- Channel custom fields point to active version

**Rollback:**

- Change custom field IDs to previous version
- No file deletion needed
- Takes ~2 minutes

### Examples

**Deploy v1.0.0:**

```bash
node backend/scripts/deploy-ml-model.js \
  --channel=2 \
  --version=1.0.0 \
  --model=./ml-models/model.json \
  --weights=./ml-models/weights.bin \
  --metadata=./ml-models/metadata.json \
  --token=abc123...
```

**Deploy v2.0.0 to same channel:**

```bash
# Uploads new version, automatically deactivates v1.0.0
node backend/scripts/deploy-ml-model.js \
  --channel=2 \
  --version=2.0.0 \
  --model=./ml-models-v2/model.json \
  --weights=./ml-models-v2/weights.bin \
  --metadata=./ml-models-v2/metadata.json \
  --token=abc123...
```

**Rollback to v1.0.0:**

```
Manual: Settings → Channels → Channel 2 → ML Model tab
Change the 3 Asset ID fields back to v1.0.0 IDs
Save
```

### Verification

**Check deployment:**

```graphql
query {
  channel(id: "2") {
    customFields {
      mlModelJsonId
      mlModelBinId
      mlMetadataId
    }
  }
}
```

**Check version details:**

```graphql
query {
  asset(id: "YOUR_ASSET_ID") {
    name
    tags {
      value
    }
    channels {
      id
      name
    }
  }
}
```

**View all versions for channel:**

```
Admin UI: Catalog → Assets
Filter manually for assets with channel-2 tag
```

### Troubleshooting

**Error: "File not found"**

- Check file paths are correct
- Use absolute paths or relative to script location

**Error: "Upload failed: 400"**

- Verify file types are permitted in vendure-config.ts
- Check file sizes are under 50MB

**Error: "Assignment failed"**

- Verify channel ID exists
- Check admin token has permissions

**Error: "Activation failed"**

- Verify custom fields exist in Channel entity
- Check vendure-config.ts has mlModelJsonId, mlModelBinId, mlMetadataId

### Version Cleanup

**Recommended:**

- Keep at least 2 versions (current + previous) for rollback
- Delete versions older than 30 days

**Manual deletion:**

```
Admin UI: Catalog → Assets
Select old version assets → Delete
```

**Automated cleanup (future):**

```javascript
// TODO: Implement cleanup script
// node scripts/cleanup-old-models.js --channel=2 --keep=2
```

### Integration with CI/CD

```yaml
# .github/workflows/deploy-model.yml
name: Deploy ML Model
on:
  push:
    paths:
      - 'ml-models/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: npm install
      - run: |
          node backend/scripts/deploy-ml-model.js \
            --channel=${{ secrets.CHANNEL_ID }} \
            --version=${{ github.sha }} \
            --model=./ml-models/model.json \
            --weights=./ml-models/weights.bin \
            --metadata=./ml-models/metadata.json \
            --token=${{ secrets.VENDURE_ADMIN_TOKEN }} \
            --api=${{ secrets.VENDURE_API_URL }}
```

### See Also

- **ML_GUIDE.md** - Complete ML model architecture documentation
- **vendure-config.ts** - Backend configuration
- **frontend/src/app/core/services/ml-model.service.ts** - Frontend implementation
