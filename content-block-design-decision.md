
# Content Block Storage Format — Design Decision Required

## The Problem

| Component | Current Code | Produces/Expects |
|-----------|-----------|------------------|
| `RichEditor` (TipTap) | `editor.getJSON()` | `{ type: 'doc', content: [...] }` — **object with array inside** |
| `ContentRenderer` | `blocks.map(...)` | **array directly** |

**Result**: Pages render blank because renderer tries to `.map()` an object.

---

## Option A: Store the Full TipTap Document (Recommended)

Store exactly what TipTap produces: `{ type: 'doc', content: [...] }`

### Schema
```typescript
body: jsonb('body').$type<{ type: 'doc'; content: ContentBlock[] }>()
```

### RichEditor onChange
```typescript
// Already correct — passes getJSON() directly
onChange(editor.getJSON())
```

### ContentRenderer usage
```typescript
// Unwrap the document
<ContentRenderer document={homeContent.i18n.body} />

// Component signature
interface ContentRendererProps {
  document: { type: 'doc'; content: ContentBlock[] } | null;
}

export function ContentRenderer({ document }: ContentRendererProps) {
  if (!document?.content || !Array.isArray(document.content)) return null;
  
  return (
    <div className="space-y-6">
      {document.content.map((block, idx) => (
        <BlockRenderer key={idx} block={block} />
      ))}
    </div>
  );
}
```

**Pros:**
- Native TipTap format — no transformation layer
- Future-proof for TipTap features (marks, node attributes)
- Can re-edit existing content by passing back to editor

**Cons:**
- Slightly more verbose storage

---

## Option B: Store Just the Array

Extract `content` array before storage, wrap on retrieval.

### Schema
```typescript
body: jsonb('body').$type<ContentBlock[]>()
```

### RichEditor onChange (modified)
```typescript
// Extract just the content array
const json = editor.getJSON();
onChange(JSON.stringify(json.content || []));
```

### ContentRenderer (unchanged)
```typescript
// Already expects array
<ContentRenderer blocks={homeContent.i18n.body} />
```

**Pros:**
- Cleaner database values
- Renderer stays simpler

**Cons:**
- Loses TipTap document metadata (version, top-level marks)
- Need to wrap back into `{ type: 'doc', content: [...] }` before re-editing
- Transformation layer introduces bugs

---

## Option C: Hybrid — Store Document, Render from Helper

Store full document, but renderer accepts either format.

```typescript
// Helper to normalize any input to array
function getBlocks(input: unknown): ContentBlock[] {
  if (!input) return [];
  if (Array.isArray(input)) return input;
  if (typeof input === 'object' && input !== null && 'content' in input) {
    return (input as any).content || [];
  }
  return [];
}
```

**Pros:**
- Backward compatible with both formats
- Flexible

**Cons:**
- Magic behavior — harder to debug
- "Works by accident" code smell

---

## My Recommendation: Option A

Store the full TipTap document. It's the native format, requires no transformation, and editing existing content "just works."

---

## Awaiting Your Decision

| Option | Store Format | Render Input |
|--------|-----------|-------------|
| **A** (recommended) | `{ type: 'doc', content: [...] }` | `document.content` |
| **B** | `[...]` (array only) | `blocks` directly |
| **C** | Either (with helper) | Normalized array |

**Please confirm:**
1. Which option?
2. If A: should I also add `marks` support (bold/italic inside paragraphs)?
