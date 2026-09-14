# Prompt — migrate a static site into editable sections

Hand this to a fresh session, together with the three zips for the site being
onboarded. It is written to stand alone: it states what is already true of this
codebase, what the previous migration got wrong, and what "done" means.

---

## The task

Today `scripts/extract-site-content.mjs` lifts each page body out of a static
HTML site and `scripts/publish-site-pages.mjs` stores it as **one `html` block**
per page. The markup is exact and the page looks right, but the only way to
change anything is to edit raw HTML in a textarea.

**Build the path that produces editable sections instead**: each band of a
migrated page becomes its own block, with a rich-text field for its words and a
media picker for its images, rendered in the theme's own markup.

The finished state is a client who can rewrite a heading, fix a typo, swap a
photo, reorder two sections and delete a third — without seeing a tag.

---

## What is already true — verify each before relying on it

Everything here was established by reading the code, not assumed. Re-check it;
it may have moved.

**1. A theme pack renders 10 of the 33 block types.**
`lib/themes/blocks-to-html.ts` has a switch with ten arms and a `default` that
returns `''`. `PACK_SUPPORTED_BLOCKS` in `lib/themes/pack-blocks.ts` lists them
and `tests/pack-block-support.test.ts` keeps the two in step. The supported set
includes **`rich-text`** and **`image`** — which is why this task is possible at
all — and excludes `feature-grid`, `stats`, `team`, `gallery`, `slider`,
`testimonial`, `faq` and the rest. A block outside the set saves cleanly and
renders as nothing.

**2. Those ten render as plain semantic HTML with no theme classes.**
`rich-text` becomes `<div class="prose">…</div>`; `image` becomes
`<figure><img><figcaption>`. The al-ai pack's CSS targets `.tt-*`, so a section
converted to `rich-text` today is **correct content in unstyled markup**. This
is the central problem to solve, not a detail.

**3. A pack may already ship arbitrary partials.**
`themeManifestSchema` in `lib/themes/package.ts` declares
`partials: z.record(z.string(), relativePath)` — an open record. A pack can ship
`partials/block-rich-text.html` today; nothing reads it yet.

**4. Page content reaches a template as one rendered string.**
`lib/themes/present.ts` calls `blocksToHtml(blocks, pasteMode)` and passes the
result as `page.content`. Templates cannot see the block array.

**5. Blocks are jsonb behind a passthrough schema.**
`lib/blocks/content-schema.ts`. Adding or removing a block field needs no
migration, and a stored block carrying an unknown key still parses.

**6. Sanitising happens at render, by site setting.**
`htmlPasteMode` (`safe` | `designer` | `trusted`) is read when the page renders,
so changing it fixes content already stored. `safe` strips `id`, `class` and
`style`.

---

## The design to build

**Per-pack block partials.** Teach the pack renderer to look for a partial named
`block-<type>` and, when one exists, render that block through it with the
block's fields as Liquid variables. Fall back to the current generic HTML when a
pack ships no partial.

That single seam solves the styling problem without putting theme-specific
markup into a shared module: `themes/al-ai/partials/block-rich-text.html` can
emit `<div class="tt-section tt-wrap">…</div>` around the prose, and a different
pack emits its own.

It also widens support honestly — a pack that ships `partials/block-stats.html`
makes `stats` work for that pack, and `PACK_SUPPORTED_BLOCKS` has to become
"the ten, plus whatever this pack has partials for" rather than a fixed list.
The picker warning added in `components/admin/block-builder.tsx` must follow the
same rule, or it will lie in the other direction.

**Then the migration mapping.** Extend `site.config.json` with a per-site map
from a CSS selector to a block type, so the extractor can turn a recognised
band into a structured block and leave anything unrecognised as an `html` block.
Unrecognised must stay `html` — a migration that silently drops a section it did
not understand is worse than one that leaves it as markup.

**Do not** convert a section to `rich-text` unless the words survive the trip.
Round-trip every conversion and diff the rendered output against the original
fragment. A conversion that loses a link, a line break or an image is a failed
conversion, not an acceptable one.

---

## Acceptance criteria

### 1. Field-by-field, not section-by-section

For **every** block type, list its actual fields — including nested fields
inside item arrays — then confirm each one has an admin input **and** that
editing it changes the live page.

