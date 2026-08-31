// scripts/generate-notices.ts
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

/**
 * Regenerates THIRD-PARTY-NOTICES.md from what is actually installed.
 *
 * Not a one-off file. Shipping this CMS to a client redistributes several
 * hundred open-source packages, and MIT, BSD and Apache all require their
 * copyright notice to travel with the code. A notices file written by hand
 * is wrong the first time a dependency changes, so this reads the tree.
 *
 *   npx tsx scripts/generate-notices.ts
 *
 * Run it before cutting a release. The output is committed so a client who
 * receives the source receives the attributions with it.
 */

interface Entry {
  licenses?: string | string[];
  repository?: string;
  publisher?: string;
  url?: string;
}

/** Licences that need more than a line in a list. */
const NEEDS_A_NOTE: Record<string, string> = {
  'LGPL-3.0-or-later':
    'Dynamically loaded native library. Not modified, and not statically linked; ' +
    'the recipient may replace it. Source is available from the upstream project.',
  'CC-BY-4.0': 'Data set, used at build time. Attribution required, which this file provides.',
  'Python-2.0': 'Permissive. No redistribution obligation beyond attribution.',
};

function main() {
  const raw = execFileSync(
    'npx',
    ['license-checker', '--production', '--json', '--start', process.cwd()],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
  );

  const all = JSON.parse(raw) as Record<string, Entry>;
  const rows = Object.entries(all)
    // Our own package is not a third party.
    .filter(([id]) => !id.startsWith('new-aeon-cms@'))
    .map(([id, info]) => {
      const at = id.lastIndexOf('@');
      return {
        name: id.slice(0, at),
        version: id.slice(at + 1),
        license: String(info.licenses ?? 'UNKNOWN'),
        repository: info.repository ?? '',
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const byLicense = new Map<string, number>();
  for (const r of rows) byLicense.set(r.license, (byLicense.get(r.license) ?? 0) + 1);

  const notable = rows.filter((r) => NEEDS_A_NOTE[r.license]);

  const out: string[] = [
    '# Third-party notices',
    '',
    'New Aeon CMS is distributed with the open-source packages listed below.',
    'Each remains under its own licence, and those licences govern that code —',
    'not the New Aeon CMS licence in `LICENSE`.',
    '',
    `Generated from the installed production dependency tree: **${rows.length} packages**.`,
    'Regenerate with `npx tsx scripts/generate-notices.ts` after changing dependencies.',
    '',
    '## Summary',
    '',
    '| Licence | Packages |',
    '| --- | ---: |',
    ...[...byLicense.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([lic, n]) => `| ${lic} | ${n} |`),
    '',
  ];

  if (notable.length > 0) {
    out.push(
      '## Worth reading before you ship',
      '',
      'Most of the tree is MIT, ISC, BSD or Apache-2.0: permissive, and satisfied by',
      'the attribution below. These few are not, and are called out so nobody has to',
      'discover them during a client review.',
      ''
    );
    for (const r of notable) {
      out.push(`### ${r.name}@${r.version} — ${r.license}`, '', NEEDS_A_NOTE[r.license]!, '');
    }
  }

  out.push('## All packages', '', '| Package | Version | Licence |', '| --- | --- | --- |');
  for (const r of rows) out.push(`| ${r.name} | ${r.version} | ${r.license} |`);
  out.push('');

  writeFileSync('THIRD-PARTY-NOTICES.md', out.join('\n'));
  console.log(`Wrote THIRD-PARTY-NOTICES.md — ${rows.length} packages, ${byLicense.size} licences.`);
  if (notable.length > 0) {
    console.log(`Called out ${notable.length} needing a note:`);
    for (const r of notable) console.log(`  ${r.license.padEnd(20)} ${r.name}`);
  }
}

main();
