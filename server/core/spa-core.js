// Lógica de Casa Samadhi: servicios, disponibilidad, turnos con seña, gift cards, eventos y panel.
// Es código puro sobre un objeto de estado: lo usa el servidor (que lo guarda en SQLite) y la vista previa
// (que lo guarda en el navegador). Lo que toca el mundo exterior (Mercado Pago, emails, contraseñas)
// llega por `env`:
//   env.now() → ms · env.publicUrl · env.mock
//   env.createPayment({ kind, token, title, amount, email }) → Promise<url>
//   env.sendEmail({ template, to, subject, html }) → Promise
//   env.hashPassword(pw) / env.checkPassword(pw, hash)
import { CATEGORIES, RESOURCES, SERVICES, SITE, HOURS, BOOKING, PAYMENTS, GIFTCARDS, FAQ, TERMS, PROS, WEBMASTER } from './defaults.js';
import { renderEmail, TEMPLATES, GROUPS, VARS, sampleContext, longDate } from './emails.js';

export const STATE_VERSION = 1;
export const EMAIL_DEFAULTS = { enabled: {}, custom: {}, pendingMinutes: 15, thanksHours: 20, giftExpiringDays: 30, dailyHour: 20, reviewUrl: '' };
/** Completa ajustes que faltan en estados guardados con versiones anteriores. */
function ensure(st) {
  st.settings.emails = { ...structuredClone(EMAIL_DEFAULTS), ...(st.settings.emails || {}) };
  for (const k of Object.keys(TEMPLATES)) if (st.settings.emails.enabled[k] === undefined) st.settings.emails.enabled[k] = true;
  st.meta = st.meta || { lastDaily: '' };
  st.customers = st.customers || [];
  st.resets = st.resets || [];
  st.crm = st.crm || {};
  st.ids.customer = st.ids.customer || 0;
  st.audit = st.audit || [];
  st.ids.audit = st.ids.audit || 0;
  st.cash = st.cash || { moves: [], closings: [] };
  st.ids.cash = st.ids.cash || 0;
  st.integrations = st.integrations || {};
  st.integrations.nifty = { enabled: false, url: '', secret: '', sent: 0, last_ok: '', last_error: '', fails: 0, retry_at: 0, ...(st.integrations.nifty || {}) };
  st.settings.pay = { ...structuredClone(PAYMENTS), ...(st.settings.pay || {}) };
  migrate(st);
}
/** Cambios de datos que se aplican una sola vez a estados ya guardados (no pisan lo que se edite después). */
const MIGRATIONS = {
  'wa-2026-11': (st) => {
    const site = st.settings.site;
    if (site.ritualsWhatsapp === undefined) site.ritualsWhatsapp = SITE.ritualsWhatsapp;
    if (digits(site.whatsapp) === digits(SITE.ritualsWhatsapp)) site.whatsapp = SITE.whatsapp;
    if (!site.eventsWhatsapp) site.eventsWhatsapp = SITE.eventsWhatsapp;
  },
  'sin-reiki-armonizacion-barras-2026-11': (st) => {
    const fuera = ['reiki', 'armonizacion', 'barras-de-access'];
    st.services = st.services.filter((s) => !fuera.includes(s.slug));
  },
  'alquiler-espacio-2026-11': (st) => {
    const cat = CATEGORIES.find((c) => c.key === 'espacio');
    if (!st.settings.categories.some((c) => c.key === 'espacio')) st.settings.categories.push(structuredClone(cat));
    if (st.services.some((s) => s.slug === 'alquiler-del-espacio')) return;
    const def = SERVICES.find((s) => s.slug === 'alquiler-del-espacio');
    st.ids.service = Math.max(st.ids.service || 0, ...st.services.map((s) => s.id));
    st.services.push({ id: ++st.ids.service, position: st.services.length, visible: true, featured: false, tag: '', short: '', includes: [], image: '', days: [], whatsapp: '', ...structuredClone(def) });
  },
  'faq-pagos-2026-11': (st) => {
    const faq = st.settings.content?.faq;
    if (!faq) return;
    const i = faq.findIndex((f) => f.q === '¿Cuánto es la seña y cómo se descuenta?');
    if (i < 0) return;
    const nuevas = FAQ.filter((f) => f.q === '¿Cuánto es la seña y cómo se paga?' || f.q === '¿Puedo reservar más de un servicio?');
    faq.splice(i, 1, ...nuevas);
  },
  'manicuria-carta-2026-11': (st) => {
    // Nueva carta de manicuría: actualiza los que siguen (mismo id), suma los nuevos y saca los que ya no están.
    const nuevos = SERVICES.filter((s) => s.category === 'manicuria');
    const antes = { 'soft-gel': ['soft-gel-sencillo'], 'retirado-de-esmalte': ['retirado-semi-capping'] };
    const viejos = st.services.filter((s) => s.category === 'manicuria');
    const conManicuria = prosAll(st).filter((p) => (p.services || []).some((id) => viejos.some((s) => s.id === id)));
    st.ids.service = Math.max(st.ids.service || 0, ...st.services.map((s) => s.id));
    const usados = new Set();
    nuevos.forEach((def) => {
      const prev = viejos.find((s) => !usados.has(s.id) && (s.slug === def.slug || (antes[def.slug] || []).includes(s.slug)));
      if (prev) {
        usados.add(prev.id);
        Object.assign(prev, { slug: def.slug, name: def.name, tag: def.tag || '', price: def.price, price_transfer: def.price_transfer ?? null, mode: def.mode, visible: true });
      } else {
        const s = { id: ++st.ids.service, position: 0, visible: true, featured: false, tag: '', short: '', includes: [], image: '', days: [], whatsapp: '', price_transfer: null, ...structuredClone(def) };
        st.services.push(s); usados.add(s.id);
      }
    });
    for (const p of conManicuria) p.services = [...new Set([...p.services, ...usados])];
    for (const s of viejos) {
      if (usados.has(s.id)) continue;
      if (st.bookings.some((b) => b.service_id === s.id && ACTIVE.includes(b.status))) s.visible = false; // tiene turnos por delante: se oculta
      else {
        st.services = st.services.filter((x) => x.id !== s.id);
        for (const p of prosAll(st)) if (p.services) p.services = p.services.filter((id) => id !== s.id);
      }
    }
    // Orden: la manicuría en el orden de la carta, en el lugar donde estaba.
    const base = Math.min(...viejos.map((s) => s.position));
    const mani = nuevos.map((d) => st.services.find((s) => s.slug === d.slug));
    const hidden = st.services.filter((s) => s.category === 'manicuria' && !mani.includes(s));
    const otros = st.services.filter((s) => s.category !== 'manicuria').sort((a, b) => a.position - b.position);
    const antesM = otros.filter((s) => s.position < base), despues = otros.filter((s) => s.position >= base);
    [...antesM, ...mani, ...hidden, ...despues].forEach((s, i) => (s.position = i));
  },
  'rituales-terraza-2026-11': (st) => {
    // Precios nuevos de los rituales, y la terraza como único espacio para alquilar (el salón de arriba es solo manicuría y pedicuría).
    for (const slug of ['ritual-esencial', 'ritual-profundo', 'alquiler-del-espacio']) {
      const s = st.services.find((x) => x.slug === slug), def = SERVICES.find((x) => x.slug === slug);
      if (!s) continue;
      for (const k of ['name', 'tag', 'price', 'duration', 'short', 'includes', 'image']) s[k] = structuredClone(def[k]);
    }
    for (const key of ['manicuria', 'espacio']) {
      const c = st.settings.categories.find((x) => x.key === key), def = CATEGORIES.find((x) => x.key === key);
      if (c) Object.assign(c, { name: def.name, title: def.title, intro: def.intro });
    }
    const G = st.settings.giftcards;
    if (G?.amounts) G.amounts = G.amounts.map((a) => ({ 55000: 60000, 80000: 90000 })[a] || a);
    const faq = st.settings.content?.faq, nueva = FAQ.find((f) => f.q === '¿Hacen eventos privados?');
    const i = faq ? faq.findIndex((f) => f.q === nueva.q) : -1;
    if (i >= 0) faq[i] = { ...nueva };
  },
  'rituales-placas-2026-11': (st) => {
    // Las explicaciones de cada paso de los rituales, tal como están en las placas.
    for (const slug of ['ritual-esencial', 'ritual-profundo']) {
      const s = st.services.find((x) => x.slug === slug), def = SERVICES.find((x) => x.slug === slug);
      if (s) s.includes = structuredClone(def.includes);
    }
  },
  'profesionales-2026-11': (st) => addDefaultPros(st, new Date().toISOString()),
  'webmaster-2026-11': (st) => addWebmaster(st, new Date().toISOString()),
  'comision-asesoras-2026-11': (st) => {
    // Trinidad y Belén cobran el 40% de comisión (si todavía no tenían una cargada).
    for (const p of PROS) {
      const u = st.staff.find((x) => x.role === 'pro' && x.name.trim().toLowerCase() === p.name.toLowerCase());
      if (u && !(Number(u.pay?.percent) > 0)) u.pay = { type: 'comision', base: 0, ...(u.pay || {}), percent: p.percent };
    }
  },
  'trabajos-2026-11': (st) => {
    // Trabajos de ejemplo (antes y después) para los servicios de manicuría que todavía no tienen.
    if (!st.settings.site.worksBefore) st.settings.site.worksBefore = SITE.worksBefore;
    for (const def of SERVICES.filter((x) => x.works)) {
      const s = st.services.find((x) => x.slug === def.slug);
      if (s && !s.works?.length) s.works = structuredClone(def.works);
    }
  },
  'un-whatsapp-2026-11': (st) => {
    // Un solo WhatsApp en toda la web: se dejan de usar el de head spa, el de eventos y los propios de cada servicio.
    Object.assign(st.settings.site, { ritualsWhatsapp: '', eventsWhatsapp: '' });
    for (const s of st.services) s.whatsapp = '';
  },
  'sin-tarot-2026-11': (st) => {
    // Tarot y oráculo deja de ofrecerse, y con él la sección Terapias (era su único servicio).
    const s = st.services.find((x) => x.slug === 'tarot-y-oraculo');
    if (s) {
      if (st.bookings.some((b) => b.service_id === s.id && ACTIVE.includes(b.status))) s.visible = false;
      else { st.services = st.services.filter((x) => x.id !== s.id); for (const p of prosAll(st)) if (p.services) p.services = p.services.filter((id) => id !== s.id); }
    }
    if (!st.services.some((x) => x.category === 'terapias')) st.settings.categories = st.settings.categories.filter((c) => c.key !== 'terapias');
    const site = st.settings.site;
    if (site.announcement === 'Head spa · Manicuría · Terapias · Cafetería — Calle 47 N° 679, La Plata') site.announcement = SITE.announcement;
  },
  'sin-masoterapia-2026-11': (st) => {
    // La masoterapia relajante deja de ofrecerse: se saca (o se oculta si tiene turnos por delante).
    const s = st.services.find((x) => x.slug === 'masoterapia-relajante');
    if (!s) return;
    if (st.bookings.some((b) => b.service_id === s.id && ACTIVE.includes(b.status))) { s.visible = false; return; }
    st.services = st.services.filter((x) => x.id !== s.id);
    for (const p of prosAll(st)) if (p.services) p.services = p.services.filter((id) => id !== s.id);
  },
  'avisos-equipo-2026-11': (st) => {
    // Los avisos al equipo (turno nuevo, transferencias, cancelaciones) van al correo de la casa, si todavía no hay uno cargado.
    if (!st.settings.booking.staffEmails && !st.settings.site.email) st.settings.booking.staffEmails = BOOKING.staffEmails;
  },
};
/** El usuario web master (sin contraseña hasta que la defina). */
function addWebmaster(st, at) {
  if (st.staff.some((u) => u.email === WEBMASTER.email)) return;
  st.ids.staff = Math.max(st.ids.staff || 0, ...st.staff.map((u) => u.id || 0));
  st.staff.push({ id: ++st.ids.staff, email: WEBMASTER.email, name: WEBMASTER.name, role: 'webmaster', password_hash: null, created_at: at });
}
/** Suma a las asesoras de la casa (Trinidad y Belén) con los servicios de su sección, si todavía no están. */
function addDefaultPros(st, at) {
  st.ids.staff = Math.max(st.ids.staff || 0, ...st.staff.map((u) => u.id || 0));
  for (const p of PROS) {
    const ids = st.services.filter((s) => p.categories.includes(s.category) && s.mode !== 'menu').map((s) => s.id);
    const prev = st.staff.find((u) => u.role === 'pro' && u.name.trim().toLowerCase() === p.name.toLowerCase());
    if (prev) { prev.services = [...new Set([...(prev.services || []), ...ids])]; prev.specialty = prev.specialty || p.specialty; continue; }
    // Sin email ni contraseña: atiende turnos; el acceso al panel y la comisión se cargan en Panel → Asesoras.
    st.staff.push({ id: ++st.ids.staff, email: '', name: p.name, role: 'pro', password_hash: null, created_at: at, active: true, specialty: p.specialty, services: ids, pay: { type: 'comision', percent: p.percent || 0, base: 0 } });
  }
}
function migrate(st) {
  st.meta.migrations = st.meta.migrations || [];
  for (const [k, fn] of Object.entries(MIGRATIONS)) if (!st.meta.migrations.includes(k)) { fn(st); st.meta.migrations.push(k); }
}
/** WhatsApp de un servicio: hay un solo número para toda la casa (el del botón de WhatsApp). */
export function serviceWhatsapp(st) {
  return st.settings.site.whatsapp;
}
export const COLLECTIONS = ['settings', 'services', 'bookings', 'giftcards', 'blocks', 'events', 'withdrawals', 'emails', 'staff', 'payments', 'ids', 'meta', 'customers', 'resets', 'crm', 'audit', 'cash', 'integrations'];
export const ROLES = { webmaster: 'Web master', admin: 'Administración', staff: 'Recepción', pro: 'Asesora de belleza' };
/** Administración y web master tienen los mismos permisos en el panel. */
export const isAdminRole = (u) => u?.role === 'admin' || u?.role === 'webmaster';
export const BOOKING_STATUS = { pending_payment: 'Esperando seña', pending_transfer: 'Esperando transferencia', confirmed: 'Confirmado', completed: 'Realizado', cancelled: 'Cancelado', no_show: 'No vino', expired: 'Seña vencida', attention: 'Revisar' };
export const PAY_METHODS = { mp: 'Mercado Pago', transfer: 'Transferencia', local: 'En la casa', gift: 'Gift card', none: 'Sin seña' };
export const PAY_TYPES = { comision: 'Solo comisión', basico_comision: 'Básico + comisión' };
const ACTIVE = ['confirmed', 'pending_payment', 'pending_transfer', 'attention'];
const PENDING = ['pending_payment', 'pending_transfer'];
export const GIFT_STATUS = { pending_payment: 'Esperando pago', active: 'Activa', used: 'Usada', expired: 'Vencida', cancelled: 'Anulada' };

