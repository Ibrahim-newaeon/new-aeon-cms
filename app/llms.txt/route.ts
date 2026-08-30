// app/llms.txt/route.ts
import { getSettings } from '@/lib/db/queries';
import { commerceEnabled } from '@/lib/commerce/guard';
import { absoluteUrl } from '@/lib/seo/json-ld';
import { env, locales } from '@/lib/env';

export const runtime = 'nodejs';

/**
 * /llms.txt — the same idea as robots.txt, for language models.
 *
 * A short, plain-text brief: who this is, and the handful of URLs worth
 * reading. Models are given a page's worth of context instead of having to
 * infer a shop from a navigation menu.
 *
 * Built from Settings rather than written by hand, so it cannot drift from the
 * site. If the brand answer is empty it says so plainly rather than inventing
 * one — a confident sentence nobody wrote is worse than a missing one.
 *
 * Regenerated hourly, matching the sitemap: this changes when Settings change,
 * which is rarely.
 */
export const revalidate = 3600;

export async function GET() {
  const settings = await getSettings();
  const shop = await commerceEnabled();
  const name = settings?.siteName ?? 'Site';
  const locale = env.DEFAULT_LOCALE;

  const lines: string[] = [`# ${name}`, ''];

  const answer = settings?.brandAnswer?.trim() || settings?.siteDescription?.trim();
  if (answer) {
    lines.push(`> ${answer}`, '');
  }

  lines.push('## Pages', '');
  lines.push(`- [Home](${absoluteUrl(`/${locale}`)})`);
  if (shop) {
    lines.push(`- [Shop](${absoluteUrl(`/${locale}/shop`)}) — the product catalogue`);
  }
  lines.push(`- [Search](${absoluteUrl(`/${locale}/search`)})`);
  lines.push(`- [Sitemap](${absoluteUrl('/sitemap.xml')}) — every page, both languages`);

  const contact: string[] = [];
  if (settings?.contactEmail) contact.push(`Email: ${settings.contactEmail}`);
  if (settings?.contactPhone) contact.push(`Phone: ${settings.contactPhone}`);
  if (contact.length > 0) {
    lines.push('', '## Contact', '', ...contact.map((c) => `- ${c}`));
  }

  lines.push(
    '',
    '## Notes',
    '',
    `- Languages: ${locales.join(', ')}. Every page exists at /{locale}/...`,
    ...(shop ? ['- Prices are shown in the shop; product pages carry Product schema.'] : []),
    settings?.allowAiCrawlers === false
      ? '- This site asks not to be used for AI training. See /robots.txt.'
      : '- AI crawlers are welcome to read and cite this site.'
  );

  return new Response(`${lines.join('\n')}\n`, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