- A field with no input is a bug.
- A field no renderer reads is a bug.
- Both directions must be checked. On the previous pass a fix covering only the
  write side looked complete and was not.

`tests/block-field-coverage.test.ts` shows the shape. Scope every check to the
block's own editor case: searching globally lets `slider.autoplay` mask
`video.autoplay`, and `feature-grid.icon` mask `timeline.icon`, which is exactly
how the first audit produced wrong answers.

### 2. Global content

Header, footer, nav menus, site settings, favicon and social links must all be
editable.

**Known gap:** with a theme pack active, header and footer are Liquid files
inside the zip. Changing a footer phone number means a rebuild and re-upload.
Either drive those regions from the CMS — navigation table for nav, settings for
contact details and social — or state plainly in the deliverable that they are
not editable and why.

**The settings round trip has two field-by-field lists, in different files**:
`values` in `app/api/settings/route.ts` and `initial` in
`app/(admin)/admin/settings/page.tsx`. A field missing from the first is
discarded on save; missing from the second it loads blank **and is then erased**
by the next unrelated save. `tests/settings-persistence.test.ts` guards both.

### 3. Existing patterns only

Use what is there. `Field` + `admin-input` for a labelled input, `MiniField`
inside item rows, `ItemsEditor` for add/remove/reorder, `MediaField` for
anything that points at an uploaded file, `ChipSelect` for a fixed multi-choice.
Ambient values reach deep components through context, as `ThemeDriverContext`
and the admin i18n provider do — not through three levels of props.

No new editor primitives. If something genuinely has no precedent, say so and
propose it before building it.

### 4. Lists add and remove

Every list — social links, nav items, stat cards, team members, slides,
pricing plans — must support **add and remove**, not just edit. `ItemsEditor`
provides all three plus reorder.

Verify by reading the component, not by pattern-matching for a `Plus` icon: on
the last audit that heuristic produced five false positives that reading the
code cleared.

### 5. Colours come from a setting

Repeated brand colours and backgrounds must read from an editable setting, not
be hardcoded in several files.

`components/site/` was clean at the last check — every colour goes through the
theme tokens in `lib/theme/slots.ts`. A theme pack's own stylesheet is a
different matter: it is a third-party asset and may hardcode freely, but any
colour the CMS shell paints beside it must come from the settings so the two
cannot drift. Confirm rather than assume; the check is
`grep -rhoE "#[0-9a-fA-F]{6}" components/site/`.

### 6. A dead input is a bug

An input that saves nothing and an input with no effect on the page are the same
defect to a client: they change something, see no error, and get no result.
Neither may ship. Where a value is deliberately ignored in some configuration —
as block types outside a pack's support are — the UI must say so at the moment
of choosing, not leave it to be discovered on the live site.

---

## How to verify

Reading source is acceptable and is what the existing tests do; this suite has
no DOM. Guard every regex with its own assertion, so a restructured dispatch
fails loudly instead of passing vacuously.

Every claim in the deliverable must be backed by something that was run. Report
what passed, what failed and what was not checked, separately. `npm test`,
`npm run lint`, `npm run typecheck` and `npm run build` all have to be green;
`npm run build` needs `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`
and `NEXT_PUBLIC_APP_URL` set to throwaway values, and prints database
connection errors from prerender probes that are not failures — check the exit
code.

Do not run `npm run setup:check`. It drops and recreates a database.

---

## Traps that cost time last round

| Trap | What happens |
|---|---|
| Importing a server module into a Client Component | `node:crypto` is not handled by plugins — the build fails outright. Keep shared constants in a dependency-free module |
| Running prettier | There is no prettier config; it reformats whole files and buries the real diff |
| `{# … #}` in a template | Jinja, not Liquid. liquidjs prints it onto the page |
| A `<script>` in a template | Never runs — content reaches the page via `innerHTML` |
| `htmlPasteMode` left at `safe` | Strips `id`, `class` and `style`; every migrated page renders as loose text |
| Assuming a media folder is a path | It is a label. The URL is a UUID under a year/month prefix |
| No volume on the instance | Theme packs live on local disk under `THEMES_DIR` and die on every deploy |

---

## Out of scope

Do not merge to `master`. Do not run destructive scripts. Do not change the
existing single-`html`-block path until the structured path is proven on one
page — the fifteen pages already published must keep rendering exactly as they
do now.
