#!/usr/bin/env node
// build-site.js <client-dir>
// Genereert <client-dir>/site/*.html uit <client-dir>/templates/*.html plus
// het content-model <client-dir>/site-content.json, en draait daarna
// build-nav.js zodat het menu uit navigation.json komt. Zie CLAUDE.md,
// "Sjabloonlaag (build-site.js)".
//
// Template-syntax (bewust minimaal, geen framework):
//   {{pad.naar.veld}}             waarde, ge-escaped. In tekst: "\n" -> <br>,
//                                 **vet** -> <strong>vet</strong>. Binnen een
//                                 tag-attribuut: alleen escaping, geen opmaak.
//   {{#each lijst}}...{{/each}}   herhaalt per item; velden van het item zijn
//                                 direct bereikbaar, {{.}} is het item zelf,
//                                 plus {{@index}}, {{@first}}, {{@last}}.
//   {{#if veld}}...{{else}}...{{/if}}  ontbrekend veld, lege string/lijst,
//                                 false en null zijn onwaar.
// Een blok-tag die alleen op een regel staat, neemt die hele regel mee weg.
// Onbekende velden zijn een fout: een typfout in template of JSON breekt de
// build in plaats van stilzwijgend een lege plek op te leveren.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { imageSize } from 'image-size';

const clientDirArg = process.argv[2];
if (!clientDirArg) {
  console.error('Gebruik: node build-site.js <client-dir>  (bv. clients/rijschool-ben)');
  process.exit(1);
}

const CLIENT_DIR = path.resolve(process.cwd(), clientDirArg);
const TEMPLATE_DIR = path.join(CLIENT_DIR, 'templates');
const SITE_DIR = path.join(CLIENT_DIR, 'site');
const CONTENT_JSON = path.join(CLIENT_DIR, 'site-content.json');

for (const p of [TEMPLATE_DIR, SITE_DIR, CONTENT_JSON]) {
  if (!fs.existsSync(p)) {
    console.error(`Niet gevonden: ${p}`);
    process.exit(1);
  }
}

// Een klant-repo heeft een eigen kopie van build-site.js en build-nav.js
// (Vercel bouwt daarmee). Draaien we de gedeelde versie uit website-maker,
// dan melden we het als die kopie afwijkt, zodat twee versies nooit
// ongemerkt uit elkaar groeien. Regeleinden tellen niet mee (autocrlf).
const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
if (TOOL_DIR !== CLIENT_DIR) {
  const read = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
  for (const tool of ['build-site.js', 'build-nav.js']) {
    const copy = path.join(CLIENT_DIR, tool);
    if (fs.existsSync(copy) && read(copy) !== read(path.join(TOOL_DIR, tool))) {
      console.warn(`  [!] ${tool} in ${clientDirArg} wijkt af van de gedeelde versie in ${TOOL_DIR}.`);
      console.warn('      Bepaal welke de juiste is en kopieer die over de andere (zie CLAUDE.md, "Klant-repo").');
    }
  }
}

// ---------- afbeeldingen: width/height altijd uit het bestand zelf ----------

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg)$/i;

// Elk object met een "src" naar een afbeelding in site/ krijgt width/height
// van het echte bestand. Zo blijft de beeldverhouding kloppen als de klant
// een foto vervangt, zonder dat er afmetingen in de JSON hoeven te staan.
function addImageSizes(node, where) {
  if (Array.isArray(node)) {
    node.forEach((n, i) => addImageSizes(n, `${where}[${i}]`));
  } else if (node && typeof node === 'object') {
    if (typeof node.src === 'string' && IMAGE_EXT.test(node.src)) {
      const file = path.join(SITE_DIR, node.src);
      if (!fs.existsSync(file)) throw new Error(`${where}.src: bestand niet gevonden: site/${node.src}`);
      const { width, height } = imageSize(fs.readFileSync(file));
      node.width = width;
      node.height = height;
    }
    for (const [k, v] of Object.entries(node)) addImageSizes(v, where ? `${where}.${k}` : k);
  }
}

// ---------- template-engine ----------

