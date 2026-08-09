# Legal and privacy release gate

The files in `docs/legal/documents` are the editable source documents. Supabase stores the exact
Markdown snapshot that is published through super-admin. Editing Git alone does not publish them.
The public applications read Supabase directly and do not ship a fallback copy.

## Approval checklist

- Registered contracting entity, company number, registered address and trading-name authority.
- A named owner and response process for the operational `hello@dukarun.com` mailbox.
- ODPC controller/processor registration assessment and certificate details where applicable.
- Production provider legal names, contracts, processing countries and transfer safeguards.
- Subscription renewal, tax, cancellation, refund, price-notice and support policies.
- Warranty, liability cap, indemnity, governing-law and dispute wording.
- Data-category retention periods and backup-deletion behavior.
- Final Privacy Notice, Terms, DPA and subprocessor register.

## Publishing a version

1. Edit the relevant Markdown file in `docs/legal/documents` and review it through Git.
2. Run `node scripts/verify-legal-documents.mjs` and retain the printed hash.
3. In super-admin, create or open a draft, paste the Markdown, enter the version and dates, and save.
4. Preview the draft and confirm that its calculated hash matches the Git hash.
5. Publish the draft. Published snapshots are immutable and the previous version is superseded.
6. For material Terms changes, set an enforcement date at least 14 days after publication and
   require company acceptance.
7. Notify authorized company administrators and monitor status in super-admin.

The effective date must be today or earlier when the document is published. Future scheduling is
not part of this workflow.

The hash covers the exact normalized Markdown, including formatting. A material Terms change must
use a new version and require company reacceptance. Privacy changes use a new version and notice,
but are not represented as consent.

## Internal runbooks

- [Privacy requests](PRIVACY_REQUESTS.md)
- [Incident response](INCIDENT_RESPONSE.md)
- [Compliance operations](COMPLIANCE_OPERATIONS.md)
