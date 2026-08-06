// Backfill Vendure manufacturer facets for every imported company.
// Usage: node scripts/etl/backfill-manufacturers.mjs [--apply]
// Dry-run is default. Requires the product_manufacturers migration on target.
import pg from 'pg';

const SRC_DSN = process.env.SOURCE_DB_URL ?? {
  host:
    process.env.SOURCE_DB_HOST ??
    (process.env.DB_HOST === 'postgres' ? '127.0.0.1' : process.env.DB_HOST) ??
    '127.0.0.1',
  port: Number(
    process.env.SOURCE_DB_PORT ?? process.env.POSTGRES_PORT ?? process.env.DB_PORT ?? 5432
  ),
  database: process.env.SOURCE_DB_NAME ?? process.env.DB_NAME ?? 'vendure',
  user: process.env.SOURCE_DB_USER ?? process.env.DB_USER ?? process.env.DB_USERNAME ?? 'vendure',
  password: process.env.SOURCE_DB_PASSWORD ?? process.env.DB_PASSWORD,
};
const TGT_DSN =
  process.env.TARGET_DB_URL ?? 'postgres://postgres:postgres@127.0.0.1:54322/postgres';
const APPLY = process.argv.includes('--apply');

const src = new pg.Client(SRC_DSN);
const tgt = new pg.Client(TGT_DSN);
await src.connect();
await tgt.connect();

try {
  const { rows: imports } = await tgt.query(
    `select map.old_id::int as channel_id, map.company_id, company.code as company_code
     from public.etl_id_map map
     join public.companies company on company.id=map.company_id
     where map.old_type = 'channel'
     order by map.old_id::int`
  );
  if (!imports.length) {
    console.log('No imported companies found.');
    process.exitCode = 0;
  } else {
    console.log(`\n=== MANUFACTURER BACKFILL: ${APPLY ? 'APPLY' : 'DRY RUN'} ===`);
    await tgt.query('begin');
    let totalManufacturers = 0;
    let totalLinks = 0;
    let totalMissing = 0;

    for (const imported of imports) {
      const { rows: channelRows } = await src.query('select code from channel where id=$1', [
        imported.channel_id,
      ]);
      if (!channelRows.length) {
        throw new Error(
          `source channel ${imported.channel_id} for target company '${imported.company_code}' is missing`
        );
      }
      const channelCode = channelRows[0].code;
      if (channelCode !== imported.company_code) {
        throw new Error(
          `source channel ${imported.channel_id} code '${channelCode}' does not match target company '${imported.company_code}'`
        );
      }
      const { rows: productMaps } = await tgt.query(
        `select old_id::int as source_product_id, new_id as product_id
         from public.etl_id_map
         where old_type='product' and company_id=$1`,
        [imported.company_id]
      );
      const targetBySource = new Map(
        productMaps.map(row => [row.source_product_id, row.product_id])
      );
      const sourceIds = [...targetBySource.keys()];
      let assignments = [];
      if (sourceIds.length) {
        const result = await src.query(
          `select pf."productId" as product_id,
                  coalesce(nullif(btrim(fvt.name), ''), fv.code) as manufacturer
           from product_facet_values_facet_value pf
           join facet_value fv on fv.id = pf."facetValueId"
           join facet f on f.id = fv."facetId" and lower(f.code) = 'manufacturer'
           left join facet_value_translation fvt
             on fvt."baseId" = fv.id and fvt."languageCode" = 'en'
           where pf."productId" = any($1::int[])
           order by pf."productId", fv.id`,
          [sourceIds]
        );
        assignments = result.rows;
      }

      const byProduct = new Map();
      for (const row of assignments) {
        const values = byProduct.get(row.product_id) ?? [];
        values.push(row.manufacturer);
        byProduct.set(row.product_id, values);
      }
      const duplicates = [...byProduct.entries()].filter(([, values]) => values.length > 1);
      if (duplicates.length) {
        throw new Error(
          `${channelCode}: ${duplicates.length} product(s) have multiple manufacturers; refusing unsafe backfill`
        );
      }

      const sourceNames = new Map();
      for (const row of assignments) {
        const normalized = row.manufacturer.trim().toLowerCase();
        if (!sourceNames.has(normalized)) sourceNames.set(normalized, row.manufacturer.trim());
      }
      const uniqueNames = [...sourceNames.values()];
      const manufacturerIds = new Map();
      if (uniqueNames.length) {
        await tgt.query(
          `insert into public.manufacturers (company_id, name)
           select $1, btrim(name) from unnest($2::text[]) as names(name)
           on conflict (company_id, normalized_name)
           do update set active=true, updated_at=now()`,
          [imported.company_id, uniqueNames]
        );
        const { rows } = await tgt.query(
          `select id, normalized_name from public.manufacturers
           where company_id=$1 and normalized_name=any($2::text[])`,
          [imported.company_id, uniqueNames.map(name => name.trim().toLowerCase())]
        );
        for (const row of rows) manufacturerIds.set(row.normalized_name, row.id);
      }

      let missing = 0;
      const productIds = [];
      const linkedManufacturerIds = [];
      for (const row of assignments) {
        const productId = targetBySource.get(row.product_id);
        if (!productId) {
          missing++;
          continue;
        }
        const manufacturerId = manufacturerIds.get(row.manufacturer.trim().toLowerCase());
        if (!manufacturerId) {
          missing++;
          continue;
        }
        productIds.push(productId);
        linkedManufacturerIds.push(manufacturerId);
      }
      const linkResult = productIds.length
        ? await tgt.query(
            `update public.products product
             set manufacturer_id=link.manufacturer_id, updated_at=now()
             from unnest($1::uuid[], $2::uuid[]) as link(product_id, manufacturer_id)
             where product.id=link.product_id and product.company_id=$3`,
            [productIds, linkedManufacturerIds, imported.company_id]
          )
        : { rowCount: 0 };
      const linked = linkResult.rowCount;
      missing += productIds.length - linked;

      totalManufacturers += uniqueNames.length;
      totalLinks += linked;
      totalMissing += missing;
      console.log(
        `  ${channelCode} -> ${imported.company_id}: ${uniqueNames.length} manufacturer(s), ${linked} product link(s), ${missing} missing mapping(s)`
      );
    }

    if (totalMissing) {
      throw new Error(`${totalMissing} manufacturer assignment(s) could not be mapped`);
    }
    console.log(
      `\nTotals: ${totalManufacturers} tenant manufacturer record(s), ${totalLinks} product link(s)`
    );
    if (APPLY) {
      await tgt.query('commit');
      console.log('COMMITTED.');
    } else {
      await tgt.query('rollback');
      console.log('DRY RUN — rolled back, nothing written.');
    }
  }
} catch (error) {
  await tgt.query('rollback').catch(() => {});
  console.error(`FAILED: ${error.message}`);
  process.exitCode = 1;
} finally {
  await src.end();
  await tgt.end();
}
