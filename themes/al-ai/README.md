# al-ai.ai theme pack

An HTML theme pack that reproduces the al-ai.ai marketing site on this CMS, plus
the blog the original never had.

What is committed here is the part that is ours to maintain: the manifest, the
templates, the two partials, and starter copy for the two policy pages. The
stylesheet and the script bundle are **built**, not committed, because they are
assembled from ~2 MB of third-party libraries that do not belong in git.

## Layout

| Path | What it is |
|---|---|
| `theme.json` | Manifest. Names all five templates. |
| `templates/layout.html` | Chrome: loader, page transition, cursor, header, footer. |
| `templates/home.html` | Home body — delegates entirely to page content. |
| `templates/page.html` | Every other marketing page, with a title fallback. |
| `templates/post.html` | A blog post. |
| `templates/blog.html` | Blog index, including the empty state. |
| `partials/header.html` | Nav, including the Services dropdown and Blog. |
| `partials/footer.html` | Addresses, phone numbers, social, policy links. |
| `assets/loader.css` | The loader styles that were inline in `index.html`. |
| `content/*.html` | Starter copy for Privacy Policy and Terms. |

## Building the pack

```bash
node scripts/build-theme-pack.mjs --src <drop> --out dist/themes
```

`<drop>` is the unpacked site source, shaped like this:

```
<drop>/css/{helper.css,theme-black.css,bg-noise.png,hero3-overlay.png}
<drop>/js/theme.js
<drop>/vendor/{jquery,gsap,lenis.min.js,isotope,fancybox,swiper,fontawesome}
<drop>/img/{al-ai.png,Revacity.png}
```

Output is `dist/themes/al-ai.zip`, about 1 MB. Upload it in
**Settings → Appearance**, activate it, and set the storefront driver to
`html-pack`.

## Three constraints the build works around

These come from the renderer, and each one silently breaks a pack that ignores it.

**1. One CSS file and one JS file, both at the top of `assets/`.**
`renderThemePage()` discovers them with `fs.readdir(assets)` and emits a tag per
hit (`lib/themes/render.ts`). `readdir` returns filesystem order, not
alphabetical order, so shipping `jquery.min.js` and `theme.js` separately would
load them in an undefined sequence — and `theme.js` needs jQuery to already be
there. Concatenating in source order removes the question. Nested files such as
`assets/img/al-ai.png` are ignored by that scan, which is why they are safe.

**2. A `<script>` in a template never runs.**
The rendered HTML reaches the page through `dangerouslySetInnerHTML`
(`components/site/theme-pack-view.tsx`), and `innerHTML` does not execute
scripts. Everything the original site had inline — the loader dismissal above
all — is in the bundle instead. `tests/al-ai-theme.test.ts` asserts no template
ever grows a script tag.

**3. The CMS renders its own `<body>`.**
The original relied on four classes being on it (`tt-transition`, `tt-noise`,
`tt-magic-cursor`, `tt-smooth-scroll`), which `theme.js` reads with
`hasClass()`. The bundle's prelude re-applies them before anything else runs.

## Page content

The templates hold only the chrome. Every hero and section is page content in
the CMS, so an editor can change any of it without a redeploy.

Generate the starting bodies from the original HTML:

```bash
node scripts/extract-al-ai-content.mjs \
  --src <dir-of-original-html> --out dist/content --locale en --prefix al-ai
```

That writes 13 fragments — 12 marketing pages plus the demo blog post — with
inter-page links rewritten to `/en/<slug>` and media pointed at
`/uploads/al-ai/<file>`. Paste each into its page as an `html` block.

**Set `htmlPasteMode` to `trusted` first.** On `safe` the sanitiser strips the
structural markup these sections are built from, and the pages will render as
loose text.

## Content images live in the media library, not here

Content is stored in the database and rendered without Liquid, so it can never
resolve the `asset` filter or the pack's `/theme-assets/<uuid>/` prefix — and
that prefix changes every time the pack is re-uploaded. Section and banner
images therefore belong in the media library, under `al-ai/`, which is also
where an editor can swap them.

Only chrome images ship in the pack: the logo and the Revacity mark, both
reached from templates through `| asset`.

## Known gaps

| Gap | Detail |
|---|---|
| `ai-driven.png` | Referenced by `services.html`. Missing from the source drop, and **404s on the live site today**. |
| `Ai-video.mp4` | Referenced by `about.html`. Missing from the source drop. |
| Blog demo media | `avatar.png`, `blog-post-1-1200.jpg`, `placeholder.*`, `video-1-1920.*` — placeholders in the demo post, replace with real content. |
| Contact form | Display-only. See below. |
| Policy copy | Templates with `[BRACKETED]` placeholders. Not legal advice, not reviewed. |
| Revacity link | Points at `newaeonjo-001-site3.dtempurl.com`, a temporary hosting domain. |

## The contact form does not send

`theme.js` posts the form to `mail.php`. There is no PHP runtime here, so that
request would 404 and the theme would show its own error styling to somebody who
had just filled the form in — worse than not offering to send at all. The
bundle's postlude unbinds the handler and shows the email address and phone
number instead.

Connecting it later is small: point the POST at `/api/forms` and match the
response shape. The handler to replace is in `theme-before-minify.js` around
line 1600 of the source drop.
