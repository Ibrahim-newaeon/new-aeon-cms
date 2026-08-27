# NEW AEON CMS — COMPLETE GUIDES
## Cheat Sheet · GitHub Setup · Vercel Deploy · Claude Code Mastery

---

# PART 1: QUICK-START CHEAT SHEET

## One-Page Reference

### Prerequisites Checklist
```
□ Node.js 20+
□ Docker Desktop (for local DB)
□ Git
□ VS Code (recommended)
□ Claude Code CLI (optional but recommended)
```

### 5-Minute Setup Commands

```bash
# 1. Clone template (or create fresh)
npx create-next-app@latest new-aeon-cms --typescript --tailwind --app --no-src-dir --import-alias "@/*"
cd new-aeon-cms

# 2. Install all dependencies in one command
npm install drizzle-orm pg @neondatabase/serverless next-intl zod jose argon2 lucide-react @radix-ui/react-dialog @radix-ui/react-tabs @radix-ui/react-dropdown-menu @radix-ui/react-tooltip @radix-ui/react-toast class-variance-authority clsx tailwind-merge tailwindcss-animate @tiptap/react @tiptap/starter-kit @tiptap/extension-image @tiptap/extension-link @tiptap/extension-placeholder sharp uuid

# 3. Install dev dependencies
npm install -D drizzle-kit tsx @types/pg @types/argon2 @types/uuid @playwright/test vitest

# 4. Copy all implementation files from guide

# 5. Environment
cp .env.example .env

# 6. Start database
docker-compose up -d db

# 7. Database setup
npm run db:generate
npm run db:push
npm run db:seed

# 8. Run
npm run dev
```

### Default URLs
| Service | URL |
|---------|-----|
| Public site (AR) | http://localhost:3000/ar |
| Public site (EN) | http://localhost:3000/en |
| Admin panel | http://localhost:3000/admin |
| Admin login | http://localhost:3000/admin/login |
| Database (local) | postgresql://localhost:5432 |

### Default Credentials
```
Email: admin@newaeon.com
Password: admin123456
```

### Essential npm Scripts
```bash
npm run dev          # Development with Turbopack
npm run build        # Production build
npm run db:push      # Push schema changes
npm run db:seed      # Seed development data
npm run test         # Unit tests (Vitest)
npm run test:e2e     # E2E tests (Playwright)
npm run typecheck    # TypeScript check
```

### File Locations Quick Reference
| Purpose | Path |
|---------|------|
| Database schema | `lib/db/schema.ts` |
| API routes | `app/api/*/route.ts` |
| Admin pages | `app/(admin)/admin/**` |
| Public pages | `app/(site)/[locale]/**` |
| Components | `components/admin/` & `components/site/` |
| Translations | `messages/ar.json` & `messages/en.json` |
| Environment | `.env` |
| Docker config | `docker-compose.yml` |

### Common Tasks

**Add a new content type:**
1. Edit `lib/db/schema.ts` — add to `contentTypes` table
2. Run `npm run db:push`
3. Add form in `app/(admin)/admin/content/`

**Change admin URL path:**
1. Edit `.env`: `ADMIN_PATH="/your-path"`
2. Update `middleware.ts` if hardcoded anywhere
3. Restart dev server

**Enable e-commerce:**
1. Go to Settings > Commerce in admin
2. Toggle `eCommerceEnabled` to `true`
3. Commerce menu appears automatically

**Add new language:**
1. Add locale to `AVAILABLE_LOCALES` in `.env`
2. Create `messages/[locale].json`
3. Add locale to `locales` array in `app/(site)/[locale]/layout.tsx`

---

# PART 2: GITHUB REPOSITORY SETUP

## Step-by-Step Repository Creation

### 1. Initialize Local Repository

```bash
# Navigate to your project
cd new-aeon-cms

# Initialize git
git init

# Create .gitignore
cat > .gitignore << 'EOF'
# Dependencies
node_modules/
.pnp
.pnp.js

# Testing
coverage/
playwright-report/
test-results/

# Next.js
.next/
out/

# Production
build/
dist/

# Environment
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Database
*.db
*.sqlite
lib/db/migrations/*.sql

# Uploads (if using local storage)
public/uploads/

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Logs
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Misc
*.pem
.vercel
EOF

# Add all files
git add .

# First commit
git commit -m "Initial commit: New Aeon CMS foundation"
```

### 2. Create GitHub Repository

**Option A: GitHub CLI (gh)**

```bash
# Install gh if needed: https://cli.github.com/

# Login
gh auth login

# Create repository (public)
gh repo create new-aeon-cms --public --source=. --push

# Or private
gh repo create new-aeon-cms --private --source=. --push
```

**Option B: Manual on GitHub.com**

