// Servidor de prueba para la vista previa: usa la misma lógica que el servidor real (spa-core),
// pero guarda todo en este navegador. Mercado Pago y los emails quedan simulados.
const C = window.__CORE;
const KEY = 'casa-samadhi-demo-v5';
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
  // En la demo las fotos quedan en el navegador (ya vienen achicadas desde el panel).
  saveImage: async (dataUrl) => { if (!/^data:image\/(webp|jpeg|png);base64,/.test(String(dataUrl || ''))) throw new C.ApiError(422, 'Elegí una foto (JPG, PNG o WEBP).'); return dataUrl; },
};

function seedDemo() {
  const st = C.seedState();
  st.customers = [];
  const slugIds = (list) => list.map((x) => st.services.find((s) => s.slug === x)?.id).filter(Boolean);
  for (const u of DEMO_USERS) {
    // En la demo, el acceso de asesora de prueba es el de Trinidad (head spa).
    const tri = u.role === 'pro' && st.staff.find((x) => x.role === 'pro' && x.name === 'Trinidad');
    if (tri) { Object.assign(tri, { email: u.email, password_hash: 'demo$' + u.password, phone: '221 555-4010', pay: u.pay }); continue; }
    if (u.kind === 'staff') st.staff.push({ id: ++st.ids.staff, email: u.email, name: u.name, role: u.role, password_hash: 'demo$' + u.password, created_at: new Date(Date.now() - 120 * 864e5).toISOString(),
      ...(u.role === 'pro' ? { active: true, specialty: u.specialty, phone: '221 555-4010', services: slugIds(u.services), pay: u.pay } : {}) });
    else st.customers.push({ id: (st.ids.customer = (st.ids.customer || 0) + 1), email: u.email, name: u.name, phone: u.phone, password_hash: 'demo$' + u.password, created_at: new Date(Date.now() - 40 * 864e5).toISOString() });
  }
  st.settings.booking.staffEmails = 'turnos@casasamadhi.demo';
  // Asesoras: Trinidad (head spa) y Belén (manicuría) ya vienen en los datos iniciales; en la demo, con comisión de ejemplo.
  const bel = st.staff.find((x) => x.role === 'pro' && x.name === 'Belén');
  if (bel) Object.assign(bel, { phone: '221 555-4020', pay: { type: 'comision', percent: 40, base: 0 } });
  st.settings.pay = { ...st.settings.pay, transferEnabled: true, alias: 'ALIAS.DE.PRUEBA', holder: 'Casa Samadhi (datos de prueba)', bank: 'Banco de ejemplo' };
  // Turnos de ejemplo: los últimos 90 días y las próximas dos semanas.
  let seed = 11; const r = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const names = ['Lucía Fernández', 'Carolina Gómez', 'Florencia Díaz', 'Julieta Romero', 'Agustina Pereyra', 'Sofía Martínez', 'Valeria Sosa', 'Camila Benítez', 'Mariana López', 'Paula Acosta', 'Natalia Ruiz', 'Victoria Medina',
    'Rocío Giménez', 'Milagros Torres', 'Antonella Ríos', 'Daiana Morales', 'Brenda Castro', 'Micaela Suárez', 'Lorena Vega', 'Silvina Rojas', 'Gabriela Molina', 'Ana Clara Ortiz', 'Josefina Luna', 'Celeste Ramírez', 'Pilar Domínguez', 'Melina Navarro', 'Romina Ferreyra', 'Guadalupe Sánchez'];
  const mail = (n) => n.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ /g, '.') + '@ejemplo.com';
  const nowL = C.localNow(env), nowHM = `${String(nowL.getUTCHours()).padStart(2, '0')}:${String(nowL.getUTCMinutes()).padStart(2, '0')}`;
  const TYP = ['10:00', '11:00', '11:30', '13:00', '14:00', '15:00', '16:30', '17:30', '18:00'];
  const online = st.services.filter((s) => s.mode === 'online');
  const today = C.dayKey(C.localNow(env));
  for (let i = -90; i <= 14; i++) {
    const date = C.addDays(today, i);
    const n = 1 + Math.floor(r() * 5);
    for (let k = 0; k < n; k++) {
      const s = online[Math.floor(r() ** 1.6 * online.length)];
      let slots = i === 0 ? TYP.filter((t) => !st.bookings.some((b) => b.start === `${date} ${t}` && b.resource === s.resource)) : C.slotsFor(st, env, s, date, { staff: true });
      // En días pasados ya no hay horarios libres: se usan horarios típicos (de lunes a sábado).
      if (!slots.length && i < 0 && new Date(date + 'T12:00:00Z').getUTCDay() !== 0) slots = ['10:00', '11:30', '13:00', '15:00', '16:30', '17:30'].filter((t) => !st.bookings.some((b) => b.start === `${date} ${t}` && b.resource === s.resource));
      if (!slots.length) continue;
      const time = slots[Math.floor(r() * slots.length)];
      const name = names[Math.floor(r() * names.length)];
      const dep = Math.round(s.price * 0.3 / 100) * 100;
      const past = i < 0 || (i === 0 && time < nowHM);
      const status = past ? (r() < 0.08 ? 'no_show' : r() < 0.06 ? 'cancelled' : 'completed') : 'confirmed';
      // Se reservó (y pagó la seña) entre 2 y 9 días antes, en horario normal, y nunca después de ahora.
      const cDay = C.addDays(date, -(2 + Math.floor(r() * 8))), cHM = `${String(9 + Math.floor(r() * 13)).padStart(2, '0')}:${['05', '20', '35', '50'][Math.floor(r() * 4)]}`;
      const created = new Date(Math.min(C.localToMs(`${cDay} ${cHM}`), Date.now() - (1 + r() * 20) * 3600e3)).toISOString();
      st.bookings.push({ id: ++st.ids.booking, code: `T-${++st.ids.bookingNumber}`, token: Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2), service_id: s.id, service_name: s.name + (s.tag && s.category === 'manicuria' ? ` · ${s.tag}` : ''), resource: s.resource,
        start: `${date} ${time}`, duration: s.duration, price: s.price, deposit: dep, deposit_due: dep, deposit_paid: r() < 0.85 ? dep : 0, deposit_at: created, gift_id: null, gift_code: '', gift_applied: 0,
        name, email: mail(name), phone: `221 5${Math.floor(10 + r() * 89)}-${Math.floor(1000 + r() * 8999)}`, notes: '', status, source: r() < 0.75 ? 'web' : 'panel', created_at: created,
        hold_until: created, reminded: past, thanked: past, refund_pending: false, pay_url: null, payment_id: null, history: [{ at: created, text: 'Reserva de ejemplo' }] });
    }
  }
  // Gift cards de ejemplo
  const gifts = [['Martina Herrera', 'Ritual esencial', 60000, 'Para tu cumple, ¡a relajarse!'], ['Ignacio Paz', '', 90000, ''], ['Laura Castro', 'Ritual profundo con pindas', 90000, 'Gracias por todo, mamá']];
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
  mk('ritual-profundo', notSunday(C.addDays(today, -61)), 'completed', 'Contractura en el cuello, presión suave por favor.');
  mk('ritual-esencial', notSunday(C.addDays(today, -34)), 'completed', 'Contractura en el cuello, presión suave por favor.');
  mk('ritual-esencial', up, 'confirmed', 'Contractura en el cuello, presión suave por favor.');
  mk('esmaltado-semipermanente', past, 'completed');
  // Ficha de la clienta de prueba en el CRM
  st.crm = st.crm || {};
  st.crm[cl.email] = { notes: 'Viene los sábados a la mañana. Le encantó el ritual esencial; ofrecerle el profundo con pindas (tiene una gift card para usarlo). Recomendó la casa a dos amigas.', preferences: 'Presión suave en el cuello · aceite de lavanda · té verde sin azúcar', birthday: `1990-${today.slice(5, 7)}-${String(Math.min(28, Number(today.slice(8, 10)) + 9)).padStart(2, '0')}`, tags: ['Frecuente', 'Cumpleaños'], updated_at: new Date(Date.now() - 3 * 864e5).toISOString(), updated_by: 'Recepción (prueba)' };
  const gc = new Date(Date.now() - 20 * 864e5).toISOString();
  st.giftcards.push({ id: ++st.ids.gift, code: 'CS-LUCI-A26X', token: 'clgift' + Math.random().toString(36).slice(2), amount: 90000, balance: 90000, service_id: null, service_name: 'Ritual profundo con pindas', buyer_name: 'Carolina Gómez', buyer_email: 'carolina.gomez@ejemplo.com', to_name: cl.name, to_email: cl.email, message: '¡Feliz cumple, amiga! Te lo merecés.', send_to_recipient: true,
    status: 'active', source: 'web', created_at: gc, paid_at: gc, expires_at: new Date(Date.now() + 160 * 864e5).toISOString(), pay_url: null, payment_id: 'SIM-2', history: [{ at: gc, amount: 90000, note: 'Gift card de ejemplo' }] });
  // Cada turno de ejemplo queda a nombre de una asesora que hace ese servicio (y está libre).
  const pros = st.staff.filter((u) => u.role === 'pro');
  for (const b of [...st.bookings].sort((a, c) => a.start.localeCompare(c.start))) {
    const can = pros.filter((p) => p.services.includes(b.service_id));
    const free = can.filter((p) => !st.bookings.some((x) => x !== b && x.pro_id === p.id && x.start.slice(0, 10) === b.start.slice(0, 10) && Math.abs(Date.parse(x.start.replace(' ', 'T')) - Date.parse(b.start.replace(' ', 'T'))) < Math.max(x.duration, b.duration) * 60e3));
    const p = free[Math.floor(r() * free.length)] || can[0];
    if (p) { b.pro_id = p.id; b.pro_name = p.name; if (b.status === 'completed') b.commission_percent = p.pay.percent; }
    b.pay_method = b.deposit_paid ? (r() < 0.8 ? 'mp' : 'transfer') : 'none';
  }
  // Una reserva esperando transferencia, para ver cómo se confirma.
  const t = C.addDays(today, 2) ;
  const s1 = st.services.find((s) => s.slug === 'ritual-esencial');
  const tt = C.slotsFor(st, env, s1, t, { staff: true }).find((x) => x >= '15:00') || '16:00';
  const p1 = pros.find((p) => p.services.includes(s1.id));
  const cr = new Date(Date.now() - 2 * 3600e3).toISOString();
  st.bookings.push({ id: ++st.ids.booking, code: `T-${++st.ids.bookingNumber}`, token: 'tr' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2), group: null, service_id: s1.id, service_name: s1.name, resource: s1.resource,
    pro_id: p1?.id || null, pro_name: p1?.name || '', start: `${t} ${tt}`, duration: s1.duration, price: s1.price, deposit: 18000, deposit_due: 18000, deposit_paid: 0, gift_id: null, gift_code: '', gift_applied: 0,
    name: 'Martina Herrera', email: 'martina.herrera@ejemplo.com', phone: '221 555-6611', notes: '', status: 'pending_transfer', source: 'web', created_at: cr, pay_method: 'transfer', transfer_notified: new Date(Date.now() - 3600e3).toISOString(),
    hold_until: new Date(Date.now() + 10 * 3600e3).toISOString(), reminded: false, refund_pending: false, pay_url: null, payment_id: null, history: [{ at: cr, text: 'Reservado: seña de $ 18.000 por transferencia, a verificar' }, { at: new Date(Date.now() - 3600e3).toISOString(), text: 'La clienta avisó que ya transfirió' }] });

  // ── Más datos de prueba: CRM completo, fotos, clientas cargadas a mano, gift cards, eventos y caja ──
  const pick = (a) => a[Math.floor(r() * a.length)];
  const barrios = ['Centro, La Plata', 'City Bell', 'Gonnet', 'Tolosa', 'Los Hornos', 'Villa Elisa', 'Berisso', 'Ensenada', 'Barrio Norte, La Plata', 'La Loma', 'Villa Castells', 'Ringuelet', 'Meridiano V'];
  const prefs = ['Presión suave en el cuello · aceite de lavanda', 'Prefiere té verde sin azúcar', 'Le gustan los tonos nude y rosados', 'Uñas cortas, forma almendra', 'Alérgica al látex', 'Cuero cabelludo sensible: agua tibia, no caliente', 'Prefiere música suave y poca charla', 'Café con leche de almendras', 'Le gusta probar colores de temporada', 'Embarazada: evitar aceites esenciales fuertes'];
  const notesL = ['Muy puntual. Le gusta reservar los sábados.', 'Vino recomendada por una amiga.', 'Ofrecerle el ritual profundo la próxima.', 'Siempre pide a la misma asesora.', 'Le regalaron una gift card para su cumple.', 'Pregunta por los talleres del patio.', ''];
  const tagsL = ['VIP', 'Frecuente', 'Nueva', 'Regalo', 'Sensible', 'Embarazada'];
  const bday = () => `${1972 + Math.floor(r() * 30)}-${String(1 + Math.floor(r() * 12)).padStart(2, '0')}-${String(1 + Math.floor(r() * 28)).padStart(2, '0')}`;
  const thisMonth = today.slice(5, 7);
  const admU = st.staff.find((u) => u.role === 'admin'), recU = st.staff.find((u) => u.role === 'staff');
  names.forEach((n, i) => {
    const k = mail(n);
    if (st.crm[k]) return;
    const visits = st.bookings.filter((b) => b.email === k && b.status === 'completed').length;
    const tags = [...new Set([visits >= 6 ? 'Frecuente' : visits <= 1 ? 'Nueva' : '', r() < 0.15 ? 'VIP' : '', r() < 0.12 ? pick(tagsL) : ''].filter(Boolean))];
    // Algunas cumplen este mes, para ver el filtro de cumpleaños.
    const birthday = i % 6 === 0 ? `${1980 + (i % 20)}-${thisMonth}-${String(5 + (i % 20)).padStart(2, '0')}` : bday();
    st.crm[k] = { birthday, address: pick(barrios), tags, preferences: r() < 0.7 ? pick(prefs) : '', notes: pick(notesL), photos: [], updated_at: new Date(Date.now() - (2 + i) * 864e5).toISOString(), updated_by: i % 2 ? 'Recepción (prueba)' : 'Administración (prueba)' };
  });
  // Fotos de antes y después en las clientas de manicuría (las hace Belén).
  const fotos = { 'esmaltado-semipermanente': ['media/trabajos/semi-verde-oliva.webp', 'media/trabajos/semi-negro-glitter.webp'], 'soft-gel': ['media/trabajos/softgel-rosa-glitter.webp'], dipping: ['media/trabajos/dipping-blanco-lechoso.webp'] };
  const slugOf = Object.fromEntries(st.services.map((x) => [x.id, x.slug]));
  st.bookings.filter((b) => b.status === 'completed' && fotos[slugOf[b.service_id]] && r() < 0.35).slice(-24).forEach((b, i) => {
    const m = st.crm[b.email] || (st.crm[b.email] = { notes: '', preferences: '', birthday: '', tags: [], photos: [] });
    m.photos = m.photos || [];
    if (m.photos.length >= 3) return;
    m.photos.unshift({ id: 'fdemo' + i, after: pick(fotos[slugOf[b.service_id]]), before: '', note: b.service_name, date: b.start.slice(0, 10), by: b.pro_name || 'Belén', at: new Date(C.localToMs(b.start) + 3600e3).toISOString() });
  });
  // Clientas cargadas a mano (todavía no reservaron).
  [['Marta Quiroga', '221 555-7788', 'marta.quiroga@ejemplo.com', 'City Bell', 'Llamó para consultar por el ritual profundo. Volver a escribirle.'],
   ['Norma Bustos', '221 555-3344', '', 'Tolosa', 'Vino a la cafetería y preguntó por pedicuría.'],
   ['Inés Castillo', '221 555-9090', 'ines.castillo@ejemplo.com', 'Gonnet', 'Quiere regalarle una gift card a la hermana.']].forEach(([name, phone, email, address, notes], i) => {
    const k = email || 'tel:' + phone.replace(/\D/g, '');
    st.crm[k] = { manual: true, name, phone, email, address, birthday: bday(), notes, preferences: '', tags: ['Nueva'], photos: [], created_at: new Date(Date.now() - (3 + i * 4) * 864e5).toISOString(), updated_at: new Date(Date.now() - (3 + i * 4) * 864e5).toISOString(), updated_by: 'Recepción (prueba)' };
  });
  // Más clientas con cuenta en la web.
  [['Rocío Giménez', '221 555-2020', '1991-04-18', 'Villa Elisa'], ['Camila Benítez', '221 555-3030', '1995-09-02', 'Centro, La Plata']].forEach(([name, phone, birthday, address], i) => {
    st.customers.push({ id: (st.ids.customer = (st.ids.customer || 0) + 1), email: mail(name), name, phone, birthday, address, password_hash: 'demo$Clienta.Samadhi26', created_at: new Date(Date.now() - (60 + i * 30) * 864e5).toISOString() });
  });
  // Más gift cards: una usada y una que vence pronto.
  const g1 = new Date(Date.now() - 150 * 864e5).toISOString(), g2 = new Date(Date.now() - 170 * 864e5).toISOString();
  st.giftcards.push({ id: ++st.ids.gift, code: 'CS-DEMO-4USD', token: 'demo4' + Math.random().toString(36).slice(2), amount: 45000, balance: 0, service_id: null, service_name: '', buyer_name: 'Pablo Ríos', buyer_email: 'pablo.rios@ejemplo.com', to_name: 'Antonella', to_email: '', message: '¡Feliz aniversario!', status: 'used', source: 'web', created_at: g1, paid_at: g1, expires_at: new Date(Date.now() + 30 * 864e5).toISOString(), pay_url: null, payment_id: 'SIM-3', history: [{ at: g1, amount: 45000, note: 'Gift card de ejemplo' }, { at: new Date(Date.now() - 100 * 864e5).toISOString(), amount: -45000, note: 'Usada en un turno' }] });
  st.giftcards.push({ id: ++st.ids.gift, code: 'CS-DEMO-5VNC', token: 'demo5' + Math.random().toString(36).slice(2), amount: 60000, balance: 60000, service_id: null, service_name: 'Ritual esencial', buyer_name: 'Graciela Paz', buyer_email: 'graciela.paz@ejemplo.com', to_name: 'Melina', to_email: '', message: 'Para que te relajes', status: 'active', source: 'web', created_at: g2, paid_at: g2, expires_at: new Date(Date.now() + 12 * 864e5).toISOString(), pay_url: null, payment_id: 'SIM-4', history: [{ at: g2, amount: 60000, note: 'Gift card de ejemplo' }] });
  // Eventos próximos (en el patio).
  [[6, 'Taller de skincare natural', '17:00', '19:00', 15000, 'Aprendé a armar tu rutina con productos naturales. Incluye merienda. En el patio.'],
   [13, 'Merienda y círculo de mujeres', '18:00', '20:00', 12000, 'Un encuentro para compartir, con té, pastelería de la casa y música en vivo.'],
   [20, 'Taller de cerámica', '16:00', '18:30', 25000, 'Modelado a mano y esmaltado. Materiales incluidos.']].forEach(([d, title, from, to, price, description]) => {
    st.events.push({ id: ++st.ids.event, title, date: C.addDays(today, d), from, to, price, description, active: true, image: '' });
  });
  // Caja de los últimos 14 días: fondo inicial, cobros de saldos, egresos y cierres (hoy, abierta).
  st.cash = st.cash || { moves: [], closings: [] }; st.ids.cash = st.ids.cash || 0;
  const addMove = (date, type, method, amount, concept, booking_id = null, by = recU.name, hm = '10:00') => st.cash.moves.push({ id: ++st.ids.cash, date, at: new Date(C.localToMs(`${date} ${hm}`)).toISOString(), type, method, amount, concept, booking_id, by });
  const methods = ['efectivo', 'efectivo', 'efectivo', 'transferencia', 'transferencia', 'debito', 'mercadopago'];
  let leaves = 0;
  // Movimientos de los últimos 3 meses (para Ganancias y pérdidas); cierres de caja, los últimos 14 días.
  for (let i = -95; i <= 0; i++) {
    const date = C.addDays(today, i);
    if (i === -14) addMove(date, 'in', 'efectivo', 20000, 'Fondo inicial de caja', null, admU.name, '09:30');
    // Saldos cobrados en la casa de los turnos realizados ese día.
    for (const b of st.bookings.filter((x) => x.start.startsWith(date) && x.status === 'completed')) {
      const rest = Math.max(0, b.price - (b.deposit_paid || 0) - (b.gift_applied || 0));
      if (rest) addMove(date, 'in', pick(methods), rest, `Saldo ${b.code} · ${b.service_name} · ${b.name}`, b.id, recU.name, b.start.slice(11));
    }
    if (new Date(date + 'T12:00:00Z').getUTCDay() === 0) continue;
    if (r() < 0.45) addMove(date, 'in', 'efectivo', 4000 + Math.round(r() * 8) * 1000, pick(['Venta de esmaltes', 'Venta de aceite para cutículas', 'Venta de vela aromática']), null, recU.name, '12:30');
    if (r() < 0.4) addMove(date, 'out', 'efectivo', 6000 + Math.round(r() * 9) * 1000, pick(['Café y pastelería', 'Insumos de manicuría', 'Flores para la recepción', 'Artículos de limpieza']), null, recU.name, '11:15');
    if (i % 7 === 0 && i < 0) addMove(date, 'out', 'transferencia', 35000 + Math.round(r() * 5) * 5000, 'Productos de head spa (proveedor)', null, admU.name, '15:00');
    if (i === 0) break; // hoy: la caja queda abierta
    if (i < -14) continue; // los cierres, solo de las últimas dos semanas
    const day = st.cash.moves.filter((m) => m.date === date && m.method === 'efectivo');
    const cin = day.filter((m) => m.type === 'in').reduce((a, m) => a + m.amount, 0), cout = day.filter((m) => m.type === 'out').reduce((a, m) => a + m.amount, 0);
    const expected = leaves + cin - cout;
    if (!cin && !cout) continue;
    const diff = r() < 0.75 ? 0 : pick([-500, -1000, 300, 500]);
    const counted = Math.max(0, expected + diff), withdrawn = Math.max(0, Math.floor((counted - 20000) / 1000) * 1000);
    st.cash.closings.push({ id: ++st.ids.cash, date, at: new Date(C.localToMs(`${date} 19:30`)).toISOString(), by: recU.name, opening: leaves, cash_in: cin, cash_out: cout, expected, counted, diff: counted - expected, withdrawn, leaves: counted - withdrawn, notes: diff < 0 ? 'Faltó cambio' : diff > 0 ? 'Sobró de una propina' : '' });
    leaves = counted - withdrawn;
  }
  // Historial de cambios de ejemplo
  const adm = st.staff.find((u) => u.role === 'admin'), rec = st.staff.find((u) => u.role === 'staff'), ana = pros[0];
  const log = (u, h, action) => st.audit.push({ id: (st.ids.audit = (st.ids.audit || 0) + 1), at: new Date(Date.now() - h * 3600e3).toISOString(), user_id: u.id, user: u.name, role: u.role, action });
  log(adm, 240, 'Editó la asesora Trinidad · Solo comisión 40%');
  log(adm, 239, 'Editó la asesora Belén · Solo comisión 40%');
  log(adm, 200, 'Cambió la configuración: medios de pago');
  log(rec, 50, 'Cargó el turno de un llamado por WhatsApp');
  log(ana, 30, 'Ingresó al panel');
  log(rec, 26, 'Cargó a la clienta Marta Quiroga');
  log(ana, 20, 'Sumó fotos de antes y después a Lucía Fernández');
  log(rec, 18, `Cerró la caja del ${C.addDays(today, -1)}`);
  log(adm, 6, 'Sumó un trabajo (antes y después) a Soft gel');
  st.audit.sort((a, c) => a.at.localeCompare(c.at));
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
