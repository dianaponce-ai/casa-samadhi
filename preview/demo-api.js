// Servidor de prueba para la vista previa: usa la misma lógica que el servidor real (spa-core),
// pero guarda todo en este navegador. Mercado Pago y los emails quedan simulados.
const C = window.__CORE;
const KEY = 'casa-samadhi-demo-v1';
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
export const DEMO_ADMIN = { email: 'admin@casasamadhi.demo', password: 'casasamadhi2026', name: 'Administración (demo)' };

function seedDemo() {
  const st = C.seedState();
  st.staff.push({ id: ++st.ids.staff, email: DEMO_ADMIN.email, name: DEMO_ADMIN.name, role: 'admin', password_hash: 'demo$' + DEMO_ADMIN.password, created_at: new Date().toISOString() });
  st.staff.push({ id: ++st.ids.staff, email: 'recepcion@casasamadhi.demo', name: 'Recepción (demo)', role: 'staff', password_hash: 'demo$recepcion2026', created_at: new Date().toISOString() });
  st.settings.booking.staffEmails = 'turnos@casasamadhi.demo';
  // Turnos de ejemplo: los últimos 30 días y las próximas dos semanas.
  let seed = 11; const r = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const names = ['Lucía Fernández', 'Carolina Gómez', 'Florencia Díaz', 'Julieta Romero', 'Agustina Pereyra', 'Sofía Martínez', 'Valeria Sosa', 'Camila Benítez', 'Mariana López', 'Paula Acosta', 'Natalia Ruiz', 'Victoria Medina'];
  const online = st.services.filter((s) => s.mode === 'online');
  const today = C.dayKey(C.localNow(env));
  for (let i = -30; i <= 14; i++) {
    const date = C.addDays(today, i);
    const n = Math.floor(r() * 4);
    for (let k = 0; k < n; k++) {
      const s = online[Math.floor(r() ** 1.6 * online.length)];
      const slots = C.slotsFor(st, env, s, date, { staff: true });
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
        hold_until: created, reminded: past, refund_pending: false, pay_url: null, payment_id: null, history: [{ at: created, text: 'Reserva de ejemplo' }] });
    }
  }
  // Gift cards de ejemplo
  const gifts = [['Martina Herrera', 'Ritual esencial', 55000, 'Para tu cumple, ¡a relajarse!'], ['Ignacio Paz', '', 80000, ''], ['Laura Castro', 'Ritual profundo con pindas', 80000, 'Gracias por todo, mamá']];
  gifts.forEach(([buyer, svc, amount, msg], i) => {
    const created = new Date(Date.now() - (5 + i * 7) * 864e5).toISOString();
    st.giftcards.push({ id: ++st.ids.gift, code: `CS-DEMO-${i + 1}${'ABC'[i]}${'XYZ'[i]}2`, token: 'demo' + i + Math.random().toString(36).slice(2), amount, balance: i === 1 ? 30000 : amount, service_id: null, service_name: svc, buyer_name: buyer, buyer_email: buyer.toLowerCase().replace(' ', '.') + '@ejemplo.com', to_name: '', to_email: '', message: msg, send_to_recipient: false,
      status: 'active', source: i === 1 ? 'local' : 'web', created_at: created, paid_at: created, expires_at: new Date(Date.now() + (170 - i * 7) * 864e5).toISOString(), pay_url: null, payment_id: null, history: [{ at: created, amount, note: 'Gift card de ejemplo' }, ...(i === 1 ? [{ at: created, amount: -50000, note: 'Usada en la casa' }] : [])] });
  });
  return st;
}
let st;
try { const raw = localStorage.getItem(KEY); st = raw ? JSON.parse(raw) : null; } catch { st = null; }
if (!st || st.v !== C.STATE_VERSION) st = seedDemo();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch {} };
save();
let staffId = null;
try { staffId = Number(sessionStorage.getItem(KEY + '-staff')) || null; } catch {}

async function call(path, { method = 'GET', body } = {}) {
  const [p, qs] = path.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  const staff = st.staff.find((u) => u.id === staffId) || null;
  try {
    const out = await C.handle(st, env, { method, path: p, query, body: body ? JSON.parse(JSON.stringify(body)) : {}, staff });
    if (out.session !== undefined) { staffId = out.session?.staff_id || null; try { sessionStorage.setItem(KEY + '-staff', staffId || ''); } catch {} }
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
window.__CASA_RESET = () => { try { localStorage.removeItem(KEY); sessionStorage.removeItem(KEY + '-staff'); } catch {} };
window.__CASA_DEMO_LOGIN = async () => { await call('/api/admin/login', { method: 'POST', body: { email: DEMO_ADMIN.email, password: DEMO_ADMIN.password } }); };
setInterval(async () => { if (await C.tick(st, env)) save(); }, 30e3);
C.tick(st, env).then((c) => c && save());