1. Go to https://github.com/new
2. Repository name: `new-aeon-cms`
3. Choose public or private
4. **DO NOT** initialize with README, .gitignore, or license (we have these locally)
5. Click "Create repository"
6. Follow push instructions:

```bash
git remote add origin https://github.com/YOUR_USERNAME/new-aeon-cms.git
git branch -M main
git push -u origin main
```

### 3. Branch Strategy

```bash
# Create development branch
git checkout -b develop
git push -u origin develop

# Feature branch workflow
git checkout -b feature/content-blocks
# ... work ...
git add .
git commit -m "feat: add accordion and tabs content blocks"
git push -u origin feature/content-blocks
# Create PR on GitHub to merge into develop

# Release workflow
git checkout main
git merge develop
git tag -a v1.0.0 -m "Release version 1.0.0"
git push origin main --tags
```

### 4. GitHub Actions CI/CD

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:15-alpine
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: new_aeon_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Generate Drizzle migrations
        run: npm run db:generate
      
      - name: Type check
        run: npm run typecheck
      
      - name: Lint
        run: npm run lint
      
      - name: Run unit tests
        run: npm run test
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/new_aeon_test
          JWT_ACCESS_SECRET: test-access-secret
          JWT_REFRESH_SECRET: test-refresh-secret
      
      - name: Build
        run: npm run build
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/new_aeon_test
          JWT_ACCESS_SECRET: test-access-secret
          JWT_REFRESH_SECRET: test-refresh-secret
```

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Vercel

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Deploy to Vercel
        uses: vercel/action-deploy@v1
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
```

### 5. Repository Secrets

Go to Settings > Secrets and variables > Actions:

| Secret | Value |
|--------|-------|
| `VERCEL_TOKEN` | From Vercel dashboard |
| `VERCEL_ORG_ID` | From Vercel project settings |
| `VERCEL_PROJECT_ID` | From Vercel project settings |

### 6. README Template

Create `README.md`:

```markdown
# New Aeon CMS

Content-first CMS with optional e-commerce module. Arabic RTL support.

## Features

- ✅ Content management (pages, posts, categories, tags)
- ✅ Media library with folders
- ✅ Navigation editor
- ✅ Multi-language (AR/EN)
- ✅ RTL support
- ✅ SEO tools
- ✅ Role-based access control
- ✅ Optional e-commerce module

## Tech Stack

- Next.js 15 (App Router, PPR, Turbopack)
- React 19 Server Components
- TypeScript strict
- Tailwind CSS with logical properties
- PostgreSQL + Drizzle ORM
- next-intl i18n
- TipTap editor

## Quick Start

```bash
# 1. Clone
git clone https://github.com/YOUR_USERNAME/new-aeon-cms.git
cd new-aeon-cms

# 2. Install
npm install

# 3. Environment
cp .env.example .env
# Edit .env with your values

# 4. Database
docker-compose up -d db
npm run db:push
npm run db:seed

# 5. Run
npm run dev
```

## Default Login

- URL: http://localhost:3000/admin/login
- Email: admin@newaeon.com
- Password: admin123456

## Documentation

- [Mega Prompt](./docs/mega-prompt.md)
- [Implementation Guide](./docs/implementation.md)
- [API Reference](./docs/api.md)

## License

MIT
```

### 7. Protected Branches Setup

1. Go to Settings > Branches
2. Add rule for `main`:
   - Require pull request reviews before merging
   - Require status checks to pass (CI workflow)
   - Require branches to be up to date
   - Include administrators

---

# PART 3: VERCEL DEPLOYMENT GUIDE

## Method 1: Vercel CLI (Recommended for Development)

### Step 1: Install Vercel CLI

```bash
npm i -g vercel
```

### Step 2: Login

```bash
vercel login
# Opens browser for authentication
```

### Step 3: Link Project

```bash
vercel
# Follow prompts:
# ? Set up "new-aeon-cms"? [Y/n] Y
# ? Which scope? [Your username/team]
# ? Link to existing project? [y/N] N
# ? What's your project name? [new-aeon-cms]
```

### Step 4: Configure Environment Variables

```bash
# Add each variable interactively
vercel env add DATABASE_URL
# Enter value: your-postgresql-connection-string

vercel env add JWT_ACCESS_SECRET
vercel env add JWT_REFRESH_SECRET
vercel env add ADMIN_PATH
vercel env add NEXT_PUBLIC_APP_URL
```

Or add all at once via dashboard.

### Step 5: Deploy

```bash
vercel --prod
```

---

## Method 2: Vercel Dashboard (Recommended for Production)

### Step 1: Import Repository

1. Go to https://vercel.com/new
2. Import GitHub repository: `your-username/new-aeon-cms`
3. Vercel auto-detects Next.js settings

### Step 2: Configure Project

