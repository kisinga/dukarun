# Learning platform operations

Dukarun is the integration boundary; GitBook owns Dukarun Guide, the public searchable help
experience, and Usertour owns interactive flows and checklist progress. The application never
stores guide progress or article copy.

Use the [learning platform next steps](NEXT_STEPS.md) for the GitBook publication and real-app video
pilot sequence.

## Use these names consistently

| Name              | Owner    | Meaning                                                     |
| ----------------- | -------- | ----------------------------------------------------------- |
| Dukarun Guide     | GitBook  | The public, searchable help experience for Dukarun.         |
| Category          | GitBook  | A primary business area such as Products or Selling.        |
| Article           | GitBook  | The canonical explanation of one task, concept, or problem. |
| Interactive guide | Usertour | An optional in-app companion to a task article.             |
| Journey           | Usertour | An ordered checklist that connects several task guides.     |
| Video             | YouTube  | An optional demonstration embedded in an article or flow.   |
| Glossary term     | GitBook  | The canonical definition of one business term.              |

An article must stand on its own. An interactive guide may point to the article for explanation,
and the article may launch the guide when one exists. A journey references guides in business order.
A video supports an article or guide but never replaces the written steps.

Keep both parts of the relationship visible. Every guide-backed GitBook article contains an
**Interactive guide** callout with its canonical `https://app.dukarun.com/learn/<content-key>` link.
The link uses `target="_top"`, so it replaces the current top-level page instead of opening another
tab or loading Dukarun inside the docs frame. When the article is opened through an exact
`/help/topics/<content-key>` or `/help/journeys/<content-key>` application route, Dukarun also shows
a prominent launch button above the article and the official GitBook embed shows the same action.
Those first-party actions use the Angular router, start the canonical Usertour content ID, and
preserve the current origin for localhost testing.

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

Use only selectors of the form `[data-learning-anchor="..."]`. Every flow has one explicit launch
anchor in `LEARNING_CONTENT_REGISTRY`; its first visible step must target that same anchor. Use an
element-present condition for later steps that depend on an asynchronous modal or form stage.
Usertour allows two seconds for a target to appear. The app does not add another selector wait.
JavaScript evaluation is disabled by the app. Do not configure Usertour's Resource Center.

Treat form steps as actions, not slides. The prompt must name the field and tell the user what to
enter. Do not offer a generic **Next** action while required input is empty. Configure **User fills
in input** or **Text input value is** on the relevant `data-learning-anchor`, then advance when the
condition is met or enable a clearly labelled **I have entered this** action. For buttons and
selectors, advance when the user clicks the highlighted application control instead of adding a
second Next button. Keep dismissal available on every visible step. Test each flow from a clean
account and confirm that clicking through without completing the task is impossible.

The financial recap should navigate through `financial-dashboard` (revenue and margin),
`financial-stock`, `financial-cash`, `financial-credit` (payables and receivables), and
`financial-revenue-margin` (revenue, COGS, and gross margin). These anchors point to real views; do
not reproduce or calculate financial values inside Usertour.

## Identity and privacy

Configure `USERTOUR_SIGNING_SECRET` only in Supabase Edge Function secrets. The browser obtains a
15-minute identity token containing only the authenticated user UUID and active company UUID.
Membership attributes are boolean permissions. Events contain only a stable event name. URLs sent
to Usertour have query strings, fragments, and UUID path segments removed.

The identity Edge Function relies on Supabase gateway JWT verification and reads the validated user
and active-company claims directly. Keep `verify_jwt = true` for `usertour-identity`. This avoids an
extra Auth request during guide startup. Dukarun starts loading the Usertour SDK as soon as the
authenticated shell opens and identifies the user in the background once permissions are ready.
The company membership update is queued outside the explicit launch path so it cannot delay the
first visible guide step. A launch opens the relevant Dukarun screen, schedules the Usertour start,
and returns immediately. There is no preparation overlay and no application-level target wait.
Production-authored Dukarun URLs are mapped back through the current Angular router, so localhost
does not load the deployed app between steps. Interactive learning must never block ordinary
business work.

