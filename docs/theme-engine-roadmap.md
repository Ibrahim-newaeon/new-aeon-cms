# Theme engine investment

Single-repo plan (no `cms-package` fork). Baseline tag: `v1.0.0-baseline`.

## Phase 1 — Paste HTML v2 ✅

- Sanitiser tiers: `safe` | `designer` | `trusted` (`settings.html_paste_mode`)
- Theme driver setting: `builtin` | `html-pack` (only builtin implemented)
- Document unwrap, `<style>` extract, CSS scoping
- Block flags: `isolate`, `fullPage` (blank chrome)
- Migration `0016_paste_html_v2`

## Phase 2 — HTML theme zip v1 (next)

Package format (draft):

```text
theme.zip
  theme.json          # name, version, templates map
  assets/
  templates/          # layout, home, page, post
  partials/           # header, footer
```

Scope for v1: marketing pages + home + blog. Cart, checkout, account stay on builtin React.

Needs: zip validate/store, template engine (Liquid/Handlebars-class), route→template map, asset serving, activate/rollback to builtin.

## Phase 3 — PHP theme convert

Convert-only importer that emits an HTML pack. Do not run PHP themes in production.
