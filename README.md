# Dukarun

<p align="center">
  <img src="./assets/logo/dukarun-withtext-light.svg" alt="Dukarun logo" width="280" />
</p>

> **AI-powered point-of-sale system for modern small businesses**

Dukarun helps shopkeepers ditch manual data entry and expensive barcode scanners. Use your phone's camera to instantly recognize products, process sales, and manage inventory—all powered by custom AI trained on your products.

[![Tests](https://github.com/kisinga/Dukarun/actions/workflows/test.yml/badge.svg)](https://github.com/kisinga/Dukarun/actions/workflows/test.yml)
[![Coverage](https://codecov.io/gh/kisinga/Dukarun/branch/main/graph/badge.svg)](https://codecov.io/gh/kisinga/Dukarun)
[![Backend Coverage](https://codecov.io/gh/kisinga/Dukarun/branch/main/graph/badge.svg?flag=backend)](https://codecov.io/gh/kisinga/Dukarun)
[![Frontend Coverage](https://codecov.io/gh/kisinga/Dukarun/branch/main/graph/badge.svg?flag=frontend)](https://codecov.io/gh/kisinga/Dukarun)

## Quick Start

> **First time?** Run `npm i` at the project root first.

```bash
# 1. Install dependencies (required first time)
npm i

# 2. Start development (docker + all services)
npm run dev

# Troubleshooting?
npm run setup
```

## Quick Links

- 🚀 **[Setup & Deployment](./docs/INFRASTRUCTURE.md)** - Get started, deploy anywhere
- 🆕 **[Fresh Setup](./docs/INFRASTRUCTURE.md#fresh-setup)** - First-time installation guide
- 🏗️ **[Architecture](./ARCHITECTURE.md)** - System design and decisions
- 🤖 **[ML Guide](./docs/ML_TRAINING_SETUP.md)** - AI model training
- 🗺️ **[Roadmap](./ROADMAP.md)** - Planned features

- **[Frontend Architecture](./frontend/ARCHITECTURE.md)** - Angular app structure
- **[POS Guide](./frontend/POS_README.md)** - Point-of-sale workflow
- **[Feature Catalog](./docs/customer-features/FEATURE_CATALOG.md)** - Customer-facing capabilities

## Current Status

**Version:** 2.0 (Active Development)  
**Stack:** Angular + Vendure + PostgreSQL  
**V1 Archive:** See [V1 Migration](./docs/v1-migration/MIGRATION_SUMMARY.md)

## Core Features

- 🎯 **AI Product Recognition** - Camera and barcode product lookup
- 💰 **POS (Sell)** - Checkout, payments, cashier flow
- 📦 **Products & stock** - Catalog, variants, stock adjustments
- 📊 **Sales, orders, payments** - Orders, payments, credit
- 👥 **Customers & suppliers** - Unified people, statements, purchases
- 📒 **Accounting** - Ledger, expenses, transfers
- ✅ **Approvals** - User and channel approval flows
- 🏪 **Multi-location** - Stock locations, channel-scoped data
- 📱 **Mobile-first** - Responsive dashboard

## Tech Stack

| Component      | Technology                           |
| -------------- | ------------------------------------ |
| **Frontend**   | Angular 19 + daisyUI + Tailwind CSS  |
| **Backend**    | Vendure (NestJS) + TypeScript        |
| **Database**   | PostgreSQL 16                        |
| **Cache**      | Redis 7                              |
| **ML**         | TensorFlow.js (client-side)          |
| **Deployment** | Container images (platform-agnostic) |

## Project Structure

```
dukarun/
├── assets/           # Brand assets (logos in assets/logo/)
├── backend/          # Vendure server & worker
├── frontend/         # Angular SPA
├── configs/          # Shared configuration
└── docs/             # Documentation & assets
```

## Getting Started

```bash
# Clone repository
git clone https://github.com/yourusername/dukarun.git
cd dukarun
```

**Next:** See [INFRASTRUCTURE.md](./docs/INFRASTRUCTURE.md) for complete setup instructions, including Docker Compose configuration, network architecture, and deployment guides.

## Contributing

This is currently a private project. For questions or contributions, contact the maintainers.

## License

Proprietary - All rights reserved

---

**Built with ❤️ for African small businesses**
