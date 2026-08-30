// components/admin/block-editors.tsx
'use client';

import { TestimonialEditor } from './blocks/testimonial-editor';
import { ItemsEditor, MiniField, MiniSelect, ChipSelect } from './blocks/items-editor';
import { MediaField } from './media-field';
import {
  TableEditor, PricingEditor, ComparisonEditor, ProductGridEditor, CustomEditor,
} from './blocks/grid-editors';
import { BLOCK_LABEL_KEYS, isSafeUrl } from '@/lib/blocks/defaults';
import { sliderLimits } from '@/lib/blocks/slider';
import { youTubeId } from '@/lib/blocks/youtube';
import { MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, formatBytes } from '@/lib/media/limits';
import type { ContentBlock } from '@/lib/blocks/types';
import { useT } from './i18n-provider';

interface BlockEditorProps {
  block: ContentBlock;
  onChange: (block: ContentBlock) => void;
}

/**
 * Per-block editors. `rich-text` is handled by BlockBuilder directly so the
 * TipTap bundle is not pulled into this module.
 */
export function BlockEditor({ block, onChange }: BlockEditorProps) {
  const t = useT();
  switch (block.type) {
    case 'heading':
      return (
        <div className="space-y-3">
          <Field label={t('be.level')} htmlFor="heading-level">
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

          <Field label={t('be.text')} htmlFor="heading-text">
            <input
              id="heading-text"
              type="text"
              className="admin-input"
              value={block.text}
              onChange={(e) => onChange({ ...block, text: e.target.value })}
              data-test-id="heading-text"
            />
          </Field>

          <Field label={t('be.anchor')} htmlFor="heading-anchor">
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
          <Field label={t('be.text')} htmlFor="para-text">
            <textarea
              id="para-text"
              rows={4}
              className="admin-input resize-y"
              value={block.text}
              onChange={(e) => onChange({ ...block, text: e.target.value })}
              data-test-id="paragraph-text"
            />
          </Field>

          <Field label={t('be.align')} htmlFor="para-align">
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
              <option value="left">{t('be.alignStart')}</option>
              <option value="right">{t('be.alignEnd')}</option>
              <option value="center">{t('be.alignCenter')}</option>
              <option value="justify">{t('be.alignJustify')}</option>
            </select>
          </Field>
        </div>
      );

    case 'image':
      return (
        <div className="space-y-3">
          <MediaField
            label={t('be.imageUrl')}
            value={block.src}
            onChange={(src) => onChange({ ...block, src })}
            testId="image-src"
          />
          <Field label={t('be.alt')} htmlFor="image-alt">
            <input
              id="image-alt"
              type="text"
              className="admin-input"
              value={block.alt}
              onChange={(e) => onChange({ ...block, alt: e.target.value })}
              data-test-id="image-alt"
            />
            <p className="mt-1 text-xs text-[var(--admin-text-muted)]">
              {t('be.altHint')}
            </p>
          </Field>
          <Field label={t('be.width')} htmlFor="image-layout">
            <select
              id="image-layout"
              className="admin-input"
              value={block.layout}
              onChange={(e) =>
                onChange({ ...block, layout: e.target.value as typeof block.layout })
              }
            >
              <option value="normal">{t('be.widthNormal')}</option>
              <option value="wide">{t('be.widthWide')}</option>
              <option value="full">{t('be.widthFull')}</option>
            </select>
          </Field>
        </div>
      );

    case 'quote':
      return (
        <div className="space-y-3">
          <Field label={t('be.quote')} htmlFor="quote-text">
            <textarea
              id="quote-text"
              rows={3}
              className="admin-input resize-y"
              value={block.text}
              onChange={(e) => onChange({ ...block, text: e.target.value })}
              data-test-id="quote-text"
            />
          </Field>
          <Field label={t('be.quoteAuthor')} htmlFor="quote-author">
            <input
              id="quote-author"
              type="text"
              className="admin-input"
              value={block.author ?? ''}
              onChange={(e) => onChange({ ...block, author: e.target.value || undefined })}
            />
          </Field>
          <Field label={t('be.style')} htmlFor="quote-style">
            <select
              id="quote-style"
              className="admin-input"
              value={block.style}
              onChange={(e) =>
                onChange({ ...block, style: e.target.value as typeof block.style })
              }
            >
              <option value="bordered">{t('be.quoteBordered')}</option>
              <option value="pull">{t('be.quotePull')}</option>
            </select>
          </Field>
        </div>
      );

    case 'button':
      return (
        <div className="space-y-3">
          <Field label={t('be.text')} htmlFor="btn-text">
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
            label={t('be.url')}
            value={block.url}
            onChange={(url) => onChange({ ...block, url })}
            testId="button-url"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('be.style')} htmlFor="btn-variant">
              <select
                id="btn-variant"
                className="admin-input"
                value={block.variant}
                onChange={(e) =>
                  onChange({ ...block, variant: e.target.value as typeof block.variant })
                }
              >
                <option value="primary">{t('be.variantPrimary')}</option>
                <option value="secondary">{t('be.variantSecondary')}</option>
                <option value="outline">{t('be.variantOutline')}</option>
                <option value="ghost">{t('be.variantGhost')}</option>
              </select>
            </Field>
            <Field label={t('be.size')} htmlFor="btn-size">
              <select
                id="btn-size"
                className="admin-input"
                value={block.size}
                onChange={(e) =>
                  onChange({ ...block, size: e.target.value as typeof block.size })
                }
              >
                <option value="sm">{t('be.sizeSm')}</option>
                <option value="md">{t('be.sizeMd')}</option>
                <option value="lg">{t('be.sizeLg')}</option>
              </select>
            </Field>
          </div>
        </div>
      );

    case 'divider':
      return (
        <Field label={t('be.style')} htmlFor="divider-style">
          <select
            id="divider-style"
            className="admin-input"
            value={block.style}
            onChange={(e) =>
              onChange({ ...block, style: e.target.value as typeof block.style })
            }
            data-test-id="divider-style"
          >
            <option value="line">{t('be.dividerLine')}</option>
            <option value="space">{t('be.dividerSpace')}</option>
            <option value="dots">{t('be.dividerDots')}</option>
            {/* 'stars' is in the union but was missing from the picker. */}
            <option value="stars">{t('be.dividerStars')}</option>
          </select>
        </Field>
      );

    case 'spacer':
      return (
        <Field label={t('be.spacerHeight')} htmlFor="spacer-height">
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
            {t('be.htmlSanitised')}
          </p>
        </Field>
      );

    case 'cta':
      return (
        <div className="space-y-3">
          <Field label={t('be.title')} htmlFor="cta-title">
            <input id="cta-title" type="text" className="admin-input" value={block.title}
              onChange={(e) => onChange({ ...block, title: e.target.value })} data-test-id="cta-title" />
          </Field>
          <Field label={t('be.text')} htmlFor="cta-text">
            <textarea id="cta-text" rows={2} className="admin-input resize-y" value={block.text}
              onChange={(e) => onChange({ ...block, text: e.target.value })} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <MiniField label={t('be.buttonText')} value={block.button.text}
              onChange={(v) => onChange({ ...block, button: { ...block.button, text: v } })} />
            <MiniField label={t('be.buttonUrl')} ltr value={block.button.url}
              onChange={(v) => onChange({ ...block, button: { ...block.button, url: v } })} />
          </div>
          <MediaField label={t('be.backgroundImage')} value={block.backgroundImage ?? ''}
            onChange={(v) => onChange({ ...block, backgroundImage: v || undefined })} testId="cta-bg" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={block.overlay ?? false}
              onChange={(e) => onChange({ ...block, overlay: e.target.checked })} />
            {t('be.overlay')}
          </label>
        </div>
      );

    case 'feature-grid':
      return (
        <div className="space-y-3">
          <Field label={t('be.columnCount')} htmlFor="fg-cols">
            <select id="fg-cols" className="admin-input" value={block.columns}
              onChange={(e) => onChange({ ...block, columns: Number(e.target.value) as 2 | 3 | 4 })}>
              <option value={2}>2</option><option value={3}>3</option><option value={4}>4</option>
            </select>
          </Field>
          <ItemsEditor
            items={block.items} testId="feature-grid" addLabel={t('be.addFeature')}
            emptyLabel={t('be.noFeatures')}
            createItem={() => ({ title: '', description: '' })}
            onChange={(items) => onChange({ ...block, items })}
            renderItem={(item, update) => (
              <div className="space-y-2">
                <MiniField label={t('be.iconOptional')} value={item.icon ?? ''}
                  onChange={(v) => update({ icon: v || undefined })} placeholder="★" />
                <MiniField label={t('be.title')} value={item.title} onChange={(v) => update({ title: v })} />
                <MiniField label={t('be.description')} value={item.description}
                  onChange={(v) => update({ description: v })} />
              </div>
            )}
          />
        </div>
      );

    case 'stats':
      return (
        <ItemsEditor
          items={block.items} testId="stats" addLabel={t('be.addStat')}
          emptyLabel={t('be.noStats')}
          createItem={() => ({ value: '', label: '' })}
          onChange={(items) => onChange({ ...block, items })}
          renderItem={(item, update) => (
            <div className="grid gap-2 sm:grid-cols-2">
              <MiniField label={t('be.value')} ltr value={item.value} onChange={(v) => update({ value: v })} />
              <MiniField label={t('be.label')} value={item.label} onChange={(v) => update({ label: v })} />
              <MiniField label={t('be.prefix')} ltr value={item.prefix ?? ''}
                onChange={(v) => update({ prefix: v || undefined })} />
              <MiniField label={t('be.suffix')} ltr value={item.suffix ?? ''}
                onChange={(v) => update({ suffix: v || undefined })} />
            </div>
          )}
        />
      );

    case 'slider': {
      // Both limits come from lib/blocks/slider, the same table the renderer
      // enforces — so an author cannot build something the page will refuse to
      // show, and neither side can drift from the other.
      const limits = sliderLimits(block.variant);
      return (
        <div className="space-y-3">
          <Field label={t('be.sliderVariant')} htmlFor="sl-variant">
            <select
              id="sl-variant"
              className="admin-input"
              value={block.variant}
              onChange={(e) => {
                const variant = e.target.value as typeof block.variant;
                const next = sliderLimits(variant);
                onChange({
                  ...block,
                  variant,
                  // Switching to a stricter placement has to bring the slides
                  // with it, or the editor would keep showing slides the page
                  // silently drops.
                  slides: block.slides
                    .slice(0, next.maxSlides)
                    .map((slide) =>
                      slide.kind === 'video' && !next.allowVideo
                        ? { ...slide, kind: 'image' as const }
                        : slide
                    ),
                });
              }}
              data-test-id="slider-variant"
            >
              <option value="main">{t('be.sliderMain')}</option>
              <option value="inner">{t('be.sliderInner')}</option>
            </select>
          </Field>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t('be.height')} htmlFor="sl-height">
              <select
                id="sl-height"
                className="admin-input"
                value={block.height}
                onChange={(e) =>
                  onChange({ ...block, height: e.target.value as typeof block.height })
                }
              >
                <option value="short">{t('be.heightShort')}</option>
                <option value="medium">{t('be.heightMedium')}</option>
                <option value="tall">{t('be.heightTall')}</option>
              </select>
            </Field>

            <Field label={t('be.interval')} htmlFor="sl-interval">
              <input
                id="sl-interval"
                type="number"
                min={2}
                max={30}
                className="admin-input"
                value={Math.round(block.intervalMs / 1000)}
                onChange={(e) => {
                  const seconds = Math.min(30, Math.max(2, Number(e.target.value) || 6));
                  onChange({ ...block, intervalMs: seconds * 1000 });
                }}
                data-test-id="slider-interval"
              />
            </Field>

            <Field label={t('be.autoplay')}>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={block.autoplay}
                  onChange={(e) => onChange({ ...block, autoplay: e.target.checked })}
                  data-test-id="slider-autoplay"
                />
                <span className="text-[var(--admin-text-secondary)]">{t('be.autoplayHint')}</span>
              </label>
            </Field>
          </div>

          <ItemsEditor
            items={block.slides}
            testId="slider"
            max={limits.maxSlides}
            addLabel={t('be.addSlide')}
            emptyLabel={t('be.noSlides')}
            createItem={() => ({ kind: 'image' as const, src: '', alt: '' })}
            onChange={(slides) => onChange({ ...block, slides })}
            renderItem={(slide, update) => (
              <div className="space-y-2">
                {/* The media type is chosen FIRST, and everything below it
                    changes to match: an image picker, a video-file picker, or
                    a link field. Asking for a file and then a link would leave
                    an author uploading something the slide will not use. */}
                {limits.allowVideo && (
                  <MiniSelect
                    label={t('be.slideKind')}
                    value={slide.kind}
                    options={[
                      { value: 'image', label: t('be.slideKindImage') },
                      { value: 'video', label: t('be.slideKindVideo') },
                      { value: 'youtube', label: t('be.slideKindYouTube') },
                    ]}
                    onChange={(kind) =>
                      // src is cleared on switch: an .mp4 left in an <img> is a
                      // broken slide, and a YouTube URL in a <video> is worse.
                      update({ kind: kind as typeof slide.kind, src: '' })
                    }
                    testId="slider-kind"
                  />
                )}

                {slide.kind === 'youtube' && limits.allowVideo ? (
                  <>
                    <MiniField
                      label={t('be.slideYouTube')}
                      ltr
                      placeholder="https://www.youtube.com/watch?v=..."
                      value={slide.src}
                      onChange={(v) => update({ src: v })}
                    />
                    {slide.src.trim() !== '' && youTubeId(slide.src) === null && (
                      // Told at the point of pasting, not discovered as a blank
                      // slide on the live site.
                      <p className="text-xs text-[var(--admin-danger)]" data-test-id="slider-yt-invalid">
                        {t('be.slideYouTubeInvalid')}
                      </p>
                    )}
                    <p className="text-xs text-[var(--admin-text-muted)]">
                      {t('be.specMainYouTube')}
                    </p>
                    <MediaField
                      label={t('be.slidePoster')}
                      hint={t('be.slidePosterHint')}
                      value={slide.poster ?? ''}
                      onChange={(url) => update({ poster: url || undefined })}
                      testId="slider-poster"
                    />
                  </>
                ) : slide.kind === 'video' && limits.allowVideo ? (
                  <>
                    <MediaField
                      label={t('be.slideVideo')}
                      hint={t('be.specMainVideo', { videoMax: formatBytes(MAX_VIDEO_BYTES) })}
                      value={slide.src}
                      onChange={(url) => update({ src: url })}
                      testId="slider-video"
                      preview={false}
                    />
                    <MediaField
                      label={t('be.slidePoster')}
                      hint={t('be.slidePosterHint')}
                      value={slide.poster ?? ''}
                      onChange={(url) => update({ poster: url || undefined })}
                      testId="slider-poster"
                    />
                  </>
                ) : (
                  <MediaField
                    label={t('be.slideImage')}
                    hint={t(
                      block.variant === 'main' ? 'be.specMainImage' : 'be.specInnerImage',
                      { imageMax: formatBytes(MAX_IMAGE_BYTES) }
                    )}
                    value={slide.src}
                    onChange={(url) => update({ src: url })}
                    testId="slider-image"
                  />
                )}

                <MiniField
                  label={t('be.altShort')}
                  value={slide.alt ?? ''}
                  onChange={(v) => update({ alt: v })}
                />
                <MiniField
                  label={t('be.slideEyebrow')}
                  value={slide.eyebrow ?? ''}
                  onChange={(v) => update({ eyebrow: v || undefined })}
                />
                <MiniField
                  label={t('be.title')}
                  value={slide.title ?? ''}
                  onChange={(v) => update({ title: v || undefined })}
                />
                <MiniField
                  label={t('be.description')}
                  value={slide.text ?? ''}
                  onChange={(v) => update({ text: v || undefined })}
                />
                <div className="grid gap-2 sm:grid-cols-2">
                  <MiniField
                    label={t('be.buttonText')}
                    value={slide.buttonText ?? ''}
                    onChange={(v) => update({ buttonText: v || undefined })}
                  />
                  <MiniField
                    label={t('be.buttonUrl')}
                    ltr
                    value={slide.buttonUrl ?? ''}
                    onChange={(v) => update({ buttonUrl: v || undefined })}
                  />
                </div>
              </div>
            )}
          />

          {block.slides.length >= limits.maxSlides && (
            <p className="text-xs text-[var(--admin-text-muted)]" data-test-id="slider-full">
              {t('be.slidesFull')}
            </p>
          )}
        </div>
      );
    }

    case 'downloads':
      return (
        <ItemsEditor
          items={block.items}
          testId="downloads"
          addLabel={t('be.addFile')}
          emptyLabel={t('be.noFiles')}
          createItem={() => ({ title: '', url: '' })}
          onChange={(items) => onChange({ ...block, items })}
          renderItem={(item, update) => (
            <div className="space-y-2">
              <MiniField
                label={t('be.fileTitle')}
                value={item.title}
                onChange={(v) => update({ title: v })}
              />
              <MediaField
                label={t('be.slideImage')}
                hint={t('be.fileHint')}
                value={item.url}
                onChange={(url) => update({ url })}
                testId="downloads-file"
                preview={false}
              />
              <MiniField
                label={t('be.fileMeta')}
                value={item.meta ?? ''}
                onChange={(v) => update({ meta: v || undefined })}
              />
            </div>
          )}
        />
      );

    case 'gallery':
      return (
        <div className="space-y-3">
          <Field label={t('be.layout')} htmlFor="gal-layout">
            <select id="gal-layout" className="admin-input" value={block.layout}
              onChange={(e) => onChange({ ...block, layout: e.target.value as typeof block.layout })}>
              <option value="grid">{t('be.layoutGrid')}</option><option value="masonry">{t('be.layoutMasonry')}</option>
              <option value="carousel">{t('be.layoutCarousel')}</option><option value="slideshow">{t('be.layoutSlideshow')}</option>
            </select>
          </Field>
          <ItemsEditor
            items={block.images} testId="gallery" addLabel={t('be.addImage')}
            emptyLabel={t('be.noImages')}
            createItem={() => ({ src: '', alt: '' })}
            onChange={(images) => onChange({ ...block, images })}
            renderItem={(img, update) => (
              <div className="space-y-2">
                <MiniField label={t('be.url')} ltr value={img.src} onChange={(v) => update({ src: v })} />
                <MiniField label={t('be.altShort')} value={img.alt} onChange={(v) => update({ alt: v })} />
              </div>
            )}
          />
        </div>
      );

    case 'video':
      return (
        <div className="space-y-3">
          <Field label={t('be.source')} htmlFor="vid-provider">
            <select id="vid-provider" className="admin-input" value={block.provider}
              onChange={(e) => onChange({ ...block, provider: e.target.value as typeof block.provider })}>
              <option value="youtube">YouTube</option><option value="vimeo">Vimeo</option>
              <option value="self">{t('be.selfHosted')}</option>
            </select>
          </Field>
          <UrlField label={t('be.videoUrl')} value={block.url}
            onChange={(url) => onChange({ ...block, url })} testId="video-url" />
          <MediaField label={t('be.poster')} value={block.poster ?? ''}
            onChange={(v) => onChange({ ...block, poster: v || undefined })} testId="video-poster" />
        </div>
      );

    case 'embed':
      return (
        <div className="space-y-3">
          <Field label={t('be.platform')} htmlFor="emb-provider">
            <select id="emb-provider" className="admin-input" value={block.provider}
              onChange={(e) => onChange({ ...block, provider: e.target.value as typeof block.provider })}>
              <option value="instagram">Instagram</option><option value="twitter">Twitter</option>
              <option value="tiktok">TikTok</option><option value="facebook">Facebook</option>
            </select>
          </Field>
          <UrlField label={t('be.postUrl')} value={block.url}
            onChange={(url) => onChange({ ...block, url })} testId="embed-url" />
          <p className="text-xs text-[var(--admin-text-muted)]">
            {t('be.embedNote')}
          </p>
        </div>
      );

    case 'team':
      return (
        <ItemsEditor
          items={block.members} testId="team" addLabel={t('be.addMember')}
          emptyLabel={t('be.noMembers')}
          createItem={() => ({ name: '', role: '' })}
          onChange={(members) => onChange({ ...block, members })}
          renderItem={(m, update) => (
            <div className="space-y-2">
              <MiniField label={t('be.fieldName')} value={m.name} onChange={(v) => update({ name: v })} />
              <MiniField label={t('be.memberRole')} value={m.role} onChange={(v) => update({ role: v })} />
              <MiniField label={t('be.bio')} value={m.bio ?? ''} onChange={(v) => update({ bio: v || undefined })} />
              <MiniField label={t('be.photo')} ltr value={m.photo ?? ''}
                onChange={(v) => update({ photo: v || undefined })} />
            </div>
          )}
        />
      );

    case 'timeline':
      return (
        <ItemsEditor
          items={block.items} testId="timeline" addLabel={t('be.addEvent')}
          emptyLabel={t('be.noEvents')}
          createItem={() => ({ date: '', title: '', description: '' })}
          onChange={(items) => onChange({ ...block, items })}
          renderItem={(item, update) => (
            <div className="space-y-2">
              <MiniField label={t('be.date')} ltr value={item.date} onChange={(v) => update({ date: v })} />
              <MiniField label={t('be.title')} value={item.title} onChange={(v) => update({ title: v })} />
              <MiniField label={t('be.description')} value={item.description}
                onChange={(v) => update({ description: v })} />
            </div>
          )}
        />
      );

    case 'social-links':
      return (
        <div className="space-y-3">
          <ChipSelect
            label={t('be.platforms')}
            options={['facebook', 'instagram', 'twitter', 'linkedin', 'youtube', 'tiktok'] as const}
            selected={block.platforms}
            onChange={(platforms) => onChange({ ...block, platforms })}
          />
          <Field label={t('be.shape')} htmlFor="soc-style">
            <select id="soc-style" className="admin-input" value={block.style}
              onChange={(e) => onChange({ ...block, style: e.target.value as typeof block.style })}>
              <option value="icons">{t('be.shapeIcons')}</option><option value="buttons">{t('be.shapeButtons')}</option>
              <option value="floating">{t('be.shapeFloating')}</option>
            </select>
          </Field>
        </div>
      );

    case 'recent-posts':
      return (
        <div className="space-y-3">
          <MiniField label={t('be.title')} value={block.title} onChange={(v) => onChange({ ...block, title: v })} />
          <div className="grid gap-3 sm:grid-cols-2">
            <MiniField label={t('be.count')} type="number" ltr value={block.count}
              onChange={(v) => onChange({ ...block, count: Math.max(1, Math.min(12, Number(v) || 1)) })} />
            <Field label={t('be.layout')} htmlFor="rp-layout">
              <select id="rp-layout" className="admin-input" value={block.layout}
                onChange={(e) => onChange({ ...block, layout: e.target.value as typeof block.layout })}>
                <option value="grid">{t('be.layoutGrid')}</option><option value="list">{t('be.layoutList')}</option>
                <option value="carousel">{t('be.layoutCarousel')}</option>
              </select>
            </Field>
          </div>
        </div>
      );

    case 'map':
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <MiniField label={t('be.lat')} type="number" ltr value={block.location.lat}
            onChange={(v) => onChange({ ...block, location: { ...block.location, lat: Number(v) || 0 } })} />
          <MiniField label={t('be.lng')} type="number" ltr value={block.location.lng}
            onChange={(v) => onChange({ ...block, location: { ...block.location, lng: Number(v) || 0 } })} />
          <MiniField label={t('be.zoom')} type="number" ltr value={block.zoom ?? 13}
            onChange={(v) => onChange({ ...block, zoom: Number(v) || 13 })} />
          <MiniField label={t('be.markerName')} value={block.marker ?? ''}
            onChange={(v) => onChange({ ...block, marker: v || undefined })} />
        </div>
      );

    case 'newsletter':
      return (
        <div className="space-y-3">
          <MiniField label={t('be.title')} value={block.title} onChange={(v) => onChange({ ...block, title: v })} />
          <MiniField label={t('be.description')} value={block.description ?? ''}
            onChange={(v) => onChange({ ...block, description: v || undefined })} />
          <MiniField label={t('be.buttonText')} value={block.buttonText ?? ''}
            onChange={(v) => onChange({ ...block, buttonText: v || undefined })} />
        </div>
      );

    case 'contact-form':
      return (
        <div className="space-y-3">
          <ChipSelect
            label={t('be.fields')}
            options={['name', 'email', 'phone', 'subject', 'message'] as const}
            selected={block.fields}
            onChange={(fields) => onChange({ ...block, fields })}
            labels={{ name: t('be.fieldName'), email: t('be.fieldEmail'), phone: t('be.fieldPhone'), subject: t('be.fieldSubject'), message: t('be.fieldMessage') }}
          />
          <MiniField label={t('be.submitLabel')} value={block.submitLabel ?? ''}
            onChange={(v) => onChange({ ...block, submitLabel: v || undefined })} />
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
          {t('be.editorTodo', { name: t(BLOCK_LABEL_KEYS[block.type]) })}
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
  const t = useT();
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
        placeholder={t('be.urlPlaceholder')}
        aria-invalid={invalid}
        data-test-id={testId}
      />
      {invalid && (
        <p role="alert" className="mt-1 text-xs text-[var(--admin-danger)]">
          {t('be.invalidUrl')}
        </p>
      )}
    </div>
  );
}
