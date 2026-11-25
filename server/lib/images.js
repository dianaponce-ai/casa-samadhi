// Fotos que se suben desde el panel (trabajos de antes y después, fotos de clientas) y comprobantes de transferencia.
// Se sirven en /uploads. Con Postgres se guardan en la base (tabla cs_files); si no, en DATA_DIR/uploads.
// Solo imágenes (y PDF para los comprobantes), hasta 4 MB cada una.
import { mkdirSync, writeFileSync, unlinkSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';
import { files } from './store.js';
import { ApiError } from '../core/spa-core.js';

export const UPLOADS = path.join(config.dataDir, 'uploads');
if (!files) mkdirSync(UPLOADS, { recursive: true });
const TYPES = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf' };
const MIME = Object.fromEntries(Object.entries(TYPES).map(([k, v]) => [v, k]));
const MAX = 4 * 1024 * 1024;
const NAME = /^[a-z0-9-]+\.(webp|jpg|png|pdf)$/i;

export async function saveImage(dataUrl, prefix = 'foto', { pdf = false } = {}) {
  const m = /^data:(image\/(?:webp|jpeg|png)|application\/pdf);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m || (m[1] === 'application/pdf' && !pdf)) throw new ApiError(422, pdf ? 'Subí una foto (JPG, PNG o WEBP) o un PDF.' : 'Elegí una foto (JPG, PNG o WEBP).');
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length || buf.length > MAX) throw new ApiError(422, 'La foto es muy pesada. Probá con una de menos de 4 MB.');
  const name = `${prefix.replace(/[^a-z0-9-]/gi, '')}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}.${TYPES[m[1]]}`;
  if (files) await files.save(name, m[1], buf);
  else writeFileSync(path.join(UPLOADS, name), buf);
  return 'uploads/' + name;
}
/** Borra una foto subida (las fotos de ejemplo de /media no se tocan). */
export async function deleteImage(rel) {
  const name = String(rel || '').replace(/^\//, '');
  if (!/^uploads\/[a-z0-9.-]+$/i.test(name)) return;
  const base = path.basename(name);
  if (files) { await files.remove(base).catch(() => {}); return; }
  const f = path.join(UPLOADS, base);
  if (existsSync(f)) try { unlinkSync(f); } catch {}
}
/** Lee una foto subida: { type, data } o null. */
export async function readImage(name) {
  if (!NAME.test(name)) return null;
  if (files) return files.read(name);
  const f = path.join(UPLOADS, name);
  return existsSync(f) ? { type: MIME[name.split('.').pop().toLowerCase()], data: readFileSync(f) } : null;
}
