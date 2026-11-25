// Dónde se guarda el estado de la casa:
// · con DATABASE_URL (o POSTGRES_URL, la que crea Supabase al conectarlo en Vercel) → Postgres
// · sin eso → SQLite en DATA_DIR (servidor propio o en tu compu)
// Las dos versiones exponen lo mismo: state, withState, kind e init; con Postgres, además, files (fotos y comprobantes).
import { config } from './config.js';

const impl = config.databaseUrl ? await import('./store-pg.js') : await import('./store-sqlite.js');
export const { state, withState, kind, init } = impl;
export const files = impl.files || null;
