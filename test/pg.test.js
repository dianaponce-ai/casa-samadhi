// Postgres (Vercel + Supabase): solo corre con TEST_DATABASE_URL apuntando a una base VACÍA de prueba.
//   TEST_DATABASE_URL=postgres://usuario@127.0.0.1:5432/casa_prueba npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const URL_ = process.env.TEST_DATABASE_URL;
const skip = !URL_ && 'sin TEST_DATABASE_URL';

/** Corre un script en un proceso aparte (como otra copia del servidor en Vercel). */
function run(code) {
  return new Promise((res, rej) => {
    const p = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', '--input-type=module', '-e', code], { env: { ...process.env, DATABASE_URL: URL_, VERCEL: '1' }, cwd: new URL('..', import.meta.url).pathname });
    let out = '', err = ''; p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (err += d));
    p.on('close', (c) => (c ? rej(new Error(err)) : res(out.trim())));
  });
}

test('dos copias del servidor comparten los datos y nunca pisan un cambio', { skip }, async () => {
  const add = (who) => `const { withState } = await import('./server/lib/store.js');
    for (let i = 0; i < 15; i++) await withState((st) => { st.audit.push({ id: ++st.ids.audit, text: '${who}' + i }); });
    process.exit(0);`;
  await Promise.all([run(add('A')), run(add('B')), run(add('C'))]);
  const n = await run(`const { withState } = await import('./server/lib/store.js'); console.log(await withState((st) => st.audit.filter((x) => /^[ABC]\\d+$/.test(x.text)).length, false)); process.exit(0);`);
  assert.equal(Number(n), 45);
});

test('fotos y comprobantes quedan en la base', { skip }, async () => {
  const out = await run(`const { saveImage, readImage, deleteImage } = await import('./server/lib/images.js');
    const rel = await saveImage('data:image/png;base64,' + Buffer.from('hola').toString('base64'), 'prueba');
    const f = await readImage(rel.split('/')[1]); await deleteImage(rel);
    console.log(JSON.stringify({ type: f.type, ok: f.data.toString() === 'hola', gone: !(await readImage(rel.split('/')[1])) })); process.exit(0);`);
  assert.deepEqual(JSON.parse(out), { type: 'image/png', ok: true, gone: true });
});
