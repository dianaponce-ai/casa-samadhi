// Lógica de Casa Samadhi: servicios, disponibilidad, turnos con seña, gift cards, eventos y panel.
// Es código puro sobre un objeto de estado: lo usa el servidor (que lo guarda en SQLite) y la vista previa
// (que lo guarda en el navegador). Lo que toca el mundo exterior (Mercado Pago, emails, contraseñas)
// llega por `env`:
//   env.now() → ms · env.publicUrl · env.mock
//   env.createPayment({ kind, token, title, amount, email }) → Promise<url>
//   env.sendEmail({ template, to, subject, html }) → Promise
//   env.hashPassword(pw) / env.checkPassword(pw, hash)
import { CATEGORIES, RESOURCES, SERVICES, SITE, HOURS, BOOKING, GIFTCARDS, FAQ, TERMS } from './defaults.js';
import { renderEmail, TEMPLATES, longDate } from './emails.js';

export const STATE_VERSION = 1;
export const COLLECTIONS = ['settings', 'services', 'bookings', 'giftcards', 'blocks', 'events', 'withdrawals', 'emails', 'staff', 'payments', 'ids'];
export const ROLES = { admin: 'Administración', staff: 'Recepción' };
export const BOOKING_STATUS = { pending_payment: 'Esperando seña', confirmed: 'Confirmado', completed: 'Realizado', cancelled: 'Cancelado', no_show: 'No vino', expired: 'Seña vencida', attention: 'Revisar' };
export const GIFT_STATUS = { pending_payment: 'Esperando pago', active: 'Activa', used: 'Usada', expired: 'Vencida', cancelled: 'Anulada' };

// ── Estado inicial ───────────────────────────────────────
export function seedState() {
  const st = {
    v: STATE_VERSION,
    settings: {
      site: { ...SITE }, booking: { ...BOOKING }, hours: structuredClone(HOURS), giftcards: structuredClone(GIFTCARDS),
      resources: structuredClone(RESOURCES), categories: structuredClone(CATEGORIES), content: { faq: structuredClone(FAQ), terms: TERMS },
    },
    services: [], bookings: [], giftcards: [], blocks: [], events: [], withdrawals: [], emails: [], staff: [], payments: [],
    ids: { service: 0, booking: 0, gift: 0, block: 0, event: 0, withdrawal: 0, email: 0, staff: 0, payment: 0, bookingNumber: 1000 },
  };
  SERVICES.forEach((s, i) => st.services.push({ id: ++st.ids.service, position: i, visible: true, featured: false, tag: '', short: '', includes: [], image: '', days: [], whatsapp: '', ...structuredClone(s) }));
  return st;
}