| Setting | Value |
|---------|-------|
| Framework Preset | Next.js |
| Root Directory | `./` |
| Build Command | `npm run build` |
| Output Directory | `.next` |
| Install Command | `npm install` |

### Step 3: Environment Variables

Add in Settings > Environment Variables:

| Variable | Production Value | Preview Value |
|----------|----------------|---------------|
| `DATABASE_URL` | Your production PostgreSQL | Your preview PostgreSQL |
| `JWT_ACCESS_SECRET` | Strong random string | Different random string |
| `JWT_REFRESH_SECRET` | Different strong random | Different random |
| `ADMIN_PATH` | `/admin` | `/admin` |
| `NEXT_PUBLIC_APP_URL` | `https://your-domain.com` | `https://preview-url.vercel.app` |
| `UPLOAD_DIR` | `/tmp/uploads` or S3 | `/tmp/uploads` |

### Step 4: PostgreSQL Database

**Option A: Vercel Postgres (Native Integration)**

1. Go to Storage tab in Vercel dashboard
2. Click "Create Database" > "Postgres"
3. Connect to your project
4. Vercel auto-sets `POSTGRES_URL` environment variable
5. Update your code to use `POSTGRES_URL` or map it to `DATABASE_URL`

**Option B: Neon (Serverless PostgreSQL)**

1. Go to https://neon.tech
2. Create project, get connection string
3. Add to Vercel environment variables

**Option C: Supabase**

1. Go to https://supabase.com
2. Create project
3. Connection pooler string for serverless

### Step 5: Storage for Uploads

**Option A: Vercel Blob (Native)**

```bash
npm install @vercel/blob
```

Update `lib/media/upload.ts`:

```typescript
import { put } from '@vercel/blob';

export async function uploadToVercelBlob(file: File) {
  const blob = await put(file.name, file, { access: 'public' });
  return blob.url;
}
```

**Option B: Cloudflare R2 (S3-compatible)**

Environment variables:
```
S3_ENDPOINT=https://xxx.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_BUCKET=new-aeon-uploads
S3_PUBLIC_URL=https://cdn.yourdomain.com
```

**Option C: AWS S3**

Similar to R2 with AWS credentials.

### Step 6: Custom Domain

1. Go to Project Settings > Domains
2. Add your domain: `yourdomain.com`
3. Configure DNS records as instructed
4. Add redirect from `www` to apex or vice versa

### Step 7: Deploy

```bash
# Push to main triggers auto-deploy
git push origin main

# Or manual
vercel --prod
```

---

## Method 3: Docker Deployment (Self-Hosted)

### Build Image

```bash
docker build -t new-aeon-cms -f docker/Dockerfile .
```

### Run Container

```bash
docker run -d \
  -p 3000:3000 \
  -e DATABASE_URL="postgresql://..." \
  -e JWT_ACCESS_SECRET="..." \
  -e JWT_REFRESH_SECRET="..." \
  --name new-aeon \
  new-aeon-cms
```

### Docker Compose (Production)

Create `docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: docker/Dockerfile
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - JWT_ACCESS_SECRET=${JWT_ACCESS_SECRET}
      - JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
      - REDIS_URL=${REDIS_URL}
      - NODE_ENV=production
    depends_on:
      - db
      - redis
    restart: unless-stopped

  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: ${DB_NAME}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf
      - ./certbot/conf:/etc/letsencrypt
      - ./certbot/www:/var/www/certbot
    depends_on:
      - app
    restart: unless-stopped

volumes:
  postgres_data:
```

Deploy:

```bash
docker-compose -f docker-compose.prod.yml up -d
```

---

# PART 4: CLAUDE CODE MASTERY

## What is Claude Code?

Claude Code is Anthropic's CLI tool that brings Claude AI directly into your terminal with full project context.

### Installation

```bash
# macOS
brew install anthropic/tap/claude-code

# Or via npm
npm install -g @anthropic-ai/claude-code

# Verify
claude --version
```

### Authentication

```bash
claude auth login
# Opens browser for authentication
```

---

## Essential Skills for New Aeon Development

### 1. Project Context Loading

```bash
# Start Claude Code in project directory
cd new-aeon-cms
claude

# Claude now has full context of your project
```

### 2. Key Commands

| Command | Purpose |
|---------|---------|
| `/help` | Show all available commands |
| `/clear` | Clear conversation history |
| `/compact` | Summarize and compress context |
| `/cost` | Show API usage cost |
| `/exit` | Exit Claude Code |

### 3. Working with Files

```bash
# Inside Claude Code prompt:

# Read file
> read lib/db/schema.ts

# Edit file
> edit app/(admin)/admin/page.tsx
# Then describe changes

# Create file
> create app/api/new-route/route.ts
# Then paste content or describe

# Search codebase
> search "contentTypes"
```

### 4. Running Commands

