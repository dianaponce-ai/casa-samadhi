import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const envFile = path.join(ROOT, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);
const env = (k, d = '') => (process.env[k] ?? d).toString().trim();

export const config = {
  port: Number(env('PORT', '3001')),
  publicUrl: env('PUBLIC_URL', 'http://localhost:3001').replace(/\/$/, ''),
  dataDir: env('DATA_DIR', path.join(ROOT, 'data')),
  sessionSecret: env('SESSION_SECRET') || null,
  adminEmail: env('ADMIN_EMAIL'),
  adminPassword: env('ADMIN_PASSWORD'),
  mp: { accessToken: env('MP_ACCESS_TOKEN'), webhookSecret: env('MP_WEBHOOK_SECRET') },
  mail: { smtpUrl: env('SMTP_URL'), from: env('MAIL_FROM', 'Casa Samadhi <hola@casasamadhi.com.ar>') },
};
config.mp.mock = !config.mp.accessToken;
if (!config.sessionSecret) { config.sessionSecret = crypto.randomBytes(32).toString('hex'); config.ephemeralSecret = true; }