// ── Utilidades ───────────────────────────────────────────
export class ApiError extends Error { constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; } }
const fail = (status, msg, extra) => { throw new ApiError(status, msg, extra); };
const AR_OFFSET = 3 * 3600e3; // Argentina: UTC−3 todo el año
const pad = (n) => String(n).padStart(2, '0');
export const localNow = (env) => new Date(env.now() - AR_OFFSET); // usar con getters UTC
export const dayKey = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
export const addDays = (key, n) => dayKey(new Date(Date.parse(key + 'T00:00:00Z') + n * 864e5));
export const weekday = (key) => new Date(key + 'T00:00:00Z').getUTCDay();
const toMin = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + (m || 0); };
const toHHMM = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
export const localToMs = (s) => Date.parse(s.replace(' ', 'T') + ':00Z') + AR_OFFSET; // 'YYYY-MM-DD HH:MM' hora argentina → ms
const msToLocal = (ms) => { const d = new Date(ms - AR_OFFSET); return `${dayKey(d)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };
const iso = (env) => new Date(env.now()).toISOString();
const digits = (s) => String(s || '').replace(/\D/g, '');
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || '').trim());
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const isTime = (s) => /^\d{2}:\d{2}$/.test(String(s || ''));
const clean = (s, n = 200) => String(s ?? '').trim().slice(0, n);
const fmtMoney = (n) => '$ ' + Math.round(Number(n) || 0).toLocaleString('es-AR');
const randomCode = (n, abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789') => { let s = ''; const a = new Uint32Array(n); crypto.getRandomValues(a); for (const x of a) s += abc[x % abc.length]; return s; };
const token = () => randomCode(28, 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789');
const slugify = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'servicio';
const roundTo100 = (n) => Math.round(n / 100) * 100;
const errs = (e) => { const keys = Object.keys(e).filter((k) => e[k]); if (keys.length) fail(422, e[keys[0]], { errors: e }); };

// ── Disponibilidad ───────────────────────────────────────
const blocking = (b, nowMs) => b.status === 'confirmed' || b.status === 'attention' || (b.status === 'pending_payment' && Date.parse(b.hold_until) > nowMs);
function capacityOf(st, resource) { return Math.max(1, Number(st.settings.resources.find((r) => r.key === resource)?.capacity) || 1); }

/** Horarios libres de un servicio para un día. `ignoreId`: turno que se está reprogramando. */
export function slotsFor(st, env, service, date, { ignoreId = null, staff = false } = {}) {
  const B = st.settings.booking;
  const nowMs = env.now();
  const today = dayKey(localNow(env));
  if (!staff && (date < today || date > addDays(today, B.maxDaysAhead))) return [];
  const wd = weekday(date);
  if (service.days?.length && !service.days.includes(wd)) return [];
  const windows = st.settings.hours[wd] || [];
  const dur = Math.max(5, Number(service.duration) || 60);
  const step = Math.max(5, Number(B.slotStep) || 30);
  const cap = capacityOf(st, service.resource);
  const taken = st.bookings.filter((b) => b.id !== ignoreId && b.resource === service.resource && b.start.startsWith(date) && blocking(b, nowMs))
    .map((b) => [toMin(b.start.slice(11)), toMin(b.start.slice(11)) + b.duration]);
  const blocks = st.blocks.filter((k) => k.date === date && (k.resource === 'all' || k.resource === service.resource))
    .map((k) => [k.from ? toMin(k.from) : 0, k.to ? toMin(k.to) : 24 * 60]);
  const minStart = nowMs + (staff ? 0 : Number(B.minNoticeHours) || 0) * 3600e3;
  const out = [];
  for (const w of windows) {
    for (let t = toMin(w.from); t + dur <= toMin(w.to); t += step) {
      const s = `${date} ${toHHMM(t)}`;
      if (localToMs(s) < minStart) continue;
      const overlaps = (r) => t < r[1] && r[0] < t + dur;
      if (blocks.some(overlaps)) continue;
      if (taken.filter(overlaps).length >= cap) continue;
      out.push(toHHMM(t));
    }
  }
  return out;
}

export function availability(st, env, serviceId, from, days = 14) {
  const s = st.services.find((x) => x.id === Number(serviceId) && x.visible && x.mode === 'online');
  if (!s) fail(404, 'Ese servicio no se reserva online. Escribinos por WhatsApp.');
  const today = dayKey(localNow(env));
  const start = isDate(from) && from > today ? from : today;
  const n = Math.min(62, Math.max(1, Number(days) || 14));
  const out = [];
  for (let i = 0; i < n; i++) { const d = addDays(start, i); out.push({ date: d, slots: slotsFor(st, env, s, d) }); }
  return { service_id: s.id, days: out, maxDate: addDays(today, st.settings.booking.maxDaysAhead) };
}

// ── Vistas públicas ──────────────────────────────────────
const publicService = (s) => ({ id: s.id, slug: s.slug, category: s.category, name: s.name, tag: s.tag, short: s.short, includes: s.includes, duration: s.duration, price: s.price, mode: s.mode, image: s.image, featured: !!s.featured, whatsapp: s.whatsapp || '' });
export function publicSite(st, env) {
  const S = st.settings;
  const today = dayKey(localNow(env));
  return {
    site: S.site,
    categories: S.categories,
    services: st.services.filter((s) => s.visible).sort((a, b) => a.position - b.position).map(publicService),
    hours: S.hours,
    booking: { depositPercent: S.booking.depositPercent, cancelHours: S.booking.cancelHours, maxDaysAhead: S.booking.maxDaysAhead, holdMinutes: S.booking.holdMinutes },
    giftcards: S.giftcards,
    events: st.events.filter((e) => e.active && e.date >= today).sort((a, b) => (a.date + a.from).localeCompare(b.date + b.from)),
    faq: S.content.faq,
    terms: S.content.terms,
    mock: !!env.mock,
  };
}
function publicBooking(st, env, b) {
  return {
    code: b.code, token: b.token, status: b.status, status_label: BOOKING_STATUS[b.status], service_name: b.service_name, start: b.start, when: longDate(b.start), duration: b.duration,
    price: b.price, deposit: b.deposit, deposit_due: b.deposit_due, deposit_paid: b.deposit_paid, gift_applied: b.gift_applied, name: b.name, email: b.email,
    hold_until: b.hold_until, pay_url: b.status === 'pending_payment' ? b.pay_url : null,
    can_cancel: ['confirmed', 'pending_payment'].includes(b.status) && localToMs(b.start) - env.now() > st.settings.booking.cancelHours * 3600e3,
  };
}
function publicGift(g) {
  return { token: g.token, status: g.status, status_label: GIFT_STATUS[g.status], amount: g.amount, balance: g.balance, service_name: g.service_name, buyer_name: g.buyer_name, to_name: g.to_name, message: g.message,
    code: g.status === 'pending_payment' ? null : g.code, expires_at: g.expires_at, pay_url: g.status === 'pending_payment' ? g.pay_url : null };
}

// ── Emails ───────────────────────────────────────────────
async function sendEmail(st, env, template, to, ctx, ref = {}) {
  if (!to) return;
  const { subject, html } = renderEmail(template, { site: st.settings.site, cancelHours: st.settings.booking.cancelHours, home: env.publicUrl + '/', ...ctx });
  const id = ++st.ids.email;
  const row = { id, at: iso(env), template, to, subject, html, status: 'enviando', ...ref };
  st.emails.push(row);
  if (st.emails.length > 600) st.emails.splice(0, st.emails.length - 600);
  try { const r = await env.sendEmail({ template, to, subject, html }); row.status = r === 'sin-smtp' ? 'sin configurar' : 'enviado'; } catch (e) { row.status = 'error'; row.error = String(e.message || e).slice(0, 200); }
}
const staffTo = (st) => st.settings.booking.staffEmails || st.settings.site.email || '';
const bookingLink = (env, b) => `${env.publicUrl}/#turno/${b.token}`;
const giftLink = (env, g) => `${env.publicUrl}/#gift/${g.token}`;

// ── Turnos ───────────────────────────────────────────────
function findGift(st, env, code) {
  const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!c) return null;
  const g = st.giftcards.find((x) => x.code.replace(/[^A-Z0-9]/g, '') === c);
  if (!g || g.status === 'pending_payment' || g.status === 'cancelled') fail(422, 'No encontramos esa gift card. Revisá el código.', { errors: { gift_code: 'No encontramos esa gift card. Revisá el código.' } });
  if (g.status === 'expired' || Date.parse(g.expires_at) < env.now()) fail(422, 'Esa gift card está vencida.', { errors: { gift_code: 'Esa gift card está vencida.' } });
  if (g.balance <= 0) fail(422, 'Esa gift card ya no tiene saldo.', { errors: { gift_code: 'Esa gift card ya no tiene saldo.' } });
  return g;
}
function refundGift(st, b) {
  if (!b.gift_applied || !b.gift_id) return;
  const g = st.giftcards.find((x) => x.id === b.gift_id);
  if (g) { g.balance += b.gift_applied; if (g.status === 'used') g.status = 'active'; g.history.push({ at: new Date().toISOString(), amount: b.gift_applied, note: `Devuelto por turno ${b.code}` }); }
  b.gift_applied = 0;
}

