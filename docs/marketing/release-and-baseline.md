# Conversion release and editorial handover

## Review the implementation

The local fixture preview runs at `http://127.0.0.1:4202/`. Contact is `/contact?intent=demo`; setup is `/contact?intent=setup`. Fixture mode uses one test article at `/blog/keep-stock-and-cash-in-step`. Prepared articles in the local `blog-content.json` package are handover material for manual editing and publication in the admin portal. They are not build inputs and do not appear in fixture mode. Fixture prices are demonstration values, not published offers.

Run `npx playwright test -c playwright.marketing.config.ts` for the focused browser suite; it starts or reuses the site preview. If using a locally installed Chrome rather than Playwright Chromium, set `BROWSER_CHANNEL=chrome`. Tests use the small, self-contained article in `public-content.fixture.ts`. Live articles come from the existing admin publishing workflow; publishing an article does not require a code commit or rebuild.

To refresh the actual application screenshots, run `CAPTURE_WORKFLOWS=1 npx playwright test -c playwright.marketing.config.ts`. This separate capture utility starts or reuses the site and application previews and writes PNGs to `dukarun-workflows` under the operating system's temporary directory for review and conversion to the checked-in WebP assets. It is excluded from routine end-to-end tests.

The counter and screenshots use fictional **Mwangaza Electricals**, an established shop with one location and two counter staff. The counter starts with four bulbs and two sockets for KES 1,900; recording it reduces their quantities from 31 to 27 and 18 to 16. Quantity limits prevent overselling, and reset restores the sample. The shared catalogue in `packages/marketing-demo.ts` also drives the actual application captures.

The credit example is an electrician customer’s older balance; the closing example covers a separate trading day. Priority guides and the sales playbook use these same distinctions and figures. The salon article retains its supporting service-business role.

The screenshots show the actual application with mocked fictional data. No customer sale, payment or communication is performed. Captions identify the workflow and benefit. Testimonials remain as previously requested, without new verification claims.

## Validation — 8 October 2026

| Check                                          | Result                                                                     |
| ---------------------------------------------- | -------------------------------------------------------------------------- |
| Site unit tests                                | 12 passed                                                                  |
| Site component tests                           | 13 passed                                                                  |
| Focused site browser journeys                  | 12 passed in Chrome                                                        |
| Contract suite                                 | 75 passed, including browser/crawler rendering and Docker inputs           |
| Static/design guards and prerendered artifacts | Passed                                                                     |
| Production builds                              | All four passed for the initial implementation; site rebuilt after cleanup |
| Marketing test configuration                   | Type check passed; capture utility discovered separately                   |

Browser checks cover the electricals basket, keyboard quantity reduction, stock limits, one stock reduction per sample sale, reset and the attributed demo handoff, plus 360px, 390px, tablet and desktop, keyboard access, form validation, modified registration clicks, analytics failure and the no-JavaScript fallback. The article → cash-up → enquiry regression confirms that source, campaign and the recorded blog reference reach the prepared message while entered cash-up figures stay out of site requests and analytics. Qualification controls enable when JavaScript is ready, preventing early input from being lost; answers stay in memory and have no native form names.

Build checks used fixture public data. Production release must use the existing live environment configuration. The application's existing registration redirect retains `blog_ref` but drops UTM fields; the website's outgoing link carries them. The web build's existing bundle, cart-style and ExcelJS warnings remain. No production deployment, article publication or distribution was performed.

## Publish through the existing editorial workflow

`docs/marketing/blog-content.json` contains six updates and two new articles. Each `draft` uses the existing editorial fields: `slug`, `title`, `excerpt`, `markdown`, `authorName`, `coverImagePath`, `coverImageAlt`, `tags`, `seoTitle` and `seoDescription`.

For an **update**, select the existing article by its unchanged slug in the editorial studio and save these fields as a new draft of that post. When using `platform_save_blog_draft`, provide that existing post's `postId`. Do not create a replacement post. `publishedAt` in the package records the original history; it is not an input to the draft-save RPC. Keep the existing publication date and cover asset.

For a **new guide**, create a draft with its specified slug and author. Publication sets its real publication date; the preview date is illustrative. Review metadata, the screenshot alt text, the supported Markdown and contextual links. Do not use a database seed migration or write directly to publication tables.

Deploy the website assets and public-content renderer through the existing release workflow before publishing articles that reference the new screenshots and enquiry route. Publish the priority existing revisions first, then both new guides and supporting revisions. Cross-links to the new guides become public when those guides are published; coordinate these editorial actions in the same release window. Check browser and crawler HTML after publication, then confirm dynamic sitemap entries and canonical URLs. Roll back a draft revision through the existing editorial controls if needed.

Production deployment and article publication are separate release actions. This implementation does not perform either action or distribute the sharing copy.

## Search Console baseline

Source: `dukarun.com-Performance-on-Search-2026-10-06.zip` supplied in Downloads. The chart covers 10 August–3 October 2026 and totals **100 site impressions and 12 clicks**. All observed clicks went to the homepage. The Page export totals 228 impressions because page-level aggregation differs from site-level aggregation; do not add it to the chart total.

The three article URLs exposed in the export had **26 impressions and zero clicks** in total. The blog index had 23 impressions. Only two queries were exposed, with three impressions; the export does not provide a complete query distribution. Observed traffic was Kenya/mobile. These small totals cannot establish ranking causes or prove that the other articles are unindexed.

The account owner must provide URL Inspection results for all six existing articles, the blog index and the two new guides after publication: indexed status, Google-selected canonical, last crawl, crawl permission and live-test result. Where Google chose a different canonical or did not index a page, investigate that specific evidence before changing technical settings.

Review enquiries and lead quality weekly using the sales playbook. Compare search trends after 6–8 weeks using the same pages, country, device and date-window definitions; account for publication dates. Review impressions, clicks, queries and page visibility alongside received enquiries. No traffic increase is promised.