// ── Estado inicial ───────────────────────────────────────
export function seedState() {
  const st = {
    v: STATE_VERSION,
    settings: {
      site: { ...SITE }, booking: { ...BOOKING }, pay: structuredClone(PAYMENTS), hours: structuredClone(HOURS), giftcards: structuredClone(GIFTCARDS),
      resources: structuredClone(RESOURCES), categories: structuredClone(CATEGORIES), content: { faq: structuredClone(FAQ), terms: TERMS }, emails: structuredClone(EMAIL_DEFAULTS),
    },
    meta: { lastDaily: '', migrations: Object.keys(MIGRATIONS) }, customers: [], resets: [], crm: {}, audit: [], cash: { moves: [], closings: [] }, integrations: {},
    services: [], bookings: [], giftcards: [], blocks: [], events: [], withdrawals: [], emails: [], staff: [], payments: [],
    ids: { service: 0, booking: 0, gift: 0, block: 0, event: 0, withdrawal: 0, email: 0, staff: 0, payment: 0, audit: 0, bookingNumber: 1000 },
  };
  SERVICES.forEach((s, i) => st.services.push({ id: ++st.ids.service, position: i, visible: true, featured: false, tag: '', short: '', includes: [], image: '', days: [], whatsapp: '', price_transfer: null, works: [], ...structuredClone(s) }));
  addDefaultPros(st, new Date(0).toISOString());
  addWebmaster(st, new Date(0).toISOString());
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
const blocking = (b, nowMs) => b.status === 'confirmed' || b.status === 'attention' || (PENDING.includes(b.status) && Date.parse(b.hold_until) > nowMs);
function capacityOf(st, resource) { return Math.max(1, Number(st.settings.resources.find((r) => r.key === resource)?.capacity) || 1); }

// ── Asesoras ────────────────────────────────────────
// Son usuarios del panel con rol 'pro'. Si un servicio tiene asesoras asignados, solo se puede
// reservar cuando al menos uno de ellos está libre; el turno queda a nombre de esa persona.
export const prosAll = (st) => st.staff.filter((u) => u.role === 'pro');
export const prosFor = (st, service) => prosAll(st).filter((u) => u.active !== false && (u.services || []).includes(service.id));
const proName = (st, id) => st.staff.find((u) => u.id === id)?.name || '';
function proFree(st, nowMs, proId, date, startMin, dur, ignoreId = null) {
  return !st.bookings.some((b) => b.pro_id === proId && b.id !== ignoreId && b.start.startsWith(date) && blocking(b, nowMs)
    && startMin < toMin(b.start.slice(11)) + b.duration && toMin(b.start.slice(11)) < startMin + dur);
}
// ── Horario de cada asesora ──────────────────────────────
// Cada asesora sigue el horario de la casa (schedule = null) o tiene el suyo: { 0..6: [{ from, to }] }.
// Sus días libres son bloqueos con pro_id. La casa siempre es el límite: fuera del horario de la casa no hay turnos.
const proWeek = (st, p) => (p.schedule ? p.schedule : st.settings.hours);
function proWorks(st, p, date, startMin, dur) {
  const wins = proWeek(st, p)[weekday(date)] || [];
  if (!wins.some((w) => toMin(w.from) <= startMin && startMin + dur <= toMin(w.to))) return false;
  return !st.blocks.some((k) => k.pro_id === p.id && k.date === date && (!k.from || (startMin < (k.to ? toMin(k.to) : 24 * 60) && toMin(k.from) < startMin + dur)));
}
/** Valida una semana de horarios: hasta 3 franjas por día, de HH:MM a HH:MM. */
function weekInput(body) {
  const out = {};
  for (let d = 0; d <= 6; d++) {
    const list = Array.isArray(body?.[d]) ? body[d] : [];
    out[d] = list.filter((w) => w && w.from && w.to).slice(0, 3).map((w) => {
      if (!isTime(w.from) || !isTime(w.to) || w.from >= w.to) fail(422, `Revisá el horario del ${DAY_NAMES[d]}.`);
      return { from: w.from, to: w.to };
    }).sort((a, b) => a.from.localeCompare(b.from));
  }
  return out;
}
const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
/** Lo que ve y edita cada asesora (y administración desde su ficha). */
function scheduleView(st, env, p) {
  const today = dayKey(localNow(env));
  return { pro: { id: p.id, name: p.name }, follows: !p.schedule, week: proWeek(st, p), house: st.settings.hours,
    timeoff: st.blocks.filter((k) => k.pro_id === p.id && k.date >= today).sort((a, b) => (a.date + a.from).localeCompare(b.date + b.from)) };
}
/** Turnos que la asesora tiene en días u horarios en los que ya no va a estar. */
function scheduleConflicts(st, env, p) {
  const nowKey = msToLocal(env.now());
  return st.bookings.filter((b) => b.pro_id === p.id && ACTIVE.includes(b.status) && b.start >= nowKey && !proWorks(st, p, b.start.slice(0, 10), toMin(b.start.slice(11)), b.duration))
    .sort((a, b) => a.start.localeCompare(b.start)).map((b) => ({ id: b.id, code: b.code, start: b.start, name: b.name, service_name: b.service_name }));
}
async function scheduleRoute(st, env, method, sub, body, p, staff) {
  const who = staff.name || staff.email, own = staff.id === p.id ? 'su' : `el de ${p.name}`;
  if (method === 'GET' && !sub[0]) return { ...scheduleView(st, env, p), conflicts: scheduleConflicts(st, env, p) };
  if (method === 'PUT' && !sub[0]) {
    p.schedule = body.follows ? null : weekInput(body.week);
    audit(st, env, staff, `Cambió ${own} horario: ${p.schedule ? Object.entries(p.schedule).filter(([, w]) => w.length).map(([d, w]) => `${DAY_NAMES[d].slice(0, 3)} ${w.map((x) => `${x.from}-${x.to}`).join(' y ')}`).join(' · ') || 'sin días' : 'igual que la casa'}`);
    return { ...scheduleView(st, env, p), conflicts: scheduleConflicts(st, env, p) };
  }
  if (method === 'POST' && sub[0] === 'timeoff') {
    if (!isDate(body.date)) fail(422, 'Elegí el día.');
    const to = body.to_date && isDate(body.to_date) ? body.to_date : body.date;
    if (to < body.date || addDays(body.date, 120) < to) fail(422, 'Revisá el rango de días (máximo 4 meses).');
    if ((body.from && !isTime(body.from)) || (body.to && !isTime(body.to)) || (body.from && body.to && body.from >= body.to)) fail(422, 'Revisá el horario.');
    if (body.date < dayKey(localNow(env))) fail(422, 'Elegí un día de hoy en adelante.');
    for (let d = body.date; d <= to; d = addDays(d, 1)) st.blocks.push({ id: ++st.ids.block, date: d, from: body.from || '', to: body.to || '', resource: 'pro', pro_id: p.id, reason: clean(body.reason, 120) });
    audit(st, env, staff, `${staff.id === p.id ? 'Marcó' : `Marcó para ${p.name}`} ${body.from ? `ausencia el ${body.date} de ${body.from} a ${body.to || 'cierre'}` : `día${to !== body.date ? 's' : ''} libre${to !== body.date ? 's' : ''} ${body.date}${to !== body.date ? ` a ${to}` : ''}`}${body.reason ? ` (${clean(body.reason, 120)})` : ''}`);
    return { ...scheduleView(st, env, p), conflicts: scheduleConflicts(st, env, p) };
  }
  if (method === 'DELETE' && sub[0] === 'timeoff' && sub[1]) {
    const ids = String(sub[1]).split(',').map(Number);
    const gone = st.blocks.filter((k) => ids.includes(k.id) && k.pro_id === p.id);
    if (!gone.length) fail(404, 'No encontramos ese día libre.');
    st.blocks = st.blocks.filter((k) => !gone.includes(k));
    audit(st, env, staff, `Quitó ${gone.length === 1 ? 'el día libre' : 'los días libres'} ${gone[0].date}${gone.length > 1 ? ` a ${gone.at(-1).date}` : ''}${staff.id === p.id ? '' : ` de ${p.name}`}`);
    return { ...scheduleView(st, env, p), conflicts: scheduleConflicts(st, env, p) };
  }
  fail(404, 'No existe esa ruta.');
}
/** Elige quién atiende: la asesora pedida si está libre, o la que tenga menos turnos ese día. */
function pickPro(st, env, service, date, time, { pro = null, ignoreId = null } = {}) {
  const pros = prosFor(st, service);
  if (!pros.length) return null;
  const nowMs = env.now(), t = toMin(time), dur = Math.max(5, Number(service.duration) || 60);
  const free = pros.filter((p) => (!pro || p.id === Number(pro)) && proWorks(st, p, date, t, dur) && proFree(st, nowMs, p.id, date, t, dur, ignoreId));
  const load = (p) => st.bookings.filter((b) => b.pro_id === p.id && b.start.startsWith(date) && blocking(b, nowMs)).length;
  return free.sort((a, b) => load(a) - load(b))[0] || null;
}

/** Horarios libres de un servicio para un día. `ignoreId`: turno que se está reprogramando. `pro`: con quién. */
export function slotsFor(st, env, service, date, { ignoreId = null, staff = false, pro = null } = {}) {
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
  const blocks = st.blocks.filter((k) => !k.pro_id && k.date === date && (k.resource === 'all' || k.resource === service.resource))
    .map((k) => [k.from ? toMin(k.from) : 0, k.to ? toMin(k.to) : 24 * 60]);
  const minStart = nowMs + (staff ? 0 : Number(B.minNoticeHours) || 0) * 3600e3;
  const pros = service.id ? prosFor(st, service) : [];
  const cands = pros.length ? (pro ? pros.filter((p) => p.id === Number(pro)) : pros) : null;
  if (cands && !cands.length) return [];
  const out = [];
  for (const w of windows) {
    for (let t = toMin(w.from); t + dur <= toMin(w.to); t += step) {
      const s = `${date} ${toHHMM(t)}`;
      if (localToMs(s) < minStart) continue;
      const overlaps = (r) => t < r[1] && r[0] < t + dur;
      if (blocks.some(overlaps)) continue;
      if (taken.filter(overlaps).length >= cap) continue;
      if (cands && !cands.some((p) => proWorks(st, p, date, t, dur) && proFree(st, nowMs, p.id, date, t, dur, ignoreId))) continue;
      out.push(toHHMM(t));
    }
  }
  return out;
}

export function availability(st, env, serviceId, from, days = 14, pro = null, ignoreToken = '') {
  const own = ignoreToken ? st.bookings.find((b) => b.token === String(ignoreToken)) : null;
  const s = st.services.find((x) => x.id === Number(serviceId) && x.visible && x.mode === 'online');
  if (!s) fail(404, 'Ese servicio no se reserva online. Escribinos por WhatsApp.');
  const today = dayKey(localNow(env));
  const start = isDate(from) && from > today ? from : today;
  const n = Math.min(62, Math.max(1, Number(days) || 14));
  const out = [];
  for (let i = 0; i < n; i++) { const d = addDays(start, i); out.push({ date: d, slots: slotsFor(st, env, s, d, { pro: Number(pro) || own?.pro_id || null, ignoreId: own?.id || null }) }); }
  return { service_id: s.id, days: out, maxDate: addDays(today, st.settings.booking.maxDaysAhead) };
}

// ── Vistas públicas ──────────────────────────────────────
const MAX_WORKS_PUBLIC = 8; // la web muestra hasta 8 (el celular, hasta 4)
export const MAX_WORKS = 24;
const publicService = (st, s) => ({ id: s.id, slug: s.slug, category: s.category, name: s.name, tag: s.tag, short: s.short, includes: s.includes, duration: s.duration, price: s.price, price_transfer: s.price_transfer ?? null, mode: s.mode, image: s.image,
  works: (s.works || []).slice(0, MAX_WORKS_PUBLIC).map((w) => ({ id: w.id, after: w.after, before: w.before || '' })), featured: !!s.featured,
  pros: prosFor(st, s).map((p) => ({ id: p.id, name: p.name })) });
const transferOn = (P) => !!(P.transferEnabled && (P.alias || P.cbu));
const mpOn = (P) => P.mpEnabled !== false;
export function publicSite(st, env) {
  const S = st.settings;
  const today = dayKey(localNow(env));
  return {
    site: S.site,
    categories: S.categories,
    services: st.services.filter((s) => s.visible).sort((a, b) => a.position - b.position).map((s) => publicService(st, s)),
    hours: S.hours,
    booking: { depositPercent: S.booking.depositPercent, cancelHours: S.booking.cancelHours, maxDaysAhead: S.booking.maxDaysAhead, holdMinutes: S.booking.holdMinutes,
      pay: { mp: mpOn(S.pay) || !transferOn(S.pay), transfer: transferOn(S.pay), transferHoldHours: S.pay.transferHoldHours } },
    giftcards: S.giftcards,
    events: st.events.filter((e) => e.active && e.date >= today).sort((a, b) => (a.date + a.from).localeCompare(b.date + b.from)),
    faq: S.content.faq,
    terms: S.content.terms,
    mock: !!env.mock,
  };
}
/** Los turnos que se reservaron juntos (varios servicios en una misma reserva). */
export const groupOf = (st, b) => (b.group ? st.bookings.filter((x) => x.group === b.group) : [b]).sort((a, c) => a.start.localeCompare(c.start) || a.id - c.id);
const sum = (list, k) => list.reduce((a, x) => a + (Number(x[k]) || 0), 0);
/** Una reserva vista como un todo: suma precios y señas y lista cada servicio. Es lo que ven la clienta y los emails. */
function groupView(st, b) {
  const list = groupOf(st, b);
  const act = list.find((x) => ACTIVE.includes(x.status)) || list.find((x) => x.status === 'completed') || list[0];
  return {
    ...act, id: list[0].id, code: list[0].code, token: list[0].token, start: list[0].start, service_id: list[0].service_id,
    service_name: list.map((x) => x.service_name).join(' + '),
    duration: sum(list, 'duration'), price: sum(list, 'price'), deposit: sum(list, 'deposit'), deposit_due: sum(list, 'deposit_due'), deposit_paid: sum(list, 'deposit_paid'), gift_applied: sum(list, 'gift_applied'),
    pro_name: [...new Set(list.map((x) => x.pro_name).filter(Boolean))].join(' y '),
    items: list.map((x) => ({ id: x.id, code: x.code, service_name: x.service_name, start: x.start, duration: x.duration, price: x.price, pro_name: x.pro_name || '', status: x.status, status_label: BOOKING_STATUS[x.status] })),
  };
}
function payInfo(st) {
  const P = st.settings.pay;
  return { alias: P.alias, cbu: P.cbu, holder: P.holder, bank: P.bank, cuit: P.cuit };
}
function publicBooking(st, env, b) {
  const g = groupView(st, b);
  return {
    code: g.code, token: g.token, status: g.status, status_label: BOOKING_STATUS[g.status], service_name: g.service_name, start: g.start, when: longDate(g.start), duration: g.duration,
    price: g.price, deposit: g.deposit, deposit_due: g.deposit_due, deposit_paid: g.deposit_paid, gift_applied: g.gift_applied, name: g.name, email: g.email, pro_name: g.pro_name,
    items: g.items.map(({ id, ...it }) => ({ ...it, when: longDate(it.start) })),
    whatsapp: serviceWhatsapp(st, st.services.find((s) => s.id === g.service_id)),
    pay_method: g.pay_method || '', pay_method_label: PAY_METHODS[g.pay_method] || '',
    transfer: g.status === 'pending_transfer' ? { ...payInfo(st), amount: g.deposit_due, notified: !!g.transfer_notified, has_proof: !!b.transfer_proof, can_mp: mpOn(st.settings.pay) } : null,
    hold_until: g.hold_until, pay_url: g.status === 'pending_payment' ? g.pay_url : null,
    can_cancel: ACTIVE.includes(g.status) && g.status !== 'attention' && localToMs(g.start) - env.now() > st.settings.booking.cancelHours * 3600e3,
    // Cambiar de día u horario: un solo servicio, confirmado y con la anticipación de la política de cancelación.
    can_reschedule: g.status === 'confirmed' && g.items.length === 1 && localToMs(g.start) - env.now() > st.settings.booking.cancelHours * 3600e3,
    service_id: g.service_id,
    calendar: ['confirmed', 'pending_transfer', 'attention'].includes(g.status) ? calendarLinks(st, env, b) : null,
  };
}
function publicGift(g) {
  return { token: g.token, status: g.status, status_label: GIFT_STATUS[g.status], amount: g.amount, balance: g.balance, service_name: g.service_name, buyer_name: g.buyer_name, to_name: g.to_name, message: g.message,
    code: g.status === 'pending_payment' ? null : g.code, expires_at: g.expires_at, pay_url: g.status === 'pending_payment' ? g.pay_url : null };
}

// ── Emails ───────────────────────────────────────────────
async function sendEmail(st, env, template, to, ctx, ref = {}) {
  if (!to) return;
  ensure(st);
  const E = st.settings.emails;
  if (E.enabled[template] === false && !ref.test) return;
  const svc = ctx.booking && st.services.find((s) => s.id === ctx.booking.service_id);
  const site = svc ? { ...st.settings.site, whatsapp: serviceWhatsapp(st, svc) } : st.settings.site;
  if (ctx.booking?.token && !ctx.cal) ctx = { ...ctx, cal: calendarLinks(st, env, ctx.booking) };
  let { subject, html } = renderEmail(template, { site, cancelHours: st.settings.booking.cancelHours, home: env.publicUrl + '/', reviewUrl: E.reviewUrl, pay: payInfo(st), ...ctx }, E.custom[template] || {});
  if (ref.test) subject = '[Prueba] ' + subject;
  const id = ++st.ids.email;
  const row = { id, at: iso(env), template, to, subject, html, status: 'enviando', ...ref };
  st.emails.push(row);
  if (st.emails.length > 600) st.emails.splice(0, st.emails.length - 600);
  try { const r = await env.sendEmail({ template, to, subject, html }); row.status = r === 'sin-smtp' ? 'sin configurar' : 'enviado'; } catch (e) { row.status = 'error'; row.error = String(e.message || e).slice(0, 200); }
}
export const staffTo = (st) => st.settings.booking.staffEmails || st.settings.site.email || '';
const bookingLink = (env, b) => `${env.publicUrl}/turnos#turno/${b.token}`;
// ── Agregar al calendario ────────────────────────────────
const calStamp = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
/** Links para agendar el turno: Google Calendar y un archivo .ics (Apple, Outlook y el resto). */
export function calendarLinks(st, env, b) {
  const g = groupView(st, b), site = st.settings.site;
  const from = localToMs(g.start), to = from + (Number(g.duration) || 60) * 60e3;
  const title = `${g.service_name} · Casa Samadhi`;
  const details = `Código ${g.code}${g.pro_name ? ` · Te atiende ${g.pro_name}` : ''}. Ver, cambiar o cancelar: ${bookingLink(env, b)}`;
  const where = `Casa Samadhi, ${site.address}, ${site.city}`;
  const google = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${calStamp(from)}/${calStamp(to)}&details=${encodeURIComponent(details)}&location=${encodeURIComponent(where)}&ctz=America/Argentina/Buenos_Aires`;
  return { google, ics: `${env.publicUrl}/api/bookings/${b.token}/calendar.ics` };
}
/** El turno como evento de calendario (.ics), con un aviso 2 horas antes. */
export function bookingIcs(st, env, b) {
  const g = groupView(st, b), site = st.settings.site;
  const from = localToMs(g.start), to = from + (Number(g.duration) || 60) * 60e3;
  const t = (s) => String(s || '').replace(/[\\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Casa Samadhi//Turnos//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    `UID:${g.code}-${b.token.slice(0, 8)}@casasamadhi`, `DTSTAMP:${calStamp(env.now())}`, `DTSTART:${calStamp(from)}`, `DTEND:${calStamp(to)}`,
    `SUMMARY:${t(`${g.service_name} · Casa Samadhi`)}`, `LOCATION:${t(`Casa Samadhi, ${site.address}, ${site.city}`)}`,
    `DESCRIPTION:${t(`Código ${g.code}${g.pro_name ? ` · Te atiende ${g.pro_name}` : ''}. Ver, cambiar o cancelar: ${bookingLink(env, b)}`)}`,
    'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', `DESCRIPTION:${t(`Turno en Casa Samadhi: ${g.service_name}`)}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR'].join('\r\n') + '\r\n';
}
const giftLink = (env, g) => `${env.publicUrl}/#gift/${g.token}`;
/** Email a la clienta sobre la reserva completa (una sola vez aunque tenga varios servicios). */
const mailClient = (st, env, template, b, extra = {}) => { const g = groupView(st, b); return sendEmail(st, env, template, g.email, { booking: g, link: bookingLink(env, g), ...extra }, { booking_id: g.id }); };
const mailTeam = (st, env, template, b, extra = {}) => { const g = groupView(st, b); return sendEmail(st, env, template, staffTo(st), { booking: g, ...extra }, { booking_id: g.id }); };
/** Aviso a cada asesora por sus turnos de la reserva. */
async function mailPros(st, env, template, list) {
  for (const x of list) {
    const p = x.pro_id && st.staff.find((u) => u.id === x.pro_id);
    if (p?.email && p.active !== false) await sendEmail(st, env, template, p.email, { booking: x, pro: { name: p.name }, commission: commissionOf(st, x) }, { booking_id: x.id });
  }
}

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
const svcLabel = (s) => s.name + (s.tag && s.category === 'manicuria' ? ` · ${s.tag}` : '');

/**
 * Reserva desde la web. Acepta uno o varios servicios (`items`, hasta 4) que se pagan con una sola seña,
 * por Mercado Pago (`pay_method: 'mp'`) o por transferencia (`'transfer'`).
 */
async function createBooking(st, env, body, customer = null) {
  const raw = Array.isArray(body.items) && body.items.length ? body.items : [{ service_id: body.service_id, date: body.date, time: body.time, pro_id: body.pro_id }];
  if (raw.length > 4) fail(422, 'Podés reservar hasta 4 servicios juntos.');
  const items = raw.map((it) => {
    const s = st.services.find((x) => x.id === Number(it?.service_id) && x.visible);
    if (!s) fail(404, 'Elegí un servicio.');
    if (s.mode !== 'online') fail(422, `${s.name} se coordina por WhatsApp.`);
    if (!isDate(it.date) || !isTime(it.time)) fail(422, 'Elegí el día y el horario.');
    return { s, date: it.date, time: it.time, pro: Number(it.pro_id) || null };
  });
  const e = {
    name: clean(body.name).length < 3 ? 'Escribí tu nombre y apellido.' : '',
    email: !isEmail(body.email) ? 'Revisá el email: ahí te llega la confirmación.' : '',
    phone: digits(body.phone).length < 8 ? 'Dejanos un teléfono con WhatsApp.' : '',
    accept: !body.accept ? 'Para reservar tenés que aceptar las condiciones.' : '',
  };
  errs(e);
  // Una misma persona no puede estar en dos servicios a la vez.
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i], c = items[j];
    if (a.date === c.date && toMin(a.time) < toMin(c.time) + c.s.duration && toMin(c.time) < toMin(a.time) + a.s.duration) fail(409, `${a.s.name} y ${c.s.name} se superponen. Elegí otro horario para uno de los dos.`, { taken: true });
  }
  const P = st.settings.pay, pct = Number(st.settings.booking.depositPercent) || 0;
  let gift = null, giftLeft = 0;
  const total = items.reduce((a, it) => a + (Number(it.s.price) || 0), 0);
  if (clean(body.gift_code)) { gift = findGift(st, env, body.gift_code); giftLeft = Math.min(gift.balance, total); }
  const giftTotal = giftLeft;
  const group = items.length > 1 ? `G-${randomCode(8)}` : null;
  const made = [];
  try {
    for (const it of items) {
      if (!slotsFor(st, env, it.s, it.date, { pro: it.pro }).includes(it.time)) fail(409, items.length > 1 ? `El horario de ${it.s.name} se acaba de ocupar. Elegí otro, por favor.` : 'Ese horario se acaba de ocupar. Elegí otro, por favor.', { taken: true });
      const pro = pickPro(st, env, it.s, it.date, it.time, { pro: it.pro });
      const price = Number(it.s.price) || 0;
      const deposit = price ? roundTo100(price * pct / 100) : 0;
      const giftApplied = Math.min(giftLeft, price); giftLeft -= giftApplied;
      const b = {
        id: ++st.ids.booking, code: `T-${++st.ids.bookingNumber}`, token: token(), group, service_id: it.s.id, service_name: svcLabel(it.s), resource: it.s.resource,
        pro_id: pro?.id || null, pro_name: pro?.name || '',
        start: `${it.date} ${it.time}`, duration: Number(it.s.duration) || 60, price, deposit, deposit_due: Math.max(0, deposit - giftApplied), deposit_paid: 0, gift_id: giftApplied ? gift.id : null, gift_code: giftApplied ? gift.code : '', gift_applied: giftApplied,
        name: clean(body.name, 80), email: clean(body.email, 120).toLowerCase(), phone: clean(body.phone, 40), notes: clean(body.notes, 500),
        status: 'confirmed', source: 'web', created_at: iso(env), customer_id: customer?.id || null, pay_method: 'none',
        hold_until: iso(env), reminded: false, refund_pending: false, pay_url: null, payment_id: null, history: [],
      };
      b.attr = originInput(body.origen); // de dónde vino la clienta (para el embudo de Nifty y las campañas)
      st.bookings.push(b); made.push(b);
    }
  } catch (err) {
    for (const b of made) st.bookings.splice(st.bookings.indexOf(b), 1);
    throw err;
  }
  if (gift && giftTotal) { gift.balance -= giftTotal; if (gift.balance <= 0) gift.status = 'used'; gift.history.push({ at: iso(env), amount: -giftTotal, note: `Turno ${made[0].code}` }); }
  const due = sum(made, 'deposit_due');
  const lead = made[0];
  if (due > 0) {
    const method = body.pay_method === 'transfer' && transferOn(P) ? 'transfer' : mpOn(P) || !transferOn(P) ? 'mp' : 'transfer';
    let holdUntil = env.now() + (Number(st.settings.booking.holdMinutes) || 30) * 60e3;
    if (method === 'transfer') {
      // La transferencia tiene que llegar antes del turno: se guarda hasta X horas o hasta 1 hora antes, lo que pase primero.
      holdUntil = Math.min(env.now() + (Number(P.transferHoldHours) || 12) * 3600e3, localToMs(lead.start) - 3600e3);
      if (holdUntil < env.now() + 30 * 60e3) {
        for (const b of made) { refundGift(st, b); st.bookings.splice(st.bookings.indexOf(b), 1); }
        if (gift && giftTotal) { gift.balance += giftTotal; if (gift.status === 'used') gift.status = 'active'; gift.history.pop(); }
        fail(422, mpOn(P) ? 'El turno es muy pronto para esperar una transferencia: pagá la seña con Mercado Pago.' : 'El turno es muy pronto para esperar una transferencia: elegí un horario más adelante o escribinos por WhatsApp.', { errors: { pay_method: 'Muy pronto para transferir' } });
      }
    }
    for (const b of made) Object.assign(b, { status: method === 'transfer' ? 'pending_transfer' : 'pending_payment', pay_method: method, hold_until: new Date(holdUntil).toISOString() });
    if (method === 'mp') {
      const url = await env.createPayment({ kind: 'booking', token: lead.token, title: `Seña · ${made.map((b) => b.service_name).join(' + ')} · ${longDate(lead.start)}`, amount: due, email: lead.email, ref: lead.code });
      for (const b of made) b.pay_url = url;
    } else {
      for (const b of made) b.history.push({ at: iso(env), text: `Reservado: seña de ${fmtMoney(due)} por transferencia, a verificar` });
      await mailClient(st, env, 'booking_transfer', lead, { holdUntil: longDate(msToLocal(Date.parse(lead.hold_until))) });
      await mailTeam(st, env, 'staff_transfer', lead);
    }
  } else {
    for (const b of made) { b.pay_method = giftTotal ? 'gift' : 'none'; b.history.push({ at: iso(env), text: giftTotal ? 'Confirmado con gift card' : 'Confirmado sin seña' }); }
    await confirmEmails(st, env, lead);
  }
  return { booking: publicBooking(st, env, lead), pay_url: lead.pay_url };
}
/** Confirmación: email a la clienta, al equipo (si no lo confirmó el equipo mismo) y a cada asesora. */
async function confirmEmails(st, env, b, { byStaff = false } = {}) {
  const list = groupOf(st, b).filter((x) => x.status === 'confirmed');
  await mailClient(st, env, 'booking_confirmed', b);
  if (!byStaff) await mailTeam(st, env, 'booking_staff', b);
  await mailPros(st, env, 'pro_booking', list);
}
/** Cancela un turno o, con `whole`, toda la reserva. */
async function cancelBooking(st, env, b, by, { whole = false, reason = '', notify = true, message = '' } = {}) {
  const list = (whole ? groupOf(st, b) : [b]).filter((x) => ACTIVE.includes(x.status));
  if (!list.length) fail(409, 'Ese turno ya no está activo.');
  for (const x of list) {
    x.status = 'cancelled';
    x.refund_pending = x.deposit_paid > 0;
    refundGift(st, x);
    x.history.push({ at: iso(env), text: `Cancelado por ${by}${reason ? `: ${reason}` : ''}` });
  }
  const g = list.length > 1 ? groupView(st, list[0]) : { ...list[0], items: null };
  if (notify && g.email) await sendEmail(st, env, 'booking_cancelled', g.email, { booking: g, message }, { booking_id: list[0].id });
  if (by === 'la clienta') await sendEmail(st, env, 'staff_cancelled', staffTo(st), { booking: g }, { booking_id: list[0].id });
  await mailPros(st, env, 'pro_cancelled', list);
  return list;
}
/** La administración confirma que llegó la transferencia (o que no llegó). */
async function settleTransfer(st, env, b, staff, ok, amount = null) {
  const list = groupOf(st, b).filter((x) => x.status === 'pending_transfer' || (x.status === 'expired' && x.pay_method === 'transfer'));
  if (!list.length) fail(409, 'Esta reserva no está esperando una transferencia.');
  const who = staff.name || staff.email;
  if (!ok) {
    for (const x of list) x.status = 'confirmed'; // para poder cancelarlos con el flujo normal
    await cancelBooking(st, env, list[0], who, { whole: true, reason: 'no se recibió la transferencia' });
    return;
  }
  const due = sum(list, 'deposit_due');
  const got = amount === null || amount === '' ? due : Math.max(0, Math.round(Number(amount) || 0));
  for (const x of list) {
    const free = x.status === 'pending_transfer' || slotsFor(st, env, { ...(st.services.find((s) => s.id === x.service_id) || x), duration: x.duration, resource: x.resource, days: [] }, x.start.slice(0, 10), { ignoreId: x.id, staff: true, pro: x.pro_id }).includes(x.start.slice(11));
    x.deposit_paid = due ? Math.round(got * (x.deposit_due / due)) : 0; x.deposit_at = iso(env);
    x.status = free ? 'confirmed' : 'attention';
    x.history.push({ at: iso(env), text: free ? `Transferencia recibida (${fmtMoney(x.deposit_paid)}), confirmada por ${who}` : `Transferencia recibida fuera de término y el horario ya estaba ocupado (${who}): reprogramar o devolver` });
  }
  if (list.every((x) => x.status === 'confirmed')) await confirmEmails(st, env, list[0], { byStaff: true });
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
    const list = groupOf(st, b);
    if (b.payment_id && b.payment_id === payment_id) return { ok: true, booking: publicBooking(st, env, b) };
    if (status !== 'approved') { for (const x of list) x.history.push({ at: iso(env), text: `Pago ${status}` }); return { ok: true, booking: publicBooking(st, env, b) }; }
    const open = list.filter((x) => PENDING.includes(x.status) || x.status === 'expired');
    if (open.length) {
      const due = sum(open, 'deposit_due'), got = Number(amount) || due;
      for (const x of open) {
        x.payment_id = payment_id || null; x.pay_method = 'mp';
        x.deposit_paid = due ? Math.round(got * (x.deposit_due / due)) : 0; x.deposit_at = iso(env);
        if (x.status === 'expired') {
          // Pagó después de que venció la reserva: si el horario sigue libre lo confirmamos; si no, queda para revisar.
          const s = st.services.find((y) => y.id === x.service_id);
          const free = s && slotsFor(st, env, { ...s, duration: x.duration, resource: x.resource }, x.start.slice(0, 10), { ignoreId: x.id, staff: true, pro: x.pro_id }).includes(x.start.slice(11));
          x.status = free ? 'confirmed' : 'attention';
          x.history.push({ at: iso(env), text: free ? 'Seña acreditada fuera de término; el horario seguía libre.' : 'Seña acreditada fuera de término y el horario ya estaba ocupado: hay que reprogramar o devolver.' });
        } else { x.status = 'confirmed'; x.history.push({ at: iso(env), text: `Seña acreditada por Mercado Pago (${fmtMoney(x.deposit_paid)})` }); }
      }
      if (open.some((x) => x.status === 'attention')) await mailTeam(st, env, 'staff_attention', b);
      else await confirmEmails(st, env, b);
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
      await sendEmail(st, env, 'staff_giftcard', staffTo(st), { gift: g }, { gift_id: g.id });
    }
    return { ok: true, gift: publicGift(g) };
  }
  return { ok: false };
}