async function createBooking(st, env, body) {
  const s = st.services.find((x) => x.id === Number(body.service_id) && x.visible);
  if (!s) fail(404, 'Elegí un servicio.');
  if (s.mode !== 'online') fail(422, 'Este servicio se coordina por WhatsApp.');
  const e = {
    name: clean(body.name).length < 3 ? 'Escribí tu nombre y apellido.' : '',
    email: !isEmail(body.email) ? 'Revisá el email: ahí te llega la confirmación.' : '',
    phone: digits(body.phone).length < 8 ? 'Dejanos un teléfono con WhatsApp.' : '',
    accept: !body.accept ? 'Para reservar tenés que aceptar las condiciones.' : '',
  };
  errs(e);
  if (!isDate(body.date) || !isTime(body.time)) fail(422, 'Elegí el día y el horario.');
  if (!slotsFor(st, env, s, body.date).includes(body.time)) fail(409, 'Ese horario se acaba de ocupar. Elegí otro, por favor.', { taken: true });
  const price = Number(s.price) || 0;
  const deposit = price ? roundTo100(price * (Number(st.settings.booking.depositPercent) || 0) / 100) : 0;
  let gift = null, giftApplied = 0;
  if (clean(body.gift_code)) { gift = findGift(st, env, body.gift_code); giftApplied = Math.min(gift.balance, price); }
  const depositDue = Math.max(0, deposit - giftApplied);
  const b = {
    id: ++st.ids.booking, code: `T-${++st.ids.bookingNumber}`, token: token(), service_id: s.id, service_name: s.name + (s.tag && s.category === 'manicuria' ? ` · ${s.tag}` : ''), resource: s.resource,
    start: `${body.date} ${body.time}`, duration: Number(s.duration) || 60, price, deposit, deposit_due: depositDue, deposit_paid: 0, gift_id: gift?.id || null, gift_code: gift?.code || '', gift_applied: giftApplied,
    name: clean(body.name, 80), email: clean(body.email, 120).toLowerCase(), phone: clean(body.phone, 40), notes: clean(body.notes, 500),
    status: depositDue > 0 ? 'pending_payment' : 'confirmed', source: 'web', created_at: iso(env),
    hold_until: new Date(env.now() + (Number(st.settings.booking.holdMinutes) || 30) * 60e3).toISOString(), reminded: false, refund_pending: false, pay_url: null, payment_id: null, history: [],
  };
  if (gift && giftApplied) { gift.balance -= giftApplied; if (gift.balance <= 0) gift.status = 'used'; gift.history.push({ at: iso(env), amount: -giftApplied, note: `Turno ${b.code}` }); }
  st.bookings.push(b);
  if (b.status === 'pending_payment') {
    b.pay_url = await env.createPayment({ kind: 'booking', token: b.token, title: `Seña · ${s.name} · ${longDate(b.start)}`, amount: depositDue, email: b.email, ref: b.code });
  } else {
    b.history.push({ at: iso(env), text: giftApplied ? 'Confirmado con gift card' : 'Confirmado sin seña' });
    await confirmEmails(st, env, b);
  }
  return { booking: publicBooking(st, env, b), pay_url: b.pay_url };
}
async function confirmEmails(st, env, b) {
  await sendEmail(st, env, 'booking_confirmed', b.email, { booking: b, link: bookingLink(env, b) }, { booking_id: b.id });
  await sendEmail(st, env, 'booking_staff', staffTo(st), { booking: b }, { booking_id: b.id });
}
async function cancelBooking(st, env, b, by) {
  if (!['confirmed', 'pending_payment', 'attention'].includes(b.status)) fail(409, 'Ese turno ya no está activo.');
  const wasPaid = b.deposit_paid > 0;
  b.status = 'cancelled';
  b.refund_pending = wasPaid;
  refundGift(st, b);
  b.history.push({ at: iso(env), text: `Cancelado por ${by}` });
  await sendEmail(st, env, 'booking_cancelled', b.email, { booking: b }, { booking_id: b.id });
  if (by === 'la clienta') await sendEmail(st, env, 'booking_staff', staffTo(st), { booking: { ...b, notes: `CANCELADO por la clienta.${wasPaid ? ' Tenía seña paga: coordinar devolución o nueva fecha.' : ''}` } }, { booking_id: b.id });
}

// ── Gift cards ───────────────────────────────────────────
function newGiftCode(st) { let c; do { c = `CS-${randomCode(4)}-${randomCode(4)}`; } while (st.giftcards.some((g) => g.code === c)); return c; }
async function createGift(st, env, body, { staff = null } = {}) {
  const G = st.settings.giftcards;
  if (!G.enabled && !staff) fail(403, 'Las gift cards no están disponibles en este momento.');
  let amount = Math.round(Number(body.amount) || 0), serviceName = '';
  if (body.service_id) {
    const s = st.services.find((x) => x.id === Number(body.service_id) && x.visible && x.price);
    if (!s) fail(422, 'Elegí un ritual o un monto.');
    amount = s.price; serviceName = s.name;
  }
  const e = {
    amount: !(amount >= (staff ? 1000 : Number(G.min) || 0)) ? `El monto mínimo es ${fmtMoney(G.min)}.` : amount > 2000000 ? 'Ese monto es demasiado alto.' : '',
    buyer_name: clean(body.buyer_name).length < 3 ? 'Escribí tu nombre.' : '',
    buyer_email: !staff && !isEmail(body.buyer_email) ? 'Revisá tu email: ahí te mandamos la gift card.' : '',
    to_email: body.send_to_recipient && !isEmail(body.to_email) ? 'Revisá el email de quien la recibe.' : '',
    accept: !staff && !body.accept ? 'Tenés que aceptar las condiciones.' : '',
  };
  errs(e);
  const g = {
    id: ++st.ids.gift, code: newGiftCode(st), token: token(), amount, balance: amount, service_id: body.service_id ? Number(body.service_id) : null, service_name: serviceName,
    buyer_name: clean(body.buyer_name, 80), buyer_email: clean(body.buyer_email, 120).toLowerCase(), to_name: clean(body.to_name, 80), to_email: clean(body.to_email, 120).toLowerCase(),
    message: clean(body.message, 240), send_to_recipient: !!body.send_to_recipient, status: staff ? 'active' : 'pending_payment', source: staff ? 'local' : 'web',
    created_at: iso(env), paid_at: staff ? iso(env) : null, expires_at: null, pay_url: null, payment_id: null, history: [],
  };
  if (staff) { g.expires_at = new Date(env.now() + G.validityDays * 864e5).toISOString(); g.history.push({ at: iso(env), amount, note: `Emitida en el local por ${staff.name || staff.email}` }); }
  st.giftcards.push(g);
  if (!staff) g.pay_url = await env.createPayment({ kind: 'gift', token: g.token, title: `Gift card Casa Samadhi · ${serviceName || fmtMoney(amount)}`, amount, email: g.buyer_email, ref: g.code });
  else if (g.buyer_email) await giftEmails(st, env, g);
  return { gift: publicGift(g), pay_url: g.pay_url };
}
async function giftEmails(st, env, g) {
  await sendEmail(st, env, 'giftcard_buyer', g.buyer_email, { gift: g, link: giftLink(env, g) }, { gift_id: g.id });
  if (g.send_to_recipient && g.to_email) await sendEmail(st, env, 'giftcard_recipient', g.to_email, { gift: g, link: giftLink(env, g) }, { gift_id: g.id });
}

