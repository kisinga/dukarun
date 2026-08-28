# Learning platform operations

Dukarun is the integration boundary; GitBook owns public knowledge and Usertour owns interactive
flows and checklist progress. The application never stores guide progress or article copy.

Use the [learning platform next steps](NEXT_STEPS.md) for the GitBook publication and real-app video
pilot sequence.

## Use these names consistently

| Name              | Owner    | Meaning                                                     |
| ----------------- | -------- | ----------------------------------------------------------- |
| Category          | GitBook  | A primary business area such as Products or Selling.        |
| Article           | GitBook  | The canonical explanation of one task, concept, or problem. |
| Interactive guide | Usertour | An optional in-app companion to a task article.             |
| Journey           | Usertour | An ordered checklist that connects several task guides.     |
| Video             | YouTube  | An optional demonstration embedded in an article or flow.   |
| Glossary term     | GitBook  | The canonical definition of one business term.              |

An article must stand on its own. An interactive guide may point to the article for explanation,
and the article may launch the guide when one exists. A journey references guides in business order.
A video supports an article or guide but never replaces the written steps.

## Canonical keys and Usertour setup

The web registry defines nine flow keys (eight task guides plus the financial recap) and the
`first-business-cycle` checklist key. Public Usertour content IDs are checked in as web defaults and
can be overridden through `USERTOUR_CONTENT_IDS_JSON`; its keys must match `LEARNING_CONTENT_KEYS`.
An ID in the application does not prove that its flow is published. Confirm every flow and the
checklist in the intended Usertour environment before enabling the integration for users.

GitBook may contain written articles without a Usertour companion. Add an interactive guide only
when pointing at the live interface makes the task materially easier. Do not create an empty flow
to mirror every article.

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
<https://dukarun.gitbook.io/docs/>. That site is Dukarun's built-in default for
`GITBOOK_SITE_URL`; an environment value can still override it for preview spaces. Keep all supplied
slugs stable. Edit articles, relationships, video embeds, and glossary entries in GitBook after
import; these changes require no Dukarun deployment.

GitBook serves its embed with `frame-ancestors https:`. Dukarun therefore embeds the hub in the
deployed HTTPS app and presents a first-party “Open Dukarun Help” fallback in HTTP development
previews instead of showing the browser's refused-to-connect page. Run `npm run dev:web:https` and
accept the local development certificate once to exercise the real GitBook frame on localhost.
Component tests mock only the frame transport; article titles, hierarchy, search results, and videos
still come exclusively from GitBook.

The official embed follows Dukarun's light/dark `color-scheme`. Its accent color is owned by the
canonical GitBook site's customization rather than app CSS (the frame is cross-origin); set the
GitBook primary color to Dukarun orange `#e85d2f` so both the public and embedded docs match.

Before publishing, verify every external link and use a non-production app origin when importing
into a non-production space. Add a video block only after the approved YouTube or first-party media
URL is reachable. Until then, the written steps remain complete without a placeholder or broken
player.

## Rollout and future edits

GitBook is live first and remains the canonical content source. For a Usertour change, fork the live
version, validate it with internal accounts, then publish it to the production environment. Existing
content IDs stay stable across versions, so wording, steps, and future YouTube embeds do not require a
Dukarun deployment. Clear `USERTOUR_TOKEN` in a build to disable all interactive guides without
affecting GitBook help or ordinary business actions.

Vendor failures are non-blocking: ordinary business actions must still succeed.
