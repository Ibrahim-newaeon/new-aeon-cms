# NEW AEON CMS — Mega Prompt
## Content Management System with Optional E-Commerce Module

---

## PROJECT IDENTITY

| Property | Value |
|----------|-------|
| Name | New Aeon |
| Type | CMS-first, e-commerce optional |
| Default Admin Path | `/admin` |
| Default Locale | `ar` (Arabic RTL) |
| Secondary Locale | `en` |
| Architecture | Next.js 15 App Router, monorepo |

---

## CORE PHILOSOPHY

This is a **content management system**, not an e-commerce platform with CMS features. E-commerce is a **module that can be enabled or disabled** from settings without code changes.

When e-commerce is **disabled**:
- No commerce tables accessed
- No commerce routes registered
- No commerce menu items shown
- Clean CMS dashboard

When e-commerce is **enabled**:
- Commerce menu appears
- Product catalog, cart, checkout activate
- All commerce features available

---

## TECH STACK (Locked)

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js | 15+ (App Router, PPR, Turbopack) |
| React | 19+ | Server Components default |
| Language | TypeScript | `strict: true`, no `any` |
| Styling | Tailwind CSS | 3.4+ with logical properties |
| Components | shadcn/ui | RTL-audited |
| Database | PostgreSQL | 15+ |
| ORM | Drizzle ORM | Type-safe, migrations |
| Validation | Zod | All inputs |
| Auth | JWT access (15m) + refresh (7d, httpOnly, SameSite=Strict) | Rotation + reuse detection |
| i18n | next-intl | `ar` default, `en` secondary |
| Media | Local filesystem + S3-compatible | Presigned uploads |
| Cache | Redis | Sessions, rate limiting |
| Editor | TipTap | Structured JSON blocks |

---

## SECURITY RULES

- Zod on every input: body, params, query, headers, env
- Parameterized SQL only (Drizzle)
- Rate limiting on all API routes
- Security headers: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy
- Argon2id for passwords
- JWT refresh rotation with reuse detection
- Server-side auth on every admin route — never trust hidden UI
- CSRF protection on mutations
- Secrets in env only, validated at boot
- Try/catch all async; never leak stack traces

---

## FRONTEND RULES

- React Server Components by default
- `'use client'` only for interactivity
- `data-test-id` on every interactive element
- Explicit loading and error states for all async views
- ARIA labels, keyboard navigation, visible focus rings
- Mobile-first, 56px minimum touch targets
- CSS-only animations; lazy-load heavy libraries
- RTL: `<html lang dir>` driven by locale
- Logical CSS properties: `margin-inline-start`, `padding-inline-end` — never `margin-left`, `padding-right`
- Latin text inside Arabic needs `dir="ltr"` span or it scrambles

---

## DATABASE SCHEMA

### CORE CMS TABLES (Always Required)

```sql
-- Users & Auth
users: id, email, passwordHash, name, role, avatar, isActive, lastLoginAt, createdAt, updatedAt
refreshTokens: id, jti, userId, expiresAt, revokedAt, replacedBy, createdAt

-- Content
contentTypes: id, slug, name, description, hasArchive, hasCategories, hasTags, hasFeaturedImage, customFields
content: id, typeId, slug, authorId, featuredImage, status, publishedAt, createdAt, updatedAt
contentI18n: id, contentId, locale, title, excerpt, body, metaTitle, metaDescription, ogImage, noIndex
categories: id, slug, parentId, icon, sortOrder, isActive
categoryI18n: id, categoryId, locale, name, description
tags: id, slug, name
contentTags: contentId, tagId

-- Media
mediaFolders: id, name, parentId, path, createdAt
mediaAssets: id, filename, originalName, mimeType, size, url, thumbnailUrl, width, height, altText, folderId, uploadedBy, createdAt

-- Navigation
navigation: id, label, url, order, parentId, location, isActive, openInNew

-- Settings
settings: id, siteName, siteDescription, logo, favicon, contactEmail, contactPhone, socialLinks, analyticsId, gtmId, ga4Id, metaPixelId, tiktokPixelId, customCss, comingSoonMode, comingSoonMessage, eCommerceEnabled, currency, createdAt, updatedAt

-- Audit
auditLog: id, userId, action, entityType, entityId, payload, ipAddress, userAgent, createdAt
```

### E-COMMERCE MODULE TABLES (Only when enabled)

