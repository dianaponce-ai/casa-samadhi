// Servidor de prueba para la vista previa: usa la misma lógica que el servidor real (spa-core),
// pero guarda todo en este navegador. Mercado Pago y los emails quedan simulados.
const C = window.__CORE;
const KEY = 'casa-samadhi-demo-v3';
const DEMO_USERS = window.__CASA_DEMO_USERS;
const base = location.href.split('#')[0].split('?')[0].replace(/\/$/, '');
const env = {
  now: () => Date.now(),
  publicUrl: base,
  mock: true,
  smtp: 'demo',
  createPayment: async ({ kind, token }) => `#pago/${kind}/${token}`,
  sendEmail: async () => 'ok',
  hashPassword: async (pw) => 'demo$' + pw,
  checkPassword: async (pw, h) => h === 'demo$' + pw,
};

function seedDemo() {
  const st = C.seedState();
  st.customers = [];
  for (const u of DEMO_USERS) {
    if (u.kind === 'staff') st.staff.push({ id: ++st.ids.staff, email: u.email, name: u.name, role: u.role, password_hash: 'demo$' + u.password, created_at: new Date().toISOString() });
    else st.customers.push({ id: (st.ids.customer = (st.ids.customer || 0) + 1), email: u.email, name: u.name, phone: u.phone, password_hash: 'demo$' + u.password, created_at: new Date(Date.now() - 40 * 864e5).toISOString() });
  }
  st.settings.booking.staffEmails = 'turnos@casasamadhi.demo';
  // Turnos de ejemplo: los últimos 90 días y las próximas dos semanas.
  let seed = 11; const r = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const names = ['Lucía Fernández', 'Carolina Gómez', 'Florencia Díaz', 'Julieta Romero', 'Agustina Pereyra', 'Sofía Martínez', 'Valeria Sosa', 'Camila Benítez', 'Mariana López', 'Paula Acosta', 'Natalia Ruiz', 'Victoria Medina'];
  const online = st.services.filter((s) => s.mode === 'online');
  const today = C.dayKey(C.localNow(env));
  for (let i = -90; i <= 14; i++) {
    const date = C.addDays(today, i);
    const n = Math.floor(r() * 4);
    for (let k = 0; k < n; k++) {
      const s = online[Math.floor(r() ** 1.6 * online.length)];
      let slots = C.slotsFor(st, env, s, date, { staff: true });
      // En días pasados ya no hay horarios libres: se usan horarios típicos (de lunes a sábado).
      if (!slots.length && i < 0 && new Date(date + 'T12:00:00Z').getUTCDay() !== 0) slots = ['10:00', '11:30', '13:00', '15:00', '16:30', '17:30'].filter((t) => !st.bookings.some((b) => b.start === `${date} ${t}` && b.resource === s.resource));
      if (!slots.length) continue;
      const time = slots[Math.floor(r() * slots.length)];
      const name = names[Math.floor(r() * names.length)];
      const dep = Math.round(s.price * 0.3 / 100) * 100;
      const past = i < 0 || (i === 0 && false);
      const status = past ? (r() < 0.08 ? 'no_show' : r() < 0.06 ? 'cancelled' : 'completed') : 'confirmed';
      const created = new Date(C.localToMs(`${date} ${time}`) - (2 + r() * 8) * 864e5).toISOString();
      st.bookings.push({ id: ++st.ids.booking, code: `T-${++st.ids.bookingNumber}`, token: Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2), service_id: s.id, service_name: s.name + (s.tag && s.category === 'manicuria' ? ` · ${s.tag}` : ''), resource: s.resource,
        start: `${date} ${time}`, duration: s.duration, price: s.price, deposit: dep, deposit_due: dep, deposit_paid: r() < 0.85 ? dep : 0, gift_id: null, gift_code: '', gift_applied: 0,
        name, email: name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(' ', '.') + '@ejemplo.com', phone: `221 5${Math.floor(10 + r() * 89)}-${Math.floor(1000 + r() * 8999)}`, notes: '', status, source: r() < 0.75 ? 'web' : 'panel', created_at: created,
        hold_until: created, reminded: past, thanked: past, refund_pending: false, pay_url: null, payment_id: null, history: [{ at: created, text: 'Reserva de ejemplo' }] });
    }
  }
  // Gift cards de ejemplo
  const gifts = [['Martina Herrera', 'Ritual esencial', 55000, 'Para tu cumple, ¡a relajarse!'], ['Ignacio Paz', '', 80000, ''], ['Laura Castro', 'Ritual profundo con pindas', 80000, 'Gracias por todo, mamá']];
  gifts.forEach(([buyer, svc, amount, msg], i) => {
    const created = new Date(Date.now() - (5 + i * 7) * 864e5).toISOString();
    st.giftcards.push({ id: ++st.ids.gift, code: `CS-DEMO-${i + 1}${'ABC'[i]}${'XYZ'[i]}2`, token: 'demo' + i + Math.random().toString(36).slice(2), amount, balance: i === 1 ? 30000 : amount, service_id: null, service_name: svc, buyer_name: buyer, buyer_email: buyer.toLowerCase().replace(' ', '.') + '@ejemplo.com', to_name: '', to_email: '', message: msg, send_to_recipient: false,
      status: 'active', source: i === 1 ? 'local' : 'web', created_at: created, paid_at: created, expires_at: new Date(Date.now() + (170 - i * 7) * 864e5).toISOString(), pay_url: null, payment_id: null, history: [{ at: created, amount, note: 'Gift card de ejemplo' }, ...(i === 1 ? [{ at: created, amount: -50000, note: 'Usada en la casa' }] : [])] });
  });
  // La clienta de prueba: un turno por delante, uno realizado y una gift card que le regalaron.
  const cl = DEMO_USERS.find((u) => u.kind === 'customer');
  const mk = (slug, date, status, notes = '') => {
    const s = st.services.find((x) => x.slug === slug);
    const time = C.slotsFor(st, env, s, date, { staff: true })[0] || '11:00';
    const dep = Math.round(s.price * 0.3 / 100) * 100, created = new Date(C.localToMs(`${date} ${time}`) - 5 * 864e5).toISOString();
    st.bookings.push({ id: ++st.ids.booking, code: `T-${++st.ids.bookingNumber}`, token: 'cl' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2), service_id: s.id, service_name: s.name, resource: s.resource,
      start: `${date} ${time}`, duration: s.duration, price: s.price, deposit: dep, deposit_due: dep, deposit_paid: dep, gift_id: null, gift_code: '', gift_applied: 0, name: cl.name, email: cl.email, phone: cl.phone, notes,
      status, source: 'web', created_at: created, customer_id: 1, hold_until: created, reminded: status !== 'confirmed', thanked: true, refund_pending: false, pay_url: null, payment_id: 'SIM-1', history: [{ at: created, text: 'Reserva de ejemplo' }] });
  };
  let up = C.addDays(today, 3); while (new Date(up + 'T12:00:00Z').getUTCDay() === 0) up = C.addDays(up, 1);
  let past = C.addDays(today, -12); while (new Date(past + 'T12:00:00Z').getUTCDay() === 0) past = C.addDays(past, -1);
  const notSunday = (d) => { while (new Date(d + 'T12:00:00Z').getUTCDay() === 0) d = C.addDays(d, -1); return d; };
  mk('ritual-esencial', notSunday(C.addDays(today, -96)), 'completed', 'Primera vez en un head spa. Cuero cabelludo sensible.');
  mk('masoterapia-relajante', notSunday(C.addDays(today, -61)), 'completed', 'Contractura en el cuello, presión suave por favor.');
  mk('ritual-esencial', notSunday(C.addDays(today, -34)), 'completed', 'Contractura en el cuello, presión suave por favor.');
  mk('ritual-esencial', up, 'confirmed', 'Contractura en el cuello, presión suave por favor.');
  mk('esmaltado-semipermanente', past, 'completed');
  // Ficha de la clienta de prueba en el CRM
  st.crm = st.crm || {};
  st.crm[cl.email] = { notes: 'Viene los sábados a la mañana. Le encantó el ritual esencial; ofrecerle el profundo con pindas (tiene una gift card para usarlo). Recomendó la casa a dos amigas.', preferences: 'Presión suave en el cuello · aceite de lavanda · té verde sin azúcar', birthday: `1990-${today.slice(5, 7)}-${String(Math.min(28, Number(today.slice(8, 10)) + 9)).padStart(2, '0')}`, tags: ['Frecuente', 'Cumpleaños'], updated_at: new Date(Date.now() - 3 * 864e5).toISOString(), updated_by: 'Recepción (prueba)' };
  const gc = new Date(Date.now() - 20 * 864e5).toISOString();
  st.giftcards.push({ id: ++st.ids.gift, code: 'CS-LUCI-A26X', token: 'clgift' + Math.random().toString(36).slice(2), amount: 80000, balance: 80000, service_id: null, service_name: 'Ritual profundo con pindas', buyer_name: 'Carolina Gómez', buyer_email: 'carolina.gomez@ejemplo.com', to_name: cl.name, to_email: cl.email, message: '¡Feliz cumple, amiga! Te lo merecés.', send_to_recipient: true,
    status: 'active', source: 'web', created_at: gc, paid_at: gc, expires_at: new Date(Date.now() + 160 * 864e5).toISOString(), pay_url: null, payment_id: 'SIM-2', history: [{ at: gc, amount: 80000, note: 'Gift card de ejemplo' }] });
  return st;
}
let st;
try { const raw = localStorage.getItem(KEY); st = raw ? JSON.parse(raw) : null; } catch { st = null; }
if (!st || st.v !== C.STATE_VERSION) st = seedDemo();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch {} };
save();
let staffId = null, customerId = null;
try { staffId = Number(sessionStorage.getItem(KEY + '-staff')) || null; customerId = Number(localStorage.getItem(KEY + '-cliente')) || null; } catch {}