// ── Pagos (Mercado Pago o simulado) ──────────────────────
/** Resultado de un pago: lo llama el webhook de Mercado Pago, la vuelta del checkout o el pago simulado. */
export async function applyPayment(st, env, { kind, token: tk, status, amount, payment_id }) {
  st.payments.push({ id: ++st.ids.payment, at: iso(env), kind, token: tk, status, amount, payment_id });
  if (st.payments.length > 1000) st.payments.splice(0, st.payments.length - 1000);
  if (kind === 'booking') {
    const b = st.bookings.find((x) => x.token === tk);
    if (!b) return { ok: false };
    if (b.payment_id && b.payment_id === payment_id) return { ok: true, booking: publicBooking(st, env, b) };
    if (status !== 'approved') { b.history.push({ at: iso(env), text: `Pago ${status}` }); return { ok: true, booking: publicBooking(st, env, b) }; }
    if (b.status === 'pending_payment' || b.status === 'expired') {
      b.payment_id = payment_id || null;
      b.deposit_paid = Number(amount) || b.deposit_due;
      if (b.status === 'expired') {
        // Pagó después de que venció la reserva: si el horario sigue libre lo confirmamos; si no, queda para revisar.
        const s = st.services.find((x) => x.id === b.service_id);
        const free = s && slotsFor(st, env, s, b.start.slice(0, 10), { ignoreId: b.id, staff: true }).includes(b.start.slice(11));
        b.status = free ? 'confirmed' : 'attention';
        b.history.push({ at: iso(env), text: free ? 'Seña acreditada fuera de término; el horario seguía libre.' : 'Seña acreditada fuera de término y el horario ya estaba ocupado: hay que reprogramar o devolver.' });
      } else { b.status = 'confirmed'; b.history.push({ at: iso(env), text: `Seña acreditada (${fmtMoney(b.deposit_paid)})` }); }
      await confirmEmails(st, env, b);
    }
    return { ok: true, booking: publicBooking(st, env, b) };
  }
  if (kind === 'gift') {
    const g = st.giftcards.find((x) => x.token === tk);
    if (!g) return { ok: false };
    if (status === 'approved' && g.status === 'pending_payment') {
      g.status = 'active'; g.paid_at = iso(env); g.payment_id = payment_id || null;
      g.expires_at = new Date(env.now() + st.settings.giftcards.validityDays * 864e5).toISOString();
      g.history.push({ at: iso(env), amount: g.amount, note: 'Pagada online' });
      await giftEmails(st, env, g);
    }
    return { ok: true, gift: publicGift(g) };
  }
  return { ok: false };
}

// ── Tareas periódicas (cada minuto) ──────────────────────
export async function tick(st, env) {
  const now = env.now();
  let changed = false;
  for (const b of st.bookings) {
    if (b.status === 'pending_payment' && Date.parse(b.hold_until) < now) { b.status = 'expired'; refundGift(st, b); b.history.push({ at: iso(env), text: 'Venció el tiempo para pagar la seña' }); changed = true; }
    const startMs = localToMs(b.start);
    if (b.status === 'confirmed' && !b.reminded && startMs > now && startMs - now < st.settings.booking.reminderHours * 3600e3 && now - Date.parse(b.created_at) > 6 * 3600e3) {
      b.reminded = true; changed = true;
      await sendEmail(st, env, 'booking_reminder', b.email, { booking: b, link: bookingLink(env, b) }, { booking_id: b.id });
    }
    if (b.status === 'confirmed' && startMs + b.duration * 60e3 + 12 * 3600e3 < now) { b.status = 'completed'; changed = true; }
  }
  for (const g of st.giftcards) {
    if (g.status === 'active' && g.expires_at && Date.parse(g.expires_at) < now) { g.status = 'expired'; changed = true; }
    if (g.status === 'pending_payment' && Date.parse(g.created_at) < now - 3 * 864e5) { g.status = 'cancelled'; changed = true; }
  }
  return changed;
}

// ── Panel: helpers ───────────────────────────────────────
const needAdmin = (staff) => { if (staff?.role !== 'admin') fail(403, 'Esta sección es solo para administración.'); };
const staffView = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, role_label: ROLES[u.role], created_at: u.created_at });
function serviceInput(st, body, prev = {}) {
  const s = { ...prev };
  for (const k of ['name', 'tag', 'short', 'image', 'whatsapp']) if (body[k] !== undefined) s[k] = clean(body[k], k === 'short' ? 600 : 200);
  if (body.category !== undefined) { if (!st.settings.categories.some((c) => c.key === body.category)) fail(422, 'Elegí una sección.'); s.category = body.category; }
  if (body.resource !== undefined) { if (!st.settings.resources.some((r) => r.key === body.resource)) fail(422, 'Elegí dónde se hace.'); s.resource = body.resource; }
  if (body.mode !== undefined) { if (!['online', 'whatsapp', 'menu'].includes(body.mode)) fail(422, 'Modo inválido.'); s.mode = body.mode; }
  if (body.duration !== undefined) s.duration = Math.max(0, Math.min(480, Math.round(Number(body.duration) || 0)));
  if (body.price !== undefined) s.price = body.price === '' || body.price === null ? null : Math.max(0, Math.round(Number(body.price) || 0));
  if (body.includes !== undefined) s.includes = (Array.isArray(body.includes) ? body.includes : String(body.includes).split('\n')).map((x) => clean(x, 120)).filter(Boolean).slice(0, 12);
  if (body.days !== undefined) s.days = (body.days || []).map(Number).filter((d) => d >= 0 && d <= 6);
  for (const k of ['visible', 'featured']) if (body[k] !== undefined) s[k] = !!body[k];
  if (body.position !== undefined) s.position = Number(body.position) || 0;
  if (!s.name) fail(422, 'Ponele un nombre al servicio.');
  if (s.mode === 'online' && !(s.duration > 0)) fail(422, 'Para reservar online el servicio necesita una duración.');
  if (s.mode === 'online' && !s.price) fail(422, 'Para reservar online con seña el servicio necesita un precio. Si no tiene precio fijo, elegí "Por WhatsApp".');
  return s;
}
const adminBooking = (b) => ({ ...b, status_label: BOOKING_STATUS[b.status] });

