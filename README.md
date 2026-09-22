<div align="center">

<img src="./public/octagem.png" alt="OctaGem Logo" width="360" />

# OctaGem — Enterprise Diamond, Jewelry & Watch ERP

**Next-Generation Inventory, Custody Tracking, Memo Ledger & Business Management Platform**

[![React](https://img.shields.io/badge/React-19.2-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-5.4-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/License-Proprietary-red.svg)](#license)

</div>

---

## 📌 Executive Overview

**OctaGem** is an enterprise-grade ERP system custom-built for diamond manufacturers, jewelry wholesalers, watch dealers, and luxury retailers. Engineered to manage high-value physical inventory with zero margin for error, OctaGem provides real-time visibility across single stones, bulk parcels, consignment memos, custody transfers, purchase orders, sales transactions, and multi-location vaults.

---

## ✨ Key Modules & Capabilities

### 💎 Advanced Inventory Management
- **Multi-Category Asset Support**: Dedicated tracking for Loose Diamonds, Finished Fine Jewelry, Luxury Watches, and Gemstone Parcels.
- **Detailed Attribute Catalog**: Carat weight, color, clarity, cut, certification (GIA, IGI, HRD), serial/SKU numbers, metal purity, and stone origin.
- **Physical Media Vault**: High-resolution image galleries and video attachments per stock item.
- **Ledger-Style Stock Tracking**: Immutable transaction logs for stock intake, location moves, transfers, and price updates.

### 🏷️ RFID & Barcode Serialization
- Scan-ready integration for high-speed RFID readers and 1D/2D barcode tags.
- Instant batch scanning for stock take, location audits, and quick intake.

### 📜 Memo In & Memo Out (Custody Ledger)
- **Consignment Tracking**: Monitor gems and watches sent out on memo to clients or received from suppliers.
- **Custody Transfer Workflows**: Full audit trail tracking who holds physical possession at any moment.
- **Aging & Expiry Alerts**: Instant alerts for overdue memos and pending returns.

### 💼 Quotations, Sales Orders & Invoicing
- **Commercial Documents**: Generate print-ready Quotations, Sales Orders, Memo Slips, and Tax Invoices with custom terms and letterheads.
- **Multi-Currency & Tax Rates**: Flexible line-item pricing, discounts, and regional tax computations.

### 📦 Vendor & Purchase Order Management
- Vendor onboarding with tax IDs, payment terms, and contact profiles.
- Automated purchase order lifecycle from draft to receiving and vendor bill settlement.

### 🎨 Dynamic White-Label Branding Engine
- **Custom Corporate Identity**: Live recoloring via primary/secondary HSL tokens (`bg-primary`, `text-primary`).
- **Logo Asset Uploads**: Support for Primary Horizontal Logo, Brand Mark/Icon, Light Logo, and custom Favicons.
- **Print Header Branding**: Dynamic corporate header and logo application on printable PDF/document layouts.

### 🛡️ Role-Based Access Control (RBAC) & Custom Fields
- **Granular Permissions**: Module-level view, create, edit, delete, and workflow permissions per user role.
- **Dynamic Field Schemas**: Configure custom metadata attributes per category without modifying source code.

---

## 🛠️ Technology Stack

| Layer | Technology |
|---|---|
| **Frontend Framework** | [React 19](https://react.dev/) |
| **Language** | [TypeScript 5.5](https://www.typescriptlang.org/) |
| **Build Tool & Bundler** | [Vite 5.4](https://vitejs.dev/) with SWC React Plugin |
| **UI Primitives & Design System** | [Radix UI](https://www.radix-ui.com/) & [Shadcn UI](https://ui.shadcn.com/) |
| **Styling & Animations** | [Tailwind CSS 3.4](https://tailwindcss.com/) & `tailwindcss-animate` |
| **Iconography** | [Lucide React](https://lucide.dev/) |
| **Routing** | [React Router v7](https://reactrouter.com/) |
| **Form Handling & Validation** | [React Hook Form](https://react-hook-form.com/) & [Zod](https://zod.dev/) |
| **Toast Notifications** | [Sonner](https://sonner.emilkowal.ski/) |

---

## 📁 Repository Structure

```
web/
├── public/
│   ├── octagem.png          # Primary Horizontal Brand Logo
│   ├── octagemmark.png      # Brand Mark / Square Icon
│   └── favicon.png          # Browser Favicon
├── src/
│   ├── components/          # Reusable UI & Layout Components
│   │   ├── documents/       # Printable Quotes, Invoices, Memo Slips
│   │   ├── layout/          # AppShell, AppSidebar, Headers & Protected Routes
│   │   ├── rbac/            # Permission Gate & Control Components
│   │   ├── settings/        # Master Data, RBAC, Branding & Business Editors
│   │   └── ui/              # Radix/Shadcn UI Primitives
│   ├── constants/           # Global Site Config & Navigation Schema
│   ├── contexts/            # React Auth & Dynamic Branding Contexts
│   ├── data/                # Mock Data Catalogs (Inventory, Users, Customers)
│   ├── features/            # Core Domain Modules (Auth, Inventory, Memos, Sales, Vendors)
│   ├── lib/                 # State Stores, Branding Engine & Utility Helpers
│   │   ├── api/             # Client API Abstractions
│   │   └── store/           # Reactive Storage Controllers (Zustand/Local Pattern)
│   └── types/               # TypeScript Definitions (Inventory, Orders, RBAC)
├── index.html               # Entry HTML Template
├── package.json             # Manifest & Dependencies
├── tailwind.config.ts       # Design Tokens & Palette Config
├── tsconfig.json            # TypeScript Compiler Configuration
└── vite.config.ts           # Vite Bundler Settings
```

---

## 🚀 Getting Started

### Prerequisites

Ensure you have the following installed on your development system:
- **Node.js**: `v18.0.0` or higher
- **npm**: `v9.0.0` or higher (or `pnpm` / `yarn`)

### Installation & Local Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/hrishabhsinghstack/octagem.git
   cd octagem
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Start the local development server**:
   ```bash
   npm run dev
   ```
   The application will be accessible at `http://localhost:5173`.

4. **Demo Sign-in Credentials**:
   - **Email**: `jordan@octagem.demo`
   - **Password**: `octagem123`

---

## ⚙️ Available Scripts

In the project directory, you can run:

- `npm run dev`: Starts the Vite development server with Hot Module Replacement (HMR).
- `npm run build`: Compiles TypeScript (`tsc -b`) and bundles production-ready static assets into `dist/`.
- `npm run preview`: Bootstraps a local HTTP server to preview the built `dist/` production files.

---

## 🔗 Remote Repository & Deployment

- **GitHub Repository**: [https://github.com/hrishabhsinghstack/octagem.git](https://github.com/hrishabhsinghstack/octagem.git)
- **Deployment Strategy**: Build output from `dist/` can be deployed directly to Vercel, Netlify, AWS S3 / CloudFront, or any static Web Server (Nginx / Caddy).

---

## 📝 Documentation & Release Guidelines

Refer to [GIT_COMMIT.md](./GIT_COMMIT.md) for detailed release instructions, commit specifications, and deployment steps.

---

## 📄 License

Copyright © 2026 **OctaGem**. All rights reserved.
