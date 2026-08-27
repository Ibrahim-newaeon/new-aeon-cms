# Dependency changes required for the Tier 3/4 fixes

Add to `devDependencies`:

```json
"@tailwindcss/typography": "^0.5.15"
```

`tailwind.config.ts` now imports it. Without the package installed the config
throws at build time.

Remove from the install command in the setup docs:

```
@types/argon2   <-- does not exist on npm; argon2 ships its own types
```

`tailwindcss-animate` moves from `require()` to a real import, so it must be a
dependency of the config's module graph (it already is).

## Tier 2 additions

```json
"sanitize-html": "^2.13.1",
"@tiptap/html": "^2.11.0"
```

```json
"@types/sanitize-html": "^2.13.0"   // devDependencies
```

`@tiptap/html` provides `generateHTML` for server-side rendering of the
`rich-text` block. `sanitize-html` backs `lib/blocks/sanitize.ts`; without it
both HTML sinks in the renderer are stored-XSS vectors.