// ── Tareas periódicas (cada minuto) ──────────────────────
export async function tick(st, env) {
  ensure(st);
  const now = env.now();
  const E = st.settings.emails;
  let changed = false;
  const lead = (b) => !b.group || groupOf(st, b)[0].id === b.id;
  for (const b of st.bookings) {
    if (b.status === 'pending_payment' && !b.pending_mailed && Date.parse(b.hold_until) > now && now - Date.parse(b.created_at) > E.pendingMinutes * 60e3) {
      for (const x of groupOf(st, b)) x.pending_mailed = true;
      changed = true;
      await mailClient(st, env, 'booking_pending', b, { holdUntil: msToLocal(Date.parse(b.hold_until)).slice(11) });
    }
    if (PENDING.includes(b.status) && Date.parse(b.hold_until) < now) {
      const list = groupOf(st, b).filter((x) => PENDING.includes(x.status));
      for (const x of list) { x.status = 'expired'; refundGift(st, x); x.history.push({ at: iso(env), text: x.pay_method === 'transfer' ? 'Venció el plazo para recibir la transferencia' : 'Venció el tiempo para pagar la seña' }); }
      changed = true;
      await mailClient(st, env, 'booking_expired', b);
    }
    const startMs = localToMs(b.start);
    if (b.status === 'confirmed' && !b.reminded && startMs > now && startMs - now < st.settings.booking.reminderHours * 3600e3 && now - Date.parse(b.created_at) > 6 * 3600e3) {
      b.reminded = true; changed = true;
      if (lead(b)) { for (const x of groupOf(st, b)) x.reminded = true; await mailClient(st, env, 'booking_reminder', b); }
    }
    if (b.status === 'confirmed' && startMs + b.duration * 60e3 + 12 * 3600e3 < now) { complete(st, b); changed = true; }
    if (b.status === 'completed' && !b.thanked && b.email && startMs + b.duration * 60e3 + E.thanksHours * 3600e3 < now && now - startMs < 7 * 864e5) {
      b.thanked = true; changed = true;
      if (lead(b)) { for (const x of groupOf(st, b)) x.thanked = true; await mailClient(st, env, 'booking_thanks', b); }
    }
  }
  for (const g of st.giftcards) {
    if (g.status === 'active' && g.expires_at && Date.parse(g.expires_at) < now) { g.status = 'expired'; changed = true; }
    if (g.status === 'pending_payment' && Date.parse(g.created_at) < now - 3 * 864e5) { g.status = 'cancelled'; changed = true; }
    if (g.status === 'active' && !g.expiring_mailed && g.balance > 0 && g.buyer_email && g.expires_at && Date.parse(g.expires_at) - now < E.giftExpiringDays * 864e5) {
      g.expiring_mailed = true; changed = true;
      await sendEmail(st, env, 'giftcard_expiring', g.buyer_email, { gift: g, link: giftLink(env, g) }, { gift_id: g.id });
    }
  }
  // Agenda de mañana para el equipo, una vez por día a la hora elegida.
  const ln = localNow(env), today = dayKey(ln);
  if (ln.getUTCHours() >= E.dailyHour && st.meta.lastDaily !== today && staffTo(st)) {
    st.meta.lastDaily = today; changed = true;
    const day = addDays(today, 1);
    const list = st.bookings.filter((b) => b.start.startsWith(day) && ['confirmed', 'attention'].includes(b.status)).sort((a, b) => a.start.localeCompare(b.start));
    await sendEmail(st, env, 'staff_daily', staffTo(st), { day, list });
  }
  return changed;
}

// ── Comisiones ───────────────────────────────────────────
const payOf = (p) => ({ type: 'comision', percent: 0, base: 0, ...(p?.pay || {}) });
/** Porcentaje que cobra la asesora por un turno: el que tenía al realizarse, o el actual si todavía no se hizo. */
const percentOf = (st, b) => (b.commission_percent ?? payOf(st.staff.find((u) => u.id === b.pro_id)).percent) || 0;
export const commissionOf = (st, b) => (b.pro_id ? Math.round((Number(b.price) || 0) * percentOf(st, b) / 100) : 0);
/** Marca un turno como realizado y deja fija la comisión de ese momento. */
function complete(st, b) {
  b.status = 'completed';
  if (b.pro_id && b.commission_percent == null) b.commission_percent = payOf(st.staff.find((u) => u.id === b.pro_id)).percent || 0;
}
/** Liquidación de una asesora en un mes ('AAAA-MM'): lo realizado, lo que viene y el total a cobrar. */
export function commissionReport(st, env, proId, month) {
  const p = st.staff.find((u) => u.id === proId && u.role === 'pro');
  if (!p) fail(404, 'No encontramos a esa asesora.');
  const m = /^\d{4}-\d{2}$/.test(month || '') ? month : dayKey(localNow(env)).slice(0, 7);
  const pay = payOf(p);
  const rows = st.bookings.filter((b) => b.pro_id === p.id && b.start.slice(0, 7) === m && b.status !== 'expired').sort((a, b) => a.start.localeCompare(b.start))
    .map((b) => {
      const counts = b.status === 'completed' ? 'earned' : ACTIVE.includes(b.status) ? 'upcoming' : 'none';
      return { id: b.id, code: b.code, start: b.start, service_name: b.service_name, client: b.name, price: b.price, status: b.status, status_label: BOOKING_STATUS[b.status], percent: percentOf(st, b), commission: counts === 'none' ? 0 : commissionOf(st, b), counts };
    });
  const earned = rows.filter((r) => r.counts === 'earned').reduce((a, r) => a + r.commission, 0);
  const upcoming = rows.filter((r) => r.counts === 'upcoming').reduce((a, r) => a + r.commission, 0);
  const base = pay.type === 'basico_comision' ? Number(pay.base) || 0 : 0;
  return { month: m, pro: { id: p.id, name: p.name }, pay: { ...pay, label: PAY_TYPES[pay.type] }, rows, done: rows.filter((r) => r.counts === 'earned').length, next: rows.filter((r) => r.counts === 'upcoming').length,
    sales: rows.filter((r) => r.counts === 'earned').reduce((a, r) => a + r.price, 0), earned, upcoming, base, total: base + earned, projected: base + earned + upcoming };
}

// ── Historial de cambios ─────────────────────────────────
/** Deja registrado quién hizo qué en el panel. */
function audit(st, env, staff, action, ref = {}) {
  st.audit = st.audit || [];
  st.ids.audit = (st.ids.audit || 0) + 1;
  st.audit.push({ id: st.ids.audit, at: iso(env), user_id: staff?.id || null, user: staff?.name || staff?.email || 'Sistema', role: staff?.role || '', action: clean(action, 400), ...ref });
  if (st.audit.length > 5000) st.audit.splice(0, st.audit.length - 5000);
}
const auditView = (a) => ({ ...a, role_label: ROLES[a.role] || '' });

// ── Panel: helpers ───────────────────────────────────────
const needAdmin = (staff) => { if (!isAdminRole(staff)) fail(403, 'Esta sección es solo para administración.'); };
const staffView = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, role_label: ROLES[u.role], created_at: u.created_at, has_password: !!u.password_hash });
const PRO_FIELDS = ['phone', 'dni', 'cuit', 'birthday', 'address', 'alias', 'specialty', 'notes'];
const proView = (st, u) => ({ id: u.id, name: u.name, email: u.email || '', role: u.role, active: u.active !== false, has_access: !!u.password_hash, created_at: u.created_at,
  ...Object.fromEntries(PRO_FIELDS.map((k) => [k, u[k] || ''])), services: u.services || [], pay: { ...payOf(u), label: PAY_TYPES[payOf(u).type] },
  service_names: (u.services || []).map((id) => st.services.find((s) => s.id === id)?.name).filter(Boolean), color: u.color || '', keep: proKeep(st, u) });