function dashboard(st, env) {
  const now = env.now();
  const today = dayKey(localNow(env));
  const in7 = addDays(today, 7);
  const active = (b) => ['confirmed', 'attention', 'pending_payment', 'completed'].includes(b.status);
  const monthAgo = new Date(now - 30 * 864e5).toISOString();
  const todays = st.bookings.filter((b) => b.start.startsWith(today) && b.status !== 'expired').sort((a, b) => a.start.localeCompare(b.start));
  return {
    today, todays: todays.map(adminBooking),
    week: st.bookings.filter((b) => b.start.slice(0, 10) >= today && b.start.slice(0, 10) < in7 && active(b)).length,
    attention: st.bookings.filter((b) => b.status === 'attention' || (b.status === 'cancelled' && b.refund_pending)).map(adminBooking),
    pending: st.bookings.filter((b) => b.status === 'pending_payment').length,
    deposits30: st.bookings.filter((b) => b.created_at >= monthAgo && b.deposit_paid).reduce((a, b) => a + b.deposit_paid, 0),
    bookings30: st.bookings.filter((b) => b.created_at >= monthAgo && active(b)).length,
    gifts30: st.giftcards.filter((g) => g.paid_at && g.paid_at >= monthAgo).reduce((a, g) => a + g.amount, 0),
    giftBalance: st.giftcards.filter((g) => g.status === 'active').reduce((a, g) => a + g.balance, 0),
    giftActive: st.giftcards.filter((g) => g.status === 'active').length,
    top: Object.entries(st.bookings.filter((b) => b.created_at >= monthAgo && active(b)).reduce((m, b) => ((m[b.service_name] = (m[b.service_name] || 0) + 1), m), {})).sort((a, b) => b[1] - a[1]).slice(0, 6),
    mock: !!env.mock,
  };
}
function clients(st, q) {
  const map = new Map();
  for (const b of [...st.bookings].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const k = b.email || b.phone;
    const c = map.get(k) || { email: b.email, name: b.name, phone: b.phone, visits: 0, upcoming: 0, last: '', spent: 0, services: {} };
    c.name = b.name; c.phone = b.phone || c.phone;
    if (b.status === 'completed') { c.visits++; c.spent += b.price; }
    if (['confirmed', 'pending_payment'].includes(b.status)) c.upcoming++;
    if (b.start > c.last && b.status !== 'expired') c.last = b.start;
    c.services[b.service_name] = (c.services[b.service_name] || 0) + 1;
    map.set(k, c);
  }
  let list = [...map.values()].map((c) => ({ ...c, top: Object.entries(c.services).sort((a, b) => b[1] - a[1])[0]?.[0] || '' }));
  if (q) { const t = q.toLowerCase(); list = list.filter((c) => (c.name + ' ' + c.email + ' ' + c.phone).toLowerCase().includes(t)); }
  return list.sort((a, b) => b.last.localeCompare(a.last)).slice(0, 300);
}

// ── Router ───────────────────────────────────────────────
/**
 * req: { method, path, query, body, staff } · devuelve { status, body, session? }
 * `session`: { staff_id } para iniciar sesión del panel, null para cerrarla.
 */
