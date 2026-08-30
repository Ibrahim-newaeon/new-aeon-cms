// app/robots.ts
import type { MetadataRoute } from 'next';
import { env } from '@/lib/env';
import { getSettings } from '@/lib/db/queries';

export default async function robots(): Promise<MetadataRoute.Robots> {
  const base = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');

  let comingSoon = false;
  try {
    comingSoon = (await getSettings())?.comingSoonMode ?? false;
  } catch {
    // Fail open: a DB blip should not accidentally de-index a live site.
  }

  // While the site is in coming-soon mode there is nothing worth indexing, and
  // a holding page ranking for the brand is worse than no page at all.
  if (comingSoon) {
    return { rules: [{ userAgent: '*', disallow: '/' }] };
  }

  /**
   * The AI crawlers, named explicitly.
   *
   * They already passed under the `*` rule — allowing them was the default by
   * accident rather than by decision. Naming them means a client who does not
   * want their content in a training set can actually say so, and a client who
   * does gets an unambiguous yes rather than silence.
   */
  const aiAgents = [
    'GPTBot',
    'OAI-SearchBot',
    'ChatGPT-User',
    'ClaudeBot',
    'Claude-User',
    'PerplexityBot',
    'Google-Extended',
    'Applebot-Extended',
    'CCBot',
    'meta-externalagent',
  ];

  let allowAi = true;
  try {
    allowAi = (await getSettings())?.allowAiCrawlers ?? true;
  } catch {
    // Same reasoning as above: a DB blip must not silently change policy.
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        /*
         * ADMIN_PATH is deliberately NOT listed.
         *
         * robots.txt is public, so a `Disallow: /my-secret-admin` line
         * advertises the exact path it is meant to protect — the first thing
         * an attacker reads on any site. The admin is already protected by
         * authentication and by `robots: { index: false }` in its own layout,
         * neither of which leaks the location.
         */
        disallow: ['/api/'],
      },
      // Listed either way, so the answer is explicit rather than inferred.
      { userAgent: aiAgents, ...(allowAi ? { allow: '/' } : { disallow: '/' }) },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