```sql
-- Catalog
brands: id, slug, name, logoUrl, isAuthorizedDealer, sortOrder, isActive
products: id, slug, brandId, categoryId, basePrice, compareAtPrice, warrantyMonths, isGenuine, isActive, sortOrder, createdAt, updatedAt
productI18n: id, productId, locale, name, shortDesc, description, metaTitle, metaDescription
productVariants: id, productId, sku, barcode, color, size, capacity, connectorType, price, compareAtPrice, stock, lowStockThreshold, weightGrams, isActive
productImages: id, productId, variantId, url, alt, sortOrder
productSpecs: id, productId, locale, key, value, sortOrder

-- Device Compatibility (optional sub-module)
deviceBrands: id, slug, name, logoUrl, type, isActive
deviceModels: id, deviceBrandId, slug, name, releaseYear, aliases, isActive
productCompat: id, productId, deviceModelId, fitNote

-- Commerce
orders: id, orderNumber, status, subtotal, shipping, discount, total, currency, customerName, phone, email, governorate, city, addressLine, landmark, paymentMethod, paymentStatus, notes, couponCode, createdAt, updatedAt
orderItems: id, orderId, variantId, nameSnapshot, skuSnapshot, priceSnapshot, qty
coupons: id, code, type, value, minSubtotal, usageLimit, usedCount, startsAt, endsAt, isActive
bundles: id, slug, name, discountType, discountValue, isActive
bundleItems: id, bundleId, variantId, qty
shippingZones: id, name, governorates, flatRate, freeOver, etaDays, isActive
reviews: id, productId, orderId, rating, body, authorName, isVerifiedPurchase, isApproved, createdAt
stockAlerts: id, variantId, contact, notifiedAt, createdAt
```

---

## CONTENT BLOCKS (Structured Editor)

```typescript
type ContentBlock =
  | { type: 'heading'; level: 1 | 2 | 3 | 4; text: string; anchor?: string }
  | { type: 'paragraph'; text: string; align?: 'left' | 'center' | 'right' | 'justify' }
  | { type: 'image'; src: string; alt: string; caption?: string; width?: number; height?: number; layout: 'full' | 'wide' | 'normal' }
  | { type: 'gallery'; images: { src: string; alt: string }[]; layout: 'grid' | 'masonry' | 'carousel' | 'slideshow' }
  | { type: 'video'; url: string; provider: 'youtube' | 'vimeo' | 'self'; poster?: string; autoplay?: boolean }
  | { type: 'quote'; text: string; author?: string; source?: string; style: 'bordered' | 'pull' }
  | { type: 'embed'; url: string; type: 'instagram' | 'twitter' | 'tiktok' | 'facebook' }
  | { type: 'button'; text: string; url: string; variant: 'primary' | 'secondary' | 'outline' | 'ghost'; size: 'sm' | 'md' | 'lg'; fullWidth?: boolean }
  | { type: 'divider'; style: 'line' | 'space' | 'dots' | 'stars' }
  | { type: 'spacer'; height: number }
  | { type: 'html'; content: string } // For embeds, sanitized
  | { type: 'table'; rows: number; cols: number; data: string[][]; headerRow?: boolean }
  | { type: 'accordion'; items: { title: string; content: ContentBlock[] }[] }
  | { type: 'tabs'; items: { label: string; content: ContentBlock[] }[] }
  | { type: 'cta'; title: string; text: string; button: { text: string; url: string }; backgroundImage?: string; overlay?: boolean }
  | { type: 'feature-grid'; items: { icon?: string; title: string; description: string }[]; columns: 2 | 3 | 4 }
  | { type: 'testimonial'; items: { quote: string; author: string; role?: string; avatar?: string; rating?: number }[] }
  | { type: 'team'; members: { name: string; role: string; bio?: string; photo?: string; social?: Record<string, string> }[] }
  | { type: 'stats'; items: { value: string; label: string; prefix?: string; suffix?: string }[] }
  | { type: 'timeline'; items: { date: string; title: string; description: string; icon?: string }[] }
  | { type: 'comparison'; items: { feature: string; values: Record<string, string | boolean> }[]; columns: string[] }
  | { type: 'pricing'; plans: { name: string; price: string; period?: string; features: string[]; cta: { text: string; url: string }; highlighted?: boolean }[] }
  | { type: 'map'; location: { lat: number; lng: number }; zoom?: number; marker?: string }
  | { type: 'contact-form'; fields: ('name' | 'email' | 'phone' | 'message' | 'subject')[]; submitLabel?: string; successMessage?: string }
  | { type: 'newsletter'; title: string; description?: string; buttonText?: string; privacyNote?: string }
  | { type: 'social-links'; platforms: ('facebook' | 'instagram' | 'twitter' | 'linkedin' | 'youtube' | 'tiktok')[]; style: 'icons' | 'buttons' | 'floating' }
  | { type: 'recent-posts'; title: string; category?: string; count: number; layout: 'list' | 'grid' | 'carousel' }
  | { type: 'product-grid'; productIds: string[]; layout: 'grid' | 'list' | 'carousel' } // E-commerce only
  | { type: 'custom'; component: string; props: Record<string, unknown> } // Developer extension
```

---

## ADMIN PANEL STRUCTURE

### Navigation (Max 12 items, collapsible sections)