export async function handle(st, env, req) {
  const { method, path } = req;
  const q = req.query || {};
  const body = req.body || {};
  const seg = path.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const ok = (b) => ({ status: 200, body: b });

  // Públicas
  if (method === 'GET' && path === '/api/site') return ok(publicSite(st, env));
  if (method === 'GET' && path === '/api/availability') return ok(availability(st, env, q.service, q.from, q.days));
  if (method === 'POST' && path === '/api/bookings') return ok(await createBooking(st, env, body));
  if (seg[0] === 'bookings' && seg[1]) {
    const b = st.bookings.find((x) => x.token === seg[1]);
    if (!b) fail(404, 'No encontramos ese turno.');
    if (method === 'GET' && !seg[2]) return ok({ booking: publicBooking(st, env, b) });
    if (method === 'POST' && seg[2] === 'cancel') {
      if (!publicBooking(st, env, b).can_cancel) fail(409, `Faltan menos de ${st.settings.booking.cancelHours} horas: para cancelar escribinos por WhatsApp.`);
      await cancelBooking(st, env, b, 'la clienta');
      return ok({ booking: publicBooking(st, env, b) });
    }
  }
  if (method === 'POST' && path === '/api/giftcards/check') {
    const g = findGift(st, env, body.code);
    return ok({ code: g.code, balance: g.balance, expires_at: g.expires_at });
  }
  if (method === 'POST' && path === '/api/giftcards') return ok(await createGift(st, env, body));
  if (method === 'GET' && seg[0] === 'giftcards' && seg[1]) {
    const g = st.giftcards.find((x) => x.token === seg[1]);
    if (!g) fail(404, 'No encontramos esa gift card.');
    return ok({ gift: publicGift(g) });
  }
  if (method === 'POST' && path === '/api/withdrawals') {
    const e = { name: clean(body.name).length < 3 ? 'Escribí tu nombre y apellido.' : '', email: !isEmail(body.email) ? 'Revisá el email.' : '', ref: clean(body.ref).length < 3 ? 'Escribí el código de tu turno o de tu gift card.' : '' };
    errs(e);
    const w = { id: ++st.ids.withdrawal, code: `ARR-${randomCode(6)}`, name: clean(body.name, 80), email: clean(body.email, 120).toLowerCase(), ref: clean(body.ref, 40).toUpperCase(), reason: clean(body.reason, 500), status: 'nuevo', created_at: iso(env) };
    st.withdrawals.push(w);
    await sendEmail(st, env, 'withdrawal', w.email, { w });
    await sendEmail(st, env, 'booking_staff', staffTo(st), { booking: { code: w.ref, service_name: 'Pedido de arrepentimiento', start: msToLocal(env.now()), duration: 0, price: 0, name: w.name, email: w.email, phone: '', notes: `${w.code} · ${w.reason}` } });
    return ok({ code: w.code });
  }
  if (method === 'POST' && path === '/api/pay/simulate') {
    if (!env.mock) fail(404, 'No existe esa ruta.');
    const kind = body.kind === 'gift' ? 'gift' : 'booking';
    const item = (kind === 'gift' ? st.giftcards : st.bookings).find((x) => x.token === body.token);
    if (!item) fail(404, 'No encontramos el pago.');
    const amount = kind === 'gift' ? item.amount : item.deposit_due;
    return ok(await applyPayment(st, env, { kind, token: body.token, status: body.result === 'rejected' ? 'rejected' : 'approved', amount, payment_id: 'SIM-' + randomCode(8, '0123456789') }));
  }

  // Panel
  if (seg[0] !== 'admin') fail(404, 'No existe esa ruta.');
  const A = seg.slice(1);
  if (method === 'GET' && A[0] === 'setup-needed') return ok({ needed: st.staff.length === 0 });
  if (method === 'POST' && A[0] === 'login') {
    const u = st.staff.find((x) => x.email === String(body.email || '').toLowerCase().trim());
    if (!u || !(await env.checkPassword(String(body.password || ''), u.password_hash))) fail(401, 'Email o contraseña incorrectos.');
    return { status: 200, body: { me: staffView(u) }, session: { staff_id: u.id } };
  }
  if (method === 'POST' && A[0] === 'logout') return { status: 200, body: { ok: true }, session: null };
  const staff = req.staff;
  if (!staff) fail(401, 'Tu sesión venció. Volvé a entrar.');
  if (method === 'GET' && A[0] === 'me') return ok({ me: staffView(staff) });
  if (method === 'GET' && A[0] === 'dashboard') return ok(dashboard(st, env));

  if (A[0] === 'agenda' && method === 'GET') {
    const date = isDate(q.date) ? q.date : dayKey(localNow(env));
    return ok({ date, resources: st.settings.resources, hours: st.settings.hours[weekday(date)] || [],
      bookings: st.bookings.filter((b) => b.start.startsWith(date) && b.status !== 'expired').sort((a, b) => a.start.localeCompare(b.start)).map(adminBooking),
      blocks: st.blocks.filter((k) => k.date === date) });
  }
  if (A[0] === 'slots' && method === 'GET') {
    const s = st.services.find((x) => x.id === Number(q.service));
    if (!s) fail(404, 'Elegí un servicio.');
    return ok({ slots: slotsFor(st, env, s, q.date, { ignoreId: Number(q.ignore) || null, staff: true }) });
  }
  if (A[0] === 'bookings') {
    if (method === 'GET' && !A[1]) {
      let list = st.bookings.filter((b) => b.status !== 'expired' || q.status === 'expired');
      if (q.status) list = list.filter((b) => b.status === q.status);
      if (isDate(q.from)) list = list.filter((b) => b.start >= q.from);
      if (isDate(q.to)) list = list.filter((b) => b.start.slice(0, 10) <= q.to);
      if (q.q) { const t = String(q.q).toLowerCase(); list = list.filter((b) => `${b.code} ${b.name} ${b.email} ${b.phone} ${b.service_name}`.toLowerCase().includes(t)); }
      return ok({ bookings: list.sort((a, b) => (q.order === 'asc' ? a.start.localeCompare(b.start) : b.start.localeCompare(a.start))).slice(0, 400).map(adminBooking) });
    }
    if (method === 'POST' && !A[1]) {
      const s = st.services.find((x) => x.id === Number(body.service_id));
      if (!s) fail(422, 'Elegí un servicio.');
      if (clean(body.name).length < 2) fail(422, 'Escribí el nombre.');
      if (!isDate(body.date) || !isTime(body.time)) fail(422, 'Elegí el día y la hora.');
      if (!body.force && !slotsFor(st, env, s, body.date, { staff: true }).includes(body.time)) fail(409, 'Ese horario está ocupado o fuera del horario de atención. Si igual querés cargarlo, marcá "Cargar igual".', { taken: true });
      const b = {
        id: ++st.ids.booking, code: `T-${++st.ids.bookingNumber}`, token: token(), service_id: s.id, service_name: s.name + (s.tag && s.category === 'manicuria' ? ` · ${s.tag}` : ''), resource: s.resource,
        start: `${body.date} ${body.time}`, duration: Number(body.duration) || Number(s.duration) || 60, price: Number(s.price) || 0, deposit: 0, deposit_due: 0, deposit_paid: Math.max(0, Number(body.deposit_paid) || 0), gift_id: null, gift_code: '', gift_applied: 0,
        name: clean(body.name, 80), email: clean(body.email, 120).toLowerCase(), phone: clean(body.phone, 40), notes: clean(body.notes, 500), status: 'confirmed', source: 'panel', created_at: iso(env),
        hold_until: iso(env), reminded: false, refund_pending: false, pay_url: null, payment_id: null, history: [{ at: iso(env), text: `Cargado en el panel por ${staff.name || staff.email}` }],
      };
      st.bookings.push(b);
      if (b.email && body.notify) await sendEmail(st, env, 'booking_confirmed', b.email, { booking: b, link: bookingLink(env, b) }, { booking_id: b.id });
      return ok({ booking: adminBooking(b) });
    }
    const b = st.bookings.find((x) => x.id === Number(A[1]));
    if (!b) fail(404, 'No encontramos ese turno.');
    if (method === 'GET') return ok({ booking: adminBooking(b), emails: st.emails.filter((m) => m.booking_id === b.id).map(({ html, ...m }) => m) });
    if (method === 'PATCH') {
      if (body.date || body.time) {
        const s = st.services.find((x) => x.id === b.service_id) || { ...b, days: [] };
        const date = body.date || b.start.slice(0, 10), time = body.time || b.start.slice(11);
        if (!body.force && !slotsFor(st, env, { ...s, duration: b.duration, resource: b.resource }, date, { ignoreId: b.id, staff: true }).includes(time)) fail(409, 'Ese horario está ocupado o fuera del horario de atención.', { taken: true });
        b.history.push({ at: iso(env), text: `Reprogramado de ${b.start} a ${date} ${time} por ${staff.name || staff.email}` });
        b.start = `${date} ${time}`; b.reminded = false;
        if (b.status === 'attention') b.status = 'confirmed';
        if (b.email && body.notify) await sendEmail(st, env, 'booking_confirmed', b.email, { booking: b, link: bookingLink(env, b) }, { booking_id: b.id });
      }
      if (body.status && body.status !== b.status) {
        if (!BOOKING_STATUS[body.status]) fail(422, 'Estado inválido.');
        if (body.status === 'cancelled') await cancelBooking(st, env, b, staff.name || staff.email);
        else { b.history.push({ at: iso(env), text: `${BOOKING_STATUS[b.status]} → ${BOOKING_STATUS[body.status]} (${staff.name || staff.email})` }); b.status = body.status; }
      }
      if (body.notes !== undefined) b.notes = clean(body.notes, 500);
      if (body.refund_pending !== undefined) { b.refund_pending = !!body.refund_pending; if (!b.refund_pending) b.history.push({ at: iso(env), text: `Seña resuelta (${staff.name || staff.email})` }); }
      if (body.deposit_paid !== undefined) b.deposit_paid = Math.max(0, Number(body.deposit_paid) || 0);
      return ok({ booking: adminBooking(b) });
    }
  }
  if (A[0] === 'clients' && method === 'GET') return ok({ clients: clients(st, q.q) });

  if (A[0] === 'services') {
    if (method === 'GET') return ok({ services: [...st.services].sort((a, b) => a.position - b.position), categories: st.settings.categories, resources: st.settings.resources });
    if (method === 'POST' && !A[1]) {
      const s = serviceInput(st, { mode: 'online', duration: 60, visible: true, category: st.settings.categories[0].key, resource: st.settings.resources[0].key, ...body }, { includes: [], days: [], tag: '', short: '', image: '', whatsapp: '', featured: false });
      s.id = ++st.ids.service; s.position = st.services.length; s.slug = slugify(s.name) + (st.services.some((x) => x.slug === slugify(s.name)) ? '-' + s.id : '');
      st.services.push(s);
      return ok({ service: s });
    }
    const i = st.services.findIndex((x) => x.id === Number(A[1]));
    if (i < 0) fail(404, 'No encontramos ese servicio.');
    if (method === 'PATCH') { st.services[i] = serviceInput(st, body, st.services[i]); return ok({ service: st.services[i] }); }
    if (method === 'DELETE') {
      if (st.bookings.some((b) => b.service_id === st.services[i].id && ['confirmed', 'pending_payment'].includes(b.status))) fail(409, 'Tiene turnos por delante. Ocultalo en vez de borrarlo.');
      st.services.splice(i, 1); return ok({ ok: true });
    }
  }

  if (A[0] === 'blocks') {
    if (method === 'GET') { const today = dayKey(localNow(env)); return ok({ blocks: st.blocks.filter((k) => k.date >= today).sort((a, b) => (a.date + a.from).localeCompare(b.date + b.from)), resources: st.settings.resources }); }
    if (method === 'POST') {
      if (!isDate(body.date)) fail(422, 'Elegí el día.');
      const to = body.to_date && isDate(body.to_date) ? body.to_date : body.date;
      if (to < body.date || addDays(body.date, 92) < to) fail(422, 'Revisá el rango de días (máximo 3 meses).');
      if ((body.from && !isTime(body.from)) || (body.to && !isTime(body.to)) || (body.from && body.to && body.from >= body.to)) fail(422, 'Revisá el horario.');
      const res = body.resource === 'all' || st.settings.resources.some((r) => r.key === body.resource) ? body.resource : 'all';
      const made = [];
      for (let d = body.date; d <= to; d = addDays(d, 1)) { const k = { id: ++st.ids.block, date: d, from: body.from || '', to: body.to || '', resource: res, reason: clean(body.reason, 120) }; st.blocks.push(k); made.push(k); }
      return ok({ blocks: made });
    }
    if (method === 'DELETE') { const i = st.blocks.findIndex((k) => k.id === Number(A[1])); if (i >= 0) st.blocks.splice(i, 1); return ok({ ok: true }); }
  }

  if (A[0] === 'giftcards') {
    if (method === 'GET' && !A[1]) {
      let list = [...st.giftcards];
      if (q.status) list = list.filter((g) => g.status === q.status);
      if (q.q) { const t = String(q.q).toLowerCase(); list = list.filter((g) => `${g.code} ${g.buyer_name} ${g.buyer_email} ${g.to_name} ${g.to_email}`.toLowerCase().includes(t)); }
      return ok({ giftcards: list.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 400).map((g) => ({ ...g, status_label: GIFT_STATUS[g.status] })) });
    }
    if (method === 'POST' && !A[1]) return ok(await createGift(st, env, body, { staff }));
    const g = st.giftcards.find((x) => x.id === Number(A[1]));
    if (!g) fail(404, 'No encontramos esa gift card.');
    if (method === 'POST' && A[2] === 'redeem') {
      const amount = Math.round(Number(body.amount) || 0);
      if (g.status !== 'active') fail(409, 'La gift card no está activa.');
      if (!(amount > 0) || amount > g.balance) fail(422, `El monto tiene que ser entre $ 1 y ${fmtMoney(g.balance)}.`);
      g.balance -= amount; if (g.balance <= 0) g.status = 'used';
      g.history.push({ at: iso(env), amount: -amount, note: clean(body.note, 120) || `Usada en el local (${staff.name || staff.email})` });
      return ok({ gift: { ...g, status_label: GIFT_STATUS[g.status] } });
    }
    if (method === 'PATCH') {
      if (body.status && GIFT_STATUS[body.status]) { g.history.push({ at: iso(env), amount: 0, note: `${GIFT_STATUS[g.status]} → ${GIFT_STATUS[body.status]} (${staff.name || staff.email})` }); g.status = body.status; }
      if (body.expires_at && isDate(body.expires_at)) g.expires_at = body.expires_at + 'T23:59:00.000Z';
      return ok({ gift: { ...g, status_label: GIFT_STATUS[g.status] } });
    }
    if (method === 'POST' && A[2] === 'resend') { await giftEmails(st, env, g); return ok({ ok: true }); }
  }

  if (A[0] === 'events') {
    if (method === 'GET') return ok({ events: [...st.events].sort((a, b) => b.date.localeCompare(a.date)) });
    const input = (e) => {
      const ev = { ...e };
      for (const k of ['title', 'description', 'image', 'from', 'to']) if (body[k] !== undefined) ev[k] = clean(body[k], k === 'description' ? 1200 : 200);
      if (body.date !== undefined) ev.date = body.date;
      if (body.price !== undefined) ev.price = body.price === '' || body.price === null ? null : Math.max(0, Math.round(Number(body.price) || 0));
      if (body.active !== undefined) ev.active = !!body.active;
      if (!ev.title) fail(422, 'Ponele un título.');
      if (!isDate(ev.date)) fail(422, 'Elegí la fecha.');
      return ev;
    };
    if (method === 'POST') { const ev = input({ id: ++st.ids.event, active: true, from: '', to: '', price: null, description: '', image: '' }); st.events.push(ev); return ok({ event: ev }); }
    const i = st.events.findIndex((x) => x.id === Number(A[1]));
    if (i < 0) fail(404, 'No encontramos ese evento.');
    if (method === 'PATCH') { st.events[i] = input(st.events[i]); return ok({ event: st.events[i] }); }
    if (method === 'DELETE') { st.events.splice(i, 1); return ok({ ok: true }); }
  }

  if (A[0] === 'settings') {
    if (method === 'GET') return ok({ settings: st.settings, roles: ROLES });
    if (method === 'PUT' && A[1]) {
      needAdmin(staff);
      const key = A[1];
      const S = st.settings;
      if (key === 'site') { for (const k of Object.keys(SITE)) if (body[k] !== undefined) S.site[k] = clean(body[k], 300); }
      else if (key === 'booking') {
        const n = (k, min, max) => { if (body[k] !== undefined) S.booking[k] = Math.max(min, Math.min(max, Math.round(Number(body[k]) || 0))); };
        n('depositPercent', 0, 100); n('minNoticeHours', 0, 168); n('maxDaysAhead', 1, 365); n('slotStep', 5, 120); n('holdMinutes', 10, 240); n('cancelHours', 0, 168); n('reminderHours', 0, 72);
        if (body.staffEmails !== undefined) S.booking.staffEmails = clean(body.staffEmails, 300);
      } else if (key === 'hours') {
        const h = {};
        for (let d = 0; d < 7; d++) {
          const list = (body[d] || []).filter((w) => isTime(w.from) && isTime(w.to));
          if (list.some((w) => w.from >= w.to)) fail(422, 'Revisá los horarios: la hora de cierre tiene que ser después de la de apertura.');
          h[d] = list.map((w) => ({ from: w.from, to: w.to }));
        }
        S.hours = h;
      } else if (key === 'giftcards') {
        if (body.enabled !== undefined) S.giftcards.enabled = !!body.enabled;
        if (body.amounts !== undefined) S.giftcards.amounts = (body.amounts || []).map((x) => Math.round(Number(x) || 0)).filter((x) => x > 0).slice(0, 8);
        if (body.min !== undefined) S.giftcards.min = Math.max(0, Math.round(Number(body.min) || 0));
        if (body.validityDays !== undefined) S.giftcards.validityDays = Math.max(7, Math.min(730, Math.round(Number(body.validityDays) || 180)));
      } else if (key === 'resources') {
        const list = (body.resources || []).map((r) => ({ key: slugify(r.key || r.name), name: clean(r.name, 60), capacity: Math.max(1, Math.min(20, Math.round(Number(r.capacity) || 1))) })).filter((r) => r.name);
        if (!list.length) fail(422, 'Tiene que haber al menos un espacio.');
        S.resources = list;
      } else if (key === 'content') {
        if (body.faq !== undefined) S.content.faq = (body.faq || []).map((x) => ({ q: clean(x.q, 200), a: clean(x.a, 1500) })).filter((x) => x.q && x.a);
        if (body.terms !== undefined) S.content.terms = String(body.terms).slice(0, 20000);
        if (body.categories !== undefined) for (const c of body.categories) { const t = S.categories.find((x) => x.key === c.key); if (t) { t.title = clean(c.title, 80) || t.title; t.intro = clean(c.intro, 400); } }
      } else fail(404, 'No existe esa configuración.');
      return ok({ settings: S });
    }
  }

  if (A[0] === 'emails' && method === 'GET') {
    if (A[1]) { const m = st.emails.find((x) => x.id === Number(A[1])); if (!m) fail(404, 'No encontramos ese email.'); return ok({ email: m }); }
    return ok({ emails: [...st.emails].reverse().slice(0, 200).map(({ html, ...m }) => m), templates: Object.fromEntries(Object.entries(TEMPLATES).map(([k, t]) => [k, { label: t.label, to: t.to }])) });
  }
  if (A[0] === 'withdrawals') {
    if (method === 'GET') return ok({ withdrawals: [...st.withdrawals].reverse() });
    if (method === 'PATCH') { const w = st.withdrawals.find((x) => x.id === Number(A[1])); if (!w) fail(404, 'No encontrado.'); if (body.status) w.status = clean(body.status, 20); return ok({ withdrawal: w }); }
  }
  if (A[0] === 'users') {
    needAdmin(staff);
    if (method === 'GET') return ok({ users: st.staff.map(staffView), roles: ROLES });
    if (method === 'POST') {
      const email = String(body.email || '').toLowerCase().trim();
      if (!isEmail(email)) fail(422, 'Revisá el email.');
      if (String(body.password || '').length < 10) fail(422, 'La contraseña necesita al menos 10 caracteres.');
      if (!ROLES[body.role]) fail(422, 'Elegí un rol.');
      if (st.staff.some((u) => u.email === email)) fail(409, 'Ya hay un usuario con ese email.');
      const u = { id: ++st.ids.staff, email, name: clean(body.name, 80), role: body.role, password_hash: await env.hashPassword(String(body.password)), created_at: iso(env) };
      st.staff.push(u);
      return ok({ user: staffView(u) });
    }
    if (method === 'DELETE') {
      const i = st.staff.findIndex((u) => u.id === Number(A[1]));
      if (i < 0) fail(404, 'No encontrado.');
      if (st.staff[i].id === staff.id) fail(409, 'No podés borrar tu propio usuario.');
      if (st.staff[i].role === 'admin' && st.staff.filter((u) => u.role === 'admin').length === 1) fail(409, 'Tiene que quedar al menos un usuario de administración.');
      st.staff.splice(i, 1);
      return ok({ ok: true });
    }
  }
  fail(404, 'No existe esa ruta.');
}

/** Crea un usuario del panel (para el primer arranque o el script create-admin). */
export async function addStaff(st, env, { email, password, name = '', role = 'admin' }) {
  const u = { id: ++st.ids.staff, email: String(email).toLowerCase().trim(), name, role, password_hash: await env.hashPassword(String(password)), created_at: iso(env) };
  st.staff.push(u);
  return u;
}
