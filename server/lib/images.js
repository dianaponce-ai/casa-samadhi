// Fotos que se suben desde el panel (trabajos de antes y después): se guardan en DATA_DIR/uploads
// y se sirven en /uploads. Solo imágenes, hasta 4 MB cada una.
import { mkdirSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';
import { ApiError } from '../core/spa-core.js';

export const UPLOADS = path.join(config.dataDir, 'uploads');
mkdirSync(UPLOADS, { recursive: true });
const TYPES = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };
const MAX = 4 * 1024 * 1024;

export async function saveImage(dataUrl, prefix = 'foto') {
  const m = /^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new ApiError(422, 'Elegí una foto (JPG, PNG o WEBP).');
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length || buf.length > MAX) throw new ApiError(422, 'La foto es muy pesada. Probá con una de menos de 4 MB.');
  const name = `${prefix.replace(/[^a-z0-9-]/gi, '')}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}.${TYPES[m[1]]}`;
  writeFileSync(path.join(UPLOADS, name), buf);
  return 'uploads/' + name;
}
/** Borra una foto subida (las fotos de ejemplo de /media no se tocan). */
export async function deleteImage(rel) {
  const name = String(rel || '').replace(/^\//, '');
  if (!/^uploads\/[a-z0-9.-]+$/i.test(name)) return;
  const f = path.join(UPLOADS, path.basename(name));
  if (existsSync(f)) try { unlinkSync(f); } catch {}
}
