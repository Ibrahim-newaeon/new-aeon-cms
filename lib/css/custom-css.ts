// lib/css/custom-css.ts
// Sanitise admin customCss before persist / inject.

/**
 * Strip the dangerous bits of free-form CSS while keeping layout overrides.
 * Admin-trusted, but a stolen admin session should not get @import data exfil
 * or expression() for free.
 */
export function sanitizeCustomCss(css: string): string {
  let out = css;
  out = out.replace(/<\/?\s*style/gi, '');
  out = out.replace(/@import\b[^;]*;?/gi, '');
  out = out.replace(/expression\s*\(/gi, '');
  out = out.replace(/-moz-binding\s*:/gi, '');
  out = out.replace(/javascript\s*:/gi, '');
  out = out.replace(/vbscript\s*:/gi, '');
  out = out.replace(/behavior\s*:/gi, '');
  // data: URLs in CSS can smuggle payloads in older engines
  out = out.replace(/url\s*\(\s*['"]?\s*data:/gi, 'url(blocked:');
  if (out.length > 20_000) out = out.slice(0, 20_000);
  return out;
}

export function isCustomCssSafe(css: string): boolean {
  if (/<\/?\s*style/i.test(css)) return false;
  if (/@import\b/i.test(css)) return false;
  if (/expression\s*\(/i.test(css)) return false;
  if (/javascript\s*:/i.test(css)) return false;
  if (/vbscript\s*:/i.test(css)) return false;
  if (/-moz-binding\s*:/i.test(css)) return false;
  if (/url\s*\(\s*['"]?\s*data:/i.test(css)) return false;
  return true;
}
