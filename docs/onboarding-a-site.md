# Onboarding a static HTML site

How to take a hand-built HTML site — delivered as the usual three zips — and
turn it into a site this CMS serves, with every page editable.

This is the process al-ai.ai went through. It is written so the second site is
a **configuration file and a set of templates**, not a second copy of the
scripts.

---

## What you need before you start

| Zip | What must be inside | Used for |
|---|---|---|
| **Pages** | The `.html` files, one per page | Page content |
| **Theme** | `css/`, `js/`, `vendor/`, `img/` | The theme pack |
| **Media** | Every image and video the pages reference | The media library |

Plus a **running CMS instance** for this site: its own database, its own
environment variables, its own domain. One deployment per site. The setup
wizard gates on "does an admin exist **in this database**", so a fresh
`DATABASE_URL` gets you the wizard with nothing to undo.

Unpack the theme zip into one directory — the **drop** — shaped like this:

```
<drop>/css/…      stylesheets, and any image a stylesheet loads with url()
<drop>/js/…       the site's own scripts
<drop>/vendor/…   jQuery, GSAP, Swiper, Font Awesome, …
<drop>/img/…      logo and other chrome images
```

---

## Step 0 — Read the site before you write anything

Three things decide the whole configuration. Open any two pages side by side.

**1. Where does the chrome stop and the content start?**
Find the element that wraps everything between the header and the footer. On
al-ai.ai that is `<div id="tt-content-wrap">` down to `<footer id="tt-footer"`.
Those two strings become `content.open` and `content.close`. They must appear
on **every** page, and identically.

**2. In what order do the stylesheets and scripts load?**
Copy the `<link>` and `<script>` order out of the `<head>` and the foot of the
body, exactly. Order is load-bearing — a theme script that runs before jQuery
throws and takes the rest of the bundle with it.

**3. Which images belong to the chrome?**
Logo, footer mark, loader. Those ship inside the pack. **Everything else is
content** and goes to the media library — see *Why images split in two* below.

---

## Step 1 — Create the theme pack directory

```bash
mkdir -p themes/<site>/{templates,partials,assets,shims,content}
```

Copy `themes/al-ai/` as a starting point; it is a complete worked example.

| File | What goes in it |
|---|---|
| `theme.json` | Manifest naming the five templates |
| `templates/layout.html` | The chrome: header, footer, loader, transitions |
| `templates/home.html` | Front page body — usually just the page content |
| `templates/page.html` | Every other page, with a title fallback |
| `templates/post.html` | A blog post |
| `templates/blog.html` | Blog index, **including the empty state** |
| `partials/header.html` | Nav. Mark the current page with `page.slug` |
| `partials/footer.html` | Addresses, social, policy links |
| `shims/*.js` | Anything the original had in an inline `<script>` |
| `content/*.html` | Pages with no original — policy templates, etc. |

**Three rules these templates must respect.** Each one fails silently.

1. **Liquid comments are `{% comment %}…{% endcomment %}`.** Not `{# … #}` —
   that is Jinja, and liquidjs prints it onto the page verbatim.
2. **A `<script>` in a template never runs.** The rendered HTML reaches the
   page through `dangerouslySetInnerHTML`, and `innerHTML` does not execute
   scripts. Inline scripts go in `shims/` instead.
3. **The CMS renders its own `<body>`.** If the theme's JS checks for classes
   on it, a prelude shim has to re-add them.

---

## Step 2 — Write `themes/<site>/site.config.json`

This is the file that replaces editing the scripts. Copy
`themes/al-ai/site.config.json` and change it.

```jsonc
{
  "name": "example.com",          // must match theme.json's name
  "prefix": "example",            // media placeholder path: /uploads/example/…
  "locale": "en",

  "content": {
    "open":  "<div id=\"content\">",   // page body starts AFTER this
    "close": "<footer",                // …and ends BEFORE this
    "stripSvg": true,
    "titleSeparator": "|"              // "example.com | About" -> "About"
  },

  "slugs": {                      // original filename -> CMS slug
    "index.html": "",             // "" means the front page
    "about.html": "about"
  },

  "postSlugs": ["a-blog-post"],   // these become posts, not pages

  "linkRewrites": {               // links to pages that were never files
    "blog-archive.html": "/{locale}/blog"
  },

  "packPages": {                  // copied from themes/<site>/content/
    "privacy-policy.html": "Privacy Policy"
  },

  "mediaReplacements": [          // a file the live site 404s on
    { "missing": "old.png", "replacement": "new.mp4", "as": "video", "label": "…" }
  ],

  "build": {
    "cssOrder": ["vendor/…/all.min.css", "css/theme.css"],
    "jsOrder":  ["vendor/jquery/jquery.min.js", "js/theme.js"],
    "packCss":  ["assets/loader.css"],
    "shims":    { "before": ["shims/prelude.js"], "after": ["shims/loader.js"] },
    "chromeImages":     ["logo.png"],
    "cssSiblingImages": ["bg-noise.png"],
    "webfonts": "vendor/fontawesome/webfonts"
  }
}
```

**Map slugs explicitly.** Do not assume the filename lowercases into the slug —
on al-ai.ai three of them did not, and a lowercasing rule would have produced
dead links that nothing reports.

---

## Step 3 — Build and install the theme pack

```bash
node scripts/build-theme-pack.mjs --site <site> --src <drop> --out dist/themes
```