```bash
# Execute shell commands
> !npm run db:push

# Run tests
> !npm run test

# Check types
> !npm run typecheck
```

---

## MCP (Model Context Protocol) Setup

MCP extends Claude's capabilities with external tools and data sources.

### 1. Install MCP Server

```bash
# For filesystem access
npm install -g @modelcontextprotocol/server-filesystem

# For PostgreSQL
npm install -g @modelcontextprotocol/server-postgres

# For GitHub
npm install -g @modelcontextprotocol/server-github
```

### 2. Configure MCP in Claude Code

Create `~/.claude/mcp.json`:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/path/to/new-aeon-cms"
      ]
    },
    "postgres": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-postgres",
        "postgresql://postgres:postgres@localhost:5432/new_aeon_cms"
      ]
    },
    "github": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-github"
      ],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "your-github-token"
      }
    }
  }
}
```

### 3. Using MCP in Claude Code

```bash
# After starting claude, MCP tools are available:

> What tables are in my database?
# Claude uses postgres MCP to query

> Show me recent commits
# Claude uses github MCP

> Find all files containing "contentTypes"
# Claude uses filesystem MCP
```

---

## Recommended Claude Code Plugins/Extensions

### VS Code Extension (Optional)

While Claude Code is primarily CLI, you can enhance VS Code:

| Extension | Purpose |
|-----------|---------|
| **Claude for VS Code** (if available) | Direct integration |
| **GitHub Copilot** | Alternative AI assistance |
| **ESLint** | Code quality |
| **Prettier** | Code formatting |
| **Tailwind CSS IntelliSense** | Auto-completion |
| **Prisma** or **Drizzle ORM** extensions | Database tooling |
| **next-translate** or **i18n Ally** | Translation management |

### Claude Code Best Practices

```bash
# 1. Always start with context
claude
> I'm working on the New Aeon CMS. Let me load the project context.

# 2. Use structured prompts
> Implement a new content block type called "testimonial" with these fields:
> - quote: string
> - author: string
> - role: string (optional)
> - avatar: string (optional, image URL)
> - rating: number 1-5 (optional)
>
> Requirements:
> 1. Add to database schema
> 2. Add to content renderer
> 3. Add to admin editor
> 4. Show file paths as comments

# 3. Ask for explanations when needed
> Explain how the auth middleware works

# 4. Request tests
> Write Playwright tests for the login flow

# 5. Request documentation
> Document the content block system in markdown
```

---

## Claude Code Mega Prompt for New Aeon

When starting a new session, paste this:

```text
You are the lead developer for New Aeon CMS — a content-first management system with optional e-commerce.

PROJECT CONTEXT:
- Next.js 15 App Router with React Server Components
- TypeScript strict, no any
- Tailwind CSS with logical properties for RTL
- PostgreSQL with Drizzle ORM
- Arabic (ar) default, English (en) secondary
- Admin at configurable path (default: /admin)
- Dark admin theme, light public site

CURRENT TASK: [describe what you need]

RULES:
1. Show file paths as comments at top of every code block
2. Use Server Components by default; 'use client' only for interactivity
3. Zod validate all inputs
4. Logical CSS properties: ms-4 not ml-4, me-2 not mr-2
5. RTL-aware: test in both directions
6. Never hardcode brand names — use settings
7. End with: what shipped / validation checklist / warnings / next steps
```

---

## Complete Development Workflow

```bash
# 1. Start day
cd new-aeon-cms
git pull origin develop
git checkout -b feature/my-feature

# 2. Start Claude Code
claude

# 3. Make changes with AI assistance
# ... work with claude ...

# 4. Test
npm run typecheck
npm run test

# 5. Commit
git add .
git commit -m "feat: description"

# 6. Push and PR
git push -u origin feature/my-feature
gh pr create --title "feat: my feature" --body "Description"

# 7. Merge and deploy
gh pr merge
vercel --prod
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Database connection fails | Check Docker is running: `docker ps` |
| JWT errors | Verify secrets in `.env` are set |
| RTL not working | Check `dir="rtl"` on `<html>` |
| Build fails | Run `npm run typecheck` for errors |
| Upload fails | Check `UPLOAD_DIR` exists and is writable |
| Claude Code slow | Use `/compact` to reduce context |

---

## Resources

| Resource | URL |
|----------|-----|
| Next.js Docs | https://nextjs.org/docs |
| Drizzle ORM | https://orm.drizzle.team |
| Tailwind CSS | https://tailwindcss.com |
| next-intl | https://next-intl-docs.vercel.app |
| TipTap Editor | https://tiptap.dev |
| Vercel Docs | https://vercel.com/docs |
| Claude Code | https://docs.anthropic.com/claude-code |

---

*New Aeon CMS — Built for content, ready for commerce.*