// components/admin/rich-text-block-editor.tsx
'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TiptapImage from '@tiptap/extension-image';
import TiptapLink from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Bold, Italic, List, ListOrdered, Quote,
  Image as ImageIcon, Link as LinkIcon, Undo, Redo,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { isSafeUrl } from '@/lib/blocks/defaults';
import type { ContentBlock } from '@/lib/blocks/types';
import { useT } from './i18n-provider';

type RichTextBlock = Extract<ContentBlock, { type: 'rich-text' }>;

interface RichTextBlockEditorProps {
  block: RichTextBlock;
  onChange: (block: RichTextBlock) => void;
}

export function RichTextBlockEditor({ block, onChange }: RichTextBlockEditorProps) {
  const t = useT();
  const editor = useEditor({
    extensions: [
      StarterKit,
      TiptapImage,
      TiptapLink.configure({
        openOnClick: false,
        // Belt-and-braces with isSafeUrl below; TipTap will drop a pasted
        // javascript: link too.
        protocols: ['http', 'https', 'mailto', 'tel'],
      }),
      Placeholder.configure({ placeholder: t('editor.placeholder') }),
    ],
    content: block.content,
    // Required under React 19 / App Router: without it TipTap renders during
    // SSR and React reports a hydration mismatch.
    immediatelyRender: false,
    editorProps: {
      attributes: { 'data-test-id': 'rich-text-editor-surface' },
    },
    onUpdate: ({ editor }) => {
      onChange({ type: 'rich-text', content: editor.getJSON() as RichTextBlock['content'] });
    },
  });

  if (!editor) {
    return (
      <div className="h-[300px] animate-pulse rounded-lg bg-[var(--admin-surface)]" />
    );
  }

  const promptForUrl = (message: string, apply: (url: string) => void) => {
    const url = window.prompt(message);
    if (url === null) return;
    if (!isSafeUrl(url)) {
      window.alert(t('editor.invalidUrl'));
      return;
    }
    apply(url.trim());
  };

  return (
    <div className="border border-[var(--admin-line)] rounded-lg overflow-hidden">
      <div
        role="toolbar"
        aria-label={t('editor.toolbar')}
        className="flex items-center gap-1 p-2 border-b border-[var(--admin-line)] bg-[var(--admin-elevated)] flex-wrap"
      >
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive('bold')}
          label={t('editor.bold')}
          testId="rt-bold"
        >
          <Bold size={16} aria-hidden="true" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive('italic')}
          label={t('editor.italic')}
          testId="rt-italic"
        >
          <Italic size={16} aria-hidden="true" />
        </ToolbarButton>

        <Separator />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive('bulletList')}
          label={t('editor.bulletList')}
          testId="rt-bullet"
        >
          <List size={16} aria-hidden="true" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive('orderedList')}
          label={t('editor.orderedList')}
          testId="rt-ordered"
        >
          <ListOrdered size={16} aria-hidden="true" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          isActive={editor.isActive('blockquote')}
          label={t('editor.quote')}
          testId="rt-quote"
        >
          <Quote size={16} aria-hidden="true" />
        </ToolbarButton>

        <Separator />

        <ToolbarButton
          onClick={() =>
            promptForUrl(t('editor.imageUrl'), (url) =>
              editor.chain().focus().setImage({ src: url }).run()
            )
          }
          label={t('editor.insertImage')}
          testId="rt-image"
        >
          <ImageIcon size={16} aria-hidden="true" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() =>
            promptForUrl(t('editor.linkUrl'), (url) =>
              editor.chain().focus().setLink({ href: url }).run()
            )
          }
          isActive={editor.isActive('link')}
          label={t('editor.insertLink')}
          testId="rt-link"
        >
          <LinkIcon size={16} aria-hidden="true" />
        </ToolbarButton>

        <Separator />

        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          label={t('editor.undo')}
          testId="rt-undo"
        >
          <Undo size={16} aria-hidden="true" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          label={t('editor.redo')}
          testId="rt-redo"
        >
          <Redo size={16} aria-hidden="true" />
        </ToolbarButton>
      </div>

      <EditorContent
        editor={editor}
        className="prose prose-invert max-w-none p-4 min-h-[300px] bg-[var(--admin-surface)]"
      />
    </div>
  );
}

function Separator() {
  return <div className="w-px h-6 bg-[var(--admin-line)] mx-1" aria-hidden="true" />;
}

function ToolbarButton({
  onClick,
  isActive,
  disabled,
  children,
  label,
  testId,
}: {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  label: string;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={isActive}
      data-test-id={testId}
      className={cn(
        'p-2 rounded hover:bg-white/5 transition-colors disabled:opacity-40',
        isActive && 'bg-[var(--admin-primary-muted)] text-[var(--admin-primary)]'
      )}
    >
      {children}
    </button>
  );
}
