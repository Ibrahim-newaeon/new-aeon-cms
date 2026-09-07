# Theme engine investment

Single-repo plan (no `cms-package` fork). Baseline tag: `v1.0.0-baseline`.

## Phase 1 — Paste HTML v2 ✅

- Sanitiser tiers: `safe` | `designer` | `trusted` (`settings.html_paste_mode`)
- Theme driver setting: `builtin` | `html-pack` (only builtin implemented)
- Document unwrap, `<style>` extract, CSS scoping
- Block flags: `isolate`, `fullPage` (blank chrome)
- Migration `0016_paste_html_v2`

## Phase 2 — HTML theme zip v1 ✅

- Package: `theme.json` + `templates/` + `partials/` + `assets/`
- Upload / activate / delete via Settings → Appearance (`ThemesPanel`)
- Liquid templates for `home` | `page` | `post` | `blog`
- Cart, checkout, account, shop stay on builtin React
- Sample pack: `themes/samples/minimal.zip`
- Migration `0017_html_theme_packs`
- Static assets: `/theme-assets/{themeId}/...`

## Phase 3 — PHP theme convert

Convert-only importer that emits an HTML pack. Do not run PHP themes in production.