| Section | Items | Condition |
|---------|-------|-----------|
| **Overview** | Dashboard | Always |
| **Content** | Pages, Posts, Categories, Tags, Content Types | Always |
| **Media** | Library, Folders | Always |
| **Navigation** | Menus | Always |
| **Commerce** | Products, Orders, Customers, Inventory, Coupons, Shipping | `eCommerceEnabled === true` |
| **Users** | Admins, Roles | Always |
| **Settings** | General, SEO, Tracking, Appearance, Commerce | Always |

### Dashboard Widgets (CMS-focused)

| Widget | Data |
|--------|------|
| Content Stats | Total pages, posts, drafts, published |
| Recent Activity | Last 10 edits with user and timestamp |
| Media Storage | Used / total storage |
| Quick Actions | New page, New post, Upload media |
| Traffic Overview | If analytics connected |
| Commerce Summary | If e-commerce enabled: revenue, orders, low stock |

---

## E-COMMERCE MODULE (When Enabled)

### Activation
Toggle in Settings > Commerce. When enabled:
- Commerce tables migrate automatically
- Commerce menu items appear
- Product blocks available in content editor
- Cart/checkout routes register

### Features
| Feature | Priority |
|---------|----------|
| Product catalog with variants | High |
| Category-based browsing | High |
| Cart with session persistence | High |
| Checkout with COD | High |
| Order management | High |
| Basic inventory tracking | Medium |
| Shipping zones | Medium |
| Coupons | Medium |
| Product reviews | Low |
| Back-in-stock alerts | Low |

---

## SETUP & DEPLOYMENT

### Environment Variables

```bash
# Required
DATABASE_URL="postgresql://..."
JWT_ACCESS_SECRET="min-32-chars"
JWT_REFRESH_SECRET="different-32-chars"

# Admin
ADMIN_PATH="/admin"        # Configurable
DEFAULT_LOCALE="ar"        # ar or en
AVAILABLE_LOCALES="ar,en"

# Media
UPLOAD_DIR="./public/uploads"
# Or S3:
# S3_ENDPOINT="..."
# S3_ACCESS_KEY="..."
# S3_SECRET_KEY="..."
# S3_BUCKET="..."
# S3_PUBLIC_URL="..."

# Redis (optional)
REDIS_URL="redis://..."

# App
NEXT_PUBLIC_APP_URL="https://..."
NODE_ENV="production"
```

### Docker

```dockerfile
# Multi-stage: deps -> builder -> runner
# Non-root user
# Health check at /api/health
# Minimal final image
```

---

## BUILD PHASES

### Phase 1: Foundation
- Next.js 15 + TypeScript strict + Tailwind
- Drizzle ORM + PostgreSQL connection
- Docker setup
- Env validation with Zod

### Phase 2: Auth & Users
- Login/logout with JWT
- Refresh rotation + reuse detection
- Role-based access control
- Password reset flow

### Phase 3: Core CMS
- Content types system
- Pages CRUD with block editor
- Media library with folders
- Categories and tags
- Navigation editor

### Phase 4: i18n & RTL
- next-intl integration
- Arabic/English switching
- Full RTL audit
- Content translation workflow

### Phase 5: Public Site
- Homepage builder
- Dynamic page routing
- Blog listing and single
- Navigation from CMS

### Phase 6: SEO & Performance
- Meta tags, Open Graph
- Sitemap, robots.txt
- Structured data (JSON-LD)
- Core Web Vitals optimization

### Phase 7: Settings & Polish
- Site settings UI
- Tracking codes (GTM, GA4, Meta, TikTok)
- Custom CSS
- Coming soon mode

### Phase 8: E-Commerce Module (Optional)
- Enable toggle in settings
- Product catalog
- Cart and checkout
- Order management

### Phase 9: Testing
- Playwright E2E
- Vitest unit tests
- Accessibility audit
- Performance benchmarking

---

## AI CODING INSTRUCTIONS

When implementing this prompt:

1. **Show file path** as comment at top of every code block
2. **Default to code**, explain only when asked
3. **Flag assumptions explicitly** — never silently decide
4. **Ask before inventing** — brand names, product data, device models
5. **Use Server Components by default** — `'use client'` only for interactivity
6. **Zod validate everything** — forms, APIs, env, params
7. **Logical CSS properties** — `ms-4` not `ml-4`, `me-2` not `mr-2`
8. **ARIA labels** on all interactive elements
9. **Error boundaries** around every async component
10. **End each phase** with: shipped / validation checklist / warnings / next steps

---

## CUSTOMIZATION POINTS

| What | Where |
|------|-------|
| Site name | Settings > General |
| Logo | Settings > General (upload) |
| Favicon | Settings > General (upload) |
| Brand colors | Settings > Appearance (CSS variables) |
| Custom CSS | Settings > Appearance |
| Tracking codes | Settings > Tracking |
| Commerce on/off | Settings > Commerce |
| Currency | Settings > Commerce |
| Admin path | Environment variable `ADMIN_PATH` |

---

*New Aeon CMS — Content-first, commerce-optional, fully configurable.*