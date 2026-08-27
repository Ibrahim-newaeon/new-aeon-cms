
# Content Block Architecture — Corrected

## The Realization

**ContentBlock[]** and **TipTap document** are completely different data types that happen to share some field names.

| Aspect | ContentBlock | TipTap Document |
|--------|-------------|-----------------|
| Purpose | Page layout sections | Rich text prose |
| Examples | hero, testimonial, cta, pricing, feature-grid | paragraph, heading, bulletList |
| Shape | `{ type: 'paragraph', text: 'hi' }` | `{ type: 'paragraph', content: [{type:'text', text:'hi'}] }` |
| Who emits | Our form builder | TipTap editor |

## Correct Design (from your answers)

```typescript
// body is ALWAYS ContentBlock[]
body: ContentBlock[]

// One specific block type holds TipTap content opaquely
interface RichTextBlock {
  type: 'rich-text';
  content: object; // TipTap JSON document — we don't parse this
}
```

**Rendering**: TipTap block uses `@tiptap/html` or `generateHTML()` to produce HTML string. We don't traverse its internals.

---

## Corrected ContentBlock Union

```typescript
type ContentBlock =
  // Layout blocks (our system)
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
  | { type: 'html'; content: string } // sanitized
  
  // Complex layout blocks
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
  | { type: 'product-grid'; productIds: string[]; layout: 'grid' | 'list' | 'carousel' } // e-commerce only
  
  // THE KEY BLOCK: Rich text via TipTap
  | { type: 'rich-text'; content: object } // TipTap JSON document — opaque to us
  
  // Developer extension
  | { type: 'custom'; component: string; props: Record<string, unknown> };
```

---

## Corrected RichEditor Component

```typescript
// components/admin/rich-editor.tsx
'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { Bold, Italic, List, ListOrdered, Image as ImageIcon, Link as LinkIcon, Heading1, Heading2, Quote, Undo, Redo } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RichEditorProps {
  value: object; // TipTap document
  onChange: (value: object) => void;
  placeholder?: string;
}

export function RichEditor({ value, onChange, placeholder = 'ابدأ الكتابة هنا...' }: RichEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Image,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    onUpdate: ({ editor }) => {
      onChange(editor.getJSON());
    },
  });

  if (!editor) return null;

  // ... toolbar JSX same as before ...

  return (
    <div className="border border-[var(--admin-line)] rounded-lg overflow-hidden">
      {/* toolbar */}
      <EditorContent editor={editor} className="prose prose-invert max-w-none p-4 min-h-[300px] bg-[var(--admin-surface)]" />
    </div>
  );
}
```

**Usage in page form**:
```typescript
// Inside LocaleTabs:
{formData.body.map((block, idx) => (
  block.type === 'rich-text' ? (
    <RichEditor
      value={block.content}
      onChange={(tipTapDoc) => updateBlock(idx, { ...block, content: tipTapDoc })}
    />
  ) : (
    // ... other block editors
  )
))}
```

---

## Corrected ContentRenderer

```typescript
// components/site/content-renderer.tsx
import { generateHTML } from '@tiptap/html';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';

// TipTap extensions needed for HTML generation
const tiptapExtensions = [StarterKit, Image, Link];

interface ContentBlock {
  type: string;
  [key: string]: any;
}

interface ContentRendererProps {
  blocks: ContentBlock[];
}

export function ContentRenderer({ blocks }: ContentRendererProps) {
  if (!blocks || !Array.isArray(blocks)) return null;

  return (
    <div className="space-y-6">
      {blocks.map((block, idx) => (
        <BlockRenderer key={idx} block={block} />
      ))}
    </div>
  );
}

function BlockRenderer({ block }: { block: ContentBlock }) {
  switch (block.type) {
    // --- Layout blocks (our shapes) ---
    
    case 'heading':
      const HeadingTag = `h${block.level}` as keyof JSX.IntrinsicElements;
      return (
        <HeadingTag id={block.anchor} className={`font-bold text-gray-900 ${
          block.level === 1 ? 'text-3xl' : block.level === 2 ? 'text-2xl' : block.level === 3 ? 'text-xl' : 'text-lg'
        }`}>
          {block.text}
        </HeadingTag>
      );

    case 'paragraph':
      return <p className="text-gray-700 leading-relaxed">{block.text}</p>;

    case 'image':
      return (
        <figure className="my-8">
          <img src={block.src} alt={block.alt} className="w-full rounded-lg" />
          {block.caption && <figcaption className="text-center text-sm text-gray-500 mt-2">{block.caption}</figcaption>}
        </figure>
      );

    // ... all other layout blocks ...

    // --- THE KEY CASE: Rich text via TipTap ---
    case 'rich-text':
      // TipTap generates HTML string from its document
      const html = generateHTML(block.content, tiptapExtensions);
      return (
        <div 
          className="prose prose-lg max-w-none"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );

    default:
      return null;
  }
}
```

---

## Corrected Schema

```typescript
// lib/db/schema.ts — contentI18n.body
body: jsonb('body').$type<ContentBlock[]>(),
```

---

## Summary

| What I Got Wrong | The Truth |
|-----------------|-----------|
| `body` stores TipTap doc | `body` stores `ContentBlock[]`; one block holds TipTap doc |
| `paragraph` in TipTap = `paragraph` in ContentBlock | Same name, completely different shapes |
| We'd traverse TipTap nodes in renderer | We never traverse TipTap nodes — we pass the whole doc to `generateHTML()` |
| Marks need manual case arms | Marks rendered by TipTap's own HTML generator |

**The rule**: ContentBlock is OUR format. TipTap format lives ONLY inside `rich-text` blocks, and we treat it as opaque.