### Launch latency

The Usertour SDK (`@usertour/sdk`, served from `js.usertour.io`) awaits a server acknowledgement
over its WebSocket for every operation: identify, content start, each step advance (`GO_TO_STEP`),
and checklist task clicks all wait for `api.usertour.io` before the UI proceeds. On slow or
high-latency connections this adds several seconds to the first visible step and to each step
click, and it cannot be removed application-side without patching the vendor bundle. Dukarun's
launch path therefore overlaps identification with routing and never holds the app for vendor
responses.

The breakdown is visible in the browser console by default: launches log
`[learning] <phase>: <ms>` for navigation, the identity-token Edge Function call, SDK
identification, and the Usertour start, plus a line whenever the SDK requests an in-app
navigation. Silence the logging with `localStorage.setItem('dukarun:learning-timing', '0')`.

For local testing, put `USERTOUR_SIGNING_SECRET` in the gitignored
`supabase/functions/.env`, then restart the local stack with `npm run sb:stop` followed by
`npm run sb:start`. Supabase loads this file into local Edge Functions. A 503 response from
`/functions/v1/usertour-identity` with `usertour_configuration_missing` means the local runtime did
not receive that secret. Do not add an unsigned localhost identity path; local testing should use
the same signed-token flow as production.

## GitBook publishing

Import `gitbook-import` into the public, search-indexed `en-KE` space at
<https://dukarun.gitbook.io/docs/>. That site is Dukarun's built-in default for
`GITBOOK_SITE_URL`; an environment value can still override it for preview spaces. Keep all supplied
slugs stable. Edit articles, relationships, video embeds, and glossary entries in GitBook after
import; these changes require no Dukarun deployment.

GitBook serves its embed with `frame-ancestors https:`. Dukarun therefore embeds Dukarun Guide in
the deployed HTTPS app and presents a first-party “Open Dukarun Guide” fallback in HTTP development
previews instead of showing the browser's refused-to-connect page. Run `npm run dev:web:https` and
accept the local development certificate once to exercise the real GitBook frame on localhost.
Component tests mock only the frame transport; article titles, hierarchy, search results, and videos
still come exclusively from GitBook.

The official embed follows Dukarun's light/dark `color-scheme`. Its accent color is owned by the
canonical GitBook site's customization rather than app CSS (the frame is cross-origin); set the
GitBook primary color to Dukarun orange `#e85d2f` so both the public and embedded docs match.

Expose GitBook's Assistant, Search, and Docs tabs. Search includes question suggestions that hand
off to the Assistant; hiding that tab leaves those suggestions visibly clickable but inert. Keep
Assistant suggestions and tools site-owned instead of overriding them with empty application
configuration. Keep GitBook's site-wide External links setting on **same tab**. The application
cannot override a target chosen by GitBook inside its cross-origin frame, so the article CTAs also
declare `target="_top"`. Dukarun's first-party button and official embed action call the application
router and preserve the current origin, including localhost.

Before publishing, verify every external link and use a non-production app origin when importing
into a non-production space. Keep the `## Video` section in every task article and journey. Until a
task-specific walkthrough is ready, use the approved Dukarun overview at
<https://youtu.be/dfykDyK6Fs8> as an explicitly labelled placeholder. Use GitBook's native embed
block so the video plays on the page. Replace the URL in GitBook when the task-specific YouTube
upload is approved; this does not require a Dukarun deployment.

## Rollout and future edits

GitBook is live first and remains the canonical content source. For a Usertour change, fork the live
version, validate it with internal accounts, then publish it to the production environment. Existing
content IDs stay stable across versions, so wording, steps, and future YouTube embeds do not require a
Dukarun deployment. Clear `USERTOUR_TOKEN` in a build to disable all interactive guides without
affecting Dukarun Guide or ordinary business actions.

Vendor failures are non-blocking: ordinary business actions must still succeed.