/** Lo que impide borrar a una asesora: turnos por venir y turnos realizados (con comisión). */
const proKeep = (st, p) => ({ active: st.bookings.filter((b) => b.pro_id === p.id && ACTIVE.includes(b.status)).length, done: st.bookings.filter((b) => b.pro_id === p.id && ['completed', 'no_show'].includes(b.status)).length });
async function proInput(st, env, body, prev = null) {
  const u = prev ? { ...prev } : { role: 'pro', active: true, services: [], pay: { type: 'comision', percent: 40, base: 0 } };
  if (body.name !== undefined) u.name = clean(body.name, 80);
  if (!u.name || u.name.length < 2) fail(422, 'Escribí el nombre de la asesora.');
  for (const k of PRO_FIELDS) if (body[k] !== undefined) u[k] = clean(body[k], k === 'notes' ? 1000 : 160);
  if (body.email !== undefined) {
    const email = String(body.email || '').toLowerCase().trim();
    if (email && !isEmail(email)) fail(422, 'Revisá el email.');
    if (email && st.staff.some((x) => x.email === email && x.id !== u.id)) fail(409, 'Ya hay un usuario con ese email.');
    u.email = email;
  }
  if (body.services !== undefined) u.services = [...new Set((body.services || []).map(Number).filter((id) => st.services.some((s) => s.id === id)))];
  if (body.pay !== undefined) {
    const type = PAY_TYPES[body.pay?.type] ? body.pay.type : 'comision';
    const percent = Math.max(0, Math.min(100, Number(body.pay?.percent) || 0));
    const base = type === 'basico_comision' ? Math.max(0, Math.round(Number(body.pay?.base) || 0)) : 0;
    if (type === 'basico_comision' && !base) fail(422, 'Escribí el básico mensual.');
    u.pay = { type, percent, base };
  }
  if (body.active !== undefined) u.active = !!body.active;
  if (body.password) {
    if (String(body.password).length < 10) fail(422, 'La contraseña necesita al menos 10 caracteres.');
    if (!u.email) fail(422, 'Para darle acceso al panel necesita un email.');
    u.password_hash = await env.hashPassword(String(body.password));
  }
  if (body.remove_access) u.password_hash = null;
  return u;
}
function serviceInput(st, body, prev = {}) {
  const s = { ...prev };
  for (const k of ['name', 'tag', 'short', 'image']) if (body[k] !== undefined) s[k] = clean(body[k], k === 'short' ? 600 : 200);
  if (body.category !== undefined) { if (!st.settings.categories.some((c) => c.key === body.category)) fail(422, 'Elegí una sección.'); s.category = body.category; }
  if (body.resource !== undefined) { if (!st.settings.resources.some((r) => r.key === body.resource)) fail(422, 'Elegí dónde se hace.'); s.resource = body.resource; }
  if (body.mode !== undefined) { if (!['online', 'whatsapp', 'menu'].includes(body.mode)) fail(422, 'Modo inválido.'); s.mode = body.mode; }
  if (body.duration !== undefined) s.duration = Math.max(0, Math.min(480, Math.round(Number(body.duration) || 0)));
  if (body.price !== undefined) s.price = body.price === '' || body.price === null ? null : Math.max(0, Math.round(Number(body.price) || 0));
  if (body.price_transfer !== undefined) s.price_transfer = body.price_transfer === '' || body.price_transfer === null ? null : Math.max(0, Math.round(Number(body.price_transfer) || 0)) || null;
  if (body.includes !== undefined) s.includes = (Array.isArray(body.includes) ? body.includes : String(body.includes).split('\n')).map((x) => clean(x, 240)).filter(Boolean).slice(0, 12);
  if (body.days !== undefined) s.days = (body.days || []).map(Number).filter((d) => d >= 0 && d <= 6);
  for (const k of ['visible', 'featured']) if (body[k] !== undefined) s[k] = !!body[k];
  if (body.position !== undefined) s.position = Number(body.position) || 0;
  if (!s.name) fail(422, 'Ponele un nombre al servicio.');
  if (s.mode === 'online' && !(s.duration > 0)) fail(422, 'Para reservar online el servicio necesita una duración.');
  if (s.mode === 'online' && !s.price) fail(422, 'Para reservar online con seña el servicio necesita un precio. Si no tiene precio fijo, elegí "Por WhatsApp".');
  return s;
}
const adminBooking = (b) => ({ ...b, status_label: BOOKING_STATUS[b.status], pay_method_label: PAY_METHODS[b.pay_method] || '' });
const adminBookingFull = (st, b) => ({ ...adminBooking(b), commission: commissionOf(st, b), commission_percent_now: percentOf(st, b), collected: (st.cash?.moves || []).filter((m) => m.booking_id === b.id && m.type === 'in').reduce((a, m) => a + m.amount, 0) });
/** Lo que ve una asesora de un turno suyo: sin email ni datos de pago de la clienta. */
const proBooking = (st, b) => ({ id: b.id, code: b.code, start: b.start, duration: b.duration, service_name: b.service_name, resource: b.resource, status: b.status, status_label: BOOKING_STATUS[b.status],
  name: b.name, phone: b.phone, notes: b.notes, price: b.price, commission: commissionOf(st, b), percent: percentOf(st, b), history: b.history, pro_id: b.pro_id, pro_name: b.pro_name });

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
    transfers: st.bookings.filter((b) => b.status === 'pending_transfer' && (!b.group || groupOf(st, b)[0].id === b.id)).map((b) => { const g = groupView(st, b); return { ...adminBooking(b), service_name: g.service_name, deposit_due: g.deposit_due }; }),
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
// ── Clientas (CRM) ───────────────────────────────────────
// Cada clienta se identifica por su email (o por su celular si reservó sin email).
const clientKey = (b) => (b.email ? String(b.email).toLowerCase() : 'tel:' + digits(b.phone));
const CRM_TAGS = ['VIP', 'Frecuente', 'Nueva', 'Cumpleaños', 'Regalo', 'Sensible', 'Embarazada', 'No contactar'];
function clientRows(st, env) {
  const map = new Map();
  const nowKey = msToLocal(env.now());
  for (const b of [...st.bookings].sort((a, b) => a.start.localeCompare(b.start))) {
    if (b.status === 'expired') continue;
    const k = clientKey(b);
    if (k === 'tel:') continue;
    const c = map.get(k) || { key: k, email: b.email || '', name: b.name, phone: b.phone, visits: 0, upcoming: 0, cancelled: 0, noShows: 0, spent: 0, services: {}, first: '', last: '', lastService: '', next: '', nextService: '', bookings: 0 };
    c.name = b.name || c.name; c.phone = b.phone || c.phone; c.bookings++;
    if (b.status === 'completed') { c.visits++; c.spent += b.price; if (!c.first) c.first = b.start; c.last = b.start; c.lastService = b.service_name; }
    if (b.status === 'cancelled') c.cancelled++;
    if (b.status === 'no_show') c.noShows++;
    if (ACTIVE.includes(b.status) && b.start >= nowKey.slice(0, 10)) { c.upcoming++; if (!c.next) { c.next = b.start; c.nextService = b.service_name; } }
    c.services[b.service_name] = (c.services[b.service_name] || 0) + 1;
    map.set(k, c);
  }
  // Clientas cargadas a mano o con cuenta en la web, aunque todavía no tengan turnos.
  const blank = (k, m) => ({ key: k, email: m.email || '', name: m.name || '', phone: m.phone || '', visits: 0, upcoming: 0, cancelled: 0, noShows: 0, spent: 0, services: {}, first: '', last: '', lastService: '', next: '', nextService: '', bookings: 0 });
  for (const [k, m] of Object.entries(st.crm)) if (m.manual && !map.has(k)) map.set(k, blank(k, m));
  for (const cu of st.customers) { const k = String(cu.email || '').toLowerCase(); if (k && !map.has(k)) map.set(k, blank(k, cu)); }
  return [...map.values()].map((c) => {
    const crm = st.crm[c.key] || {};
    const acc = st.customers.find((x) => x.email === (crm.email || c.email));
    // Lo que se edita en la ficha (o carga la clienta en su cuenta) manda sobre lo que vino en los turnos.
    return { ...c, name: crm.name || c.name || acc?.name || '', phone: crm.phone || c.phone || acc?.phone || '', email: crm.email || c.email,
      top: Object.entries(c.services).sort((a, b) => b[1] - a[1])[0]?.[0] || '', account: !!acc, tags: crm.tags || [],
      birthday: crm.birthday || acc?.birthday || '', address: crm.address || acc?.address || '', photos: (crm.photos || []).length, hasNotes: !!crm.notes, manual: !!crm.manual };
  });
}
function clients(st, env, q = {}) {
  let list = clientRows(st, env);
  if (q.q) { const t = String(q.q).toLowerCase(); list = list.filter((c) => (c.name + ' ' + c.email + ' ' + c.phone + ' ' + c.address + ' ' + c.tags.join(' ')).toLowerCase().includes(t)); }
  if (q.tag) list = list.filter((c) => c.tags.includes(q.tag));
  const nowKey = msToLocal(env.now()).slice(0, 10);
  if (q.segment === 'inactive') list = list.filter((c) => c.last && !c.next && c.last.slice(0, 10) < addDays(nowKey, -60));
  if (q.segment === 'birthday') { const m = nowKey.slice(5, 7); list = list.filter((c) => c.birthday && c.birthday.slice(5, 7) === m); }
  if (q.segment === 'new') list = list.filter((c) => c.visits <= 1);
  if (q.segment === 'loyal') list = list.filter((c) => c.visits >= 3);
  const sorts = { last: (a, b) => (b.last || b.next).localeCompare(a.last || a.next), spent: (a, b) => b.spent - a.spent, visits: (a, b) => b.visits - a.visits, name: (a, b) => a.name.localeCompare(b.name) };
  list.sort(sorts[q.sort] || sorts.last);
  const all = clientRows(st, env);
  return { clients: list.slice(0, 500), total: all.length, tags: CRM_TAGS,
    summary: { total: all.length, withAccount: all.filter((c) => c.account).length, returning: all.filter((c) => c.visits >= 2).length, inactive: all.filter((c) => c.last && !c.next && c.last.slice(0, 10) < addDays(nowKey, -60)).length, spent: all.reduce((a, c) => a + c.spent, 0) } };
}
function clientDetail(st, env, key) {
  const k = String(key || '').toLowerCase();
  const row = clientRows(st, env).find((c) => c.key === k);
  if (!row) fail(404, 'No encontramos esa clienta.');
  const list = st.bookings.filter((b) => clientKey(b) === k && b.status !== 'expired').sort((a, b) => b.start.localeCompare(a.start));
  const done = list.filter((b) => b.status === 'completed').map((b) => b.start.slice(0, 10)).sort();
  const gaps = done.slice(1).map((d, i) => (Date.parse(d) - Date.parse(done[i])) / 864e5);
  const acc = st.customers.find((x) => x.email === row.email);
  const gifts = st.giftcards.filter((g) => g.status !== 'pending_payment' && row.email && (g.buyer_email === row.email || g.to_email === row.email));
  const crm = st.crm[k] || {};
  return {
    client: { ...row, account_since: acc?.created_at || '', avgTicket: row.visits ? Math.round(row.spent / row.visits) : 0, everyDays: gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : 0 },
    crm: { notes: crm.notes || '', preferences: crm.preferences || '', birthday: row.birthday, address: row.address, name: row.name, phone: row.phone, email: row.email, tags: crm.tags || [], photos: crm.photos || [], updated_at: crm.updated_at || '', updated_by: crm.updated_by || '' },
    services: Object.entries(row.services).sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n })),
    bookings: list.map(adminBooking),
    giftcards: gifts.map((g) => ({ id: g.id, code: g.code, amount: g.amount, balance: g.balance, status: g.status, status_label: GIFT_STATUS[g.status], service_name: g.service_name, role: g.to_email === row.email ? 'Recibida' : 'Comprada', created_at: g.created_at })),
    tags: CRM_TAGS,
  };
}
function saveClient(st, env, key, body, staff) {
  const k = String(key || '').toLowerCase();
  if (!clientRows(st, env).some((c) => c.key === k)) fail(404, 'No encontramos esa clienta.');
  const cur = st.crm[k] || {};
  const bd = String(body.birthday || '').slice(0, 10);
  const u = { ...cur };
  if (body.name !== undefined) { if (clean(body.name).length < 3) fail(422, 'Escribí el nombre y apellido.'); u.name = clean(body.name, 80); }
  if (body.phone !== undefined) { if (body.phone && digits(body.phone).length < 8) fail(422, 'Revisá el celular.'); u.phone = clean(body.phone, 40); }
  if (body.email !== undefined) { if (body.email && !isEmail(body.email)) fail(422, 'Revisá el correo.'); u.email = clean(body.email, 120).toLowerCase(); }
  if (body.address !== undefined) u.address = clean(body.address, 160);
  if (body.notes !== undefined) u.notes = clean(body.notes, 2000);
  if (body.preferences !== undefined) u.preferences = clean(body.preferences, 500);
  if (body.birthday !== undefined) u.birthday = /^\d{4}-\d{2}-\d{2}$/.test(bd) ? bd : '';
  if (Array.isArray(body.tags)) u.tags = [...new Set(body.tags.map((t) => clean(t, 30)).filter(Boolean))].slice(0, 12);
  st.crm[k] = { notes: '', preferences: '', birthday: '', tags: [], ...u, updated_at: iso(env), updated_by: staff?.name || staff?.email || '' };
  return clientDetail(st, env, k);
}
/** Alta de una clienta desde el panel (por ejemplo, alguien que reservó por teléfono o vino sin turno). */
function createClient(st, env, body, staff) {
  const email = clean(body.email, 120).toLowerCase(), phone = clean(body.phone, 40);
  const e = { name: clean(body.name).length < 3 ? 'Escribí el nombre y apellido.' : '', email: email && !isEmail(email) ? 'Revisá el correo.' : '', phone: !email && digits(phone).length < 8 ? 'Dejá un celular o un correo.' : '' };
  errs(e);
  const k = email || 'tel:' + digits(phone);
  if (clientRows(st, env).some((c) => c.key === k)) fail(409, 'Ya hay una clienta con ese correo o celular.', { key: k });
  st.crm[k] = { manual: true, name: clean(body.name, 80), phone, email, address: clean(body.address, 160), birthday: /^\d{4}-\d{2}-\d{2}$/.test(String(body.birthday || '')) ? body.birthday : '', notes: '', preferences: '', tags: [], photos: [], created_at: iso(env), updated_at: iso(env), updated_by: staff?.name || staff?.email || '' };
  return clientDetail(st, env, k);
}
export const MAX_CLIENT_PHOTOS = 60;
/** Fotos de antes y después de una clienta (la de antes es opcional). */
async function addClientPhoto(st, env, body, staff) {
  const k = String(body.key || '').toLowerCase();
  if (!clientRows(st, env).some((c) => c.key === k)) fail(404, 'No encontramos esa clienta.');
  if (!env.saveImage) fail(501, 'Este servidor no puede guardar fotos.');
  const m = st.crm[k] = { notes: '', preferences: '', birthday: '', tags: [], ...(st.crm[k] || {}) };
  m.photos = m.photos || [];
  if (m.photos.length >= MAX_CLIENT_PHOTOS) fail(422, `Llegaste al máximo de ${MAX_CLIENT_PHOTOS} fotos para esta clienta. Borrá alguna vieja.`);
  const p = { id: 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), after: await env.saveImage(body.after, 'clienta'), before: body.before ? await env.saveImage(body.before, 'clienta-antes') : '',
    note: clean(body.note, 160), date: isDate(body.date) ? body.date : dayKey(localNow(env)), by: staff?.name || staff?.email || '', at: iso(env) };
  m.photos.unshift(p);
  return clientDetail(st, env, k);
}
async function removeClientPhoto(st, env, body) {
  const k = String(body.key || '').toLowerCase(), m = st.crm[k];
  const i = (m?.photos || []).findIndex((p) => p.id === body.id);
  if (i < 0) fail(404, 'No encontramos esa foto.');
  const [p] = m.photos.splice(i, 1);
  for (const f of [p.after, p.before]) if (f) await env.deleteImage?.(f);
  return clientDetail(st, env, k);
}

