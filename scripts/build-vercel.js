// Arma lo que publica Vercel en dist/vercel:
//  · con base de datos (DATABASE_URL o POSTGRES_URL, que crea Supabase al conectarlo) → la versión real:
//    la web, el turnero, las páginas de gracias y el panel como archivos; /api y /uploads los atiende api/index.js.
//  · sin base de datos → la demo de siempre (todo en el navegador, datos de ejemplo).
import { readFileSync, writeFileSync, cpSync, rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { turnosPage, thanksPage } from '../server/lib/turnos-page.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist/vercel');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const real = !!(process.env.DATABASE_URL || process.env.POSTGRES_URL) && process.env.CASA_DEMO !== '1';
if (!real) {
  console.log('Sin base de datos: se publica la DEMO (datos de ejemplo en el navegador).');
  execFileSync(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(ROOT, 'scripts/build-preview.js'), path.join(OUT, 'index.html'), '--standalone'], { stdio: 'inherit' });
} else {
  cpSync(path.join(ROOT, 'public'), OUT, { recursive: true });
  cpSync(path.join(ROOT, 'admin'), path.join(OUT, 'admin'), { recursive: true });
  const html = readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
  writeFileSync(path.join(OUT, 'turnos.html'), turnosPage(html));
  writeFileSync(path.join(OUT, 'gracias-turno.html'), thanksPage(html, 'turno'));
  writeFileSync(path.join(OUT, 'gracias-comprobante.html'), thanksPage(html, 'comprobante'));
  console.log('Versión real: web, turnero, páginas de gracias y panel en dist/vercel; la API va con la base de datos.');
}
