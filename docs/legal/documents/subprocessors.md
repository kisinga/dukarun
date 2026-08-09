# Subprocessors

This document lists service providers used to operate Dukarun and explains their purpose.

## Infrastructure and network security

- Cloudflare provides DNS, proxying and network security.
- Dukarun uses a self-hosted Supabase software stack for database, authentication, storage, realtime services and edge functions.

## Subscription payments

- Paystack processes subscription payment requests, verification and payment webhooks.

## Communications

- TextSMS delivers one-time codes, receipts, reminders and other SMS messages.
- WhatsApp and a Dukarun-managed OpenWA gateway deliver merchant-authorized WhatsApp messages.
- A configured email delivery service sends operational and support email.

## Provider changes

Before adding a provider that processes merchant personal data, Dukarun reviews its purpose, access, security and data protection terms.

We update this document when a material provider changes and give notice where the Data Processing Addendum or applicable law requires it.