const escapeText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (s) => escapeText(s).replace(/"/g, '&quot;');
const inlineMarkup = (s) => s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');

// Blok-tags die alleen op een regel staan: hele regel (incl. inspringing en
// regeleinde) weghalen, zodat de uitvoer net zo ingesprongen is als handwerk.
const STANDALONE = /^[ \t]*(\{\{[#/][^}]*\}\}|\{\{else\}\})[ \t]*\r?\n/gm;
const TAG = /\{\{\s*([#/]?)([^}]*?)\s*\}\}/g;

function parse(src) {
  src = src.replace(STANDALONE, '$1');
  const root = { type: 'root', children: [] };
  const stack = [root];
  // Binnen een {{#if}} na {{else}} gaan nieuwe nodes naar de else-tak.
  const push = (node) => {
    const top = stack[stack.length - 1];
    (top.elseChildren ?? top.children).push(node);
  };
  let last = 0;
  let m;
  TAG.lastIndex = 0;
  while ((m = TAG.exec(src))) {
    const text = src.slice(last, m.index);
    if (text) push({ type: 'text', text });
    last = TAG.lastIndex;
    const [, sigil, body] = m;
    if (sigil === '#') {
      const [kind, expr] = body.split(/\s+/);
      if (kind !== 'each' && kind !== 'if') throw new Error(`Onbekend blok: {{#${body}}}`);
      const node = { type: kind, expr, children: [], elseChildren: null };
      push(node);
      stack.push(node);
    } else if (sigil === '/') {
      const node = stack.pop();
      if (node.type !== body) throw new Error(`{{/${body}}} sluit geen open {{#${body}}}`);
    } else if (body === 'else') {
      const node = stack[stack.length - 1];
      if (node.type !== 'if' || node.elseChildren) throw new Error('{{else}} hoort binnen {{#if}}');
      node.elseChildren = [];
    } else {
      // Attribuut-context: de laatste '<' vóór deze tag staat ná de laatste '>'.
      const before = src.slice(0, m.index);
      const inTag = before.lastIndexOf('<') > before.lastIndexOf('>');
      push({ type: 'var', expr: body, inTag });
    }
  }
  if (stack.length !== 1) throw new Error(`Niet gesloten blok: {{#${stack[stack.length - 1].type}}}`);
  const rest = src.slice(last);
  if (rest) push({ type: 'text', text: rest });
  return root.children;
}

function lookup(expr, scopes) {
  if (expr === '.') return scopes[0].value;
  if (expr.startsWith('@')) {
    const s = scopes.find((sc) => sc.meta);
    if (!s || !(expr.slice(1) in s.meta)) throw new Error(`{{${expr}}} buiten {{#each}}`);
    return s.meta[expr.slice(1)];
  }
  const parts = expr.split('.');
  for (const { value } of scopes) {
    if (value && typeof value === 'object' && parts[0] in value) {
      let v = value;
      for (const p of parts) {
        if (v == null || typeof v !== 'object' || !(p in v)) throw new Error(`Veld niet gevonden: ${expr}`);
        v = v[p];
      }
      return v;
    }
  }
  throw new Error(`Veld niet gevonden: ${expr}`);
}

const truthy = (v) => (Array.isArray(v) ? v.length > 0 : Boolean(v));

function render(nodes, scopes) {
  let out = '';
  for (const n of nodes) {
    if (n.type === 'text') out += n.text;
    else if (n.type === 'var') {
      const v = lookup(n.expr, scopes);
      if (v == null || typeof v === 'object') throw new Error(`{{${n.expr}}} is geen tekst of getal`);
      const s = String(v);
      out += n.inTag ? escapeAttr(s) : inlineMarkup(escapeText(s));
    } else if (n.type === 'if') {
      // Ontbrekend veld = onwaar: zo kan een optioneel veld (bv. een
      // bijschrift) in de JSON ook helemaal weggelaten worden.
      let v;
      try { v = lookup(n.expr, scopes); } catch { v = undefined; }
      out += render(truthy(v) ? n.children : n.elseChildren || [], scopes);
    } else if (n.type === 'each') {
      const list = lookup(n.expr, scopes);
      if (!Array.isArray(list)) throw new Error(`{{#each ${n.expr}}}: geen lijst`);
      list.forEach((item, index) => {
        const meta = { index, first: index === 0, last: index === list.length - 1 };
        out += render(n.children, [{ value: item, meta }, ...scopes]);
      });
    }
  }
  return out;
}

// ---------- CSS-velden ----------
// Foto's die in de CSS staan (bv. een hero-achtergrond met verloop, per
// breakpoint) blijven in de handgeschreven CSS, maar de URL komt uit het
// content-model. Markeer zo'n url() in site/css/*.css met een commentaar
// direct erachter:
//   url("../images/x.jpg") /* content: hero.backgroundPhoto */ 70% center / cover
// De build vervangt dan alleen die url() door het "src" van dat veld (pad
// vanaf site/, zoals elders in site-content.json); de rest van de CSS wordt
// niet aangeraakt en de markering blijft staan voor de volgende build.
const CSS_FIELD = /url\((["']?)[^"')]*\1\)(\s*\/\*\s*content:\s*([\w.]+)\s*\*\/)/g;
const CSS_DIR = path.join(SITE_DIR, 'css');

function renderCss(css, content) {
  let count = 0;
  const out = css.replace(CSS_FIELD, (m, q, marker, expr) => {
    const v = lookup(expr, [{ value: content }]);
    const src = typeof v === 'string' ? v : v?.src;
    if (typeof src !== 'string' || !src) throw new Error(`${expr}: geen afbeelding (verwacht { "src": "images/…" })`);
    if (/["'()\s]|\\/.test(src)) throw new Error(`${expr}: ongeldig pad voor CSS: ${src}`);
    if (!fs.existsSync(path.join(SITE_DIR, src))) throw new Error(`${expr}: bestand niet gevonden: site/${src}`);
    count++;
    const rel = path.relative(CSS_DIR, path.join(SITE_DIR, src)).split(path.sep).join('/');
    return `url("${rel}")${marker}`;
  });
  return { out, count };
}

// ---------- build ----------
// Eerst alles renderen, pas daarna schrijven: een fout (onbekend veld,
// ontbrekende foto) laat site/ dan ongemoeid in plaats van half gebouwd.

const outputs = []; // { file, label, text, note }
try {
  const content = JSON.parse(fs.readFileSync(CONTENT_JSON, 'utf8'));
  addImageSizes(content, '');

  const templates = fs.readdirSync(TEMPLATE_DIR).filter((f) => f.endsWith('.html'));
  if (!templates.length) throw new Error(`Geen *.html in ${TEMPLATE_DIR}`);
  for (const file of templates) {
    const src = fs.readFileSync(path.join(TEMPLATE_DIR, file), 'utf8');
    try {
      outputs.push({ file: path.join(SITE_DIR, file), label: `site/${file}`, text: render(parse(src), [{ value: content }]) });
    } catch (err) {
      throw new Error(`templates/${file}: ${err.message}`);
    }
  }

  const cssFiles = fs.existsSync(CSS_DIR) ? fs.readdirSync(CSS_DIR).filter((f) => f.endsWith('.css')) : [];
  for (const file of cssFiles) {
    const css = fs.readFileSync(path.join(CSS_DIR, file), 'utf8');
    try {
      const { out, count } = renderCss(css, content);
      if (count) outputs.push({ file: path.join(CSS_DIR, file), label: `site/css/${file}`, text: out, note: ` (${count} CSS-veld${count === 1 ? '' : 'en'})` });
    } catch (err) {
      throw new Error(`site/css/${file}: ${err.message}`);
    }
  }
} catch (err) {
  console.error(`Build afgebroken, niets geschreven. ${err.message}`);
  process.exit(1);
}

for (const { file, label, text, note } of outputs) {
  if (note === undefined) {
    // HTML: build-nav.js vult hierna het menu, dus altijd opnieuw schrijven.
    fs.writeFileSync(file, text, 'utf8');
    console.log(`  gegenereerd ${label}`);
    continue;
  }
  // CSS is handgeschreven: alleen aanraken als een CSS-veld echt verandert.
  const changed = fs.readFileSync(file, 'utf8') !== text;
  if (changed) fs.writeFileSync(file, text, 'utf8');
  console.log(`  ${changed ? 'bijgewerkt ' : 'ongewijzigd'} ${label}${note}`);
}

// Menu en footer-navigatie komen uit navigation.json (enige bron, CLAUDE.md).
const buildNav = path.join(path.dirname(fileURLToPath(import.meta.url)), 'build-nav.js');
const res = spawnSync(process.execPath, [buildNav, CLIENT_DIR], { stdio: 'inherit' });
process.exit(res.status ?? 1);
