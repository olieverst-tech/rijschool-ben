#!/usr/bin/env node
// Regenerates the header nav (with dropdowns) and footer "Navigatie" list
// in every site/*.html page from navigation.json, so navigation.json stays
// the single source of truth for menu structure.
//
// Usage: node build-nav.js <client-dir>   (e.g. clients/luijer)
// Operates entirely within that client directory — never touches another
// client's data. See CLAUDE.md.
import fs from 'node:fs/promises';
import path from 'node:path';

const clientDirArg = process.argv[2];
if (!clientDirArg) {
  console.error('Usage: node build-nav.js <client-dir>');
  console.error('  e.g. node build-nav.js clients/luijer');
  process.exit(1);
}

const CLIENT_DIR = path.resolve(process.cwd(), clientDirArg);
const SITE_DIR = path.join(CLIENT_DIR, 'site');
const NAVIGATION_JSON = path.join(CLIENT_DIR, 'navigation.json');

// <client-dir>/nav-links.json maps the live URLs captured in
// navigation.json to the local files (or #anchors, for one-page sites) this
// project builds them into:
//   { "byUrl": { "<live url>": "page.html" }, "byLabel": { "<label>": "#anchor" } }
// byLabel wins over byUrl — needed when several menu items share one URL
// (e.g. a one-page Wix site whose anchor links all resolve to "/").
let NAV_LINKS = { byUrl: {}, byLabel: {} };
try {
  const parsed = JSON.parse(await fs.readFile(path.join(CLIENT_DIR, 'nav-links.json'), 'utf8'));
  NAV_LINKS = { byUrl: parsed.byUrl || {}, byLabel: parsed.byLabel || {} };
} catch {
  // no mapping: live URLs are used as-is
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function localHref(item) {
  return NAV_LINKS.byLabel[item.label] || NAV_LINKS.byUrl[item.url] || item.url;
}

// Items without a link and without children are page-builder artefacts
// (e.g. Wix's "More" overflow button), not real menu entries.
function isRealItem(item) {
  return item.url || (item.children && item.children.length);
}

function renderNavItem(item, currentFile) {
  const href = localHref(item);
  const isActive = href === currentFile;
  const children = item.children || [];

  if (!children.length) {
    return `      <div class="nav-item">
        <a href="${href}"${isActive ? ' class="is-active"' : ''}>${escapeHtml(item.label)}</a>
      </div>`;
  }

  const childActive = children.some((c) => localHref(c) === currentFile);
  const childLinks = children
    .map((c) => {
      const chref = localHref(c);
      const cActive = chref === currentFile;
      return `          <a href="${chref}"${cActive ? ' class="is-active"' : ''}>${escapeHtml(c.label)}</a>`;
    })
    .join('\n');

  return `      <div class="nav-item has-dropdown${isActive || childActive ? ' is-active-parent' : ''}">
        <a href="${href}"${isActive ? ' class="is-active"' : ''}>${escapeHtml(item.label)}</a>
        <button type="button" class="dropdown-toggle" aria-expanded="false" aria-label="Submenu ${escapeHtml(item.label)} tonen"></button>
        <div class="dropdown">
${childLinks}
        </div>
      </div>`;
}

function renderFooterItem(item, currentFile) {
  const href = localHref(item);
  const isActive = href === currentFile;
  const children = item.children || [];

  let html = `          <li><a href="${href}"${isActive ? ' class="is-active"' : ''}>${escapeHtml(item.label)}</a>`;
  if (children.length) {
    const subItems = children
      .map((c) => {
        const chref = localHref(c);
        const cActive = chref === currentFile;
        return `              <li><a href="${chref}"${cActive ? ' class="is-active"' : ''}>${escapeHtml(c.label)}</a></li>`;
      })
      .join('\n');
    html += `\n            <ul class="footer-sublist">\n${subItems}\n            </ul>\n          `;
  }
  html += `</li>`;
  return html;
}

async function main() {
  let navigationRaw;
  try {
    navigationRaw = await fs.readFile(NAVIGATION_JSON, 'utf8');
  } catch {
    console.error(`Kan ${NAVIGATION_JSON} niet lezen — run eerst scrape-site.js voor deze klant.`);
    process.exit(1);
  }

  const navigation = JSON.parse(navigationRaw).filter(isRealItem);
  if (!navigation.length) {
    console.error('navigation.json is empty — run scrape-site.js first.');
    process.exit(1);
  }

  const files = (await fs.readdir(SITE_DIR)).filter((f) => f.endsWith('.html'));

  const navBlockRe = /(<nav class="main-nav" id="main-nav">)([\s\S]*?)(\n\s*<\/nav>)/;
  // Footer list: either the "Navigatie" column, or a bare <ul class="footer-nav">
  // (for sites where no such heading text exists in content.json).
  const footerNavRes = [
    /(<div class="footer-col">\s*<h4>Navigatie<\/h4>\s*<ul>)([\s\S]*?)(\s*<\/ul>\s*<\/div>)/,
    /(<ul class="footer-nav">)([\s\S]*?)(\s*<\/ul>\s*<!-- \/footer-nav -->)/,
  ];

  for (const file of files) {
    const filePath = path.join(SITE_DIR, file);
    let html = await fs.readFile(filePath, 'utf8');

    const navHtml = navigation.map((item) => renderNavItem(item, file)).join('\n');
    if (navBlockRe.test(html)) {
      html = html.replace(navBlockRe, `$1\n${navHtml}$3`);
    } else {
      console.warn(`  [!] geen main-nav gevonden in ${file}`);
    }

    const footerHtml = navigation.map((item) => renderFooterItem(item, file)).join('\n');
    const footerNavRe = footerNavRes.find((re) => re.test(html));
    if (footerNavRe) {
      html = html.replace(footerNavRe, `$1\n${footerHtml}$3`);
    } else {
      console.warn(`  [!] geen footer-navigatie gevonden in ${file}`);
    }

    await fs.writeFile(filePath, html, 'utf8');
    console.log(`  updated ${file}`);
  }

  console.log(`\nNavigatie herbouwd voor ${files.length} pagina's in ${CLIENT_DIR} op basis van navigation.json.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
