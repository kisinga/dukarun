# Changelog

All notable changes to Dukarun will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2025-10 (In Development)

### Major Changes

- **Complete architecture migration from V1 to V2**
  - Migrated from PocketBase (Go + SQLite) to Vendure (TypeScript + PostgreSQL)
  - Replaced Alpine.js frontend with Angular 19
  - Implemented GraphQL API replacing REST endpoints

### Added

#### Backend

- Vendure-based headless commerce platform
- PostgreSQL 16 database with proper indexing
- Redis 7 for caching and session management
- GraphQL API with type-safe schema
- Multi-tenancy via Vendure Channels
- Background worker for async tasks

#### Frontend

- Angular 19 SPA with standalone components
- daisyUI + Tailwind CSS design system
- RxJS-based state management
- Apollo GraphQL client integration
- Responsive mobile-first UI
- Offline-capable PWA foundation

#### ML Integration

- TensorFlow.js client-side inference
- Static file-based model storage
- IndexedDB model caching
- Per-channel model management
- metadata.json versioning system

#### Infrastructure

- Docker Compose development environment
- Centralized configuration system
- Auto-populated development database
- Health check monitoring
- Volume-based data persistence

### Changed

- **Authentication**: Cookie-based → JWT tokens
- **Database**: SQLite → PostgreSQL
- **Frontend Framework**: Alpine.js → Angular
- **API Style**: REST → GraphQL
- **Deployment**: Single binary → Containerized services

### Documentation

- Created comprehensive ARCHITECTURE.md
- Consolidated ML_GUIDE.md
- Updated INFRASTRUCTURE.md
- Created V1 migration archive
- Streamlined docs/README.md
- Updated root README.md

### Recent additions (July 2026)

#### WhatsApp and outbound communication

- WhatsApp integration via OpenWA Gateway for business notifications.
- Platform toggles for SMS, email, and WhatsApp channels in Global Settings.
- Test WhatsApp sends that bypass channel gates so operators can verify setup before going live.
- Message templates for shift opened, shift closed, and balance changed triggers.
- WhatsApp shift open/close alerts sent to financial admins.
- Customer notification kill switch and per-customer notification preference.

#### Ledger and SSOT consolidation

- Order and purchase reconciliation to consolidate operational records into the ledger.
- Trust ledger or trust model options when reconciling partially paid orders.
- Customer and supplier balance alignment tools that keep the ledger as the source of truth.
- Ledger divergence scanner and audit script to confirm inventory, AP, and AR match the ledger.
- Shift reconciliation backfill to keep cashier session records consolidated with the ledger.

### Preserved from V1

- Multi-tenancy business model
- ML-powered product recognition
- Point-of-sale workflows
- Inventory management concepts
- Credit sales functionality
- Multi-location support
- Complete V1 codebase archived in docs/v1-migration/

---

## [1.0.0] - 2024-07

### Initial Release (PocketBase)

#### Features

- Basic point-of-sale functionality
- Product catalog with photo management
- ML-powered product recognition (TensorFlow.js)
- Multi-company support
- User authentication and authorization
- Admin dashboard with company management
- Sales transaction recording
- Inventory tracking
- Credit sales with customer management
- Photo export functionality
- Financial logs and reporting

#### Tech Stack

- Backend: Go + PocketBase
- Database: SQLite
- Frontend: Alpine.js + Vanilla JavaScript + Bootstrap 5
- Templates: Go templates (templ library)
- ML: TensorFlow.js + Teachable Machine

#### Business Requirements Met

- Solved manual inventory tracking problem
- Eliminated need for barcode scanners
- Provided real-time sales recording
- Enabled multi-location management
- Supported customer credit tracking

---

## Migration Notes

### V1 → V2 Migration Guide

**Complete migration documentation available at:**

- [docs/v1-migration/MIGRATION_SUMMARY.md](./docs/v1-migration/MIGRATION_SUMMARY.md)

**Key Migration Areas:**

1. Business Logic - All workflows documented and preserved
2. Data Models - Complete schema mapping from SQLite to PostgreSQL
3. API Endpoints - GraphQL equivalents for all REST endpoints
4. UI Components - Angular components replacing Go templates
5. State Management - RxJS replacing Alpine.js stores
6. Authentication - JWT implementation replacing cookies

**Migration Status:** ✅ Complete
**V1 Archive:** Fully preserved in docs/v1-migration/

---

## Upcoming (Roadmap)

See [ROADMAP.md](./ROADMAP.md) for detailed future plans.

### Phase 1: Core POS (Q1 2026)

- Bulk product import (CSV/Excel)
- Product variants and combinations
- Cashier role with two-step workflow
- Pro-forma invoice printing
- Multiple payment methods per sale
- Stock adjustments and transfers

### Phase 2: Analytics (Q2 2026)

- Sales trends and reporting
- Revenue by location
- Profit margin analysis
- Inventory valuation
- Visual charts and dashboards

### Phase 3: Mobile PWA (Q3 2026)

- Install prompt and offline mode
- Push notifications
- Biometric login
- Haptic feedback
- Virtual scrolling optimization

### Phase 4: ML & Automation (Q4 2026)

- Auto-training triggers
- SKU-level detection
- Voice commands
- Smart categorization
- Python microservice for GPU acceleration

---

**Last Updated:** October 2025  
**Current Version:** 2.0.0-dev  
**Status:** Active Development