// ── Caja y facturación ───────────────────────────────────
// Facturación del día: señas cobradas online, gift cards vendidas en la web, cobros en la casa e ingresos/egresos cargados a mano.
// Caja: el efectivo del local (lo que quedó del cierre anterior + lo que entra − lo que sale) y su cierre.
export const CASH_METHODS = { efectivo: 'Efectivo', transferencia: 'Transferencia', mercadopago: 'Mercado Pago', debito: 'Débito', credito: 'Crédito' };
const cashOf = (st) => (st.cash = st.cash || { moves: [], closings: [] });
const closingOf = (st, date) => cashOf(st).closings.find((c) => c.date === date && !c.reopened_at);
const localDay = (isoStr) => (isoStr ? msToLocal(Date.parse(isoStr)).slice(0, 10) : '');
function openingFor(st, date) {
  const prev = cashOf(st).closings.filter((c) => c.date < date && !c.reopened_at).sort((a, b) => b.date.localeCompare(a.date))[0];
  return prev ? prev.leaves : 0;
}
/** Lo que entró solo (sin pasar por la caja del local): señas y gift cards pagadas online ese día. */
function onlineIncome(st, date) {
  const out = [];
  for (const b of st.bookings) {
    if (!b.deposit_paid || !['mp', 'transfer'].includes(b.pay_method)) continue;
    if (localDay(b.deposit_at || b.created_at) !== date) continue;
    out.push({ id: 'b' + b.id, type: 'in', auto: true, at: b.deposit_at || b.created_at, amount: b.deposit_paid, method: b.pay_method === 'mp' ? 'mercadopago' : 'transferencia', concept: `Seña ${b.code} · ${b.service_name} · ${b.name}`, booking_id: b.id });
  }
  for (const g of st.giftcards) {
    if (!g.paid_at || !g.payment_id || localDay(g.paid_at) !== date) continue;
    out.push({ id: 'g' + g.id, type: 'in', auto: true, at: g.paid_at, amount: g.amount, method: 'mercadopago', concept: `Gift card ${g.code} · ${g.buyer_name}` });
  }
  return out;
}
const restOf = (b) => Math.max(0, (Number(b.price) || 0) - (b.deposit_paid || 0) - (b.gift_applied || 0));
const collectedOf = (st, b) => cashOf(st).moves.filter((m) => m.booking_id === b.id && m.type === 'in').reduce((a, m) => a + m.amount, 0);
export function cashDay(st, env, date) {
  const moves = cashOf(st).moves.filter((m) => m.date === date).sort((a, b) => a.at.localeCompare(b.at));
  const all = [...onlineIncome(st, date), ...moves].sort((a, b) => a.at.localeCompare(b.at));
  const byMethod = Object.fromEntries(Object.keys(CASH_METHODS).map((k) => [k, { in: 0, out: 0 }]));
  let income = 0, expenses = 0;
  for (const m of all) { (byMethod[m.method] ||= { in: 0, out: 0 })[m.type] += m.amount; if (m.type === 'in') income += m.amount; else expenses += m.amount; }
  const opening = openingFor(st, date);
  const cashIn = byMethod.efectivo.in, cashOut = byMethod.efectivo.out;
  // Turnos del día con saldo por cobrar en la casa.
  const pending = st.bookings.filter((b) => b.start.startsWith(date) && ['confirmed', 'completed', 'attention'].includes(b.status) && restOf(b) > collectedOf(st, b))
    .sort((a, b) => a.start.localeCompare(b.start)).map((b) => ({ id: b.id, code: b.code, time: b.start.slice(11), name: b.name, service_name: b.service_name, pro_name: b.pro_name || '', status: b.status, rest: restOf(b) - collectedOf(st, b) }));
  const c = closingOf(st, date);
  return { date, methods: CASH_METHODS, moves: all.map((m) => ({ ...m, method_label: CASH_METHODS[m.method] || m.method })), byMethod, income, expenses, net: income - expenses,
    cash: { opening, in: cashIn, out: cashOut, expected: opening + cashIn - cashOut }, pending, closing: c || null,
    history: cashOf(st).closings.filter((x) => !x.reopened_at).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10) };
}
/** Facturación de los últimos días (para la tabla de la caja). */
function billing(st, env, until, days = 14) {
  const out = [];
  for (let i = 0; i < days; i++) { const d = addDays(until, -i); const r = cashDay(st, env, d); out.push({ date: d, income: r.income, expenses: r.expenses, net: r.net, closed: !!r.closing, byMethod: Object.fromEntries(Object.entries(r.byMethod).map(([k, v]) => [k, v.in - v.out])) }); }
  return out;
}
async function cashRoute(st, env, method, A, q, body, staff) {
  const who = staff.name || staff.email;
  const today = dayKey(localNow(env));
  if (method === 'GET' && !A[1]) { const date = isDate(q.date) ? q.date : today; return { ...cashDay(st, env, date), billing: billing(st, env, date), today }; }
  if (method === 'POST' && A[1] === 'moves') {
    const date = isDate(body.date) ? body.date : today;
    if (closingOf(st, date)) fail(409, 'La caja de ese día ya está cerrada. Si hace falta, pedile a administración que la reabra.');
    const amount = Math.round(Number(body.amount) || 0);
    if (!(amount > 0)) fail(422, 'Escribí el monto.');
    if (!CASH_METHODS[body.method]) fail(422, 'Elegí el medio de pago.');
    const type = body.type === 'out' ? 'out' : 'in';
    const b = body.booking_id ? st.bookings.find((x) => x.id === Number(body.booking_id)) : null;
    if (body.booking_id && !b) fail(404, 'No encontramos ese turno.');
    const concept = clean(body.concept, 160) || (b ? `Saldo ${b.code} · ${b.service_name} · ${b.name}` : '');
    if (!concept) fail(422, 'Escribí el concepto (por ejemplo: insumos, retiro, venta de productos).');
    const m = { id: ++st.ids.cash, date, at: iso(env), type, method: body.method, amount, concept, booking_id: b?.id || null, by: who };
    cashOf(st).moves.push(m);
    if (b) b.history.push({ at: iso(env), text: `Cobrado en la casa: ${fmtMoney(amount)} (${CASH_METHODS[m.method]}) por ${who}` });
    audit(st, env, staff, `Caja ${date}: ${type === 'in' ? 'ingreso' : 'egreso'} de ${fmtMoney(amount)} (${CASH_METHODS[m.method]}) · ${concept}`);
    return cashDay(st, env, date);
  }
  if (method === 'DELETE' && A[1] === 'moves' && A[2]) {
    const i = cashOf(st).moves.findIndex((m) => m.id === Number(A[2]));
    if (i < 0) fail(404, 'No encontramos ese movimiento.');
    const m = cashOf(st).moves[i];
    if (closingOf(st, m.date)) fail(409, 'La caja de ese día ya está cerrada.');
    if (!isAdminRole(staff) && m.by !== who) fail(403, 'Solo administración puede borrar movimientos de otra persona.');
    cashOf(st).moves.splice(i, 1);
    audit(st, env, staff, `Caja ${m.date}: borró ${m.type === 'in' ? 'el ingreso' : 'el egreso'} de ${fmtMoney(m.amount)} · ${m.concept}`);
    return cashDay(st, env, m.date);
  }
  if (method === 'POST' && A[1] === 'close') {
    const date = isDate(body.date) ? body.date : today;
    if (closingOf(st, date)) fail(409, 'La caja de ese día ya está cerrada.');
    if (date > today) fail(422, 'No se puede cerrar una caja de un día que todavía no llegó.');
    const d = cashDay(st, env, date);
    const counted = Math.max(0, Math.round(Number(body.counted) || 0)), withdrawn = Math.max(0, Math.round(Number(body.withdrawn) || 0));
    if (body.counted === '' || body.counted === undefined || body.counted === null) fail(422, 'Contá el efectivo de la caja y escribí el total.');
    if (withdrawn > counted) fail(422, 'No se puede retirar más de lo que hay en la caja.');
    const c = { id: ++st.ids.cash, date, at: iso(env), by: who, opening: d.cash.opening, cash_in: d.cash.in, cash_out: d.cash.out, expected: d.cash.expected, counted, diff: counted - d.cash.expected, withdrawn, leaves: counted - withdrawn,
      income: d.income, expenses: d.expenses, net: d.net, byMethod: Object.fromEntries(Object.entries(d.byMethod).map(([k, v]) => [k, v.in - v.out])), notes: clean(body.notes, 500) };
    cashOf(st).closings.push(c);
    audit(st, env, staff, `Cerró la caja del ${date}: esperado ${fmtMoney(c.expected)}, contado ${fmtMoney(counted)}${c.diff ? ` (diferencia ${c.diff > 0 ? '+' : '−'}${fmtMoney(Math.abs(c.diff))})` : ''}, retiró ${fmtMoney(withdrawn)}`);
    return cashDay(st, env, date);
  }
  if (method === 'POST' && A[1] === 'reopen') {
    needAdmin(staff);
    const c = closingOf(st, String(body.date || ''));
    if (!c) fail(404, 'Esa caja no está cerrada.');
    c.reopened_at = iso(env); c.reopened_by = who;
    audit(st, env, staff, `Reabrió la caja del ${c.date}`);
    return cashDay(st, env, c.date);
  }
  fail(404, 'No existe esa ruta.');
}

// ── Ganancias y pérdidas (mes a mes) ─────────────────────
// Ingresos: señas cobradas online, gift cards vendidas en la web y todo lo que entró por la caja.
// Egresos: lo que salió por la caja. Comisiones: de los turnos realizados (más el básico de quien lo tenga).
const monthOf = (isoStr) => localDay(isoStr).slice(0, 7);
export function profitAndLoss(st, env, months = 12) {
  const now = dayKey(localNow(env)).slice(0, 7);
  const keys = [];
  for (let i = months - 1; i >= 0; i--) { const [y, m] = now.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 - i, 1)); keys.push(d.toISOString().slice(0, 7)); }
  const rows = Object.fromEntries(keys.map((k) => [k, { month: k, bookings: 0, booked: 0, cancelled: 0, clients: new Set(), turnover: 0, income: 0, expenses: 0, commissions: 0 }]));
  for (const b of st.bookings) {
    const r = rows[b.start.slice(0, 7)];
    if (r) {
      if (b.status === 'completed') { r.bookings++; r.turnover += Number(b.price) || 0; r.clients.add(clientKey(b)); r.commissions += commissionOf(st, b); }
      else if (ACTIVE.includes(b.status)) r.booked++;
      else if (['cancelled', 'no_show'].includes(b.status)) r.cancelled++;
    }
    if (b.deposit_paid && ['mp', 'transfer'].includes(b.pay_method)) { const d = rows[monthOf(b.deposit_at || b.created_at)]; if (d) d.income += b.deposit_paid; }
  }
  for (const g of st.giftcards) { if (g.paid_at && g.payment_id) { const d = rows[monthOf(g.paid_at)]; if (d) d.income += g.amount; } }
  for (const m of cashOf(st).moves) { const d = rows[m.date.slice(0, 7)]; if (d) d[m.type === 'in' ? 'income' : 'expenses'] += m.amount; }
  // Básico mensual de las asesoras que lo tienen (desde el mes en que se sumaron).
  for (const p of prosAll(st)) {
    const pay = payOf(p);
    if (pay.type !== 'basico_comision' || !pay.base || p.active === false) continue;
    for (const k of keys) if (!p.created_at || p.created_at.slice(0, 7) <= k) rows[k].commissions += pay.base;
  }
  const list = keys.map((k) => { const r = rows[k]; return { ...r, clients: r.clients.size, result: r.income - r.expenses - r.commissions }; });
  const total = list.reduce((a, r) => ({ bookings: a.bookings + r.bookings, turnover: a.turnover + r.turnover, income: a.income + r.income, expenses: a.expenses + r.expenses, commissions: a.commissions + r.commissions, result: a.result + r.result }),
    { bookings: 0, turnover: 0, income: 0, expenses: 0, commissions: 0, result: 0 });
  // Clientas distintas en todo el período (no la suma de cada mes).
  total.clients = new Set(st.bookings.filter((b) => b.status === 'completed' && keys.includes(b.start.slice(0, 7))).map(clientKey)).size;
  return { months: list.reverse(), total, current: now };
}

// ── Origen de la reserva ─────────────────────────────────
// La web guarda de dónde llegó la clienta (UTM, fbclid, gclid): Meta, Google u Otro, más la fuente y la campaña.
function originInput(o) {
  if (!o || typeof o !== 'object') return { canal: 'Otro', fuente: '', campania: '', pagina: 'web' };
  const canal = ['Meta', 'Google', 'Otro'].includes(o.canal) ? o.canal : 'Otro';
  return { canal, fuente: clean(o.fuente, 60), campania: clean(o.campania, 120), pagina: o.pagina === 'turnero' ? 'turnero' : 'web' };
}

