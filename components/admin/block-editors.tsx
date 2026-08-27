// components/admin/block-editors.tsx
'use client';

import { TestimonialEditor } from './blocks/testimonial-editor';
import { ItemsEditor, MiniField, ChipSelect } from './blocks/items-editor';
import { MediaField } from './media-field';
import {
  TableEditor, PricingEditor, ComparisonEditor, ProductGridEditor, CustomEditor,
} from './blocks/grid-editors';
import { BLOCK_LABELS, isSafeUrl } from '@/lib/blocks/defaults';
import type { ContentBlock } from '@/lib/blocks/types';

interface BlockEditorProps {
  block: ContentBlock;
  onChange: (block: ContentBlock) => void;
}

/**
 * Per-block editors. `rich-text` is handled by BlockBuilder directly so the
 * TipTap bundle is not pulled into this module.
 */
export function BlockEditor({ block, onChange }: BlockEditorProps) {
  switch (block.type) {
    case 'heading':
      return (
        <div className="space-y-3">
          <Field label="المستوى" htmlFor="heading-level">
            <select
              id="heading-level"
              className="admin-input"
              value={block.level}
              onChange={(e) =>
                onChange({ ...block, level: Number(e.target.value) as 1 | 2 | 3 | 4 })
              }
              data-test-id="heading-level"
            >
              <option value={1}>H1</option>
              <option value={2}>H2</option>
              <option value={3}>H3</option>
              <option value={4}>H4</option>
            </select>
          </Field>

          <Field label="النص" htmlFor="heading-text">
            <input
              id="heading-text"
              type="text"
              className="admin-input"
              value={block.text}
              onChange={(e) => onChange({ ...block, text: e.target.value })}
              data-test-id="heading-text"
            />
          </Field>

          <Field label="معرّف الرابط (anchor)" htmlFor="heading-anchor">
            <input
              id="heading-anchor"
              type="text"
              dir="ltr"
              className="admin-input text-start"
              value={block.anchor ?? ''}
              onChange={(e) => onChange({ ...block, anchor: e.target.value || undefined })}
              placeholder="section-id"
            />
          </Field>
        </div>
      );

    case 'paragraph':
      return (
        <div className="space-y-3">
          <Field label="النص" htmlFor="para-text">
            <textarea
              id="para-text"
              rows={4}
              className="admin-input resize-y"
              value={block.text}
              onChange={(e) => onChange({ ...block, text: e.target.value })}
              data-test-id="paragraph-text"
            />
          </Field>

          <Field label="المحاذاة" htmlFor="para-align">
            <select
              id="para-align"
              className="admin-input"
              value={block.align ?? 'left'}
              onChange={(e) =>
                onChange({
                  ...block,
                  align: e.target.value as NonNullable<typeof block.align>,
                })
              }
              data-test-id="paragraph-align"
            >
              {/* 'left'/'right' are the union's values but render as logical
                  start/end, so the labels describe reading order, not sides. */}
              <option value="left">بداية السطر</option>
              <option value="right">نهاية السطر</option>
              <option value="center">وسط</option>
              <option value="justify">ضبط</option>
            </select>
          </Field>
        </div>
      );

    case 'image':
      return (
        <div className="space-y-3">
          <MediaField
            label="رابط الصورة"
            value={block.src}
            onChange={(src) => onChange({ ...block, src })}
            testId="image-src"
          />
          <Field label="نص بديل (alt)" htmlFor="image-alt">
            <input
              id="image-alt"
              type="text"
              className="admin-input"
              value={block.alt}
              onChange={(e) => onChange({ ...block, alt: e.target.value })}
              data-test-id="image-alt"
            />
            <p className="mt-1 text-xs text-[var(--admin-text-muted)]">
              اتركه فارغاً فقط إذا كانت الصورة زخرفية.
            </p>
          </Field>
          <Field label="العرض" htmlFor="image-layout">
            <select
              id="image-layout"
              className="admin-input"
              value={block.layout}
              onChange={(e) =>
                onChange({ ...block, layout: e.target.value as typeof block.layout })
              }
            >
              <option value="normal">عادي</option>
              <option value="wide">عريض</option>
              <option value="full">كامل</option>
            </select>
          </Field>
        </div>
      );

    case 'quote':
      return (
        <div className="space-y-3">
          <Field label="الاقتباس" htmlFor="quote-text">
            <textarea
              id="quote-text"
              rows={3}
              className="admin-input resize-y"
              value={block.text}
              onChange={(e) => onChange({ ...block, text: e.target.value })}
              data-test-id="quote-text"
            />
          </Field>
          <Field label="القائل" htmlFor="quote-author">
            <input
              id="quote-author"
              type="text"
              className="admin-input"
              value={block.author ?? ''}
              onChange={(e) => onChange({ ...block, author: e.target.value || undefined })}
            />
          </Field>
          <Field label="النمط" htmlFor="quote-style">
            <select
              id="quote-style"
              className="admin-input"
              value={block.style}
              onChange={(e) =>
                onChange({ ...block, style: e.target.value as typeof block.style })
              }
            >
              <option value="bordered">بإطار جانبي</option>
              <option value="pull">اقتباس بارز</option>
            </select>
          </Field>
        </div>
      );

    case 'button':
      return (
        <div className="space-y-3">
          <Field label="النص" htmlFor="btn-text">
            <input
              id="btn-text"
              type="text"
              className="admin-input"
              value={block.text}
              onChange={(e) => onChange({ ...block, text: e.target.value })}
              data-test-id="button-text"
            />
          </Field>
          <UrlField
            label="الرابط"
            value={block.url}
            onChange={(url) => onChange({ ...block, url })}
            testId="button-url"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="النمط" htmlFor="btn-variant">
              <select
                id="btn-variant"
                className="admin-input"
                value={block.variant}
                onChange={(e) =>
                  onChange({ ...block, variant: e.target.value as typeof block.variant })
                }
              >
                <option value="primary">أساسي</option>
                <option value="secondary">ثانوي</option>
                <option value="outline">محدّد</option>
                <option value="ghost">شفاف</option>
              </select>
            </Field>
            <Field label="الحجم" htmlFor="btn-size">
              <select
                id="btn-size"
                className="admin-input"
                value={block.size}
                onChange={(e) =>
                  onChange({ ...block, size: e.target.value as typeof block.size })
                }
              >
                <option value="sm">صغير</option>
                <option value="md">متوسط</option>
                <option value="lg">كبير</option>
              </select>
            </Field>
          </div>
        </div>
      );

    case 'divider':
      return (
        <Field label="النمط" htmlFor="divider-style">
          <select
            id="divider-style"
            className="admin-input"
            value={block.style}
            onChange={(e) =>
              onChange({ ...block, style: e.target.value as typeof block.style })
            }
            data-test-id="divider-style"
          >
            <option value="line">خط</option>
            <option value="space">مسافة</option>
            <option value="dots">نقاط</option>
            {/* 'stars' is in the union but was missing from the picker. */}
            <option value="stars">نجوم</option>
          </select>
        </Field>
      );

    case 'spacer':
      return (
        <Field label="الارتفاع (rem)" htmlFor="spacer-height">
          <input
            id="spacer-height"
            type="number"
            dir="ltr"
            className="admin-input text-start"
            value={block.height}
            min={0.5}
            max={20}
            step={0.5}
            onChange={(e) => onChange({ ...block, height: Number(e.target.value) })}
            data-test-id="spacer-height"
          />
        </Field>
      );

    case 'html':
      return (
        <Field label="HTML" htmlFor="html-content">
          <textarea
            id="html-content"
            rows={8}
            dir="ltr"
            className="admin-input resize-y font-mono text-xs text-start"
            value={block.content}
            onChange={(e) => onChange({ ...block, content: e.target.value })}
            data-test-id="html-content"
          />
          <p className="mt-1 text-xs text-[var(--admin-warning)]">
            يُنقّى المحتوى قبل العرض: الوسوم والسمات غير المسموح بها تُحذف.
          </p>
        </Field>
      );

    case 'cta':
      return (
        <div className="space-y-3">
          <Field label="العنوان" htmlFor="cta-title">
            <input id="cta-title" type="text" className="admin-input" value={block.title}
              onChange={(e) => onChange({ ...block, title: e.target.value })} data-test-id="cta-title" />
          </Field>
          <Field label="النص" htmlFor="cta-text">
            <textarea id="cta-text" rows={2} className="admin-input resize-y" value={block.text}
              onChange={(e) => onChange({ ...block, text: e.target.value })} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <MiniField label="نص الزر" value={block.button.text}
              onChange={(v) => onChange({ ...block, button: { ...block.button, text: v } })} />
            <MiniField label="رابط الزر" ltr value={block.button.url}
              onChange={(v) => onChange({ ...block, button: { ...block.button, url: v } })} />
          </div>
          <MediaField label="صورة الخلفية" value={block.backgroundImage ?? ''}
            onChange={(v) => onChange({ ...block, backgroundImage: v || undefined })} testId="cta-bg" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={block.overlay ?? false}
              onChange={(e) => onChange({ ...block, overlay: e.target.checked })} />
            طبقة تعتيم فوق الصورة
          </label>
        </div>
      );

    case 'feature-grid':
      return (
        <div className="space-y-3">
          <Field label="عدد الأعمدة" htmlFor="fg-cols">
            <select id="fg-cols" className="admin-input" value={block.columns}
              onChange={(e) => onChange({ ...block, columns: Number(e.target.value) as 2 | 3 | 4 })}>
              <option value={2}>2</option><option value={3}>3</option><option value={4}>4</option>
            </select>
          </Field>
          <ItemsEditor
            items={block.items} testId="feature-grid" addLabel="إضافة ميزة"
            emptyLabel="لا توجد مميزات بعد"
            createItem={() => ({ title: '', description: '' })}
            onChange={(items) => onChange({ ...block, items })}
            renderItem={(item, update) => (
              <div className="space-y-2">
                <MiniField label="أيقونة (اختياري)" value={item.icon ?? ''}
                  onChange={(v) => update({ icon: v || undefined })} placeholder="★" />
                <MiniField label="العنوان" value={item.title} onChange={(v) => update({ title: v })} />
                <MiniField label="الوصف" value={item.description}
                  onChange={(v) => update({ description: v })} />
              </div>
            )}
          />
        </div>
      );

    case 'stats':
      return (
        <ItemsEditor
          items={block.items} testId="stats" addLabel="إضافة إحصائية"
          emptyLabel="لا توجد إحصائيات بعد"
          createItem={() => ({ value: '', label: '' })}
          onChange={(items) => onChange({ ...block, items })}
          renderItem={(item, update) => (
            <div className="grid gap-2 sm:grid-cols-2">
              <MiniField label="القيمة" ltr value={item.value} onChange={(v) => update({ value: v })} />
              <MiniField label="التسمية" value={item.label} onChange={(v) => update({ label: v })} />
              <MiniField label="بادئة" ltr value={item.prefix ?? ''}
                onChange={(v) => update({ prefix: v || undefined })} />
              <MiniField label="لاحقة" ltr value={item.suffix ?? ''}
                onChange={(v) => update({ suffix: v || undefined })} />
            </div>
          )}
        />
      );

    case 'gallery':
      return (
        <div className="space-y-3">
          <Field label="التخطيط" htmlFor="gal-layout">
            <select id="gal-layout" className="admin-input" value={block.layout}
              onChange={(e) => onChange({ ...block, layout: e.target.value as typeof block.layout })}>
              <option value="grid">شبكة</option><option value="masonry">متداخل</option>
              <option value="carousel">شريط</option><option value="slideshow">عرض شرائح</option>
            </select>
          </Field>
          <ItemsEditor
            items={block.images} testId="gallery" addLabel="إضافة صورة"
            emptyLabel="لا توجد صور بعد"
            createItem={() => ({ src: '', alt: '' })}
            onChange={(images) => onChange({ ...block, images })}
            renderItem={(img, update) => (
              <div className="space-y-2">
                <MiniField label="الرابط" ltr value={img.src} onChange={(v) => update({ src: v })} />
                <MiniField label="نص بديل" value={img.alt} onChange={(v) => update({ alt: v })} />
              </div>
            )}
          />
        </div>
      );

    case 'video':
      return (
        <div className="space-y-3">
          <Field label="المصدر" htmlFor="vid-provider">
            <select id="vid-provider" className="admin-input" value={block.provider}
              onChange={(e) => onChange({ ...block, provider: e.target.value as typeof block.provider })}>
              <option value="youtube">YouTube</option><option value="vimeo">Vimeo</option>
              <option value="self">ملف مستضاف</option>
            </select>
          </Field>
          <UrlField label="رابط الفيديو" value={block.url}
            onChange={(url) => onChange({ ...block, url })} testId="video-url" />
          <MediaField label="صورة الغلاف" value={block.poster ?? ''}
            onChange={(v) => onChange({ ...block, poster: v || undefined })} testId="video-poster" />
        </div>
      );

    case 'embed':
      return (
        <div className="space-y-3">
          <Field label="المنصة" htmlFor="emb-provider">
            <select id="emb-provider" className="admin-input" value={block.provider}
              onChange={(e) => onChange({ ...block, provider: e.target.value as typeof block.provider })}>
              <option value="instagram">Instagram</option><option value="twitter">Twitter</option>
              <option value="tiktok">TikTok</option><option value="facebook">Facebook</option>
            </select>
          </Field>
          <UrlField label="رابط المنشور" value={block.url}
            onChange={(url) => onChange({ ...block, url })} testId="embed-url" />
          <p className="text-xs text-[var(--admin-text-muted)]">
            يُعرض كبطاقة رابط؛ سياسة الأمان (CSP) تمنع سكربتات المنصات الخارجية.
          </p>
        </div>
      );

    case 'team':
      return (
        <ItemsEditor
          items={block.members} testId="team" addLabel="إضافة عضو"
          emptyLabel="لا يوجد أعضاء بعد"
          createItem={() => ({ name: '', role: '' })}
          onChange={(members) => onChange({ ...block, members })}
          renderItem={(m, update) => (
            <div className="space-y-2">
              <MiniField label="الاسم" value={m.name} onChange={(v) => update({ name: v })} />
              <MiniField label="المسمى" value={m.role} onChange={(v) => update({ role: v })} />
              <MiniField label="نبذة" value={m.bio ?? ''} onChange={(v) => update({ bio: v || undefined })} />
              <MiniField label="الصورة" ltr value={m.photo ?? ''}
                onChange={(v) => update({ photo: v || undefined })} />
            </div>
          )}
        />
      );

    case 'timeline':
      return (
        <ItemsEditor
          items={block.items} testId="timeline" addLabel="إضافة حدث"
          emptyLabel="لا توجد أحداث بعد"
          createItem={() => ({ date: '', title: '', description: '' })}
          onChange={(items) => onChange({ ...block, items })}
          renderItem={(item, update) => (
            <div className="space-y-2">
              <MiniField label="التاريخ" ltr value={item.date} onChange={(v) => update({ date: v })} />
              <MiniField label="العنوان" value={item.title} onChange={(v) => update({ title: v })} />
              <MiniField label="الوصف" value={item.description}
                onChange={(v) => update({ description: v })} />
            </div>
          )}
        />
      );

    case 'social-links':
      return (
        <div className="space-y-3">
          <ChipSelect
            label="المنصات"
            options={['facebook', 'instagram', 'twitter', 'linkedin', 'youtube', 'tiktok'] as const}
            selected={block.platforms}
            onChange={(platforms) => onChange({ ...block, platforms })}
          />
          <Field label="الشكل" htmlFor="soc-style">
            <select id="soc-style" className="admin-input" value={block.style}
              onChange={(e) => onChange({ ...block, style: e.target.value as typeof block.style })}>
              <option value="icons">أيقونات</option><option value="buttons">أزرار</option>
              <option value="floating">عائم</option>
            </select>
          </Field>
        </div>
      );

    case 'recent-posts':
      return (
        <div className="space-y-3">
          <MiniField label="العنوان" value={block.title} onChange={(v) => onChange({ ...block, title: v })} />
          <div className="grid gap-3 sm:grid-cols-2">
            <MiniField label="العدد" type="number" ltr value={block.count}
              onChange={(v) => onChange({ ...block, count: Math.max(1, Math.min(12, Number(v) || 1)) })} />
            <Field label="التخطيط" htmlFor="rp-layout">
              <select id="rp-layout" className="admin-input" value={block.layout}
                onChange={(e) => onChange({ ...block, layout: e.target.value as typeof block.layout })}>
                <option value="grid">شبكة</option><option value="list">قائمة</option>
                <option value="carousel">شريط</option>
              </select>
            </Field>
          </div>
        </div>
      );

    case 'map':
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <MiniField label="خط العرض" type="number" ltr value={block.location.lat}
            onChange={(v) => onChange({ ...block, location: { ...block.location, lat: Number(v) || 0 } })} />
          <MiniField label="خط الطول" type="number" ltr value={block.location.lng}
            onChange={(v) => onChange({ ...block, location: { ...block.location, lng: Number(v) || 0 } })} />
          <MiniField label="التقريب" type="number" ltr value={block.zoom ?? 13}
            onChange={(v) => onChange({ ...block, zoom: Number(v) || 13 })} />
          <MiniField label="اسم الموقع" value={block.marker ?? ''}
            onChange={(v) => onChange({ ...block, marker: v || undefined })} />
        </div>
      );

    case 'newsletter':
      return (
        <div className="space-y-3">
          <MiniField label="العنوان" value={block.title} onChange={(v) => onChange({ ...block, title: v })} />
          <MiniField label="الوصف" value={block.description ?? ''}
            onChange={(v) => onChange({ ...block, description: v || undefined })} />
          <MiniField label="نص الزر" value={block.buttonText ?? ''}
            onChange={(v) => onChange({ ...block, buttonText: v || undefined })} />
          <p className="text-xs text-[var(--admin-warning)]">
            يتطلب نقطة استقبال للاشتراكات — غير مُنفّذة بعد.
          </p>
        </div>
      );

    case 'contact-form':
      return (
        <div className="space-y-3">
          <ChipSelect
            label="الحقول"
            options={['name', 'email', 'phone', 'subject', 'message'] as const}
            selected={block.fields}
            onChange={(fields) => onChange({ ...block, fields })}
            labels={{ name: 'الاسم', email: 'البريد', phone: 'الهاتف', subject: 'الموضوع', message: 'الرسالة' }}
          />
          <MiniField label="نص زر الإرسال" value={block.submitLabel ?? ''}
            onChange={(v) => onChange({ ...block, submitLabel: v || undefined })} />
          <p className="text-xs text-[var(--admin-warning)]">
            يتطلب نقطة استقبال للرسائل — غير مُنفّذة بعد.
          </p>
        </div>
      );

    case 'table':
      return <TableEditor block={block} onChange={onChange} />;

    case 'pricing':
      return <PricingEditor block={block} onChange={onChange} />;

    case 'comparison':
      return <ComparisonEditor block={block} onChange={onChange} />;

    case 'product-grid':
      return <ProductGridEditor block={block} onChange={onChange} />;

    case 'custom':
      return <CustomEditor block={block} onChange={onChange} />;

    case 'testimonial':

      // `columns` is optional on the union but carries a Zod default, so the
      // editor's input type has it required. Normalize rather than widening
      // the schema, which would lose the default.
      return (
        <TestimonialEditor
          value={{ ...block, columns: block.columns ?? 3 }}
          onChange={onChange}
        />
      );

    default:
      return (
        <p className="text-sm text-[var(--admin-text-muted)]">
          محرر «{BLOCK_LABELS[block.type]}» قيد التطوير. يمكن حفظ القسم بقيمه الافتراضية.
        </p>
      );
  }
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-2 block text-sm text-[var(--admin-text-secondary)]">
        {label}
      </label>
      {children}
    </div>
  );
}

/** URL input that surfaces unsafe schemes at entry time. */
function UrlField({
  label,
  value,
  onChange,
  testId,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  testId: string;
}) {
  const invalid = value.length > 0 && !isSafeUrl(value);
  return (
    <div>
      <label htmlFor={testId} className="mb-2 block text-sm text-[var(--admin-text-secondary)]">
        {label}
      </label>
      <input
        id={testId}
        type="text"
        dir="ltr"
        className="admin-input text-start"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://… أو /uploads/…"
        aria-invalid={invalid}
        data-test-id={testId}
      />
      {invalid && (
        <p role="alert" className="mt-1 text-xs text-[var(--admin-danger)]">
          رابط غير صالح. استخدم http/https أو مساراً يبدأ بـ /
        </p>
      )}
    </div>
  );
}