Then in the CMS: **Settings → Appearance** → upload `dist/themes/<site>.zip` →
activate → set the storefront driver to `html-pack`.

**Set `htmlPasteMode` to `trusted` before publishing any content.** On `safe`
the sanitiser strips the `id`, `class` and `style` attributes the sections are
built from, and every page renders as loose text. The setting is read at
**render** time, so changing it later fixes pages that are already stored —
nothing needs re-pasting.

**The instance needs a persistent volume.** Theme packs live on local disk
under `THEMES_DIR` — always, even when media is on S3. Without a volume the
pack is destroyed on the next deploy. Set `THEMES_DIR` and `UPLOAD_DIR` onto
that volume.

---

## Step 4 — Extract the page content

```bash
node scripts/extract-site-content.mjs --site <site> --src <dir-of-html> --out dist/content
```

This writes one fragment per page plus **`pages.json`**, the manifest that
carries each page's slug, title and content type.

Read the output. `Skipped … (markers not found)` means `content.open` or
`content.close` is wrong for that page — fix the config, not the file.

---

## Step 5 — Upload the media, then rewrite the paths

Upload everything in the media zip through **Admin → Media**.

A media **folder is a label, not a path**. It changes nothing about a file's
URL. The library renames every upload to `<uuid>.<ext>` under a year/month
prefix, so the paths the fragments carry are placeholders until they are
rewritten.

Export the library. On an admin page, in the DevTools console:

```js
copy(JSON.stringify(await (await fetch('/api/media')).json(), null, 2))
```

Paste into `media.json`, then:

```bash
node scripts/remap-content-media.mjs --media media.json --dir dist/content --dry-run
node scripts/remap-content-media.mjs --media media.json --dir dist/content
```

The dry run lists anything it could not match. **Resolve that list before
publishing** — an unmatched path is left as-is and 404s on the live page.

> Do **not** fetch `/api/media` by typing it into the address bar. The API
> guard requires `Origin` to match `Host` and, absent an `Origin`, requires
> `Sec-Fetch-Site: same-origin` — which a typed URL is not. You get a 403
> reading `Cross-site request blocked`, which looks like a login failure and
> is not one. The route also returns only the newest **200** assets.

---

## Step 6 — Publish every page in one command

```bash
export CMS_EMAIL='you@example.com'
export CMS_PASSWORD='…'          # never on the command line: argv is public

node scripts/publish-site-pages.mjs --url https://<site> --dir dist/content --dry-run
node scripts/publish-site-pages.mjs --url https://<site> --dir dist/content
```

It logs in and drives the same HTTP API the admin screens drive, so the origin
check, the session, the role check and the block validation all still apply. It
can publish nothing a logged-in editor could not.

- `--dry-run` validates everything and sends no request.
- `--only home,about` limits it to named slugs.
- `--status draft` holds the pages back for review.
- `--locale ar` writes the other language.

**Idempotent by slug.** A page that already exists is updated in place. That
matters: `content.slug` carries an index but **no unique constraint**, so
creating blindly would leave two pages at one address and let row order decide
which one the site serves.

---

## Step 7 — Redirect the old URLs

The old site served `.html` paths and search engines still hold them. Set
`LEGACY_REDIRECTS` on the instance to a JSON map of old path → new path;
`next.config.ts` turns it into 301s.

---

## Why images split in two

This catches everybody once.

| Kind | Lives in | Why |
|---|---|---|
| **Chrome** — logo, footer mark, loader | The theme pack | Templates reach it with `{{ '…' \| asset }}` |
| **Content** — heroes, sections, banners | The media library | Content is stored in the database and rendered **without Liquid** |

Page content can never resolve the `asset` filter or the pack's
`/theme-assets/<uuid>/` prefix — and that uuid changes every time the pack is
re-uploaded, so a content image pointed at it would break on the next upload.

---

## Checklist

- [ ] Instance deployed, with a **volume**, `THEMES_DIR` and `UPLOAD_DIR` on it
- [ ] Setup wizard completed, admin created
- [ ] `htmlPasteMode` = **trusted**
- [ ] `themes/<site>/` templates and `site.config.json` written
- [ ] Theme pack built, uploaded, activated, driver = `html-pack`
- [ ] Content extracted; nothing skipped
- [ ] Media uploaded; remap dry run matches **everything**
- [ ] Pages published; `--dry-run` clean first
- [ ] Theme colours set in the admin
- [ ] `LEGACY_REDIRECTS` set
- [ ] Deployment pipeline knows about the new service

---

## When something looks wrong

| Symptom | Cause |
|---|---|
| Implementation notes printed above the header | Jinja `{# #}` in a template — use `{% comment %}` |
| Page renders as loose text | `htmlPasteMode` is `safe`; set it to `trusted` |
| Nothing interactive works, console shows a CSP refusal | The bundle is not carrying the nonce |
| A loading overlay never clears | The dismissal shim is missing, or keys off an element React replaced |
| Every icon is a blank box | `build.webfonts` is not set |
| Images 404 | Remap not run, or its dry run had unmatched entries |
| Theme pack gone after a deploy | No volume, or `THEMES_DIR` is not on it |
| `Upload failed` on the pack | Volume is root-owned; the container runs as uid 1001 |
| Loose sentences down the right margin | Inline SVG kept; set `content.stripSvg` |
