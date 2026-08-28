// lib/email/render.ts
import 'server-only';

/**
 * Layout shell for transactional mail.
 *
 * Tables and inline styles, deliberately. Outlook renders with Word's HTML
 * engine — no flexbox, no grid, unreliable `<div>` margins — and Gmail strips
 * <style> blocks in some contexts. This is the markup that survives, and a
 * templating framework would spend its effort producing the same thing.
 */

export type MailLocale = 'ar' | 'en';

/**
 * Everything interpolated into a template goes through this.
 *
 * These messages carry customer-supplied text — names, addresses, form fields.
 * Mail clients render HTML, so an unescaped `<` is the same injection problem
 * it is on a web page, and the store's own inbox is the target.
 */
export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const BRAND = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e2e8f0';
const BG = '#f1f5f9';

export interface LayoutOptions {
  locale: MailLocale;
  title: string;
  intro?: string;
  body: string;
  footer?: string;
}

export function layout({ locale, title, intro, body, footer }: LayoutOptions): string {
  const rtl = locale === 'ar';
  const dir = rtl ? 'rtl' : 'ltr';
  const align = rtl ? 'right' : 'left';

  // A font stack rather than a webfont: many clients block remote font loads,
  // and Arabic falling back to a Latin-only face renders as boxes.
  const font = rtl
    ? "'Segoe UI', Tahoma, 'Noto Naskh Arabic', 'Traditional Arabic', Arial, sans-serif"
    : "'Segoe UI', -apple-system, Helvetica, Arial, sans-serif";

  return `<!doctype html>
<html dir="${dir}" lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:${BG};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BG};padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="max-width:600px;background:#ffffff;border:1px solid ${LINE};border-radius:12px;overflow:hidden;font-family:${font};">
      <tr>
        <td dir="${dir}" align="${align}" style="padding:24px 28px 8px 28px;">
          <h1 style="margin:0;font-size:20px;line-height:1.4;color:${BRAND};font-weight:700;">${esc(title)}</h1>
          ${intro ? `<p style="margin:10px 0 0 0;font-size:14px;line-height:1.7;color:${MUTED};">${esc(intro)}</p>` : ''}
        </td>
      </tr>
      <tr><td dir="${dir}" align="${align}" style="padding:12px 28px 24px 28px;font-size:14px;line-height:1.7;color:${BRAND};">
        ${body}
      </td></tr>
      ${
        footer
          ? `<tr><td dir="${dir}" align="${align}" style="padding:16px 28px;background:#f8fafc;border-top:1px solid ${LINE};font-size:12px;line-height:1.7;color:${MUTED};">${esc(footer)}</td></tr>`
          : ''
      }
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

/** A label/value row. `value` is pre-escaped by the caller when it holds markup. */
export function row(label: string, value: string, opts: { ltr?: boolean; strong?: boolean } = {}): string {
  return `<tr>
    <td style="padding:7px 0;color:${MUTED};font-size:13px;white-space:nowrap;">${esc(label)}</td>
    <td style="padding:7px 0;font-size:13px;${opts.strong ? 'font-weight:700;' : ''}"${opts.ltr ? ' dir="ltr"' : ''}>${value}</td>
  </tr>`;
}

export function table(rows: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">${rows}</table>`;
}

export function divider(): string {
  return `<div style="height:1px;background:${LINE};margin:18px 0;"></div>`;
}

/**
 * Plain-text alternative. Some clients show it, spam filters weigh its absence,
 * and it is what the `log` driver prints to the console.
 */
export function textBlock(lines: (string | null | undefined)[]): string {
  return lines.filter((l) => l !== null && l !== undefined).join('\n');
}
