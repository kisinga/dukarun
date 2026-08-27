# Learning platform operations

Dukarun is the integration boundary; GitBook owns public knowledge and Usertour owns interactive
flows and checklist progress. The application never stores guide progress or article copy.

## Canonical keys and Usertour setup

Set `USERTOUR_CONTENT_IDS_JSON` to a JSON object whose keys match `LEARNING_CONTENT_KEYS` in the web
registry. Create nine flows (eight task flows plus the financial recap) and one checklist named
`first-business-cycle`.

The checklist order is product, supplier, credit purchase, cash sale, customer credit, and credit
sale. A checklist task completes when its flow completes **or** its corresponding stable event is
received. Configure dismissal on every flow and the checklist. Configure the checklist to
auto-dismiss on completion and start the financial recap flow.

Use only selectors of the form `[data-learning-anchor="..."]`. JavaScript evaluation is disabled by
the app. Do not configure Usertour's Resource Center.

The financial recap should navigate through `financial-dashboard` (revenue and margin),
`financial-stock`, `financial-cash`, `financial-credit` (payables and receivables), and
`financial-revenue-margin` (revenue, COGS, and gross margin). These anchors point to real views; do
not reproduce or calculate financial values inside Usertour.

## Identity and privacy

Configure `USERTOUR_SIGNING_SECRET` only in Supabase Edge Function secrets. The browser obtains a
15-minute identity token containing only the authenticated user UUID and active company UUID.
Membership attributes are boolean permissions. Events contain only a stable event name. URLs sent
to Usertour have query strings, fragments, and UUID path segments removed.

## GitBook publishing

Import `gitbook-import` into the public, search-indexed `en-KE` space at
<https://dukarun.gitbook.io/dukarun-docs/>. That site is Dukarun's built-in default for
`GITBOOK_SITE_URL`; an environment value can still override it for preview spaces. Keep all supplied
slugs stable. Edit articles, relationships, video embeds, and glossary entries in GitBook after
import; these changes require no Dukarun deployment.

GitBook serves its embed with `frame-ancestors https:`. Dukarun therefore embeds the hub in the
deployed HTTPS app and presents a first-party “Open Dukarun Help” fallback in HTTP development
previews instead of showing the browser's refused-to-connect page.

Before publishing, verify each linked media URL, create the matching Usertour draft, and use a
non-production app origin when importing into a non-production space.

## Rollout

1. Publish GitBook.
2. Create unpublished Usertour drafts and completion rules.
3. Deploy with empty Usertour variables to keep interactive guides disabled while embedded help is
   available.
4. Configure an internal environment and exercise every role and company switch.
5. Publish Usertour content, populate all IDs, then enable production variables.

Vendor failures are non-blocking: ordinary business actions must still succeed.
