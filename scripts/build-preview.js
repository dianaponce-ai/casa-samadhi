// Arma la vista previa en un solo archivo: web + panel + servidor de prueba en el navegador.
// Uso: node scripts/build-preview.js salida.html [--standalone]
//   sin --standalone: un solo HTML con las fotos adentro (para compartir como vista previa)
//   --standalone: página completa con /media al lado (para Vercel u otro hosting estático)
import { readFileSync, writeFileSync, mkdirSync, cpSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEMO_USERS } from './demo-users-list.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv.find((a) => a.endsWith('.html')) || path.join(ROOT, 'dist/vista-previa.html');
const standalone = process.argv.includes('--standalone');
const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');
const strip = (src) => src.replace(/^import .*$/gm, '').replace(/^export /gm, '');

const html = read('public/index.html');
let body = html.split('<!--BODY-->')[1].split('<!--/BODY-->')[0];
const adminHtml = read('admin/index.html').split('<body>')[1].split('<script')[0];
const adminCss = read('admin/admin.css')
  .replace(/:root:not\(\[data-theme="light"\]\)/g, ':host').replace(/:root\[data-theme="dark"\]/g, ':host-context([data-theme="dark"])')
  .replace(/:root\s*\{/g, ':host {').replace(/html, body \{ height: 100%; \}/, '.admin-shell { min-height: 100%; }').replace(/\nbody \{/, '\n.admin-shell {');

// Fotos: en el archivo único van adentro (data URI); en la versión para hosting, al lado.
const media = {};
for (const f of readdirSync(path.join(ROOT, 'public/media'))) {
  const type = f.endsWith('.png') ? 'image/png' : f.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
  media['media/' + f] = standalone ? 'media/' + f : `data:${type};base64,${readFileSync(path.join(ROOT, 'public/media', f)).toString('base64')}`;
}
body = body.replace(/(src|href)="\/media\/([^"]+)"/g, (m, attr, f) => `${attr}="${media['media/' + f] || 'media/' + f}"`);
const j = (v) => JSON.stringify(v).replace(/</g, '\\u003c');

const page = `<title>Casa Samadhi · Café & Spa</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Italiana&family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400;1,500&family=Jost:wght@300;400;500&display=swap">
<style>
${read('public/assets/spa.css')}
</style>
${body}
<script>
window.__MEDIA_MAP = ${j(media)};
window.__CASA_MEDIA = (u) => window.__MEDIA_MAP[String(u || '').replace(/^\\//, '')] || u;
window.__CASA_DEMO_USERS = ${j(DEMO_USERS)};
window.__ADMIN_CSS = ${j(adminCss)};
window.__ADMIN_HTML = ${j(adminHtml)};
</script>
<script type="module">
${strip(read('server/core/defaults.js'))}
${strip(read('server/core/emails.js'))}
${strip(read('server/core/spa-core.js'))}
window.__CORE = { seedState, handle, tick, applyPayment, slotsFor, dayKey, addDays, localNow, localToMs, ApiError, STATE_VERSION };
</script>
<script type="module">
${strip(read('preview/demo-api.js'))}
</script>
<script type="module">
${read('preview/admin-host.js')}
</script>
<script type="module">
${read('admin/admin.js')}
</script>
<script type="module">
${read('public/assets/spa.js')}
</script>
`;
mkdirSync(path.dirname(out), { recursive: true });
if (standalone) {
  writeFileSync(out, `<!doctype html>
<html lang="es-AR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="Casa Samadhi: head spa, masajes, manicuría, terapias holísticas y cafetería en La Plata.">
<meta name="theme-color" content="#f4efe6">
<meta name="robots" content="noindex">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' fill='%234c5a3d'/%3E%3Ctext x='32' y='45' font-family='Georgia,serif' font-size='34' fill='%23f4efe6' text-anchor='middle'%3ECS%3C/text%3E%3C/svg%3E">
${page.replace('<meta name="claude:viewport-fit-sides" content="cover">\n', '').replace('</style>', '</style>\n</head>\n<body>')}</body>
</html>
`);
  cpSync(path.join(ROOT, 'public/media'), path.join(path.dirname(out), 'media'), { recursive: true });
} else writeFileSync(out, page);
console.log(`${out} · ${(page.length / 1024).toFixed(0)} KB`);