async function call(path, { method = 'GET', body } = {}) {
  const [p, qs] = path.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  const staff = st.staff.find((u) => u.id === staffId) || null;
  const customer = (st.customers || []).find((c) => c.id === customerId) || null;
  try {
    const out = await C.handle(st, env, { method, path: p, query, body: body ? JSON.parse(JSON.stringify(body)) : {}, staff, customer });
    if (out.session !== undefined) { staffId = out.session?.staff_id || null; try { sessionStorage.setItem(KEY + '-staff', staffId || ''); } catch {} }
    if (out.customerSession !== undefined) { customerId = out.customerSession?.customer_id || null; try { localStorage.setItem(KEY + '-cliente', customerId || ''); } catch {} }
    if (method !== 'GET') save();
    return JSON.parse(JSON.stringify(out.body));
  } catch (e) {
    if (method !== 'GET') { try { st = JSON.parse(localStorage.getItem(KEY)); } catch {} }
    const err = new Error(e.message); err.status = e.status || 500; err.data = { error: e.message, ...(e.extra || {}) };
    if (!(e instanceof C.ApiError)) console.error(e);
    throw err;
  }
}
window.__CASA_API = (path, opts) => call(path, opts);
window.__CASA_ADMIN_API = (path, opts) => call('/api/admin' + path, opts);
window.__CASA_DEMO_RESET_LINK = () => { const m = [...st.emails].reverse().find((x) => x.template === 'password_reset'); return m ? (m.html.match(/#clave\/[A-Za-z0-9]+/) || [])[0] : null; };
window.__CASA_RESET = () => { try { localStorage.removeItem(KEY); localStorage.removeItem(KEY + '-cliente'); sessionStorage.removeItem(KEY + '-staff'); } catch {} };
setInterval(async () => { if (await C.tick(st, env)) save(); }, 30e3);
C.tick(st, env).then((c) => c && save());