// ── Integración con Nifty (embudo del cliente) ───────────
// Cada turno nuevo o que cambia se manda a Nifty, firmado con la clave del cliente, sin datos de la clienta.
// Se envía fuera del bloqueo (server/index.js cada minuto): niftyBatch arma el lote y niftyDone anota el resultado.
const NIFTY_STATUS = { pending_payment: 'pendiente', pending_transfer: 'pendiente', confirmed: 'confirmado', attention: 'confirmado', completed: 'realizado', cancelled: 'cancelado', expired: 'vencido', no_show: 'no_vino' };
const niftySig = (b) => [b.status, b.start, b.price, b.deposit_paid, b.service_name].join('|');
function niftyTurno(st, env, b) {
  const s = st.services.find((x) => x.id === b.service_id);
  return { codigo: b.code, estado: NIFTY_STATUS[b.status] || 'pendiente', servicio: b.service_name, categoria: s?.category || '', fecha: b.start.slice(0, 10), hora: b.start.slice(11),
    reservado: msToLocal(Date.parse(b.created_at)) + ':00', precio: Number(b.price) || 0, sena: Number(b.deposit_paid) || 0,
    canal: b.attr?.canal || 'Otro', fuente: b.attr?.fuente || '', campania: b.attr?.campania || '', origen: b.source === 'panel' ? 'panel' : b.attr?.pagina || 'web' };
}
const niftyOn = (st) => { const N = st.integrations?.nifty; return !!(N && N.enabled && N.url && N.secret); };
/** Lote de turnos para mandar (hasta 100), o null si no hay nada o todavía no toca reintentar. */
export function niftyBatch(st, env) {
  ensure(st);
  const N = st.integrations.nifty;
  if (!niftyOn(st) || env.now() < (N.retry_at || 0)) return null;
  const desde = new Date(env.now() - 400 * 864e5).toISOString();
  const list = st.bookings.filter((b) => b.created_at >= desde && b.nifty_sig !== niftySig(b)).slice(0, 100);
  const gone = (N.deleted || []).slice(0, 100); // turnos eliminados del panel: en Nifty quedan como cancelados
  if (!list.length && !gone.length) return null;
  return { url: N.url, secret: N.secret, body: JSON.stringify({ turnos: [...list.map((b) => niftyTurno(st, env, b)), ...gone] }), sent: list.map((b) => [b.id, niftySig(b)]), gone: gone.map((t) => t.codigo) };
}
/** Anota el resultado de un envío: si salió bien, esos turnos quedan al día; si no, reintenta más tarde (hasta 1 hora). */
export function niftyDone(st, env, job, res) {
  ensure(st);
  const N = st.integrations.nifty;
  if (res.ok) {
    for (const [id, sig] of job.sent) { const b = st.bookings.find((x) => x.id === id); if (b) b.nifty_sig = sig; }
    if (job.gone?.length) N.deleted = (N.deleted || []).filter((t) => !job.gone.includes(t.codigo));
    Object.assign(N, { sent: (N.sent || 0) + job.sent.length + (job.gone?.length || 0), last_ok: iso(env), last_error: '', fails: 0, retry_at: 0 });
  } else {
    N.fails = (N.fails || 0) + 1;
    Object.assign(N, { last_error: `${new Date(env.now()).toISOString().slice(0, 16).replace('T', ' ')} · ${res.error || 'Nifty no respondió'}`, retry_at: env.now() + Math.min(60, 2 ** Math.min(N.fails, 6)) * 60e3 });
  }
  return { save: true };
}
function niftyView(st, env) {
  const N = st.integrations.nifty, desde = new Date(env.now() - 400 * 864e5).toISOString();
  return { enabled: !!N.enabled, url: N.url, has_secret: !!N.secret, sent: N.sent || 0, last_ok: N.last_ok, last_error: N.last_error,
    pending: N.enabled ? st.bookings.filter((b) => b.created_at >= desde && b.nifty_sig !== niftySig(b)).length + (N.deleted || []).length : 0, can_send: !!env.niftySend };
}
async function niftyRoute(st, env, method, A, body, staff) {
  needAdmin(staff);
  const N = st.integrations.nifty;
  if (method === 'GET') return niftyView(st, env);
  if (method === 'PUT') {
    if (body.url !== undefined) {
      const u = String(body.url || '').trim();
      if (u && !/^https:\/\/[^\s]+$/.test(u) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(u)) fail(422, 'La dirección tiene que empezar con https://');
      N.url = u;
    }
    if (body.secret) { const k = String(body.secret).trim(); if (k.length < 20) fail(422, 'Revisá la clave: es la que te dio Nifty (empieza con nft_).'); N.secret = k; }
    if (body.enabled !== undefined) N.enabled = !!body.enabled;
    if (N.enabled && (!N.url || !N.secret)) fail(422, 'Para activarla cargá la dirección y la clave que te da Nifty.');
    Object.assign(N, { fails: 0, retry_at: 0 });
    audit(st, env, staff, `Cambió la integración con Nifty (${N.enabled ? 'activa' : 'apagada'})`);
    return niftyView(st, env);
  }
  if (method === 'POST' && A[1] === 'test') {
    if (!N.url || !N.secret) fail(422, 'Cargá la dirección y la clave primero.');
    if (!env.niftySend) fail(501, 'En la vista previa no se envía nada a Nifty.');
    const r = await env.niftySend(N.url, N.secret, JSON.stringify({ turnos: [], prueba: true }));
    if (!r.ok) fail(502, `Nifty respondió: ${r.error}`);
    N.last_error = '';
    return { ok: true, ...niftyView(st, env) };
  }
  fail(404, 'No existe esa ruta.');
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
  const ok2 = (r) => ({ status: 200, ...r });

  // Públicas
  ensure(st);
  if (method === 'GET' && path === '/api/site') return ok(publicSite(st, env));
  if (method === 'GET' && path === '/api/availability') return ok(availability(st, env, q.service, q.from, q.days, q.pro, q.ignore));
  if (method === 'POST' && path === '/api/bookings') return ok(await createBooking(st, env, body, req.customer));
  if (seg[0] === 'bookings' && seg[1]) {
    const b = st.bookings.find((x) => x.token === seg[1]);
    if (!b) fail(404, 'No encontramos ese turno.');
    if (method === 'GET' && !seg[2]) return ok({ booking: publicBooking(st, env, b) });
    // La clienta cambia el día o el horario desde el link del correo (con la misma asesora).
    if (method === 'POST' && seg[2] === 'reschedule') {
      if (!publicBooking(st, env, b).can_reschedule) fail(409, `Este turno ya no se puede cambiar online (faltan menos de ${st.settings.booking.cancelHours} horas o tiene más de un servicio). Escribinos por WhatsApp.`);
      const date = String(body.date || ''), time = String(body.time || '');
      const s = st.services.find((x) => x.id === b.service_id);
      if (!s || !isDate(date) || !/^\d{2}:\d{2}$/.test(time)) fail(422, 'Elegí el día y el horario.');
      if (!slotsFor(st, env, { ...s, duration: b.duration, resource: b.resource }, date, { ignoreId: b.id, pro: b.pro_id }).includes(time)) fail(409, 'Ese horario ya no está libre. Elegí otro.', { taken: true });
      const prev = b.start;
      b.start = `${date} ${time}`; b.reminded = false;
      b.history.push({ at: iso(env), text: `La clienta cambió el turno de ${prev} a ${b.start}` });
      if (b.email) await sendEmail(st, env, 'booking_rescheduled', b.email, { booking: b, link: bookingLink(env, b) }, { booking_id: b.id });
      await mailTeam(st, env, 'staff_rescheduled', b, { prev });
      return ok({ booking: publicBooking(st, env, b) });
    }
    if (method === 'POST' && seg[2] === 'cancel') {
      if (!publicBooking(st, env, b).can_cancel) fail(409, `Faltan menos de ${st.settings.booking.cancelHours} horas: para cancelar escribinos por WhatsApp.`);
      await cancelBooking(st, env, b, 'la clienta', { whole: true });
      return ok({ booking: publicBooking(st, env, b) });
    }
    // La clienta avisa que ya transfirió: le llega al equipo para verificarla.
    if (method === 'POST' && seg[2] === 'transfer-sent') {
      const list = groupOf(st, b).filter((x) => x.status === 'pending_transfer');
      if (!list.length) fail(409, 'Esta reserva no está esperando una transferencia.');
      // La clienta sube el comprobante (foto o PDF): queda en el turno para que el equipo lo verifique.
      if (body.comprobante) {
        if (!env.saveImage) fail(501, 'Este servidor no puede guardar archivos.');
        const f = await env.saveImage(body.comprobante, 'comprobante', { pdf: true });
        for (const x of list) { x.transfer_proof = f; x.history.push({ at: iso(env), text: 'La clienta subió el comprobante de la transferencia' }); }
        if (list[0].transfer_notified) await mailTeam(st, env, 'staff_transfer', b, { notified: true, note: 'Subió el comprobante: está en el turno, en el panel.' });
      }
      if (!list[0].transfer_notified) {
        for (const x of list) { x.transfer_notified = iso(env); x.history.push({ at: iso(env), text: 'La clienta avisó que ya transfirió' + (clean(body.note) ? `: ${clean(body.note, 200)}` : '') }); }
        await mailTeam(st, env, 'staff_transfer', b, { notified: true, note: clean(body.note, 200) || (body.comprobante ? 'Subió el comprobante: está en el turno, en el panel.' : '') });
      }
      return ok({ booking: publicBooking(st, env, b) });
    }
    // Prefiere pagar con Mercado Pago una reserva que estaba por transferencia.
    if (method === 'POST' && seg[2] === 'pay-mp') {
      const list = groupOf(st, b).filter((x) => x.status === 'pending_transfer');
      if (!list.length || !mpOn(st.settings.pay)) fail(409, 'Esta reserva no se puede pagar con Mercado Pago.');
      const due = sum(list, 'deposit_due');
      const url = await env.createPayment({ kind: 'booking', token: list[0].token, title: `Seña · ${list.map((x) => x.service_name).join(' + ')} · ${longDate(list[0].start)}`, amount: due, email: list[0].email, ref: list[0].code });
      const hold = new Date(Math.max(Date.parse(list[0].hold_until), env.now() + (Number(st.settings.booking.holdMinutes) || 30) * 60e3)).toISOString();
      for (const x of list) { Object.assign(x, { status: 'pending_payment', pay_method: 'mp', pay_url: url, hold_until: hold }); x.history.push({ at: iso(env), text: 'Cambió a pagar con Mercado Pago' }); }
      return ok({ booking: publicBooking(st, env, b), pay_url: url });
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
    await sendEmail(st, env, 'staff_withdrawal', staffTo(st), { w });
    return ok({ code: w.code });
  }
  if (method === 'POST' && path === '/api/pay/simulate') {
    if (!env.mock) fail(404, 'No existe esa ruta.');
    const kind = body.kind === 'gift' ? 'gift' : 'booking';
    const item = (kind === 'gift' ? st.giftcards : st.bookings).find((x) => x.token === body.token);
    if (!item) fail(404, 'No encontramos el pago.');
    const amount = kind === 'gift' ? item.amount : sum(groupOf(st, item), 'deposit_due');
    return ok(await applyPayment(st, env, { kind, token: body.token, status: body.result === 'rejected' ? 'rejected' : 'approved', amount, payment_id: 'SIM-' + randomCode(8, '0123456789') }));
  }

  // Mi cuenta (clientas)
  if (seg[0] === 'account') return ok2(await accountRoute(st, env, method, seg[1], body, { ...req, query: q }));

  // Panel
  if (seg[0] !== 'admin') fail(404, 'No existe esa ruta.');
  const A = seg.slice(1);
  if (method === 'GET' && A[0] === 'setup-needed') return ok({ needed: st.staff.length === 0 });
  if (method === 'POST' && A[0] === 'login') {
    const u = st.staff.find((x) => x.email && x.email === String(body.email || '').toLowerCase().trim());
    if (!u || !u.password_hash || u.active === false || !(await env.checkPassword(String(body.password || ''), u.password_hash))) fail(401, 'Email o contraseña incorrectos.');
    audit(st, env, u, 'Ingresó al panel');
    return { status: 200, body: { me: staffView(u) }, session: { staff_id: u.id } };
  }
  if (method === 'POST' && A[0] === 'logout') return { status: 200, body: { ok: true }, session: null };
  const staff = req.staff;
  if (!staff || staff.active === false || (staff.role === 'pro' && !staff.password_hash)) fail(401, 'Tu sesión venció. Volvé a entrar.');
  if (method === 'GET' && A[0] === 'me') return ok({ me: staffView(staff) });
  // Las asesoras solo ven sus turnos, sus servicios y sus comisiones.
  if (staff.role === 'pro') return ok(await proRoute(st, env, method, A, q, body, staff));
  const who = staff.name || staff.email;
  if (method === 'GET' && A[0] === 'dashboard') return ok(dashboard(st, env));

  if (A[0] === 'agenda' && method === 'GET') {
    const date = isDate(q.date) ? q.date : dayKey(localNow(env));
    return ok({ date, resources: st.settings.resources, hours: st.settings.hours[weekday(date)] || [],
      bookings: st.bookings.filter((b) => b.start.startsWith(date) && b.status !== 'expired' && (!Number(q.pro) || b.pro_id === Number(q.pro))).sort((a, b) => a.start.localeCompare(b.start)).map(adminBooking),
      blocks: st.blocks.filter((k) => k.date === date), pros: prosAll(st).filter((p) => p.active !== false).map((p) => ({ id: p.id, name: p.name, color: p.color || '' })) });
  }
  if (A[0] === 'slots' && method === 'GET') {
    const s = st.services.find((x) => x.id === Number(q.service));
    if (!s) fail(404, 'Elegí un servicio.');
    return ok({ slots: slotsFor(st, env, s, q.date, { ignoreId: Number(q.ignore) || null, staff: true, pro: Number(q.pro) || null }), pros: prosFor(st, s).map((p) => ({ id: p.id, name: p.name })) });
  }
  if (A[0] === 'bookings') {
    if (method === 'GET' && !A[1]) {
      let list = st.bookings.filter((b) => b.status !== 'expired' || q.status === 'expired');
      if (q.status) list = list.filter((b) => b.status === q.status);
      if (isDate(q.from)) list = list.filter((b) => b.start >= q.from);
      if (isDate(q.to)) list = list.filter((b) => b.start.slice(0, 10) <= q.to);
      if (q.q) { const t = String(q.q).toLowerCase(); list = list.filter((b) => `${b.code} ${b.name} ${b.email} ${b.phone} ${b.service_name} ${b.pro_name || ''}`.toLowerCase().includes(t)); }
      if (Number(q.pro)) list = list.filter((b) => b.pro_id === Number(q.pro));
      return ok({ bookings: list.sort((a, b) => (q.order === 'asc' ? a.start.localeCompare(b.start) : b.start.localeCompare(a.start))).slice(0, 400).map(adminBooking) });
    }
    if (method === 'POST' && !A[1]) {
      const s = st.services.find((x) => x.id === Number(body.service_id));
      if (!s) fail(422, 'Elegí un servicio.');
      if (clean(body.name).length < 2) fail(422, 'Escribí el nombre.');
      if (!isDate(body.date) || !isTime(body.time)) fail(422, 'Elegí el día y la hora.');
      const wantPro = Number(body.pro_id) || null;
      if (wantPro && !prosAll(st).some((p) => p.id === wantPro)) fail(422, 'Elegí una asesora.');
      if (!body.force && !slotsFor(st, env, s, body.date, { staff: true, pro: wantPro }).includes(body.time)) fail(409, 'Ese horario está ocupado (o la asesora no está libre) o queda fuera del horario de atención. Si igual querés cargarlo, marcá "Cargar igual".', { taken: true });
      const pro = wantPro ? st.staff.find((p) => p.id === wantPro) : pickPro(st, env, s, body.date, body.time);
      const dep = Math.max(0, Number(body.deposit_paid) || 0);
      const b = {
        id: ++st.ids.booking, code: `T-${++st.ids.bookingNumber}`, token: token(), group: null, service_id: s.id, service_name: svcLabel(s), resource: s.resource,
        pro_id: pro?.id || null, pro_name: pro?.name || '',
        start: `${body.date} ${body.time}`, duration: Number(body.duration) || Number(s.duration) || 60, price: Number(s.price) || 0, deposit: 0, deposit_due: 0, deposit_paid: dep, deposit_at: dep ? iso(env) : null, gift_id: null, gift_code: '', gift_applied: 0,
        name: clean(body.name, 80), email: clean(body.email, 120).toLowerCase(), phone: clean(body.phone, 40), notes: clean(body.notes, 500), status: 'confirmed', source: 'panel', created_at: iso(env),
        pay_method: dep ? (PAY_METHODS[body.pay_method] ? body.pay_method : 'local') : 'none',
        hold_until: iso(env), reminded: false, refund_pending: false, pay_url: null, payment_id: null, history: [{ at: iso(env), text: `Cargado en el panel por ${who}` }],
      };
      st.bookings.push(b);
      audit(st, env, staff, `Cargó el turno ${b.code}: ${b.service_name} · ${b.start}${b.pro_name ? ` · con ${b.pro_name}` : ''} · ${b.name}`, { booking_id: b.id });
      if (b.email && body.notify) await sendEmail(st, env, 'booking_confirmed', b.email, { booking: b, link: bookingLink(env, b) }, { booking_id: b.id });
      await mailPros(st, env, 'pro_booking', [b]);
      return ok({ booking: adminBooking(b) });
    }
    const b = st.bookings.find((x) => x.id === Number(A[1]));
    if (!b) fail(404, 'No encontramos ese turno.');
    if (method === 'GET') {
      const s = st.services.find((x) => x.id === b.service_id);
      const grp = groupOf(st, b);
      return ok({ booking: adminBookingFull(st, b), emails: st.emails.filter((m) => grp.some((x) => x.id === m.booking_id)).map(({ html, ...m }) => m),
        group: grp.length > 1 ? grp.map((x) => ({ id: x.id, code: x.code, start: x.start, service_name: x.service_name, pro_name: x.pro_name || '', status: x.status, deposit_due: x.deposit_due })) : [],
        group_due: sum(grp.filter((x) => x.status === 'pending_transfer'), 'deposit_due'),
        pros: (s ? prosFor(st, s) : []).concat(b.pro_id && !(s ? prosFor(st, s) : []).some((p) => p.id === b.pro_id) ? st.staff.filter((p) => p.id === b.pro_id) : []).map((p) => ({ id: p.id, name: p.name })),
        audit: st.audit.filter((a) => grp.some((x) => x.id === a.booking_id)).slice(-50).reverse().map(auditView) });
    }
    // Eliminar un turno para siempre (por ejemplo, los de prueba). Solo administración. No le avisa a la clienta:
    // para avisarle, primero se cancela. Si ya tiene cobros en la caja, hay que borrarlos antes (así la caja no queda descuadrada).
    if (method === 'DELETE') {
      needAdmin(staff);
      if (cashOf(st).moves.some((m) => m.booking_id === b.id)) fail(409, 'Este turno tiene cobros registrados en la caja: borralos primero desde Caja y facturación.');
      refundGift(st, b);
      if (b.transfer_proof && env.deleteImage) await env.deleteImage(b.transfer_proof);
      // En Nifty el turno ya figuraba: queda como cancelado.
      if (niftyOn(st) && b.nifty_sig) { const N = st.integrations.nifty; (N.deleted ||= []).push({ ...niftyTurno(st, env, b), estado: 'cancelado' }); }
      st.bookings.splice(st.bookings.indexOf(b), 1);
      audit(st, env, staff, `Eliminó el turno ${b.code} (${b.service_name} · ${b.start} · ${b.name} · ${BOOKING_STATUS[b.status]})`);
      return ok({ ok: true });
    }
    if (method === 'PATCH') {
      const changes = [];
      if (body.transfer === 'confirm' || body.transfer === 'reject') {
        await settleTransfer(st, env, b, staff, body.transfer === 'confirm', body.amount ?? null);
        audit(st, env, staff, body.transfer === 'confirm' ? `Confirmó la transferencia de ${b.code}${b.group ? ' (reserva conjunta)' : ''}` : `Rechazó la transferencia de ${b.code}: no llegó`, { booking_id: b.id });
        return ok({ booking: adminBookingFull(st, b) });
      }
      if (body.pro_id !== undefined && (Number(body.pro_id) || null) !== b.pro_id) {
        const pid = Number(body.pro_id) || null;
        const p = pid ? prosAll(st).find((x) => x.id === pid) : null;
        if (pid && !p) fail(422, 'Elegí una asesora.');
        if (p && !body.force && !proFree(st, env.now(), p.id, b.start.slice(0, 10), toMin(b.start.slice(11)), b.duration, b.id)) fail(409, `${p.name} ya tiene otro turno a esa hora. Si igual querés asignárselo, marcá "Cargar igual".`, { taken: true });
        const before = b.pro_name || 'nadie';
        b.pro_id = p?.id || null; b.pro_name = p?.name || '';
        if (b.status !== 'completed') b.commission_percent = null;
        b.history.push({ at: iso(env), text: `Asesora: ${before} → ${b.pro_name || 'nadie'} (${who})` });
        changes.push(`asesora ${before} → ${b.pro_name || 'nadie'}`);
        if (p && b.status === 'confirmed') await mailPros(st, env, 'pro_booking', [b]);
      }
      if (body.date || body.time) {
        const s = st.services.find((x) => x.id === b.service_id) || { ...b, days: [] };
        const date = body.date || b.start.slice(0, 10), time = body.time || b.start.slice(11);
        if (!body.force && !slotsFor(st, env, { ...s, duration: b.duration, resource: b.resource }, date, { ignoreId: b.id, staff: true, pro: b.pro_id }).includes(time)) fail(409, 'Ese horario está ocupado (o la asesora no está libre) o queda fuera del horario de atención.', { taken: true });
        b.history.push({ at: iso(env), text: `Reprogramado de ${b.start} a ${date} ${time} por ${who}` });
        changes.push(`horario ${b.start} → ${date} ${time}`);
        b.start = `${date} ${time}`; b.reminded = false;
        if (b.status === 'attention') b.status = 'confirmed';
        if (b.email && body.notify) await sendEmail(st, env, 'booking_rescheduled', b.email, { booking: b, link: bookingLink(env, b) }, { booking_id: b.id });
      }
      if (body.status && body.status !== b.status) {
        if (!BOOKING_STATUS[body.status]) fail(422, 'Estado inválido.');
        const from = BOOKING_STATUS[b.status];
        if (body.status === 'cancelled') await cancelBooking(st, env, b, who, { reason: clean(body.reason, 200), notify: body.notify !== false, message: clean(body.message, 400) });
        else { b.history.push({ at: iso(env), text: `${from} → ${BOOKING_STATUS[body.status]} (${who})` }); if (body.status === 'completed') complete(st, b); else b.status = body.status; }
        changes.push(`estado ${from} → ${BOOKING_STATUS[body.status]}`);
      }
      if (body.notes !== undefined && clean(body.notes, 500) !== b.notes) { b.notes = clean(body.notes, 500); changes.push('notas'); }
      if (body.refund_pending !== undefined && !!body.refund_pending !== b.refund_pending) { b.refund_pending = !!body.refund_pending; if (!b.refund_pending) b.history.push({ at: iso(env), text: `Seña resuelta (${who})` }); changes.push(b.refund_pending ? 'seña por devolver' : 'seña resuelta'); }
      if (body.deposit_paid !== undefined && Math.max(0, Number(body.deposit_paid) || 0) !== b.deposit_paid) { b.deposit_paid = Math.max(0, Number(body.deposit_paid) || 0); changes.push(`seña ${fmtMoney(b.deposit_paid)}`); }
      if (changes.length) audit(st, env, staff, `Turno ${b.code} (${b.name}): ${changes.join(' · ')}`, { booking_id: b.id });
      return ok({ booking: adminBookingFull(st, b) });
    }
  }
  if (A[0] === 'clients' && method === 'GET' && !A[1]) return ok(clients(st, env, q));
  if (A[0] === 'clients' && A[1] === 'ficha' && method === 'GET') return ok(clientDetail(st, env, q.key));
  if (A[0] === 'cash') return ok(await cashRoute(st, env, method, A, q, body, staff));
  if (A[0] === 'nifty') return ok(await niftyRoute(st, env, method, A, body, staff));
  if (A[0] === 'pnl' && method === 'GET') { needAdmin(staff); return ok(profitAndLoss(st, env, Math.min(36, Math.max(1, Number(q.months) || 12)))); }
  if (A[0] === 'clients' && method === 'POST' && !A[1]) { const r = createClient(st, env, body, staff); audit(st, env, staff, `Cargó a la clienta ${r.client.name}`); return ok(r); }
  if (A[0] === 'clients' && A[1] === 'photos' && method === 'POST') { const r = await addClientPhoto(st, env, body, staff); audit(st, env, staff, `Sumó fotos de antes y después a ${r.client.name}`); return ok(r); }
  if (A[0] === 'clients' && A[1] === 'photos' && method === 'DELETE') { const r = await removeClientPhoto(st, env, body); audit(st, env, staff, `Borró una foto de ${r.client.name}`); return ok(r); }
  if (A[0] === 'clients' && A[1] === 'ficha' && method === 'PATCH') { const r = saveClient(st, env, body.key, body, staff); audit(st, env, staff, `Editó la ficha de ${r.client.name}`); return ok(r); }


  // Trabajos (antes y después) de un servicio: se suben desde el panel y se ven en la web y el turnero.
  if (A[0] === 'works-before' && method === 'PUT') {
    if (!env.saveImage) fail(501, 'Este servidor no puede guardar fotos.');
    const prev = st.settings.site.worksBefore;
    st.settings.site.worksBefore = await env.saveImage(body.image, 'antes');
    if (prev && prev !== SITE.worksBefore) await env.deleteImage?.(prev);
    audit(st, env, staff, 'Cambió la foto de "antes" de los trabajos');
    return ok({ worksBefore: st.settings.site.worksBefore });
  }
  if (A[0] === 'services' && A[2] === 'works') {
    const s = st.services.find((x) => x.id === Number(A[1]));
    if (!s) fail(404, 'No encontramos ese servicio.');
    s.works = s.works || [];
    if (method === 'POST') {
      if (!env.saveImage) fail(501, 'Este servidor no puede guardar fotos.');
      if (s.works.length >= MAX_WORKS) fail(422, `Llegaste al máximo de ${MAX_WORKS} trabajos para este servicio. Borrá alguno viejo para sumar otro.`);
      const w = { id: 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), after: await env.saveImage(body.after, 'despues'), before: body.before ? await env.saveImage(body.before, 'antes') : '', created_at: iso(env) };
      s.works.unshift(w); // el más nuevo, primero
      audit(st, env, staff, `Sumó un trabajo (antes y después) a ${s.name}`);
      return ok({ service: s });
    }
    if (method === 'DELETE' && A[3]) {
      const i = s.works.findIndex((w) => w.id === A[3]);
      if (i < 0) fail(404, 'No encontramos ese trabajo.');
      const [w] = s.works.splice(i, 1);
      for (const f of [w.after, w.before]) if (f) await env.deleteImage?.(f);
      audit(st, env, staff, `Borró un trabajo de ${s.name}`);
      return ok({ service: s });
    }
  }
  if (A[0] === 'services') {
    if (method === 'GET') return ok({ services: [...st.services].sort((a, b) => a.position - b.position), categories: st.settings.categories, resources: st.settings.resources, worksBefore: st.settings.site.worksBefore || '', maxWorks: MAX_WORKS });
    if (method === 'POST' && !A[1]) {
      const s = serviceInput(st, { mode: 'online', duration: 60, visible: true, category: st.settings.categories[0].key, resource: st.settings.resources[0].key, ...body }, { includes: [], days: [], tag: '', short: '', image: '', whatsapp: '', featured: false });
      s.id = ++st.ids.service; s.position = st.services.length; s.slug = slugify(s.name) + (st.services.some((x) => x.slug === slugify(s.name)) ? '-' + s.id : '');
      st.services.push(s);
      audit(st, env, staff, `Creó el servicio ${s.name}${s.price ? ` (${fmtMoney(s.price)})` : ''}`);
      return ok({ service: s });
    }
    const i = st.services.findIndex((x) => x.id === Number(A[1]));
    if (i < 0) fail(404, 'No encontramos ese servicio.');
    if (method === 'PATCH') {
      const prev = st.services[i];
      st.services[i] = serviceInput(st, body, prev);
      const n = st.services[i], diff = [];
      if (prev.price !== n.price) diff.push(`precio ${prev.price ? fmtMoney(prev.price) : '—'} → ${n.price ? fmtMoney(n.price) : '—'}`);
      if ((prev.price_transfer ?? null) !== (n.price_transfer ?? null)) diff.push(`precio con transferencia ${prev.price_transfer ? fmtMoney(prev.price_transfer) : '—'} → ${n.price_transfer ? fmtMoney(n.price_transfer) : '—'}`);
      if (prev.duration !== n.duration) diff.push(`duración ${prev.duration} → ${n.duration} min`);
      if (prev.visible !== n.visible) diff.push(n.visible ? 'visible' : 'oculto');
      if (prev.name !== n.name) diff.push(`nombre "${prev.name}" → "${n.name}"`);
      if (prev.mode !== n.mode) diff.push(`modo ${prev.mode} → ${n.mode}`);
      audit(st, env, staff, `Editó el servicio ${n.name}${diff.length ? ': ' + diff.join(' · ') : ''}`);
      return ok({ service: n });
    }
    if (method === 'DELETE') {
      if (st.bookings.some((b) => b.service_id === st.services[i].id && ACTIVE.includes(b.status))) fail(409, 'Tiene turnos por delante. Ocultalo en vez de borrarlo.');
      const [gone] = st.services.splice(i, 1);
      for (const p of prosAll(st)) if (p.services) p.services = p.services.filter((id) => id !== gone.id);
      audit(st, env, staff, `Borró el servicio ${gone.name}`);
      return ok({ ok: true });
    }
  }

  if (A[0] === 'blocks') {
    if (method === 'GET') {
      const today = dayKey(localNow(env));
      // También se devuelve el horario de cada asesora, para verlo junto al de la casa.
      const pros = prosAll(st).filter((p) => p.active !== false).map((p) => ({ id: p.id, name: p.name, specialty: p.specialty || '', follows: !p.schedule, week: proWeek(st, p), timeoff: st.blocks.filter((k) => k.pro_id === p.id && k.date >= today).length }));
      return ok({ blocks: st.blocks.filter((k) => !k.pro_id && k.date >= today).sort((a, b) => (a.date + a.from).localeCompare(b.date + b.from)), resources: st.settings.resources, pros });
    }
    if (method === 'POST') {
      if (!isDate(body.date)) fail(422, 'Elegí el día.');
      const to = body.to_date && isDate(body.to_date) ? body.to_date : body.date;
      if (to < body.date || addDays(body.date, 92) < to) fail(422, 'Revisá el rango de días (máximo 3 meses).');
      if ((body.from && !isTime(body.from)) || (body.to && !isTime(body.to)) || (body.from && body.to && body.from >= body.to)) fail(422, 'Revisá el horario.');
      const res = body.resource === 'all' || st.settings.resources.some((r) => r.key === body.resource) ? body.resource : 'all';
      const made = [];
      for (let d = body.date; d <= to; d = addDays(d, 1)) { const k = { id: ++st.ids.block, date: d, from: body.from || '', to: body.to || '', resource: res, reason: clean(body.reason, 120) }; st.blocks.push(k); made.push(k); }
      audit(st, env, staff, `Bloqueó ${body.date}${to !== body.date ? ` a ${to}` : ''}${body.from ? ` de ${body.from} a ${body.to || 'cierre'}` : ''}${body.reason ? ` (${clean(body.reason, 120)})` : ''}`);
      return ok({ blocks: made });
    }
    if (method === 'DELETE') {
      const ids = String(A[1] || '').split(',').map(Number);
      const gone = st.blocks.filter((k) => ids.includes(k.id) && !k.pro_id);
      st.blocks = st.blocks.filter((k) => !gone.includes(k));
      if (gone.length) audit(st, env, staff, `Quitó el bloqueo del ${gone[0].date}${gone.length > 1 ? ` al ${gone.at(-1).date}` : ''}`);
      return ok({ ok: true });
    }
  }

  if (A[0] === 'giftcards') {
    if (method === 'GET' && !A[1]) {
      let list = [...st.giftcards];
      if (q.status) list = list.filter((g) => g.status === q.status);
      if (q.q) { const t = String(q.q).toLowerCase(); list = list.filter((g) => `${g.code} ${g.buyer_name} ${g.buyer_email} ${g.to_name} ${g.to_email}`.toLowerCase().includes(t)); }
      return ok({ giftcards: list.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 400).map((g) => ({ ...g, status_label: GIFT_STATUS[g.status] })) });
    }
    if (method === 'POST' && !A[1]) { const r = await createGift(st, env, body, { staff }); audit(st, env, staff, `Emitió la gift card ${st.giftcards.at(-1).code} por ${fmtMoney(st.giftcards.at(-1).amount)}`); return ok(r); }
    const g = st.giftcards.find((x) => x.id === Number(A[1]));
    if (!g) fail(404, 'No encontramos esa gift card.');
    if (method === 'POST' && A[2] === 'redeem') {
      const amount = Math.round(Number(body.amount) || 0);
      if (g.status !== 'active') fail(409, 'La gift card no está activa.');
      if (!(amount > 0) || amount > g.balance) fail(422, `El monto tiene que ser entre $ 1 y ${fmtMoney(g.balance)}.`);
      g.balance -= amount; if (g.balance <= 0) g.status = 'used';
      g.history.push({ at: iso(env), amount: -amount, note: clean(body.note, 120) || `Usada en el local (${staff.name || staff.email})` });
      audit(st, env, staff, `Descontó ${fmtMoney(amount)} de la gift card ${g.code}`);
      return ok({ gift: { ...g, status_label: GIFT_STATUS[g.status] } });
    }
    if (method === 'PATCH') {
      if (body.status && GIFT_STATUS[body.status]) { g.history.push({ at: iso(env), amount: 0, note: `${GIFT_STATUS[g.status]} → ${GIFT_STATUS[body.status]} (${staff.name || staff.email})` }); audit(st, env, staff, `Gift card ${g.code}: ${GIFT_STATUS[g.status]} → ${GIFT_STATUS[body.status]}`); g.status = body.status; }
      if (body.expires_at && isDate(body.expires_at)) { g.expires_at = body.expires_at + 'T23:59:00.000Z'; audit(st, env, staff, `Gift card ${g.code}: vence el ${body.expires_at}`); }
      return ok({ gift: { ...g, status_label: GIFT_STATUS[g.status] } });
    }
    if (method === 'POST' && A[2] === 'resend') { await giftEmails(st, env, g); audit(st, env, staff, `Reenvió la gift card ${g.code}`); return ok({ ok: true }); }
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
    if (method === 'POST') { const ev = input({ id: ++st.ids.event, active: true, from: '', to: '', price: null, description: '', image: '' }); st.events.push(ev); audit(st, env, staff, `Creó el evento ${ev.title} (${ev.date})`); return ok({ event: ev }); }
    const i = st.events.findIndex((x) => x.id === Number(A[1]));
    if (i < 0) fail(404, 'No encontramos ese evento.');
    if (method === 'PATCH') { st.events[i] = input(st.events[i]); audit(st, env, staff, `Editó el evento ${st.events[i].title}`); return ok({ event: st.events[i] }); }
    if (method === 'DELETE') { const [ev] = st.events.splice(i, 1); audit(st, env, staff, `Borró el evento ${ev.title}`); return ok({ ok: true }); }
  }

  if (A[0] === 'settings') {
    if (method === 'GET') return ok({ settings: st.settings, roles: ROLES });
    if (method === 'PUT' && A[1]) {
      needAdmin(staff);
      const key = A[1];
      const S = st.settings;
      if (key === 'site') { for (const k of Object.keys(SITE)) if (body[k] !== undefined) S.site[k] = clean(body[k], 300); }
      else if (key === 'pay') {
        ensure(st);
        for (const k of ['alias', 'cbu', 'holder', 'bank', 'cuit']) if (body[k] !== undefined) S.pay[k] = clean(body[k], 120);
        for (const k of ['mpEnabled', 'transferEnabled']) if (body[k] !== undefined) S.pay[k] = !!body[k];
        if (body.transferHoldHours !== undefined) S.pay.transferHoldHours = Math.max(1, Math.min(72, Math.round(Number(body.transferHoldHours) || 12)));
        if (S.pay.cbu && !/^\d{22}$/.test(S.pay.cbu.replace(/\D/g, ''))) fail(422, 'El CBU/CVU tiene que tener 22 números.');
        if (!S.pay.mpEnabled && !transferOn(S.pay)) fail(422, 'Dejá al menos un medio de pago: Mercado Pago o transferencia con alias o CBU.');
      }
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
      } else if (key === 'emails') {
        ensure(st);
        const E = S.emails;
        const n = (k, min, max) => { if (body[k] !== undefined) E[k] = Math.max(min, Math.min(max, Math.round(Number(body[k]) || 0))); };
        n('pendingMinutes', 5, 120); n('thanksHours', 1, 96); n('giftExpiringDays', 1, 120); n('dailyHour', 0, 23);
        if (body.reviewUrl !== undefined) E.reviewUrl = /^https?:\/\//.test(String(body.reviewUrl).trim()) || !String(body.reviewUrl).trim() ? clean(body.reviewUrl, 400) : fail(422, 'El link de reseñas tiene que empezar con https://');
        if (body.enabled) for (const [k, v] of Object.entries(body.enabled)) if (TEMPLATES[k]) E.enabled[k] = !!v;
        if (body.custom) for (const [k, v] of Object.entries(body.custom)) if (TEMPLATES[k]) {
          const c = { subject: clean(v?.subject, 200), title: clean(v?.title, 120), intro: clean(v?.intro, 1500) };
          if (c.subject || c.title || c.intro) E.custom[k] = c; else delete E.custom[k];
        }
        if (body.staffEmails !== undefined) S.booking.staffEmails = clean(body.staffEmails, 300);
      } else if (key === 'content') {
        if (body.faq !== undefined) S.content.faq = (body.faq || []).map((x) => ({ q: clean(x.q, 200), a: clean(x.a, 1500) })).filter((x) => x.q && x.a);
        if (body.terms !== undefined) S.content.terms = String(body.terms).slice(0, 20000);
        if (body.categories !== undefined) for (const c of body.categories) { const t = S.categories.find((x) => x.key === c.key); if (t) { t.title = clean(c.title, 80) || t.title; t.intro = clean(c.intro, 400); } }
      } else fail(404, 'No existe esa configuración.');
      audit(st, env, staff, `Cambió la configuración: ${{ site: 'datos de la casa', pay: 'medios de pago', booking: 'reservas', hours: 'horarios de atención', giftcards: 'gift cards', resources: 'espacios', emails: 'emails', content: 'textos de la web' }[key] || key}`);
      return ok({ settings: S });
    }
  }

  if (A[0] === 'emails' && A[1] === 'templates' && method === 'GET') {
    ensure(st);
    const E = st.settings.emails;
    const site = { ...st.settings.site, publicUrl: env.publicUrl, reviewUrl: E.reviewUrl };
    return ok({ smtp: env.smtp ?? null, groups: GROUPS, vars: VARS, settings: { ...E, enabled: undefined, custom: undefined }, staffTo: staffTo(st),
      templates: Object.entries(TEMPLATES).map(([key, t]) => {
        const r = renderEmail(key, { ...sampleContext(key, site, env.now()), site }, E.custom[key] || {});
        return { key, group: t.group, label: t.label, to: t.to, when: t.when, enabled: E.enabled[key] !== false, custom: E.custom[key] || {}, defaults: r.defaults, subject: r.subject, html: r.html };
      }) });
  }
  if (A[0] === 'emails' && A[1] === 'preview' && method === 'POST') {
    if (!TEMPLATES[body.template]) fail(404, 'No existe ese email.');
    const site = { ...st.settings.site, publicUrl: env.publicUrl, reviewUrl: st.settings.emails?.reviewUrl || '' };
    const r = renderEmail(body.template, { ...sampleContext(body.template, site, env.now()), site }, { subject: clean(body.subject, 200), title: clean(body.title, 120), intro: clean(body.intro, 1500) });
    return ok({ subject: r.subject, html: r.html });
  }
  if (A[0] === 'emails' && A[1] === 'test' && method === 'POST') {
    if (!TEMPLATES[body.template] && body.template !== 'all') fail(404, 'No existe ese email.');
    if (!isEmail(body.to)) fail(422, 'Escribí el email al que querés mandar la prueba.');
    const site = { ...st.settings.site, publicUrl: env.publicUrl };
    const keys = body.template === 'all' ? Object.keys(TEMPLATES) : [body.template];
    for (const k of keys) await sendEmail(st, env, k, String(body.to).trim(), { ...sampleContext(k, site, env.now()), link: env.publicUrl + '/' }, { test: true });
    const last = st.emails.slice(-keys.length);
    return ok({ sent: keys.length, status: last.map((m) => m.status), subjects: last.map((m) => m.subject) });
  }
  if (A[0] === 'emails' && method === 'GET') {
    if (A[1]) { const m = st.emails.find((x) => x.id === Number(A[1])); if (!m) fail(404, 'No encontramos ese email.'); return ok({ email: m }); }
    return ok({ emails: [...st.emails].reverse().slice(0, 200).map(({ html, ...m }) => m), templates: Object.fromEntries(Object.entries(TEMPLATES).map(([k, t]) => [k, { label: t.label, to: t.to }])) });
  }
  if (A[0] === 'withdrawals') {
    if (method === 'GET') return ok({ withdrawals: [...st.withdrawals].reverse() });
    if (method === 'PATCH') { const w = st.withdrawals.find((x) => x.id === Number(A[1])); if (!w) fail(404, 'No encontrado.'); if (body.status) { w.status = clean(body.status, 20); audit(st, env, staff, `Arrepentimiento ${w.code}: ${w.status}`); } return ok({ withdrawal: w }); }
  }
  if (A[0] === 'users') {
    needAdmin(staff);
    // Se pueden crear usuarios con cualquiera de los roles; solo un web master crea (o quita) otro web master.
    const creatable = { ...(staff.role === 'webmaster' ? { webmaster: ROLES.webmaster } : {}), admin: ROLES.admin, staff: ROLES.staff, pro: ROLES.pro };
    if (method === 'GET') return ok({ users: st.staff.filter((u) => u.role !== 'pro' || u.password_hash).map(staffView), roles: creatable });
    if (method === 'POST') {
      const email = String(body.email || '').toLowerCase().trim();
      if (!isEmail(email)) fail(422, 'Revisá el email.');
      if (String(body.password || '').length < 10) fail(422, 'La contraseña necesita al menos 10 caracteres.');
      if (!creatable[body.role]) fail(422, body.role === 'webmaster' ? 'Solo un web master puede crear otro web master.' : 'Elegí un rol.');
      if (st.staff.some((u) => u.email === email)) fail(409, 'Ya hay un usuario con ese email.');
      const u = { id: ++st.ids.staff, email, name: clean(body.name, 80), role: body.role, password_hash: await env.hashPassword(String(body.password)), created_at: iso(env) };
      // Una asesora nueva atiende turnos: se le asignan los servicios y la comisión en Asesoras de belleza.
      if (u.role === 'pro') Object.assign(u, { active: true, specialty: clean(body.specialty, 80), services: [], pay: { type: 'comision', percent: 0, base: 0 } });
      st.staff.push(u);
      audit(st, env, staff, `Creó el usuario ${u.email} (${ROLES[u.role]})`);
      return ok({ user: staffView(u) });
    }
    if (method === 'DELETE') {
      const i = st.staff.findIndex((u) => u.id === Number(A[1]));
      if (i < 0) fail(404, 'No encontrado.');
      if (st.staff[i].id === staff.id) fail(409, 'No podés borrar tu propio usuario.');
      if (st.staff[i].role === 'webmaster' && staff.role !== 'webmaster') fail(403, 'Solo un web master puede quitar a otro web master.');
      if (isAdminRole(st.staff[i]) && st.staff.filter((u) => isAdminRole(u) && u.password_hash).length === 1 && st.staff[i].password_hash) fail(409, 'Tiene que quedar al menos un usuario de administración.');
      if (st.staff[i].role === 'pro') fail(409, 'A las asesoras se las da de baja desde Asesoras.');
      const [gone] = st.staff.splice(i, 1);
      audit(st, env, staff, `Quitó el acceso de ${gone.email}`);
      return ok({ ok: true });
    }
  }

  // Asesoras: ficha, servicios que hace, forma de pago y liquidación de comisiones (solo administración).
  if (A[0] === 'pros' && A[1] && A[2] === 'schedule') {
    needAdmin(staff);
    const p = prosAll(st).find((x) => x.id === Number(A[1]));
    if (!p) fail(404, 'No encontramos esa asesora.');
    return ok(await scheduleRoute(st, env, method, A.slice(3), body, p, staff));
  }
  if (A[0] === 'pros') {
    needAdmin(staff);
    const month = /^\d{4}-\d{2}$/.test(q.month || '') ? q.month : dayKey(localNow(env)).slice(0, 7);
    if (method === 'GET' && !A[1]) {
      const list = prosAll(st).sort((a, b) => (b.active !== false) - (a.active !== false) || a.name.localeCompare(b.name));
      return ok({ month, pay_types: PAY_TYPES, services: [...st.services].sort((a, b) => a.position - b.position).map((s) => ({ id: s.id, name: svcLabel(s), category: s.category, price: s.price, mode: s.mode })),
        pros: list.map((p) => { const r = commissionReport(st, env, p.id, month); return { ...proView(st, p), month: { done: r.done, next: r.next, sales: r.sales, earned: r.earned, upcoming: r.upcoming, base: r.base, total: r.total, projected: r.projected } }; }) });
    }
    if (method === 'POST' && !A[1]) {
      const u = await proInput(st, env, body);
      u.id = ++st.ids.staff; u.created_at = iso(env); u.role = 'pro';
      st.staff.push(u);
      audit(st, env, staff, `Creó la asesora ${u.name} · ${PAY_TYPES[u.pay.type]} ${u.pay.percent}%${u.pay.base ? ` + básico ${fmtMoney(u.pay.base)}` : ''}${u.password_hash ? ' · con acceso al panel' : ''}`, { pro_id: u.id });
      return ok({ pro: proView(st, u) });
    }
    const i = st.staff.findIndex((u) => u.id === Number(A[1]) && u.role === 'pro');
    if (i < 0) fail(404, 'No encontramos a esa asesora.');
    const p = st.staff[i];
    if (method === 'GET') return ok({ pro: proView(st, p), report: commissionReport(st, env, p.id, month), pay_types: PAY_TYPES,
      services: [...st.services].sort((a, b) => a.position - b.position).map((s) => ({ id: s.id, name: svcLabel(s), category: s.category, price: s.price, mode: s.mode })),
      audit: st.audit.filter((a) => a.user_id === p.id || a.pro_id === p.id).slice(-200).reverse().map(auditView) });
    if (method === 'PATCH') {
      const before = proView(st, p);
      const u = await proInput(st, env, body, p);
      st.staff[i] = u;
      const diff = [];
      if (before.name !== u.name) diff.push(`nombre ${before.name} → ${u.name}`);
      if (JSON.stringify(before.pay) !== JSON.stringify(proView(st, u).pay)) diff.push(`pago ${before.pay.label} ${before.pay.percent}%${before.pay.base ? ` + ${fmtMoney(before.pay.base)}` : ''} → ${PAY_TYPES[u.pay.type]} ${u.pay.percent}%${u.pay.base ? ` + ${fmtMoney(u.pay.base)}` : ''}`);
      if (before.services.join() !== (u.services || []).join()) diff.push(`servicios: ${proView(st, u).service_names.join(', ') || 'ninguno'}`);
      if (before.active !== (u.active !== false)) diff.push(u.active !== false ? 'reactivada' : 'dada de baja');
      if (body.password) diff.push('nueva contraseña');
      if (body.remove_access) diff.push('sin acceso al panel');
      if (PRO_FIELDS.some((k) => (before[k] || '') !== (u[k] || '')) || before.email !== (u.email || '')) diff.push('datos personales');
      if (body.name !== undefined) for (const b of st.bookings) if (b.pro_id === u.id) b.pro_name = u.name;
      audit(st, env, staff, `Editó a ${u.name}${diff.length ? ': ' + diff.join(' · ') : ''}`, { pro_id: u.id });
      return ok({ pro: proView(st, u) });
    }
    if (method === 'DELETE') {
      const keep = proKeep(st, p);
      if (keep.active) fail(409, `Tiene ${keep.active} turno${keep.active === 1 ? '' : 's'} por venir: reasignalos a otra asesora (o cancelalos) antes de borrarla.`);
      if (keep.done) fail(409, `Tiene ${keep.done} turno${keep.done === 1 ? '' : 's'} realizado${keep.done === 1 ? '' : 's'} con comisión: dala de baja en vez de borrarla, así queda su historial.`);
      // Los turnos cancelados o vencidos que tenía quedan sin asesora (con su nombre en el historial).
      for (const b of st.bookings) if (b.pro_id === p.id) { b.pro_id = null; b.history.push({ at: iso(env), text: `Se borró la asesora ${p.name}` }); }
      st.blocks = st.blocks.filter((k) => k.pro_id !== p.id);
      st.staff.splice(i, 1);
      audit(st, env, staff, `Borró la asesora ${p.name}`);
      return ok({ ok: true });
    }
  }

  // Historial de cambios del panel (solo administración).
  if (A[0] === 'audit' && method === 'GET') {
    needAdmin(staff);
    let list = [...st.audit].reverse();
    if (Number(q.user)) list = list.filter((a) => a.user_id === Number(q.user));
    if (q.q) { const t = String(q.q).toLowerCase(); list = list.filter((a) => `${a.user} ${a.action}`.toLowerCase().includes(t)); }
    if (isDate(q.from)) list = list.filter((a) => a.at.slice(0, 10) >= q.from);
    return ok({ audit: list.slice(0, 500).map(auditView), users: st.staff.map((u) => ({ id: u.id, name: u.name || u.email, role_label: ROLES[u.role] })) });
  }
  fail(404, 'No existe esa ruta.');
}

