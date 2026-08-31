// lib/seo/llms.ts

/**
 * The body of /llms.txt.
 *
 * A pure function, separate from the route, because the route is ISR-cached
 * for an hour: over HTTP you cannot observe "publish a policy and it appears",
 * which is exactly the rule most worth testing. Here it is a plain input to a
 * plain output.
 *
 * The discipline this encodes: every link must be a page that EXISTS and is
 * PUBLISHED. A model cites what it is told, so a line pointing at a draft or a
 * guessed slug is worse than no line — it teaches the model that this shop
 * 404s, and an empty policy it can reach may be quoted as the shop's terms.
 */

export interface LlmsInput {
  name: string;
  /** The brand answer, already trimmed. Omitted entirely when unwritten. */
  answer?: string | null;
  shop: boolean;
  primary: string;
  others: string[];
  /** Slugs of PUBLISHED pages only. */
  pages: ReadonlySet<string>;
  country?: string | null;
  currency?: string | null;
  contactPhone?: string | null;
  whatsappNumber?: string | null;
  contactEmail?: string | null;
  social?: Record<string, string> | null;
  allowAiCrawlers?: boolean | null;
  /** Injected so this stays pure and testable without env or a base URL. */
  url: (path: string) => string;
  languageName: (code: string) => string;
}

/** The first slug that exists wins, so a shop's own naming is respected. */
function pick(pages: ReadonlySet<string>, candidates: string[]): string | null {
  return candidates.find((s) => pages.has(s)) ?? null;
}

export function buildLlmsTxt(i: LlmsInput): string {
  const L: string[] = [`# ${i.name}`, ''];

  const answer = i.answer?.trim();
  // A confident sentence nobody wrote is worse than a missing one.
  if (answer) L.push(`> ${answer}`, '');

  const alsoIn = i.others.map(i.languageName).join(', ');
  L.push(
    `This site is the official store. Primary language: ${i.languageName(i.primary)}.` +
      (alsoIn ? ` Also available in ${alsoIn}.` : ''),
    ''
  );

  L.push('## Site', '');
  L.push(`- [Home](${i.url(`/${i.primary}`)}): Main storefront`);
  if (i.shop) L.push(`- [Shop](${i.url(`/${i.primary}/shop`)}): Product catalogue`);

  // By REAL slug. "about-us" here, not the conventional "about".
  const about = pick(i.pages, ['about-us', 'about']);
  if (about) L.push(`- [About](${i.url(`/${i.primary}/${about}`)}): Who we are`);

  const contact = pick(i.pages, ['contact', 'contact-us']);
  if (contact) L.push(`- [Contact](${i.url(`/${i.primary}/${contact}`)}): Phone, WhatsApp, address`);

  // Delivery terms are what a model is asked most about a COD shop.
  const shipping = pick(i.pages, ['shipping', 'shipping-and-delivery', 'delivery']);
  if (shipping) {
    L.push(
      `- [Shipping & COD](${i.url(`/${i.primary}/${shipping}`)}): Governorates, delivery time, cash on delivery`
    );
  }

  L.push(`- [Sitemap](${i.url('/sitemap.xml')}): Every page, both languages`);

  for (const locale of i.others) {
    const tag = locale.toUpperCase();
    L.push('', `## ${i.languageName(locale)}`, '');
    L.push(`- [Home (${tag})](${i.url(`/${locale}`)})`);
    if (i.shop) L.push(`- [Shop (${tag})](${i.url(`/${locale}/shop`)})`);
  }

  L.push('', '## Facts for citation', '');
  L.push(`- Brand: ${i.name}`);
  if (i.country) L.push(`- Country: ${i.country}`);
  if (i.shop && i.currency) L.push(`- Currency: ${i.currency}`);
  // Not a setting because it is not yet a choice: this CMS has no payment
  // gateway, so COD is the only method a shop can offer. When a gateway lands
  // this must come from the enabled methods instead.
  if (i.shop) L.push('- Payment: Cash on delivery (COD)');
  L.push(`- Languages: ${[i.primary, ...i.others].map(i.languageName).join(', ')}`);

  // Contact as FACTS rather than a link: most shops fill these in Settings
  // without ever building a contact page.
  if (i.contactPhone) L.push(`- Phone: ${i.contactPhone}`);
  if (i.whatsappNumber) L.push(`- WhatsApp: ${i.whatsappNumber}`);
  if (i.contactEmail) L.push(`- Email: ${i.contactEmail}`);

  const social = Object.entries(i.social ?? {})
    .filter(([, url]) => typeof url === 'string' && url.trim())
    .map(([p, url]) => `${p[0]!.toUpperCase()}${p.slice(1)}: ${url}`);
  if (social.length > 0) L.push(`- Official social: ${social.join(', ')}`);

  const optional: string[] = [];
  for (const [slug, label] of [
    ['privacy-policy', 'Privacy'],
    ['returns-and-refunds', 'Returns'],
    ['terms-and-conditions', 'Terms'],
  ] as const) {
    if (i.pages.has(slug)) optional.push(`- [${label}](${i.url(`/${i.primary}/${slug}`)})`);
  }
  if (optional.length > 0) L.push('', '## Optional', '', ...optional);

  // Said only when it contradicts the welcome a model would otherwise assume,
  // so this file never disagrees with /robots.txt.
  if (i.allowAiCrawlers === false) {
    L.push('', '## Notes', '', '- This site asks not to be used for AI training. See /robots.txt.');
  }

  return `${L.join('\n')}\n`;
}
