// Guarda el estado de la casa en Postgres (Supabase en Vercel). Misma idea que la versión SQLite:
// cada colección (turnos, clientas, caja…) es una fila con su JSON.
// En Vercel puede haber varias copias del servidor a la vez, así que:
//  · cada cambio se hace con un bloqueo de la base (dos reservas simultáneas nunca toman el mismo horario);
//  · antes de leer o cambiar, se mira el número de versión y, si otra copia guardó algo, se recarga.
// Las fotos y comprobantes también van a la base (tabla cs_files) y se sirven en /uploads.
import pg from 'pg';
import crypto from 'node:crypto';
import { config } from './config.js';
import { seedState, COLLECTIONS, STATE_VERSION } from '../core/spa-core.js';

const LOCK = 47_679_001; // número fijo del bloqueo de Casa Samadhi
const REV = '__rev';

/** Conexión: se limpian los parámetros que pg no entiende y se usa TLS salvo en la propia compu. */
function poolConfig(url) {
  const u = new URL(url);
  const mode = u.searchParams.get('sslmode');
  for (const k of ['sslmode', 'supa', 'pgbouncer', 'sslrootcert']) u.searchParams.delete(k);
  const local = ['localhost', '127.0.0.1', '::1', ''].includes(u.hostname);
  // Con DATABASE_CA (el certificado de Supabase) se verifica el servidor; si no, la conexión va cifrada igual.
  const ssl = mode === 'disable' || (local && !mode) ? false : config.databaseCa ? { ca: config.databaseCa.replace(/\\n/g, '\n') } : { rejectUnauthorized: false };
  return { connectionString: u.toString(), ssl, max: config.serverless ? 2 : 5, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 10_000 };
}
export const pool = new pg.Pool(poolConfig(config.databaseUrl));
pool.on('error', (e) => console.error('Base de datos:', e.message));

export const kind = 'pg';
export const state = {};
let rev = null; // versión cargada en esta copia (null = hay que recargar)
let last = new Map(); // JSON de cada colección tal como está en la base

async function tx(fn) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query('SELECT pg_advisory_xact_lock($1)', [LOCK]);
    const out = await fn(c);
    await c.query('COMMIT');
    return out;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { c.release(); }
}

async function writeColls(c, keys) {
  for (const k of keys) {
    await c.query('INSERT INTO cs_state(coll, json, updated_at) VALUES($1, $2, now()) ON CONFLICT (coll) DO UPDATE SET json = excluded.json, updated_at = now()', [k, last.get(k)]);
  }
}

/** Trae de la base lo que haga falta. Si la base está vacía, la crea con los datos iniciales (servicios, asesoras…). */
async function refresh(c) {
  const r = await c.query('SELECT json FROM cs_state WHERE coll = $1', [REV]);
  const dbRev = r.rows[0] ? Number(r.rows[0].json) : null;
  if (dbRev !== null && dbRev === rev) return;
  if (dbRev === null) {
    const st = seedState();
    for (const k of Object.keys(state)) delete state[k];
    Object.assign(state, st);
    last = new Map([...COLLECTIONS, 'v'].map((k) => [k, JSON.stringify(state[k])]));
    last.set(REV, '1');
    await writeColls(c, [...last.keys()]);
    rev = 1;
    return;
  }
  const rows = (await c.query('SELECT coll, json FROM cs_state')).rows;
  const st = seedState(); // lo que falte en la base (colecciones nuevas) toma el valor inicial
  last = new Map();
  for (const row of rows) { if (row.coll !== REV) st[row.coll] = JSON.parse(row.json); last.set(row.coll, row.json); }
  if (st.v !== STATE_VERSION) st.v = STATE_VERSION;
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, st);
  rev = dbRev;
}

/** Guarda solo las colecciones que cambiaron y sube la versión. */
async function persist(c) {
  const changed = [];
  for (const k of [...COLLECTIONS, 'v']) {
    const s = JSON.stringify(state[k]);
    if (s !== last.get(k)) { last.set(k, s); changed.push(k); }
  }
  if (!changed.length) return;
  last.set(REV, String(rev + 1));
  await writeColls(c, [...changed, REV]);
  rev += 1;
}

let queue = Promise.resolve();
/** Ejecuta fn(state) en exclusiva. Con save, con el bloqueo de la base y guardando lo que cambió; sin save, solo lee
 *  (a diferencia de SQLite, acá {save:true} sin save no guarda: quien pueda cambiar algo tiene que pasar save = true). */
export function withState(fn, save = true) {
  const run = queue.then(async () => {
    await init();
    if (!save) {
      const c = await pool.connect();
      try { await refresh(c); } catch (e) { rev = null; throw e; } finally { c.release(); }
      return fn(state);
    }
    const snap = structuredClone(state);
    try {
      return await tx(async (c) => {
        await refresh(c);
        const before = structuredClone(state);
        try {
          const out = await fn(state);
          await persist(c);
          return out;
        } catch (e) {
          for (const k of Object.keys(state)) delete state[k];
          Object.assign(state, before);
          throw e;
        }
      });
    } catch (e) {
      // Si falló la base (no la lógica), se vuelve a cargar todo la próxima vez.
      if (!(e && e.status)) { rev = null; for (const k of Object.keys(state)) delete state[k]; Object.assign(state, snap); }
      throw e;
    }
  });
  queue = run.catch(() => {});
  return run;
}

// ── Fotos y comprobantes ─────────────────────────────────
export const files = {
  async save(name, type, buf) { await pool.query('INSERT INTO cs_files(name, type, data) VALUES($1, $2, $3)', [name, type, buf]); },
  async read(name) { const r = await pool.query('SELECT type, data FROM cs_files WHERE name = $1', [name]); return r.rows[0] || null; },
  async remove(name) { await pool.query('DELETE FROM cs_files WHERE name = $1', [name]); },
};

// ── Arranque: tablas, datos iniciales y clave de las sesiones ──
// Se hace una vez por copia del servidor; si la base no responde, se reintenta en el próximo pedido.
let booting = null;
export function init() {
  booting ||= boot().catch((e) => { booting = null; rev = null; throw e; });
  return booting;
}
const boot = () => tx(async (c) => {
  await c.query('CREATE TABLE IF NOT EXISTS cs_state (coll text PRIMARY KEY, json text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())');
  await c.query('CREATE TABLE IF NOT EXISTS cs_files (name text PRIMARY KEY, type text NOT NULL, data bytea NOT NULL, created_at timestamptz NOT NULL DEFAULT now())');
  await c.query('CREATE TABLE IF NOT EXISTS cs_kv (k text PRIMARY KEY, v text NOT NULL)');
  // Supabase expone las tablas por su API pública: se activa RLS sin reglas, así solo entra el servidor.
  for (const t of ['cs_state', 'cs_files', 'cs_kv']) await c.query(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);
  await refresh(c);
  // Sin SESSION_SECRET, la clave de las sesiones se crea una vez y queda en la base (así es la misma en todas las copias).
  if (config.ephemeralSecret) {
    await c.query('INSERT INTO cs_kv(k, v) VALUES($1, $2) ON CONFLICT (k) DO NOTHING', ['session_secret', crypto.randomBytes(32).toString('hex')]);
    config.sessionSecret = (await c.query('SELECT v FROM cs_kv WHERE k = $1', ['session_secret'])).rows[0].v;
    config.ephemeralSecret = false;
  }
});
await init().catch((e) => console.error('Base de datos:', e.message));
