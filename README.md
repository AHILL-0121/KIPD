# Kipd

Multi-tenant hotel and restaurant management. One deployment serves many properties; each property's data is isolated
by tenant. Hotels get a booking calendar, stay billing and GST invoices. Restaurants get QR table ordering, a kitchen
display and separate bills. An optional Android shell can read UPI payment notifications on a front-desk device and match
them to open bills.

This repository is a single Next.js application (`frontend/`) with a Capacitor Android project inside it
(`frontend/android/`).

## Contents

- [Features](#features)
- [Technology](#technology)
- [Project layout](#project-layout)
- [Roles and permissions](#roles-and-permissions)
- [Tenant isolation](#tenant-isolation)
- [Settings](#settings)
- [Payments](#payments)
- [Real-time updates](#real-time-updates)
- [Android app](#android-app)
- [Configuration](#configuration)
- [Local development](#local-development)
- [Database and migrations](#database-and-migrations)
- [Testing and CI](#testing-and-ci)
- [Known limitations](#known-limitations)

## Features

### Hotel

- **Bookings calendar.** A room timeline showing each booking's state. Overlapping bookings for the same room are
  rejected by the database itself (an `EXCLUDE` constraint, `bookings_no_overlap`, added in migration `0002`), so two
  guests cannot take the last room at the same moment even if application code has a bug.
- **Stay bills.** Room charges, deposits and payments on one bill per stay. A restaurant bill can be posted to an
  in-house guest's room and settled at checkout.
- **GST invoices.** A4 tax invoices numbered per property and financial year. Numbers come from `invoice_counters`,
  incremented in the same statement that stamps the bill, so there are no gaps or repeats. Issuing stores a frozen copy of who billed whom
  (`bills.invoice_data`); a number is assigned once and an issued invoice is never edited.
- **Credit notes.** Corrections to an issued invoice are made with a credit note, not by changing the invoice.
- **Public booking page** (`/book/<slug>`) for guests, rate limited.

### Restaurant

- **QR table ordering.** Guests open the menu from a table QR code (`/menu/<slug>`) and place orders without an account.
- **Kitchen display (KDS)** per outlet, updated live.
- **Menu management.** An item that has appeared on an order is hidden rather than deleted, so historical bills and
  reports stay correct.
- **Restaurant bills** are kept separate from hotel bills.

### Platform

- Platform admin area (`/admin`) for tenants, users and platform statistics.
- Staff invitations by email, with role assignment.
- Analytics: occupancy and revenue breakdowns.
- Per-tenant time zone, which decides what "today" means for bookings and reports.

## Technology

| Area | Choice |
| --- | --- |
| Application | Next.js 14 (App Router), React, TypeScript |
| Styling | Tailwind CSS |
| Database | PostgreSQL on Neon, Drizzle ORM, SQL migrations via drizzle-kit |
| Authentication | Clerk |
| Validation | zod |
| Online payments | Razorpay payment links and webhooks |
| Email | SMTP (staff invitations, access requests) |
| Rate limiting | Upstash Redis, with an in-memory fallback |
| File storage | Vercel Blob |
| Android | Capacitor, with a native Java notification listener |
| Tests | Vitest |
| Hosting | Vercel |

## Project layout

```
.
├── .github/workflows/        CI (types, lint, tests, build) and Android APK build
└── frontend/
    ├── android/              Capacitor Android project, including UPIListenerService.java
    ├── drizzle/              SQL migrations, snapshots, and RUNBOOK.txt
    ├── scripts/              db-drift, db-reset, create-platform-admin
    ├── src/
    │   ├── app/
    │   │   ├── api/          Route handlers (billing, bookings, orders, settings, webhooks, public, ...)
    │   │   ├── dashboard/    Staff UI: bookings, rooms, orders, restaurant, kds, billing, analytics, staff, settings
    │   │   ├── admin/        Platform admin UI
    │   │   ├── book/, menu/  Public guest pages
    │   │   └── (auth)/       Sign-in and sign-up
    │   ├── components/       UI, billing, bookings, settings, landing, mascot
    │   ├── db/schema.ts      The database schema (source of truth for migrations)
    │   ├── lib/              auth and roles, GST and invoice maths, settings parsing, rate limiting, realtime, ...
    │   └── middleware.ts     Clerk middleware and the list of public routes
    └── tests/                Vitest suites
```

## Roles and permissions

Roles are enforced on the server in `src/lib/auth.ts` (`requireTenant(ROLES.x)`), not just hidden in the sidebar.

| Role | Intended use |
| --- | --- |
| `owner` | Everything, including settings and staff |
| `manager` | Everything, including settings and staff |
| `front_desk` | Bookings, rooms, hotel billing and invoices |
| `waiter` | Orders and billing for restaurant tables |
| `kitchen` | Kitchen display and order status |

The groups used by the API:

| Group | Roles | Typical use |
| --- | --- | --- |
| `manage` | owner, manager | Changing settings, staff, tax and payment configuration |
| `frontDesk` | owner, manager, front_desk | Bookings, invoices |
| `orders` | owner, manager, waiter | Taking and editing orders |
| `kitchen` | owner, manager, waiter, kitchen | Kitchen display |
| `billing` | owner, manager, front_desk, waiter | Reading bills and receipt/payment settings, recording payments |

A suspended or deleted tenant is blocked on every tenant route. Role changes can take up to about a minute to apply,
because roles are cached.

## Tenant isolation

- Every tenant-owned table has `tenant_id NOT NULL`.
- Foreign keys between tenant-owned tables are composite, `(tenant_id, parent_id)` referencing `parent(tenant_id, id)`.
  A row cannot reference another tenant's parent even if a query forgets a filter.
- The tenant is taken from the signed-in session, never from the request body.
- Guest-facing routes under `/api/public/` resolve the tenant from the slug in the link, are rate limited, and return
  only public data (the menu, room types).
- `tests/tenant-isolation.test.ts` and `tests/integrity.test.ts` attempt cross-tenant reads and writes against the real
  schema and must keep passing.

## Settings

Settings live under Dashboard > Settings. They are stored per tenant in the database, so every staff member and every
device sees the same configuration. Only owners and managers can change them.

| Card | Storage | Notes |
| --- | --- | --- |
| Property: name, currency, check-in time, check-out time, timezone | `tenants.name`, `tenants.timezone`, `tenants.property_settings` | Timezone is an IANA name and is validated. |
| Receipt layout: header, subtext, footer | `tenants.receipt_settings` | Printed on restaurant and stay bills. |
| Payments | `tenants.payment_settings` | Allowed manual methods, online payment links, suggested deposit. |
| Tax and invoices | `tenants.tax_settings` | GSTIN, address, state, how room GST is charged, invoice prefix and footer. |

Behaviour worth knowing:

- An empty stored object means "use the defaults". Parsing with defaults happens in `src/lib/property-settings.ts`,
  `src/lib/payment-settings.ts` and `src/lib/gst.ts`.
- Requests are validated with zod and rejected with a 400 if invalid.
- Changing the tax profile affects bills opened afterwards. Bills already open keep the tax they were opened with, and
  issued invoices never change.
- Endpoints: `GET`/`POST`/`PATCH /api/settings` (property and receipt), `GET`/`PUT /api/settings/payments`,
  `GET`/`PUT /api/settings/tax`.

The browser's `localStorage` is used for two per-device preferences only: whether the sidebar is collapsed and the last
menu category selected. No business configuration is stored there.

## Payments

Staff can record payments manually (cash, UPI, card, bank transfer). Which methods are offered is controlled by the
Payments setting. Two automated paths exist:

1. **Razorpay payment links and UPI QR codes**, for hotel and restaurant bills. Each business connects its **own**
   Razorpay account in Settings > Payments (owner only), so the money settles to its own bank account and never passes
   through the platform. The Key Secret and the webhook secret are stored encrypted with `PAYMENT_KEYS_SECRET` and are
   never sent to a browser. Razorpay calls `POST /api/webhooks/razorpay/<tenant id>` (the exact address is shown in
   Settings) with the `payment_link.paid` and `qr_code.credited` events. That route is public in the Clerk middleware
   and instead verifies Razorpay's signature using that business's own webhook secret. A unique index on
   `payments.razorpay_payment_id` means a webhook delivered twice cannot count a payment twice.
2. **UPI notification matching** from the Android app (see below), which posts to `/api/payments/notification-match`
   and returns a suggested bill for staff to confirm.

Razorpay is optional. A business that has not connected an account works as before; online links are simply unavailable to it.

## Real-time updates

The kitchen display, orders screen and billing screen update live through Server-Sent Events. Events are published to a
per-tenant channel in `src/lib/realtime.ts`.

See [Known limitations](#known-limitations): the current implementation keeps connections in server memory.

## Android app

The Android project wraps the deployed web application in a Capacitor shell. `capacitor.config.ts` sets `server.url`
to the deployed site, so the app loads the live web application:

- Changes to React components, API routes and the database schema reach the app as soon as the web deployment is
  live. No new APK is needed.
- A new APK is needed only when native code under `frontend/android/` changes, or the app name, permissions or icon do.
- Cookies are persisted through `CapacitorCookies` so a login survives the app being closed. The Clerk middleware
  allow-lists the app's own origin (`capacitor://com.kipd.android`) and the deployed site as authorized parties.
  Local origins (`capacitor://localhost`, `http://localhost:3000`) are accepted only outside production.

### UPI notification listener

`UPIListenerService.java` is a notification listener service. After the user grants notification access, it reads
incoming notifications from supported UPI apps, extracts the amount and bank reference with regular expressions, and
passes them to the web layer, which posts them to `/api/payments/notification-match` to find a matching open bill.
Only notifications from GPay, PhonePe and Paytm are accepted. The endpoint requires a signed-in staff session, takes the
tenant from that session, and only matches bills of that tenant. It records the event and suggests a matching open bill;
it never marks a bill paid, and a person confirms at the counter. It is intended for a dedicated device at the front
desk. It depends on the wording of third-party notifications, so expect to adjust the patterns if an app changes its
text. Device-registered, signed requests are not implemented yet.

### Building the APK

CI builds a debug APK on pushes to `main` and on manual runs, and uploads it as the `kipd-app-debug.apk` artifact.
To build locally:

```bash
cd frontend
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
```

### Changing the app icon

1. Put a square logo of at least 1024x1024 pixels at `frontend/assets/icon.png`.
2. Run, from `frontend/`:
   ```bash
   npx @capacitor/assets generate --iconBackgroundColor '#ffffff'
   ```
3. Commit the generated Android resources. CI will produce an APK with the new icon.

## Configuration

Copy `frontend/.env.example` to `frontend/.env.local`.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Neon PostgreSQL connection string |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Yes | Clerk authentication |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | Yes | Auth routes (`/sign-in`, `/sign-up`) |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` | Yes | Where to land after auth (`/dashboard`) |
| `NEXT_PUBLIC_APP_URL` | Yes | Public base URL used in generated links |
| `PAYMENT_KEYS_SECRET` | For online payments | Encrypts each business's Razorpay keys. Any random string of 32+ characters. Never change it: stored keys become unreadable and every business must re-enter them. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | No | Outgoing email |
| `CONTACT_ADMIN_EMAIL` | No | Recipient of the public "request access" form |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Recommended in production | Shared rate limiting. Without it, limits are per server instance. |
| `BLOB_READ_WRITE_TOKEN` | No | Vercel Blob storage |

Razorpay keys are not environment variables: each business enters its own in Settings > Payments, where its webhook address and secret are shown. `NEXT_PUBLIC_APP_URL` must be the public address of the deployment, because the webhook address is built from it.

## Local development

Requirements: Node.js 22 and a PostgreSQL database (a Neon branch works well).

```bash
git clone https://github.com/AHILL-0121/KIPD.git
cd KIPD/frontend
npm install
cp .env.example .env.local     # then fill in the values
npm run db:migrate
npm run dev
```

The app runs at `http://localhost:3000`. Create the first platform admin with `npm run admin:create`.

To test the Android app against your machine, run `npm run dev -- -H 0.0.0.0` and temporarily point
`server.url` in `capacitor.config.ts` at your computer's LAN address. Do not commit that change.

## Database and migrations

The schema is defined in `frontend/src/db/schema.ts`. Migrations are SQL files in `frontend/drizzle/`, generated by
drizzle-kit. Commit each migration together with its snapshot in `drizzle/meta/`, and do not edit snapshots by hand.
`drizzle/RUNBOOK.txt` describes the one-time reset procedure and what the database guarantees.

| Command | Purpose |
| --- | --- |
| `npm run db:generate -- --name <name>` | Generate a migration from schema changes |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:drift` | Read-only check that the database matches `schema.ts`. Exits 1 on drift. |
| `npm run db:reset` | Lists what a full reset would delete. Read the runbook before using it. |
| `npm run admin:create` | Create a platform admin |

Migrations so far:

| # | Change |
| --- | --- |
| 0000 | Initial schema |
| 0001 | Order source |
| 0002 | No-overlap constraint on bookings |
| 0003 | Hotel bills and payment details |
| 0004 | Payment settings and Razorpay |
| 0005 | Tax profile and numbered invoices |
| 0006 | Post to room and credit notes |
| 0007 | Property and receipt settings |
| 0008 | Razorpay accounts: one per business, secrets encrypted |

Practice for changes: make them additive where possible, run them first on a Neon branch, run `db:drift` afterwards,
and apply them to production at or before the deploy that needs them.

## Testing and CI

```bash
cd frontend
npm test              # Vitest, single run
npm run test:watch
npx tsc --noEmit      # type check
npm run lint
```

The suites cover GST calculation, invoice numbering, room charges and credit notes, payment settings, role checks,
timezones, migrations, tenant isolation and database integrity, plus the main dashboard pages.

GitHub Actions (`.github/workflows/android-build.yml`) runs type check, lint, tests and a production build on every pull
request and push to `main`, using dummy credentials so no real secrets are needed. The Android APK job runs only for
pushes to `main` and manual runs, after those checks pass.

## Known limitations

- **Live updates on serverless.** `src/lib/realtime.ts` keeps connected clients in process memory. On a single
  long-running server this is fine. On Vercel an event published on one instance does not reach a client connected to
  another, so live screens can miss updates. A managed pub/sub service is needed before relying on live updates at
  scale.
- **Rate limiting without Redis.** If the Upstash variables are not set, or Redis is unreachable, limits fall back to
  per-instance memory and are looser than configured.
- **Outlets and webhooks settings.** The Outlets and Webhooks cards in Settings are not backed by the API yet;
  `GET /api/settings` returns empty lists for them.
- **Receipt layout migration.** Receipt layouts that were saved only in a browser's `localStorage` before migration
  `0007` were not carried over and must be entered again.
- **UPI matching** depends on third-party notification text and is best-effort.
