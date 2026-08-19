# Troubleshooting

## Local Supabase

```bash
npx supabase status
npm run sb:stop
npm run sb:start
```

If startup fails, confirm Docker is running and ports `54321`–`54327` are free. Use
`npm run sb:reset` only when losing local database state is acceptable.

## Authentication and tenant context

- Inspect the browser network response from `/auth/v1` before debugging Angular guards.
- Confirm the user has a `company_members` row and that custom access-token hooks are enabled.
- RLS denials are expected when `company_id`/role claims are absent; never bypass them in the UI.
- For local OTP testing, use the test values configured in `supabase/config.toml`.

## Frontend configuration

Production build logs must show `[env:<app>] wrote ...environment.generated.ts`. If a deployed
app calls `127.0.0.1:54321`, set `SUPABASE_URL` and `SUPABASE_ANON_KEY` in Cloudflare Pages,
clear its build cache, and redeploy.

The anon key is public. The service-role key is not and must never be configured in Pages.

## Database changes

- Applied migrations are immutable; add a new migration to correct behavior.
- Run `npm run sb:lint`, `npm run sb:test`, and `npm run sb:types` after schema/RPC changes.
- `npm run sb:types` resets the local database before generation. Local data is replaced by seed
  data, and the resulting types match committed migrations.

## POS and dashboard freshness

- A completed online sale should commit through `post_sale`, then trigger a background dashboard
  refetch through Realtime invalidation.
- An offline sale remains in the IndexedDB outbox and is deliberately excluded from server stats
  until replay succeeds.
- If a supplier balance appears stale, verify the purchase/payment RPC posted accounts payable,
  then inspect the relevant Realtime subscription and refetch rather than editing totals locally.

## Historical Vendure issues

The former Vendure troubleshooting guide is preserved at
`archive/vendure/GENERAL_TROUBLESHOOTING.md`.
