# Kipd - Hotel & Restaurant Management SaaS

Complete multi-tenant platform for managing hotels, restaurants, and unified operations.

## Features

- 🏨 **Hotel Management**: Room inventory, booking engine, guest management
- 🍽️ **Restaurant Operations**: Menu management, QR ordering, KDS
- 📊 **Analytics**: Occupancy trends, revenue breakdown, performance insights
- 💳 **Unified Billing**: Consolidated invoicing across all services
- 👥 **Multi-tenant**: Platform admin panel with tenant management
- 🔐 **Authentication**: Clerk-powered auth with role-based access
- 📱 **Real-time Updates**: SSE for live order and KDS updates
- 🎨 **Design System**: Custom Tailwind theme with Kipd brand colors

## Tech Stack

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS
- **Database**: Drizzle ORM + Neon PostgreSQL
- **Auth**: Clerk
- **Payments**: Stripe
- **Email**: Resend
- **Storage**: Vercel Blob
- **Animations**: Framer Motion
- **Icons**: Lucide React
- **Charts**: Recharts

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database (Neon recommended)
- Clerk account
- Stripe account
- Resend API key

### Installation

1. Clone the repository:
```bash
git clone <repo-url>
cd kipd/frontend
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
```

Fill in all required environment variables in `.env.local`.

4. Generate database schema:
```bash
npm run db:push
```

5. Run development server:
```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000)

## Project Structure

```
frontend/
├── src/
│   ├── app/
│   │   ├── admin/              # Platform admin panel
│   │   ├── dashboard/          # Tenant dashboard
│   │   ├── book/               # Public booking engine
│   │   ├── menu/               # QR menu ordering
│   │   └── api/                # API routes
│   ├── components/
│   │   ├── ui/                 # Reusable UI components
│   │   └── mascot/             # Kipd mascot component
│   ├── db/
│   │   ├── schema.ts           # Database schema
│   │   └── index.ts            # Database client
│   └── lib/
│       ├── auth.ts             # Auth helpers
│       └── email.ts            # Email service
├── public/                      # Static assets
├── drizzle.config.ts           # Drizzle configuration
├── tailwind.config.ts          # Tailwind configuration
└── package.json
```

## Key Pages

### Platform Admin
- `/admin` - Platform dashboard with tenant stats
- `/admin/tenants` - Tenant management (CRUD)

### Hotel Dashboard
- `/dashboard` - Overview with occupancy, arrivals, orders
- `/dashboard/rooms` - Room inventory management
- `/dashboard/bookings` - Reservations list
- `/dashboard/restaurant` - Menu item management
- `/dashboard/orders` - Order monitoring
- `/dashboard/kds/[outletId]` - Kitchen Display System
- `/dashboard/billing` - Unified billing
- `/dashboard/staff` - Team management
- `/dashboard/analytics` - Performance insights
- `/dashboard/settings` - Property configuration

### Public Pages
- `/book/[hotelSlug]` - Booking engine
- `/menu/[restaurantSlug]/[tableId]` - QR ordering

## API Routes

All API routes are in `src/app/api/`:

- `POST /api/bookings` - Create booking
- `GET /api/bookings` - List bookings
- `POST /api/orders` - Create order
- `GET /api/orders` - List orders
- `GET /api/sse/kds/[outletId]` - SSE for KDS updates
- `POST /api/billing` - Create bill
- `PATCH /api/billing` - Process payment
- `POST /api/webhooks/stripe` - Stripe webhook handler
- `GET /api/admin/tenants` - List tenants (admin only)
- `POST /api/admin/tenants` - Create tenant (admin only)

## Database Schema

Complete schema with 15+ tables:
- `tenants` - Multi-tenant isolation
- `properties` - Hotel properties
- `rooms`, `roomTypes` - Room inventory
- `guests`, `bookings` - Reservations
- `outlets` - Restaurant/bar locations
- `menuCategories`, `menuItems` - Menu management
- `tables`, `orders`, `orderItems` - Order management
- `bills`, `payments` - Billing system
- `staff` - Team members
- `webhooks`, `webhookLogs` - Integration events

## Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npm run db:push      # Push schema changes to database
npm run db:studio    # Open Drizzle Studio
```

## Environment Variables

See `.env.example` for all required variables:

- `DATABASE_URL` - Neon PostgreSQL connection string
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - Clerk public key
- `CLERK_SECRET_KEY` - Clerk secret key
- `STRIPE_SECRET_KEY` - Stripe secret key
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook signing secret
- `RESEND_API_KEY` - Resend email API key
- `BLOB_READ_WRITE_TOKEN` - Vercel Blob storage token
- `UPSTASH_REDIS_REST_URL` - Upstash Redis URL
- `UPSTASH_REDIS_REST_TOKEN` - Upstash Redis token

## Design System

Custom color palette:
- **Amber** (#E8A020) - Primary brand color
- **Terra** (#C8573A) - Accent/warm
- **Sage** (#5E8C6A) - Success/cool
- **Cream** (#FAF8F4) - Background
- **Ink** (#1C1917) - Text

Typography:
- **DM Sans** - Body text
- **Playfair Display** - Headings/serif
- **DM Mono** - Code/labels

## Illustration System

Kipd features a comprehensive illustration system with **Kip**, our friendly corgi mascot, providing delightful feedback across all user interactions.

**12 Illustration Scenes:**
- 404 errors, loading states, success confirmations
- Empty states, offline detection, error handling
- Booking confirmations, checkout flows
- Order ready notifications, maintenance mode
- Toast notifications with emotional variants

See [ILLUSTRATIONS.md](./ILLUSTRATIONS.md) for complete documentation.

**Usage Example:**
```tsx
import { KipdIllustration } from '@/components/mascot/KipdIllustration';

<KipdIllustration 
  scene="success" 
  size="lg" 
  message="Your booking has been confirmed!"
/>
```

## Deployment

### Vercel (Recommended)

1. Push code to GitHub
2. Import project in Vercel
3. Add environment variables
4. Deploy

The app will be available at your Vercel URL.

### Other Platforms

The app can be deployed to any platform supporting Next.js 14:
- Netlify
- Railway
- Render
- AWS Amplify

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a pull request

## License

MIT License - see LICENSE file for details

## Support

For support, email support@kipd.app or open an issue on GitHub.
