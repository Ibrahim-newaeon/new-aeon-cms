# Testimonial block — wiring status

**DONE.** `components/site/content-renderer.tsx` now imports `TestimonialBlock`
and dispatches `case 'testimonial'`. No further wiring needed.

The notes below are retained for the spec bugs they record.

---

## Resolved: `any` in the renderer

`BlockRenderer` used to declare:

```typescript
interface ContentBlock {
  type: string;
  [key: string]: any;   // <-- violates "TypeScript strict, no any"
}
```

Swapping that for the union in `lib/blocks/types.ts` turns every block case
into an exhaustive, checked switch:

```typescript
import type { ContentBlock } from '@/lib/blocks/types';
```

**Both follow-up cleanups are now done too.** Swapping in the union surfaced
type errors in the `gallery` case (`block.images?.map((img: any, ...)`) and the
`heading` case (`` `h${block.level}` `` needing a `const` map to narrow); the
renderer now uses `HEADING_TAG[block.level]`, carries no `any`, and compiles
under `strict`.

---

## Two spec bugs found while implementing

1. **`embed` has a duplicate key.** `new-aeon-mega-prompt.md` declares
   `{ type: 'embed'; url: string; type: 'instagram' | 'twitter' | ... }` —
   `type` appears twice, which does not compile. `lib/blocks/types.ts` renames
   the second to `provider`, matching how the `video` block already does it.

2. **Two different testimonial shapes are documented.**
   `new-aeon-mega-prompt.md` (the authoritative `ContentBlock` union) uses an
   **array**: `{ type: 'testimonial'; items: TestimonialItem[] }`.
   `new-aeon-complete-guides.md` shows **flat single** fields in its Claude Code
   example prompt. This implementation follows the mega-prompt (array), since
   the guides snippet is illustrative prose, not a spec.

## Assumption flagged

`columns?: 1 | 2 | 3` is **an addition beyond the mega-prompt spec**, mirroring
the `columns` field `feature-grid` already carries. It defaults to `3`. Drop it
from `lib/blocks/types.ts` and `lib/blocks/testimonial.ts` if you want to stay
strictly on-spec.

## No database migration needed

`contentI18n.body` is `jsonb` (`lib/db/schema.ts`), so block types are
schema-less. The "add to database schema" step in the guides' example prompt is
a no-op — do **not** run `db:generate` / `db:push` for this change.