// ── Panel de las asesoras ───────────────────────────
// Ven solo sus turnos (sin email de la clienta), los servicios que hacen y sus comisiones. Pueden cancelar un turno suyo.
async function proRoute(st, env, method, A, q, body, me) {
  const mine = (b) => b.pro_id === me.id;
  const who = me.name || me.email;
  if (A[0] === 'schedule') return scheduleRoute(st, env, method, A.slice(1), body, me, me);
  // Sus clientas: ve la ficha y suma fotos de antes y después; no edita los datos.
  if (A[0] === 'clients') {
    const keys = new Set(st.bookings.filter((b) => mine(b) && b.status !== 'expired').map(clientKey));
    const own = (k) => { if (!keys.has(String(k || '').toLowerCase())) fail(404, 'No encontramos esa clienta.'); };
    if (method === 'GET' && !A[1]) { const r = clients(st, env, q); const list = r.clients.filter((c) => keys.has(c.key)); return { ...r, clients: list, total: list.length, summary: { ...r.summary, total: list.length } }; }
    if (method === 'GET' && A[1] === 'ficha') { own(q.key); return clientDetail(st, env, q.key); }
    if (method === 'POST' && A[1] === 'photos') { own(body.key); const r = await addClientPhoto(st, env, body, me); audit(st, env, me, `Sumó fotos de antes y después a ${r.client.name}`); return r; }
  }
  if (method === 'GET' && A[0] === 'dashboard') {
    const today = dayKey(localNow(env));
    const r = commissionReport(st, env, me.id, today.slice(0, 7));
    const next = st.bookings.filter((b) => mine(b) && b.start.slice(0, 10) >= today && ACTIVE.includes(b.status)).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 12);
    return { today, next: next.map((b) => proBooking(st, b)), month: { done: r.done, next: r.next, sales: r.sales, earned: r.earned, upcoming: r.upcoming, base: r.base, total: r.total, projected: r.projected, pay: r.pay } };
  }
  if (method === 'GET' && A[0] === 'agenda') {
    const date = isDate(q.date) ? q.date : dayKey(localNow(env));
    return { date, resources: st.settings.resources, hours: st.settings.hours[weekday(date)] || [], blocks: st.blocks.filter((k) => k.date === date), pros: [],
      bookings: st.bookings.filter((b) => mine(b) && b.start.startsWith(date) && b.status !== 'expired').sort((a, b) => a.start.localeCompare(b.start)).map((b) => proBooking(st, b)) };
  }
  if (A[0] === 'bookings' && method === 'GET' && !A[1]) {
    let list = st.bookings.filter((b) => mine(b) && b.status !== 'expired');
    if (q.status) list = list.filter((b) => b.status === q.status);
    if (isDate(q.from)) list = list.filter((b) => b.start >= q.from);
    if (isDate(q.to)) list = list.filter((b) => b.start.slice(0, 10) <= q.to);
    if (q.q) { const t = String(q.q).toLowerCase(); list = list.filter((b) => `${b.code} ${b.name} ${b.service_name}`.toLowerCase().includes(t)); }
    return { bookings: list.sort((a, b) => (q.order === 'asc' ? a.start.localeCompare(b.start) : b.start.localeCompare(a.start))).slice(0, 400).map((b) => proBooking(st, b)) };
  }
  if (A[0] === 'bookings' && A[1]) {
    const b = st.bookings.find((x) => x.id === Number(A[1]) && mine(x));
    if (!b) fail(404, 'No encontramos ese turno entre los tuyos.');
    if (method === 'GET') return { booking: proBooking(st, b), audit: st.audit.filter((a) => a.booking_id === b.id).slice(-30).reverse().map(auditView) };
    if (method === 'PATCH') {
      if (body.status !== 'cancelled' || Object.keys(body).some((k) => !['status', 'reason'].includes(k))) fail(403, 'Desde tu usuario solo podés cancelar un turno. Para otros cambios hablá con administración.');
      if (!ACTIVE.includes(b.status)) fail(409, 'Ese turno ya no está activo.');
      const reason = clean(body.reason, 200);
      if (reason.length < 3) fail(422, 'Contanos por qué se cancela (queda registrado).');
      await cancelBooking(st, env, b, who, { reason });
      audit(st, env, me, `Canceló el turno ${b.code} (${b.service_name} · ${b.start} · ${b.name}): ${reason}`, { booking_id: b.id });
      await sendEmail(st, env, 'staff_cancelled', staffTo(st), { booking: { ...b, items: null }, by: who, reason }, { booking_id: b.id });
      return { booking: proBooking(st, b) };
    }
  }
  if (method === 'GET' && A[0] === 'services') {
    const pay = payOf(me);
    return { services: st.services.filter((s) => (me.services || []).includes(s.id)).sort((a, b) => a.position - b.position).map((s) => ({ id: s.id, name: svcLabel(s), category: s.category, duration: s.duration, price: s.price, mode: s.mode, commission: Math.round((Number(s.price) || 0) * (pay.percent || 0) / 100) })),
      categories: st.settings.categories, resources: st.settings.resources, pay: { ...pay, label: PAY_TYPES[pay.type] } };
  }
  if (method === 'GET' && A[0] === 'commissions') return commissionReport(st, env, me.id, q.month);
  if (method === 'GET' && A[0] === 'audit') return { audit: st.audit.filter((a) => a.user_id === me.id).slice(-200).reverse().map(auditView) };
  fail(403, 'Tu usuario de asesora no tiene acceso a esta sección.');
}

