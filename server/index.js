// Casa Samadhi · servidor: web pública, reservas, gift cards y panel.
import express from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import { config, ROOT } from './lib/config.js';
import { state, withState } from './lib/store.js';
import { sendEmail } from './lib/mail.js';
import { createPayment, readPayment } from './integrations/mercadopago.js';
import { handle, applyPayment, tick, addStaff, ApiError } from './core/spa-core.js';

// ── Contraseñas y sesiones ───────────────────────────────
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${crypto.scryptSync(pw, salt, 64).toString('hex')}`;
}
function checkPassword(pw, stored) {
  const [alg, s, h] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !s || !h) return false;
  const a = crypto.scryptSync(pw, Buffer.from(s, 'hex'), 64), b = Buffer.from(h, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const COOKIE = 'casa_samadhi_panel', AGE = 12 * 3600;
const sign = (p) => { const b = Buffer.from(JSON.stringify(p)).toString('base64url'); return `${b}.${crypto.createHmac('sha256', config.sessionSecret).update(b).digest('base64url')}`; };
function verify(t) {
  const [b, mac] = String(t || '').split('.');
  if (!b || !mac) return null;
  const exp = crypto.createHmac('sha256', config.sessionSecret).update(b).digest('base64url');
  if (exp.length !== mac.length || !crypto.timingSafeEqual(Buffer.from(exp), Buffer.from(mac))) return null;
  const p = JSON.parse(Buffer.from(b, 'base64url').toString());
  return p.exp > Date.now() / 1000 ? p : null;
}
const CCOOKIE = 'casa_samadhi_cliente', CAGE = 30 * 24 * 3600;
const readCookie = (req, name = COOKIE) => (req.headers.cookie || '').split(';').map((x) => x.trim().split('=')).find(([k]) => k === name)?.[1];
const setCookie = (res, v, age, name = COOKIE) => res.append('Set-Cookie', `${name}=${v}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${age}${config.publicUrl.startsWith('https') ? '; Secure' : ''}`);

export const env = {
  now: () => Date.now(),
  publicUrl: config.publicUrl,
  mock: config.mp.mock,
  smtp: !!config.mail.smtpUrl,
  createPayment,
  sendEmail,
  hashPassword: async (pw) => hashPassword(pw),
  checkPassword: async (pw, h) => checkPassword(pw, h),
};

// ── App ──────────────────────────────────────────────────
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use((req, res, next) => { res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'SAMEORIGIN' }); next(); });
app.use(express.json({ limit: '100kb' }));

// Límite simple por IP para lo que crea cosas (reservas, gift cards, ingreso al panel).
const hits = new Map();
function limit(max, minutes) {
  return (req, res, next) => {
    const k = req.ip + req.path, now = Date.now();
    const a = (hits.get(k) || []).filter((t) => now - t < minutes * 60e3);
    if (a.length >= max) return res.status(429).json({ error: 'Demasiados intentos seguidos. Esperá unos minutos.' });
    a.push(now); hits.set(k, a); next();
  };
}
app.post(['/api/bookings', '/api/giftcards', '/api/withdrawals'], limit(20, 15));
app.post(['/api/admin/login', '/api/account/login'], limit(10, 15));
app.post('/api/account/register', limit(8, 60));

// Webhook de Mercado Pago: se consulta el pago a Mercado Pago (no se confía en lo que llega).
app.post('/api/webhooks/mp', async (req, res) => {
  res.sendStatus(200);
  try {
    const id = req.body?.data?.id || req.query['data.id'] || req.query.id;
    if (!id || (req.body?.type && req.body.type !== 'payment')) return;
    const p = await readPayment(id);
    if (p) await withState((st) => applyPayment(st, env, p));
  } catch (e) { console.error('Webhook MP:', e.message); }
});
// Vuelta del checkout: confirma enseguida sin esperar al webhook.
app.post('/api/pay/confirm', async (req, res, next) => {
  try {
    const p = await readPayment(String(req.body?.payment_id || ''));
    if (!p || p.kind !== req.body?.kind || p.token !== req.body?.token) return res.json({ ok: false });
    res.json(await withState((st) => applyPayment(st, env, p)));
  } catch (e) { next(e); }
});

app.use('/api', async (req, res, next) => {
  try {
    const p = verify(readCookie(req));
    const staff = p ? state.staff.find((u) => u.id === p.uid) : null;
    const pc = verify(readCookie(req, CCOOKIE));
    const customer = pc ? (state.customers || []).find((c) => c.id === pc.cid) : null;
    // Las acciones de la cuenta solo aceptan JSON (protección contra envíos desde otros sitios).
    if (req.path.startsWith('/account') && req.method !== 'GET' && !String(req.get('content-type') || '').includes('application/json')) return res.status(403).json({ error: 'Pedido rechazado.' });
    if (req.path.startsWith('/admin') && !['GET', 'HEAD'].includes(req.method) && !['/admin/login'].includes(req.path) && req.get('x-casa-admin') !== '1') return res.status(403).json({ error: 'Pedido rechazado.' });
    const out = await withState((st) => handle(st, env, { method: req.method, path: '/api' + req.path, query: req.query, body: req.body, staff, customer }), req.method !== 'GET');
    if (out.session !== undefined) setCookie(res, out.session ? sign({ uid: out.session.staff_id, exp: Math.floor(Date.now() / 1000) + AGE }) : '', out.session ? AGE : 0);
    if (out.customerSession !== undefined) setCookie(res, out.customerSession ? sign({ cid: out.customerSession.customer_id, exp: Math.floor(Date.now() / 1000) + CAGE }) : '', out.customerSession ? CAGE : 0, CCOOKIE);
    res.status(out.status).json(out.body);
  } catch (e) { next(e); }
});

app.use('/admin', express.static(path.join(ROOT, 'admin'), { index: 'index.html' }));
app.use(express.static(path.join(ROOT, 'public'), { extensions: ['html'], maxAge: '1h' }));

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err instanceof ApiError) return res.status(err.status).json({ error: err.message, ...(err.extra || {}) });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'No pudimos leer los datos enviados.' });
  console.error(err);
  res.status(500).json({ error: err.message?.startsWith('Mercado Pago') ? err.message : 'Algo salió mal. Probá de nuevo en un momento.' });
});

// Primer usuario del panel desde .env
if (!state.staff.length && config.adminEmail && config.adminPassword) {
  await withState((st) => addStaff(st, env, { email: config.adminEmail, password: config.adminPassword, name: 'Administración', role: 'admin' }));
  console.log(`Usuario del panel creado: ${config.adminEmail}`);
}
// Tareas cada minuto: libera reservas sin seña, manda recordatorios, vence gift cards.
setInterval(() => withState((st) => tick(st, env).then((changed) => ({ save: changed })), false).catch((e) => console.error('Tareas:', e.message)), 60e3).unref();

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  app.listen(config.port, () => {
    console.log(`Casa Samadhi en ${config.publicUrl} (puerto ${config.port})`);
    if (config.mp.mock) console.log('· Mercado Pago en modo prueba: falta MP_ACCESS_TOKEN.');
    if (!config.mail.smtpUrl) console.log('· Sin SMTP_URL: los emails quedan registrados en el panel pero no se envían.');
    if (config.ephemeralSecret) console.log('· Falta SESSION_SECRET: las sesiones del panel se cierran al reiniciar.');
  });
}
export { app };
