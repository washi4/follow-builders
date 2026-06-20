#!/usr/bin/env node

import { mkdir, readFile, readdir, writeFile } from 'fs/promises';
import { join, basename } from 'path';
import { fileURLToPath } from 'url';

const SCRIPT_DIR = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = join(SCRIPT_DIR, '..');

function getArg(name, fallback) {
  const idx = process.argv.indexOf(name);
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function formatDateParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function formatDateTimeParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}`;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function linkify(text) {
  const urlRegex = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g;
  return escapeHtml(text).replace(urlRegex, (url) => {
    return `<a href="${url}" target="_blank" rel="noreferrer noopener">${url}</a>`;
  });
}

function parseDigest(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const title = lines.find((line) => line.trim()) || 'AI Builders Digest';
  const sections = [];
  let currentSection = null;
  let currentCard = [];

  const sectionNames = new Set(['X / TWITTER', 'OFFICIAL BLOGS', 'PODCASTS']);

  const pushCard = () => {
    const cardText = currentCard.join('\n').trim();
    if (cardText && currentSection) currentSection.cards.push(cardText);
    currentCard = [];
  };

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (i === 0 && trimmed === title) continue;
    if (sectionNames.has(trimmed)) {
      pushCard();
      currentSection = { title: trimmed, cards: [] };
      sections.push(currentSection);
      continue;
    }
    if (trimmed === '━━━━━━━━━━') {
      pushCard();
      continue;
    }
    if (!currentSection) continue;
    currentCard.push(raw);
  }

  pushCard();
  return { title, sections };
}

function cardTitleAndBody(cardText) {
  const lines = cardText.split('\n').map((line) => line.trimEnd());
  const title = lines.find((line) => line.trim()) || '';
  const body = lines.slice(lines.findIndex((line) => line.trim()) + 1).join('\n').trim();
  return { title, body };
}

function renderCard(cardText) {
  const { title, body } = cardTitleAndBody(cardText);
  return `
    <article class="card">
      <h3>${linkify(title)}</h3>
      <div class="body">${body ? linkify(body).replace(/\n/g, '<br>') : ''}</div>
    </article>`;
}

function renderPage({ title, sections, digestText, generatedAt, timeZone, archiveHref, backHref }) {
  const sectionHtml = sections
    .map(
      (section) => `
      <section class="section">
        <h2>${escapeHtml(section.title)}</h2>
        ${section.cards.map(renderCard).join('\n')}
      </section>`
    )
    .join('\n');
  const fallbackHtml = sectionHtml
    ? ''
    : `
      <section class="section">
        <h2>Digest content</h2>
        <div class="card">
          <div class="meta">This digest was generated, but the section parser did not recognize the output format.</div>
          <pre class="raw-digest">${escapeHtml(digestText).trim()}</pre>
        </div>
      </section>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light; }
    body { margin: 0; font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f6f7fb; color: #111827; }
    .wrap { max-width: 860px; margin: 0 auto; padding: 24px 16px 48px; }
    .topbar { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; align-items: center; margin-bottom: 20px; }
    .hero { background: #111827; color: #fff; border-radius: 20px; padding: 20px; box-shadow: 0 10px 30px rgba(0,0,0,.08); }
    .hero h1 { margin: 0 0 8px; font-size: 28px; line-height: 1.15; }
    .hero p { margin: 6px 0 0; color: rgba(255,255,255,.85); }
    .nav a { color: #2563eb; text-decoration: none; font-weight: 600; }
    .section { margin-top: 24px; }
    .section h2 { margin: 0 0 12px; font-size: 18px; letter-spacing: .04em; text-transform: uppercase; color: #374151; }
    .card { background: #fff; border-radius: 18px; padding: 16px; margin: 12px 0; box-shadow: 0 6px 24px rgba(17,24,39,.06); border: 1px solid #e5e7eb; }
    .card h3 { margin: 0 0 10px; font-size: 17px; line-height: 1.3; }
    .card .body { white-space: pre-wrap; line-height: 1.55; color: #1f2937; }
    .card a { color: #2563eb; word-break: break-word; }
    .meta { font-size: 13px; color: #6b7280; }
    .raw-digest { margin: 12px 0 0; white-space: pre-wrap; line-height: 1.6; color: #1f2937; font-family: inherit; }
    .archive-list { display: grid; gap: 12px; margin-top: 20px; }
    .archive-item { background: #fff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 14px 16px; box-shadow: 0 6px 24px rgba(17,24,39,.04); }
    .archive-item a { text-decoration: none; color: #111827; font-weight: 600; }
    .archive-item .meta { margin-top: 4px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="topbar nav">
      <a href="${escapeHtml(backHref)}">← Back to archive</a>
      <a href="${escapeHtml(archiveHref)}">Open latest</a>
    </div>
    <div class="hero">
      <h1>${escapeHtml(title)}</h1>
      <p>Generated ${escapeHtml(generatedAt)} (${escapeHtml(timeZone)})</p>
    </div>
    ${sectionHtml}
    ${fallbackHtml}
  </div>
</body>
</html>`;
}

async function main() {
  const preparedPath = getArg('--prepared-file', '/tmp/fb-prepared.json');
  const digestPath = getArg('--digest-file', '/tmp/fb-digest.txt');
  const outputDir = getArg('--output-dir', join(REPO_ROOT, 'docs'));
  const archiveDir = join(outputDir, 'digests');

  const prepared = JSON.parse(await readFile(preparedPath, 'utf-8'));
  const digestText = await readFile(digestPath, 'utf-8');
  const timeZone = prepared.config?.timezone || process.env.FB_TIMEZONE || 'UTC';
  const generatedAt = new Date(prepared.generatedAt || Date.now());
  const dateSlug = formatDateParts(generatedAt, timeZone);
  const displayGeneratedAt = formatDateTimeParts(generatedAt, timeZone);
  const parsed = parseDigest(digestText);

  await mkdir(archiveDir, { recursive: true });
  await writeFile(join(outputDir, '.nojekyll'), '');

  const dailyHref = `digests/${dateSlug}.html`;
  const pageHtml = renderPage({
    title: parsed.title,
    sections: parsed.sections,
    digestText,
    generatedAt: displayGeneratedAt,
    timeZone,
    archiveHref: '../index.html',
    backHref: '../index.html'
  });
  await writeFile(join(archiveDir, `${dateSlug}.html`), pageHtml);

  const files = (await readdir(archiveDir)).filter((file) => file.endsWith('.html'));
  const entries = files
    .map((file) => basename(file, '.html'))
    .sort((a, b) => b.localeCompare(a))
    .map((date) => ({
      date,
      href: `digests/${date}.html`
    }));

  const latest = entries[0];
  const indexHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Follow Builders Archive</title>
  <style>
    :root { color-scheme: light; }
    body { margin: 0; font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f6f7fb; color: #111827; }
    .wrap { max-width: 860px; margin: 0 auto; padding: 24px 16px 48px; }
    .hero { background: #111827; color: #fff; border-radius: 20px; padding: 20px; margin-bottom: 20px; box-shadow: 0 10px 30px rgba(0,0,0,.08); }
    .hero h1 { margin: 0 0 8px; font-size: 28px; line-height: 1.15; }
    .hero p { margin: 6px 0 0; color: rgba(255,255,255,.85); }
    .archive-list { display: grid; gap: 12px; margin-top: 20px; }
    .archive-item { display: block; background: #fff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 14px 16px; box-shadow: 0 6px 24px rgba(17,24,39,.04); text-decoration: none; color: #111827; transition: transform .12s ease, box-shadow .12s ease, border-color .12s ease; }
    .archive-item:hover, .archive-item:focus-visible { transform: translateY(-1px); box-shadow: 0 10px 28px rgba(17,24,39,.08); border-color: #cbd5e1; }
    .archive-item .title { font-weight: 600; }
    .archive-item .meta { margin-top: 4px; font-size: 13px; color: #6b7280; }
    .nav { margin-bottom: 16px; display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .nav a { color: #2563eb; text-decoration: none; font-weight: 600; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="nav">
      <a href="${escapeHtml(latest ? latest.href : '#')}">Open latest</a>
    </div>
    <div class="hero">
      <h1>Follow Builders Archive</h1>
      <p>${entries.length} daily digests</p>
    </div>
    <div class="archive-list">
      ${entries
        .map(
          (entry) => `
        <a class="archive-item" href="${escapeHtml(entry.href)}">
          <div class="title">${escapeHtml(entry.date)}</div>
          <div class="meta">Daily digest</div>
        </a>`
        )
        .join('\n')}
    </div>
  </div>
</body>
</html>`;

  await writeFile(join(outputDir, 'index.html'), indexHtml);

  process.stdout.write(
    JSON.stringify(
      {
        status: 'ok',
        outputDir,
        dateSlug,
        dailyHref,
        entries: entries.length
      },
      null,
      2
    ) + '\n'
  );
}

main().catch((err) => {
  console.error(`Build pages failed: ${err.message}`);
  process.exit(1);
});