// ── Cuentas de clientas ──────────────────────────────────
const customerView = (c) => ({ id: c.id, name: c.name, email: c.email, phone: c.phone, birthday: c.birthday || '', address: c.address || '', created_at: c.created_at });
/** Turnos y gift cards de una clienta: los suyos y los que reservó con el mismo email sin cuenta. */
function accountData(st, env, c) {
  // Una reserva con varios servicios se muestra una sola vez.
  const mine = st.bookings.filter((b) => b.customer_id === c.id || b.email === c.email).filter((b) => b.status !== 'expired' && (!b.group || groupOf(st, b)[0].id === b.id));
  const nowKey = msToLocal(env.now());
  const upcoming = mine.filter((b) => b.start >= nowKey.slice(0, 10) && ACTIVE.includes(groupView(st, b).status)).sort((a, b) => a.start.localeCompare(b.start));
  const past = mine.filter((b) => !upcoming.includes(b)).sort((a, b) => b.start.localeCompare(a.start)).slice(0, 30);
  const gifts = st.giftcards.filter((g) => g.status !== 'pending_payment' && (g.buyer_email === c.email || g.to_email === c.email)).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const done = mine.filter((b) => b.status === 'completed' && b.start <= nowKey).sort((a, b) => b.start.localeCompare(a.start));
  const last = done[0];
  const lastNotes = [...mine].sort((a, b) => b.created_at.localeCompare(a.created_at)).find((b) => b.notes)?.notes || '';
  const fav = Object.entries(done.reduce((m, b) => ((m[b.service_name] = (m[b.service_name] || 0) + 1), m), {})).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  return { customer: customerView(c), upcoming: upcoming.map((b) => publicBooking(st, env, b)), past: past.map((b) => publicBooking(st, env, b)), giftcards: gifts.map(publicGift),
    stats: { visits: done.length, lastVisit: last ? { start: last.start, when: longDate(last.start), service_name: last.service_name } : null, favorite: fav, lastNotes } };
}
async function accountRoute(st, env, method, action, body, req) {
  const email = String(body.email || '').toLowerCase().trim();
  if (method === 'POST' && action === 'register') {
    const e = {
      name: clean(body.name).length < 3 ? 'Escribí tu nombre y apellido.' : '',
      email: !isEmail(email) ? 'Revisá el email.' : st.customers.some((c) => c.email === email) || st.staff.some((u) => u.email === email) ? 'Ya hay una cuenta con ese email. Ingresá con tu contraseña.' : '',
      phone: digits(body.phone).length < 8 ? 'Dejanos un celular con WhatsApp.' : '',
      password: String(body.password || '').length < 8 ? 'La contraseña necesita al menos 8 caracteres.' : '',
    };
    errs(e);
    const c = { id: ++st.ids.customer, name: clean(body.name, 80), email, phone: clean(body.phone, 40), password_hash: await env.hashPassword(String(body.password)), created_at: iso(env) };
    st.customers.push(c);
    return { body: accountData(st, env, c), customerSession: { customer_id: c.id } };
  }
  if (method === 'POST' && action === 'login') {
    const pw = String(body.password || '');
    const c = st.customers.find((x) => x.email === email);
    if (c && await env.checkPassword(pw, c.password_hash)) return { body: accountData(st, env, c), customerSession: { customer_id: c.id } };
    // El equipo también puede entrar desde acá: se abre el panel.
    const u = st.staff.find((x) => x.email === email && x.password_hash && x.active !== false);
    if (u && await env.checkPassword(pw, u.password_hash)) return { body: { staff: staffView(u) }, session: { staff_id: u.id } };
    fail(401, 'Email o contraseña incorrectos.');
  }
  if (method === 'POST' && action === 'logout') return { body: { ok: true }, customerSession: null };
  // Recuperar contraseña: siempre responde lo mismo, exista o no la cuenta (así no se puede averiguar quién está registrado).
  if (method === 'POST' && action === 'forgot') {
    if (!isEmail(email)) fail(422, 'Escribí el email de tu cuenta.', { errors: { email: 'Escribí el email de tu cuenta.' } });
    const person = st.customers.find((x) => x.email === email) || st.staff.find((x) => x.email === email);
    if (person) {
      const recent = st.resets.filter((r) => r.email === email && Date.parse(r.created_at) > env.now() - 15 * 60e3).length;
      if (recent < 3) {
        const tk = token() + token();
        st.resets = st.resets.filter((r) => Date.parse(r.expires_at) > env.now() && !r.used).slice(-200);
        st.resets.push({ token: tk, email, kind: st.staff.includes(person) ? 'staff' : 'customer', created_at: iso(env), expires_at: new Date(env.now() + 3600e3).toISOString(), used: false });
        await sendEmail(st, env, 'password_reset', email, { person: { name: person.name || '', staff: st.staff.includes(person) }, resetLink: `${env.publicUrl}/#clave/${tk}` });
      }
    }
    return { body: { ok: true } };
  }
  if (action === 'reset') {
    const r = st.resets.find((x) => x.token === String(body.token || req.query?.token || ''));
    const valid = r && !r.used && Date.parse(r.expires_at) > env.now();
    if (method === 'GET') return { body: { valid: !!valid } };
    if (method !== 'POST') fail(404, 'No existe esa ruta.');
    if (!valid) fail(410, 'El link venció o ya se usó. Pedí uno nuevo desde "¿Te olvidaste la contraseña?".');
    const pw = String(body.password || '');
    if (pw.length < (r.kind === 'staff' ? 10 : 8)) fail(422, `La contraseña necesita al menos ${r.kind === 'staff' ? 10 : 8} caracteres.`, { errors: { password: `Al menos ${r.kind === 'staff' ? 10 : 8} caracteres.` } });
    r.used = true;
    st.resets.filter((x) => x.email === r.email).forEach((x) => (x.used = true));
    if (r.kind === 'staff') {
      const u = st.staff.find((x) => x.email === r.email); if (!u) fail(410, 'La cuenta ya no existe.');
      u.password_hash = await env.hashPassword(pw);
      return { body: { staff: staffView(u) }, session: { staff_id: u.id } };
    }
    const c = st.customers.find((x) => x.email === r.email); if (!c) fail(410, 'La cuenta ya no existe.');
    c.password_hash = await env.hashPassword(pw);
    return { body: accountData(st, env, c), customerSession: { customer_id: c.id } };
  }
  const c = req.customer;
  if (!c) fail(401, 'Ingresá a tu cuenta.');
  if (method === 'GET' && action === 'me') return { body: accountData(st, env, c) };
  if (method === 'PATCH' && action === 'me') {
    if (body.name !== undefined) { if (clean(body.name).length < 3) fail(422, 'Escribí tu nombre y apellido.'); c.name = clean(body.name, 80); }
    if (body.phone !== undefined) { if (digits(body.phone).length < 8) fail(422, 'Revisá el celular.'); c.phone = clean(body.phone, 40); }
    if (body.birthday !== undefined) c.birthday = /^\d{4}-\d{2}-\d{2}$/.test(String(body.birthday)) ? body.birthday : '';
    if (body.address !== undefined) c.address = clean(body.address, 160);
    // Lo que carga la clienta también queda en su ficha del CRM.
    if (body.birthday !== undefined || body.address !== undefined) { const k = c.email.toLowerCase(); st.crm[k] = { notes: '', preferences: '', tags: [], ...(st.crm[k] || {}), birthday: c.birthday || '', address: c.address || '', updated_at: iso(env), updated_by: 'la clienta' }; }
    if (body.password) {
      if (!(await env.checkPassword(String(body.current || ''), c.password_hash))) fail(422, 'La contraseña actual no es correcta.');
      if (String(body.password).length < 8) fail(422, 'La contraseña nueva necesita al menos 8 caracteres.');
      c.password_hash = await env.hashPassword(String(body.password));
    }
    return { body: accountData(st, env, c) };
  }
  fail(404, 'No existe esa ruta.');
}
export async function addCustomer(st, env, { email, password, name, phone = '' }) {
  ensure(st);
  const c = { id: ++st.ids.customer, name, email: String(email).toLowerCase().trim(), phone, password_hash: await env.hashPassword(String(password)), created_at: iso(env) };
  st.customers.push(c);
  return c;
}

/** Crea un usuario del panel (para el primer arranque o el script create-admin). */
export async function addStaff(st, env, { email, password, name = '', role = 'admin', services, pay, specialty }) {
  const u = { id: ++st.ids.staff, email: String(email).toLowerCase().trim(), name, role, password_hash: await env.hashPassword(String(password)), created_at: iso(env) };
  if (role === 'pro') Object.assign(u, { active: true, specialty: specialty || '', pay: pay || { type: 'comision', percent: 40, base: 0 },
    services: (services || []).map((x) => (typeof x === 'number' ? x : st.services.find((s) => s.slug === x)?.id)).filter(Boolean) });
  st.staff.push(u);
  return u;
}
