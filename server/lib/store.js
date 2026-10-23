// Guarda el estado de la casa (servicios, turnos, gift cards…) en SQLite.
// Cada colección es una fila con su JSON. Los pedidos se atienden de a uno (cola), así nunca se pisan dos reservas.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { seedState, COLLECTIONS, STATE_VERSION } from '../core/spa-core.js';

mkdirSync(config.dataDir, { recursive: true });
const db = new DatabaseSync(process.env.DB_FILE || path.join(config.dataDir, 'casa-samadhi.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; CREATE TABLE IF NOT EXISTS state (coll TEXT PRIMARY KEY, json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime(\'now\')));');

function load() {
  const rows = db.prepare('SELECT coll, json FROM state').all();
  if (!rows.length) { const st = seedState(); persist(st); return st; }
  const st = seedState();
  for (const r of rows) if (r.coll === 'v') st.v = JSON.parse(r.json); else st[r.coll] = JSON.parse(r.json);
  if (st.v !== STATE_VERSION) st.v = STATE_VERSION; // acá van las migraciones cuando cambie la estructura
  return st;
}
function persist(st) {
  const up = db.prepare('INSERT INTO state(coll, json, updated_at) VALUES(?, ?, datetime(\'now\')) ON CONFLICT(coll) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at');
  db.exec('BEGIN IMMEDIATE');
  try { for (const k of COLLECTIONS) up.run(k, JSON.stringify(st[k])); up.run('v', JSON.stringify(st.v)); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }
}

export const state = load();
let queue = Promise.resolve();
/** Ejecuta fn(state) en exclusiva; si save es true (o fn devuelve {save:true}) guarda al terminar. */
export function withState(fn, save = true) {
  const run = queue.then(async () => {
    // Si algo falla a mitad de camino, se vuelve al estado anterior para no dejar datos a medias.
    const snap = save ? structuredClone(state) : null;
    try {
      const out = await fn(state);
      if (save || out?.save) persist(state);
      return out;
    } catch (e) {
      if (snap) for (const k of Object.keys(snap)) state[k] = snap[k];
      throw e;
    }
  });
  queue = run.catch(() => {});
  return run;
}
export const saveNow = () => persist(state);
