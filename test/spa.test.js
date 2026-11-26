import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedState, handle, tick, slotsFor, ApiError } from '../server/core/spa-core.js';

// Reloj fijo: martes 3 de noviembre de 2026, 9:00 en Argentina (12:00 UTC)
function makeEnv(start = Date.UTC(2026, 10, 3, 12, 0)) {
  let now = start; const sent = [];
  return { sent, advance: (ms) => (now += ms), now: () => now, publicUrl: 'http://test', mock: true,
    createPayment: async ({ kind, token }) => `#pago/${kind}/${token}`, sendEmail: async (m) => { sent.push(m); return 'ok'; },
    hashPassword: async (p) => 'x$' + p, checkPassword: async (p, h) => h === 'x$' + p };
}
// Estado inicial sin las asesoras de la casa, para los tests que arman su propio equipo.
const bare = () => { const st = seedState(); st.staff = []; st.ids.staff = 0; return st; };
const call = (st, env, method, path, body, staff) => handle(st, env, { method, path: path.split('?')[0], query: Object.fromEntries(new URLSearchParams(path.split('?')[1] || '')), body, staff }).then((r) => r.body);
const who = { name: 'Ana Prueba', email: 'ana@ejemplo.com', phone: '221 555 1234', accept: true };

test('disponibilidad respeta horario, anticipación y domingo cerrado', async () => {
  const st = seedState(), env = makeEnv();
  const r = await call(st, env, 'GET', '/api/availability?service=1&days=6');
  assert.equal(r.days[0].date, '2026-11-03');
  assert.equal(r.days[0].slots[0], '12:00'); // 9:00 + 3 h de anticipación
  assert.equal(r.days[0].slots.at(-1), '18:00'); // el ritual dura 60 min y se cierra a las 19
  assert.deepEqual(r.days.find((d) => d.date === '2026-11-08').slots, []); // domingo
});

test('reserva con seña: queda guardada, se confirma al pagar y el horario se ocupa', async () => {
  const st = seedState(), env = makeEnv();
  const r = await call(st, env, 'POST', '/api/bookings', { service_id: 1, date: '2026-11-04', time: '10:00', ...who });
  assert.equal(r.booking.status, 'pending_payment');
  assert.equal(r.booking.deposit_due, 18000);
  await assert.rejects(call(st, env, 'POST', '/api/bookings', { service_id: 2, date: '2026-11-04', time: '10:30', ...who }), (e) => e instanceof ApiError && e.status === 409);
  const p = await call(st, env, 'POST', '/api/pay/simulate', { kind: 'booking', token: r.booking.token, result: 'approved' });
  assert.equal(p.booking.status, 'confirmed');
  assert.equal(p.booking.deposit_paid, 18000);
  assert.ok(env.sent.some((m) => m.template === 'booking_confirmed' && m.to === 'ana@ejemplo.com'));
  // La manicuría usa otro espacio: ese horario sigue libre para ella.
  assert.ok(slotsFor(st, env, st.services.find((s) => s.slug === 'dipping'), '2026-11-04').includes('10:00'));
});

test('la reserva sin pagar se libera al vencer el tiempo', async () => {
  const st = seedState(), env = makeEnv();
  await call(st, env, 'POST', '/api/bookings', { service_id: 1, date: '2026-11-04', time: '10:00', ...who });
  env.advance(31 * 60e3);
  await tick(st, env);
  assert.equal(st.bookings[0].status, 'expired');
  assert.ok(slotsFor(st, env, st.services[0], '2026-11-04').includes('10:00'));
});

test('gift card: se compra, se activa con el pago y paga un turno completo', async () => {
  const st = seedState(), env = makeEnv();
  const g = await call(st, env, 'POST', '/api/giftcards', { service_id: 1, buyer_name: 'Pedro Paz', buyer_email: 'pedro@ejemplo.com', accept: true });
  assert.equal(g.gift.code, null); // el código aparece recién pagada
  const paid = await call(st, env, 'POST', '/api/pay/simulate', { kind: 'gift', token: g.gift.token });
  assert.equal(paid.gift.status, 'active');
  const r = await call(st, env, 'POST', '/api/bookings', { service_id: 1, date: '2026-11-05', time: '11:00', ...who, gift_code: paid.gift.code.toLowerCase() });
  assert.equal(r.booking.status, 'confirmed');
  assert.equal(r.pay_url, null);
  assert.equal(st.giftcards[0].balance, 0);
  // Cancelar devuelve el saldo a la gift card.
  await call(st, env, 'POST', `/api/bookings/${r.booking.token}/cancel`, {});
  assert.equal(st.giftcards[0].balance, 60000);
});

test('bloqueos y panel', async () => {
  const st = bare(), env = makeEnv();
  await assert.rejects(call(st, env, 'GET', '/api/admin/dashboard'), (e) => e.status === 401);
  st.staff.push({ id: 1, email: 'a@a.com', name: 'A', role: 'admin', password_hash: 'x$clave' });
  const staff = st.staff[0];
  await call(st, env, 'POST', '/api/admin/blocks', { date: '2026-11-06', resource: 'all', reason: 'Feriado' }, staff);
  assert.deepEqual(slotsFor(st, env, st.services[0], '2026-11-06'), []);
  const b = await call(st, env, 'POST', '/api/admin/bookings', { service_id: 4, date: '2026-11-04', time: '15:00', name: 'Clienta de WhatsApp' }, staff);
  assert.equal(b.booking.status, 'confirmed');
  await assert.rejects(call(st, env, 'PUT', '/api/admin/settings/booking', { depositPercent: 50 }, { ...staff, role: 'staff' }), (e) => e.status === 403);
});

test('emails automáticos: seña pendiente, horario liberado, gracias, agenda diaria y prueba', async () => {
  const st = bare(), env = makeEnv();
  st.settings.booking.staffEmails = 'equipo@ejemplo.com';
  const r = await call(st, env, 'POST', '/api/bookings', { service_id: 1, date: '2026-11-04', time: '10:00', ...who });
  env.advance(16 * 60e3); await tick(st, env);
  assert.ok(env.sent.some((m) => m.template === 'booking_pending'));
  env.advance(15 * 60e3); await tick(st, env);
  assert.ok(env.sent.some((m) => m.template === 'booking_expired'));
  // Apagar un email desde el panel hace que no se mande.
  st.staff.push({ id: 1, email: 'a@a.com', name: 'A', role: 'admin', password_hash: 'x$clave' });
  await call(st, env, 'PUT', '/api/admin/settings/emails', { enabled: { booking_thanks: false }, custom: { booking_confirmed: { subject: 'Listo {nombre}: {servicio}' } } }, st.staff[0]);
  const b = await call(st, env, 'POST', '/api/bookings', { service_id: 1, date: '2026-11-04', time: '15:00', ...who });
  await call(st, env, 'POST', '/api/pay/simulate', { kind: 'booking', token: b.booking.token });
  assert.ok(env.sent.some((m) => m.subject === 'Listo Ana: Ritual esencial'));
  env.advance(3 * 864e5); await tick(st, env);
  assert.equal(st.bookings[1].status, 'completed');
  assert.ok(!env.sent.some((m) => m.template === 'booking_thanks'));
  env.advance(11 * 3600e3); await tick(st, env); // pasa las 20 h: sale la agenda de mañana
  assert.ok(env.sent.some((m) => m.template === 'staff_daily' && m.to === 'equipo@ejemplo.com'));
  const t = await call(st, env, 'POST', '/api/admin/emails/test', { template: 'all', to: 'yo@ejemplo.com' }, st.staff[0]);
  assert.equal(t.sent, 23);
  assert.ok(env.sent.filter((m) => m.to === 'yo@ejemplo.com').every((m) => m.subject.startsWith('[Prueba]')));
});

test('cuentas: registro, ingreso, mis turnos y el equipo entra al panel desde el mismo formulario', async () => {
  const st = seedState(), env = makeEnv();
  const reg = await handle(st, env, { method: 'POST', path: '/api/account/register', query: {}, body: { name: 'Ana Prueba', email: 'ana@ejemplo.com', phone: '221 555 1234', password: 'claveclave' } });
  assert.equal(reg.customerSession.customer_id, 1);
  const customer = st.customers[0];
  await handle(st, env, { method: 'POST', path: '/api/bookings', query: {}, body: { service_id: 1, date: '2026-11-04', time: '10:00', ...who }, customer });
  const me = (await handle(st, env, { method: 'GET', path: '/api/account/me', query: {}, body: {}, customer })).body;
  assert.equal(me.upcoming.length, 1);
  await assert.rejects(handle(st, env, { method: 'POST', path: '/api/account/login', query: {}, body: { email: 'ana@ejemplo.com', password: 'mal' } }), (e) => e.status === 401);
  st.staff.push({ id: 1, email: 'a@a.com', name: 'A', role: 'admin', password_hash: 'x$clave1234' });
  const s = await handle(st, env, { method: 'POST', path: '/api/account/login', query: {}, body: { email: 'a@a.com', password: 'clave1234' } });
  assert.equal(s.session.staff_id, 1);
});

test('recuperar contraseña por email (clienta y equipo)', async () => {
  const st = seedState(), env = makeEnv();
  st.customers = [{ id: 1, name: 'Ana', email: 'ana@ejemplo.com', phone: '', password_hash: 'x$vieja1234' }];
  const acct = (path, body, method = 'POST') => handle(st, env, { method, path, query: {}, body });
  assert.deepEqual((await acct('/api/account/forgot', { email: 'nadie@ejemplo.com' })).body, { ok: true });
  assert.equal(env.sent.length, 0);
  await acct('/api/account/forgot', { email: 'ana@ejemplo.com' });
  const link = env.sent.at(-1).html.match(/#clave\/([A-Za-z0-9]+)/)[1];
  const r = await acct('/api/account/reset', { token: link, password: 'nueva12345' });
  assert.equal(r.customerSession.customer_id, 1);
  assert.equal(st.customers[0].password_hash, 'x$nueva12345');
  await assert.rejects(acct('/api/account/reset', { token: link, password: 'otra123456' }), (e) => e.status === 410);
  st.staff.push({ id: 1, email: 'a@a.com', name: 'A', role: 'admin', password_hash: 'x$x' });
  await acct('/api/account/forgot', { email: 'a@a.com' });
  const t2 = env.sent.at(-1).html.match(/#clave\/([A-Za-z0-9]+)/)[1];
  env.advance(61 * 60e3);
  await assert.rejects(acct('/api/account/reset', { token: t2, password: 'clavelarga1' }), (e) => e.status === 410);
});

test('CRM: ficha de clienta, notas y la cuenta recuerda la última visita', async () => {
  const st = seedState(), env = makeEnv();
  const staff = { id: 1, name: 'Recepción', role: 'staff' };
  const r = await call(st, env, 'POST', '/api/bookings', { service_id: 1, date: '2026-11-04', time: '10:00', ...who, notes: 'Presión suave' });
  await call(st, env, 'POST', '/api/pay/simulate', { kind: 'booking', token: r.booking.token, result: 'approved' });
  const id = st.bookings[0].id;
  env.advance(3 * 864e5);
  await call(st, env, 'PATCH', '/api/admin/bookings/' + id, { status: 'completed' }, staff);
  const list = await call(st, env, 'GET', '/api/admin/clients', undefined, staff);
  assert.equal(list.summary.total, 1);
  const c = list.clients[0];
  assert.equal(c.key, 'ana@ejemplo.com');
  assert.equal(c.visits, 1);
  assert.equal(c.spent, 60000);
  assert.equal(c.lastService, st.bookings[0].service_name);
  const saved = await call(st, env, 'PATCH', '/api/admin/clients/ficha', { key: c.key, notes: 'Le gusta la lavanda', tags: ['VIP'], birthday: '1990-11-20' }, staff);
  assert.equal(saved.crm.notes, 'Le gusta la lavanda');
  assert.deepEqual(saved.crm.tags, ['VIP']);
  assert.equal(saved.crm.updated_by, 'Recepción');
  assert.equal((await call(st, env, 'GET', '/api/admin/clients?segment=birthday', undefined, staff)).clients.length, 1);
  assert.equal((await call(st, env, 'GET', '/api/admin/clients?tag=VIP', undefined, staff)).clients.length, 1);
  // La clienta crea su cuenta con el mismo email: ve su última visita y lo que contó
  const acc = await call(st, env, 'POST', '/api/account/register', { name: 'Ana Prueba', email: 'ana@ejemplo.com', phone: '221 555 1234', password: 'clave-segura' });
  assert.equal(acc.stats.visits, 1);
  assert.equal(acc.stats.lastVisit.service_name, st.bookings[0].service_name);
  assert.equal(acc.stats.lastNotes, 'Presión suave');
});

test('reserva con varios servicios: una sola seña, no se superponen y se cancelan juntos', async () => {
  const st = seedState(), env = makeEnv();
  const mani = st.services.find((s) => s.slug === 'esmaltado-semipermanente');
  await assert.rejects(call(st, env, 'POST', '/api/bookings', { items: [{ service_id: 1, date: '2026-11-04', time: '10:00' }, { service_id: mani.id, date: '2026-11-04', time: '10:30' }], ...who }), (e) => e.status === 409);
  const r = await call(st, env, 'POST', '/api/bookings', { items: [{ service_id: 1, date: '2026-11-04', time: '10:00' }, { service_id: mani.id, date: '2026-11-04', time: '11:00' }], ...who });
  assert.equal(r.booking.items.length, 2);
  assert.equal(r.booking.price, 60000 + 20000);
  assert.equal(r.booking.deposit_due, 18000 + 6000);
  assert.equal(st.bookings[0].group, st.bookings[1].group);
  const p = await call(st, env, 'POST', '/api/pay/simulate', { kind: 'booking', token: r.booking.token });
  assert.equal(p.booking.status, 'confirmed');
  assert.deepEqual(st.bookings.map((b) => b.deposit_paid), [18000, 6000]);
  assert.equal(env.sent.filter((m) => m.template === 'booking_confirmed').length, 1); // un solo email para toda la reserva
  await call(st, env, 'POST', `/api/bookings/${r.booking.token}/cancel`, {});
  assert.deepEqual(st.bookings.map((b) => b.status), ['cancelled', 'cancelled']);
});

test('transferencia: queda guardado, la clienta avisa y la administración confirma', async () => {
  const st = seedState(), env = makeEnv();
  st.settings.pay = { ...st.settings.pay, alias: 'casa.samadhi.spa', holder: 'Casa Samadhi' };
  st.settings.booking.staffEmails = 'equipo@ejemplo.com';
  const admin = { id: 1, email: 'a@a.com', name: 'Admin', role: 'admin', password_hash: 'x$x' }; st.staff.push(admin);
  const r = await call(st, env, 'POST', '/api/bookings', { service_id: 1, date: '2026-11-04', time: '10:00', ...who, pay_method: 'transfer' });
  assert.equal(r.booking.status, 'pending_transfer');
  assert.equal(r.booking.transfer.alias, 'casa.samadhi.spa');
  assert.equal(r.booking.transfer.amount, 18000);
  assert.ok(env.sent.some((m) => m.template === 'booking_transfer' && m.to === 'ana@ejemplo.com' && m.html.includes('casa.samadhi.spa')));
  assert.ok(env.sent.some((m) => m.template === 'staff_transfer' && m.to === 'equipo@ejemplo.com'));
  env.advance(2 * 3600e3); await tick(st, env);
  assert.equal(st.bookings[0].status, 'pending_transfer'); // se guarda 12 h, no 30 min
  assert.ok(!slotsFor(st, env, st.services[0], '2026-11-04').includes('10:00'));
  await call(st, env, 'POST', `/api/bookings/${r.booking.token}/transfer-sent`, { note: 'Desde Banco Provincia' });
  assert.ok(env.sent.filter((m) => m.template === 'staff_transfer').length === 2);
  const d = await call(st, env, 'GET', '/api/admin/dashboard', undefined, admin);
  assert.equal(d.transfers.length, 1);
  await call(st, env, 'PATCH', '/api/admin/bookings/' + st.bookings[0].id, { transfer: 'confirm' }, admin);
  assert.equal(st.bookings[0].status, 'confirmed');
  assert.equal(st.bookings[0].deposit_paid, 18000);
  assert.ok(env.sent.some((m) => m.template === 'booking_confirmed'));
  assert.ok(st.audit.some((a) => a.user === 'Admin' && a.action.includes('Confirmó la transferencia')));
});

test('asesoras: se asignan solas, ven solo lo suyo, pueden cancelar y cobran su comisión', async () => {
  const st = bare(), env = makeEnv();
  const admin = { id: 1, email: 'a@a.com', name: 'Admin', role: 'admin', password_hash: 'x$x' }; st.staff.push(admin); st.ids.staff = 1;
  const adm = (m, p, b) => call(st, env, m, '/api/admin' + p, b, admin);
  const ana = (await adm('POST', '/pros', { name: 'Ana Gómez', email: 'ana.pro@ejemplo.com', password: 'clave-de-ana', services: [1, 2, 3], pay: { type: 'comision', percent: 40 } })).pro;
  const sol = (await adm('POST', '/pros', { name: 'Sol Ruiz', services: [1], pay: { type: 'basico_comision', percent: 20, base: 300000 } })).pro;
  assert.equal(sol.has_access, false);
  // Dos turnos a la misma hora: una asesora cada uno. Un tercero ya no entra.
  const b1 = await call(st, env, 'POST', '/api/bookings', { service_id: 1, date: '2026-11-04', time: '10:00', ...who });
  const b2 = await call(st, env, 'POST', '/api/bookings', { service_id: 1, date: '2026-11-04', time: '10:00', ...who, email: 'otra@ejemplo.com' }).catch((e) => e);
  assert.equal(b2.status, 409); // la sala de head spa tiene capacidad 1
  st.settings.resources.find((r) => r.key === 'headspa').capacity = 3;
  const b3 = await call(st, env, 'POST', '/api/bookings', { service_id: 1, date: '2026-11-04', time: '10:00', ...who, email: 'otra@ejemplo.com' });
  assert.notEqual(st.bookings[0].pro_id, st.bookings[1].pro_id);
  await assert.rejects(call(st, env, 'POST', '/api/bookings', { service_id: 1, date: '2026-11-04', time: '10:00', ...who }), (e) => e.status === 409);
  for (const b of [b1, b3]) await call(st, env, 'POST', '/api/pay/simulate', { kind: 'booking', token: b.booking.token });
  // Ana entra con su usuario: ve solo lo suyo y no puede entrar a la configuración.
  const anaUser = st.staff.find((u) => u.id === ana.id);
  const proCall = (m, p, b) => call(st, env, m, '/api/admin' + p, b, anaUser);
  const mine = await proCall('GET', '/bookings');
  assert.ok(mine.bookings.every((b) => b.pro_id === ana.id) && mine.bookings.length === 1);
  assert.equal(mine.bookings[0].email, undefined);
  await assert.rejects(proCall('GET', '/settings'), (e) => e.status === 403);
  // Ve solo sus clientas (las que atendió o va a atender), no las de otras asesoras.
  const pc = await proCall('GET', '/clients');
  assert.ok(pc.clients.length >= 1);
  assert.ok(pc.clients.every((c) => st.bookings.some((b) => b.pro_id === ana.id && (b.email || '').toLowerCase() === c.key)));
  const ajena = st.bookings.find((b) => b.pro_id !== ana.id && b.email && !st.bookings.some((x) => x.pro_id === ana.id && x.email === b.email));
  if (ajena) await assert.rejects(proCall('GET', '/clients/ficha?key=' + encodeURIComponent(ajena.email)), (e) => e.status === 404);
  const other = st.bookings.find((b) => b.pro_id !== ana.id);
  await assert.rejects(proCall('GET', '/bookings/' + other.id), (e) => e.status === 404);
  await assert.rejects(proCall('PATCH', '/bookings/' + mine.bookings[0].id, { status: 'completed' }), (e) => e.status === 403);
  // Comisiones: 40% de 60.000 para Ana; básico + 20% para Sol.
  const c = await proCall('GET', '/commissions?month=2026-11');
  assert.equal(c.upcoming, 24000);
  env.advance(3 * 864e5); await tick(st, env);
  const c2 = await proCall('GET', '/commissions?month=2026-11');
  assert.equal(c2.earned, 24000);
  const list = await adm('GET', '/pros?month=2026-11');
  const solRow = list.pros.find((p) => p.id === sol.id);
  assert.equal(solRow.month.total, 300000 + 12000);
  // Si cambia el porcentaje, lo ya realizado queda con el de ese momento.
  await adm('PATCH', '/pros/' + ana.id, { pay: { type: 'comision', percent: 50 } });
  assert.equal((await proCall('GET', '/commissions?month=2026-11')).earned, 24000);
  // Cancelar un turno propio queda registrado con el motivo.
  const b4 = await call(st, env, 'POST', '/api/bookings', { service_id: 2, date: '2026-11-10', time: '15:00', ...who });
  await call(st, env, 'POST', '/api/pay/simulate', { kind: 'booking', token: b4.booking.token });
  const id4 = st.bookings.at(-1).id;
  await assert.rejects(proCall('PATCH', '/bookings/' + id4, { status: 'cancelled' }), (e) => e.status === 422);
  await proCall('PATCH', '/bookings/' + id4, { status: 'cancelled', reason: 'Estoy enferma' });
  assert.equal(st.bookings.at(-1).status, 'cancelled');
  const log = await adm('GET', '/audit?user=' + ana.id);
  assert.ok(log.audit.some((a) => a.action.includes('Canceló el turno') && a.action.includes('Estoy enferma')));
  assert.ok((await adm('GET', '/audit')).audit.some((a) => a.user === 'Admin' && a.action.includes('Creó la asesora Ana Gómez')));
});

test('transferencia: se guarda hasta 1 hora antes del turno y no se ofrece para turnos muy cercanos', async () => {
  const st = seedState(), env = makeEnv(); // martes 9:00
  st.settings.pay = { ...st.settings.pay, alias: 'casa.samadhi.spa' };
  const r = await call(st, env, 'POST', '/api/bookings', { service_id: 1, date: '2026-11-03', time: '17:00', ...who, pay_method: 'transfer' });
  assert.equal(r.booking.hold_until, new Date(Date.UTC(2026, 10, 3, 19, 0)).toISOString()); // 16:00 en Argentina
  st.settings.booking.minNoticeHours = 0;
  await assert.rejects(call(st, env, 'POST', '/api/bookings', { service_id: 1, date: '2026-11-03', time: '10:00', ...who, pay_method: 'transfer', email: 'otra@ejemplo.com' }), (e) => e.status === 422);
  assert.equal(st.bookings.length, 1);
});

test('migración de la carta de manicuría: actualiza, suma y saca servicios sin perder ids ni turnos', async () => {
  const st = bare(), env = makeEnv();
  // Estado viejo: la carta de octubre.
  st.services = st.services.filter((s) => s.category !== 'manicuria');
  const old = [['esmaltado-semipermanente', 'Esmaltado semipermanente', 16000], ['esmaltado-tradicional', 'Esmaltado tradicional', 10000], ['soft-gel-sencillo', 'Soft gel', 25000], ['soft-gel-complejo', 'Soft gel', 30000], ['retirado-semi-capping', 'Retirado de semi o capping', 5000]];
  for (const [slug, name, price] of old) st.services.push({ id: ++st.ids.service, position: st.services.length, slug, name, price, category: 'manicuria', resource: 'manicuria', mode: 'online', duration: 60, visible: true, tag: '', short: '', includes: [], image: '', days: [], whatsapp: '' });
  const semi = st.services.find((s) => s.slug === 'esmaltado-semipermanente'), trad = st.services.find((s) => s.slug === 'esmaltado-tradicional');
  st.bookings.push({ id: 1, service_id: trad.id, status: 'confirmed', start: '2026-11-10 10:00', duration: 45, resource: 'manicuria' });
  st.staff.push({ id: 1, role: 'pro', name: 'Sol', services: [semi.id, trad.id] });
  st.meta.migrations = st.meta.migrations.filter((k) => k !== 'manicuria-carta-2026-11');
  const site = await call(st, env, 'GET', '/api/site');
  const mani = site.services.filter((s) => s.category === 'manicuria');
  assert.deepEqual(mani.map((s) => s.name), ['Semipermanente', 'Soft gel', 'Dipping', 'Belleza de pies', 'Combo manos y pies', 'Pedicuría', 'Retirado de esmalte']);
  assert.equal(mani[0].id, semi.id);
  assert.equal(mani[0].price, 20000); assert.equal(mani[0].price_transfer, 22000);
  assert.ok(st.services.find((s) => s.id === trad.id && !s.visible), 'con turnos por delante se oculta');
  assert.ok(!st.services.some((s) => s.slug === 'soft-gel-complejo'));
  assert.ok(mani.every((s) => st.staff.find((u) => u.name === 'Sol').services.includes(s.id)), 'la manicura queda asignada a la carta nueva');
});

test('migración de rituales y terraza: precios nuevos, sin coworking ni salón para alquilar', async () => {
  const st = seedState(), env = makeEnv();
  const esencial = st.services.find((s) => s.slug === 'ritual-esencial'), alq = st.services.find((s) => s.slug === 'alquiler-del-espacio');
  Object.assign(esencial, { price: 55000 });
  Object.assign(alq, { name: 'Alquiler del espacio', includes: ['Talleres, clases, meriendas, reuniones y coworking'], image: 'media/espacio-taller.webp' });
  st.settings.giftcards.amounts = [45000, 55000, 80000, 100000];
  st.settings.content.faq.find((f) => f.q === '¿Hacen eventos privados?').a = 'meriendas, reuniones, talleres y coworking';
  st.meta.migrations = st.meta.migrations.filter((k) => k !== 'rituales-terraza-2026-11');
  const site = await call(st, env, 'GET', '/api/site');
  const svc = (slug) => site.services.find((s) => s.slug === slug);
  assert.equal(svc('ritual-esencial').price, 60000);
  assert.equal(svc('ritual-profundo').price, 90000);
  assert.equal(svc('alquiler-del-espacio').name, 'Alquiler de la terraza');
  assert.equal(svc('alquiler-del-espacio').image, '');
  assert.deepEqual(st.settings.giftcards.amounts, [45000, 60000, 90000, 100000]);
  assert.ok(!JSON.stringify(site).toLowerCase().includes('coworking'));
});

test('asesoras de la casa: Trinidad en head spa y Belén en manicuría, también en estados guardados', async () => {
  const st = seedState(), env = makeEnv();
  const pro = (n) => st.staff.find((u) => u.role === 'pro' && u.name === n);
  const ids = (cat) => st.services.filter((s) => s.category === cat && s.mode !== 'menu').map((s) => s.id).sort();
  assert.deepEqual([...pro('Trinidad').services].sort(), ids('rituales'));
  assert.deepEqual([...pro('Belén').services].sort(), ids('manicuria'));
  // La reserva se asigna sola a quien corresponde.
  const r = await call(st, env, 'POST', '/api/bookings', { service_id: st.services.find((s) => s.slug === 'dipping').id, date: '2026-11-04', time: '10:00', ...who });
  assert.equal(st.bookings.find((b) => b.token === r.booking.token).pro_name, 'Belén');
  // Estado guardado sin asesoras: la migración las suma una sola vez.
  const old = bare(); old.meta.migrations = old.meta.migrations.filter((k) => k !== 'profesionales-2026-11');
  await call(old, env, 'GET', '/api/site');
  await call(old, env, 'GET', '/api/site');
  assert.equal(old.staff.filter((u) => u.role === 'pro').length, 2);
  assert.ok(old.staff.find((u) => u.name === 'Trinidad').services.length === 2);
});

test('trabajos (antes y después): ejemplos en manicuría, se suben, se ordenan y se borran', async () => {
  const st = bare(), env = { ...makeEnv(), saveImage: async (d, p) => `uploads/${p}-${d.length}.webp`, deleted: [] };
  env.deleteImage = async (f) => env.deleted.push(f);
  const admin = { id: 1, email: 'a@a.com', name: 'Admin', role: 'admin', password_hash: 'x$x' }; st.staff.push(admin); st.ids.staff = 1;
  const site = await call(st, env, 'GET', '/api/site');
  const semi = site.services.find((s) => s.slug === 'esmaltado-semipermanente');
  assert.equal(semi.works.length, 2);
  assert.ok(site.site.worksBefore.endsWith('antes.webp'));
  const img = 'data:image/webp;base64,AAAA';
  const r = await call(st, env, 'POST', `/api/admin/services/${semi.id}/works`, { after: img }, admin);
  assert.equal(r.service.works.length, 3);
  assert.equal(r.service.works[0].after, 'uploads/despues-27.webp'); // el más nuevo, primero
  assert.equal(r.service.works[0].before, '');
  // La web muestra hasta 8.
  for (let i = 0; i < 7; i++) await call(st, env, 'POST', `/api/admin/services/${semi.id}/works`, { after: img }, admin);
  assert.equal((await call(st, env, 'GET', '/api/site')).services.find((s) => s.id === semi.id).works.length, 8);
  const del = await call(st, env, 'DELETE', `/api/admin/services/${semi.id}/works/${r.service.works[0].id}`, undefined, admin);
  assert.equal(del.service.works.length, 9);
  assert.deepEqual(env.deleted, ['uploads/despues-27.webp']);
  const before = await call(st, env, 'PUT', '/api/admin/works-before', { image: img }, admin);
  assert.equal(st.settings.site.worksBefore, before.worksBefore);
});

test('migraciones: trabajos de ejemplo y sin masoterapia en estados guardados', async () => {
  const st = bare(), env = makeEnv();
  // Estado viejo: sin foto de antes, sin trabajos y con la masoterapia.
  delete st.settings.site.worksBefore;
  for (const s of st.services) s.works = [];
  st.services.push({ id: ++st.ids.service, slug: 'masoterapia-relajante', category: 'rituales', resource: 'headspa', mode: 'online', name: 'Masoterapia relajante', duration: 60, price: 45000, visible: true, position: 99, works: [] });
  st.meta.migrations = st.meta.migrations.filter((k) => !['trabajos-2026-11', 'sin-masoterapia-2026-11'].includes(k));
  const site = await call(st, env, 'GET', '/api/site');
  assert.ok(site.site.worksBefore.endsWith('antes.webp'));
  assert.equal(site.services.find((s) => s.slug === 'esmaltado-semipermanente').works.length, 2);
  assert.ok(!st.services.some((s) => s.slug === 'masoterapia-relajante'));
  assert.ok(!seedState().services.some((s) => s.slug === 'masoterapia-relajante'));
  assert.ok(['trabajos-2026-11', 'sin-masoterapia-2026-11'].every((k) => st.meta.migrations.includes(k)));
});

test('sin tarot ni sección Terapias, también en estados guardados', async () => {
  assert.ok(!seedState().services.some((s) => s.slug === 'tarot-y-oraculo'));
  assert.ok(!seedState().settings.categories.some((c) => c.key === 'terapias'));
  const st = bare(), env = makeEnv();
  st.settings.categories.push({ key: 'terapias', name: 'Terapias', title: 'Terapias holísticas', intro: '' });
  st.services.push({ id: ++st.ids.service, slug: 'tarot-y-oraculo', category: 'terapias', resource: 'terapias', mode: 'whatsapp', name: 'Tarot y oráculo', duration: 45, price: null, visible: true, position: 50 });
  st.settings.site.announcement = 'Head spa · Manicuría · Terapias · Cafetería — Calle 47 N° 679, La Plata';
  st.meta.migrations = st.meta.migrations.filter((k) => k !== 'sin-tarot-2026-11');
  const site = await call(st, env, 'GET', '/api/site');
  assert.ok(!site.services.some((s) => s.slug === 'tarot-y-oraculo'));
  assert.ok(!site.categories.some((c) => c.key === 'terapias'));
  assert.ok(!site.site.announcement.includes('Terapias'));
});

test('un solo WhatsApp en toda la web', async () => {
  const st = bare(), env = makeEnv();
  Object.assign(st.settings.site, { ritualsWhatsapp: '11 4928-2503', eventsWhatsapp: '221 000-0000' });
  st.services[0].whatsapp = '11 1111-1111';
  st.meta.migrations = st.meta.migrations.filter((k) => k !== 'un-whatsapp-2026-11');
  const site = await call(st, env, 'GET', '/api/site');
  assert.equal(site.site.ritualsWhatsapp, '');
  assert.equal(site.site.eventsWhatsapp, '');
  assert.ok(site.services.every((s) => s.whatsapp === undefined));
  const r = await call(st, env, 'POST', '/api/bookings', { service_id: st.services[0].id, date: '2026-11-04', time: '10:00', ...who });
  assert.equal(r.booking.whatsapp, st.settings.site.whatsapp);
});

test('la clienta cambia su turno desde el link y lo agrega al calendario', async () => {
  const st = bare(), env = makeEnv();
  const svc = st.services.find((s) => s.slug === 'ritual-esencial');
  const r = await call(st, env, 'POST', '/api/bookings', { service_id: svc.id, date: '2026-11-05', time: '10:00', ...who });
  await call(st, env, 'POST', '/api/pay/simulate', { kind: 'booking', token: r.booking.token, result: 'approved' });
  let b = (await call(st, env, 'GET', '/api/bookings/' + r.booking.token)).booking;
  assert.equal(b.can_reschedule, true);
  assert.ok(b.calendar.google.startsWith('https://calendar.google.com/calendar/render?action=TEMPLATE'));
  assert.ok(b.calendar.google.includes('dates=20261105T130000Z/20261105T140000Z')); // 10 h en La Plata = 13 h UTC
  assert.ok(b.calendar.ics.endsWith(`/api/bookings/${r.booking.token}/calendar.ics`));
  // Disponibilidad sin contar su propio turno: el mismo día a las 10:30 aparece libre.
  const av = await call(st, env, 'GET', `/api/availability?service=${svc.id}&from=2026-11-05&days=1&ignore=${r.booking.token}`);
  assert.ok(av.days[0].slots.includes('10:30'));
  env.sent.length = 0;
  b = (await call(st, env, 'POST', `/api/bookings/${r.booking.token}/reschedule`, { date: '2026-11-06', time: '11:00' })).booking;
  assert.equal(b.start, '2026-11-06 11:00');
  assert.ok(env.sent.some((m) => m.template === 'booking_rescheduled' && m.to === who.email && m.html.includes('calendar.google.com')));
  assert.ok(st.bookings[0].history.some((h) => h.text.includes('La clienta cambió el turno')));
  // Un horario ocupado no se puede tomar.
  await call(st, env, 'POST', '/api/bookings', { service_id: svc.id, date: '2026-11-07', time: '10:00', ...who, email: 'otra@ejemplo.com' });
  await assert.rejects(call(st, env, 'POST', `/api/bookings/${r.booking.token}/reschedule`, { date: '2026-11-07', time: '10:00' }), (e) => e.status === 409);
  // El .ics y el email de confirmación con el link para cambiarlo.
  const { bookingIcs } = await import('../server/core/spa-core.js');
  const ics = bookingIcs(st, env, st.bookings[0]);
  assert.ok(ics.includes('DTSTART:20261106T140000Z') && ics.includes('BEGIN:VALARM'));
  // Con menos de las horas de cancelación, ya no se puede cambiar.
  env.advance(3 * 864e5);
  assert.equal((await call(st, env, 'GET', '/api/bookings/' + r.booking.token)).booking.can_reschedule, false);
});

test('roles: web master, administración, recepción y asesora de belleza', async () => {
  const st = seedState(), env = makeEnv();
  const wm = st.staff.find((u) => u.role === 'webmaster');
  assert.equal(wm.email, 'diana@nifty-agency.com');
  assert.equal(wm.password_hash, null); // la define con "¿Olvidaste tu contraseña?"
  // Sin contraseña no entra.
  await assert.rejects(call(st, env, 'POST', '/api/account/login', { email: wm.email, password: 'cualquier-cosa' }), (e) => e.status === 401);
  wm.password_hash = 'x$clave-web-master';
  const admin = { id: 900, email: 'adm@ejemplo.com', name: 'Adm', role: 'admin', password_hash: 'x$x' }; st.staff.push(admin);
  // El web master tiene los permisos de administración.
  assert.ok((await call(st, env, 'GET', '/api/admin/users', undefined, wm)).roles.webmaster);
  // Administración crea usuarios de cada rol, salvo web master.
  const roles = (await call(st, env, 'GET', '/api/admin/users', undefined, admin)).roles;
  assert.deepEqual(Object.keys(roles), ['admin', 'staff', 'pro']);
  await assert.rejects(call(st, env, 'POST', '/api/admin/users', { email: 'otro@ejemplo.com', password: 'clave-larga-1', role: 'webmaster' }, admin), (e) => e.status === 422);
  const ase = (await call(st, env, 'POST', '/api/admin/users', { name: 'Sofía', email: 'sofia@ejemplo.com', password: 'clave-larga-1', role: 'pro' }, admin)).user;
  assert.equal(ase.role_label, 'Asesora de belleza');
  assert.ok(st.staff.find((u) => u.id === ase.id).services);
  // Solo un web master quita a otro web master.
  await assert.rejects(call(st, env, 'DELETE', '/api/admin/users/' + wm.id, undefined, admin), (e) => e.status === 403);
  const wm2 = (await call(st, env, 'POST', '/api/admin/users', { email: 'otro.wm@ejemplo.com', password: 'clave-larga-1', role: 'webmaster' }, wm)).user;
  assert.equal(wm2.role, 'webmaster');
  // Recepción no entra a Usuarios.
  await assert.rejects(call(st, env, 'GET', '/api/admin/users', undefined, { id: 901, role: 'staff', name: 'R', password_hash: 'x$x' }), (e) => e.status === 403 || e.status === 401);
});

test('CRM: alta de clienta, datos, dónde vive, fotos de antes y después y lo que carga ella', async () => {
  const st = bare(), env = { ...makeEnv(), saveImage: async (d, p) => `uploads/${p}-${d.length}.webp`, deleteImage: async () => {} };
  const admin = { id: 1, email: 'a@a.com', name: 'Admin', role: 'admin', password_hash: 'x$x' }; st.staff.push(admin); st.ids.staff = 1;
  const adm = (m, p, b) => call(st, env, m, '/api/admin' + p, b, admin);
  const r = await adm('POST', '/clients', { name: 'Marta López', phone: '221 555 7788', email: 'marta@ejemplo.com', birthday: '1988-03-14', address: 'City Bell' });
  assert.equal(r.client.key, 'marta@ejemplo.com');
  assert.equal(r.crm.address, 'City Bell');
  await assert.rejects(adm('POST', '/clients', { name: 'Marta Otra', email: 'marta@ejemplo.com' }), (e) => e.status === 409);
  // Aparece en la lista aunque no tenga turnos, y se busca por dónde vive.
  assert.equal((await adm('GET', '/clients?q=city bell')).clients.length, 1);
  // Se editan los datos sin perder nada.
  await adm('PATCH', '/clients/ficha', { key: 'marta@ejemplo.com', name: 'Marta B. López', address: 'Gonnet', notes: 'Le gusta el té' });
  const img = 'data:image/webp;base64,AAAA';
  let d = await adm('POST', '/clients/photos', { key: 'marta@ejemplo.com', after: img, before: img, note: 'Soft gel nude' });
  assert.equal(d.crm.photos.length, 1);
  assert.equal(d.crm.name, 'Marta B. López');
  assert.equal(d.crm.address, 'Gonnet');
  assert.equal(d.crm.notes, 'Le gusta el té');
  d = await adm('DELETE', '/clients/photos', { key: 'marta@ejemplo.com', id: d.crm.photos[0].id });
  assert.equal(d.crm.photos.length, 0);
  // La clienta con cuenta carga su cumpleaños y dónde vive: queda en la ficha.
  const reg = await handle(st, env, { method: 'POST', path: '/api/account/register', query: {}, body: { name: 'Ana Prueba', email: 'ana@ejemplo.com', phone: '221 555 1234', password: 'claveclave' } });
  const customer = st.customers.find((c) => c.id === reg.customerSession.customer_id);
  await handle(st, env, { method: 'PATCH', path: '/api/account/me', query: {}, body: { birthday: '1992-07-01', address: 'La Plata centro' }, customer });
  const f = await adm('GET', '/clients/ficha?key=ana@ejemplo.com');
  assert.equal(f.crm.birthday, '1992-07-01');
  assert.equal(f.crm.address, 'La Plata centro');
});

test('caja: facturación del día, cobro del saldo, egresos y cierre de caja', async () => {
  const st = bare(), env = makeEnv();
  const admin = { id: 1, email: 'a@a.com', name: 'Admin', role: 'admin', password_hash: 'x$x' }; st.staff.push(admin); st.ids.staff = 1;
  const rec = { id: 2, email: 'r@a.com', name: 'Recepción', role: 'staff', password_hash: 'x$x' }; st.staff.push(rec); st.ids.staff = 2;
  const adm = (m, p, b, who = admin) => call(st, env, m, '/api/admin' + p, b, who);
  // Una seña pagada online hoy (3/11) entra sola en la facturación.
  const svc = st.services.find((s) => s.slug === 'ritual-esencial');
  const r = await call(st, env, 'POST', '/api/bookings', { service_id: svc.id, date: '2026-11-03', time: '15:00', ...who });
  await call(st, env, 'POST', '/api/pay/simulate', { kind: 'booking', token: r.booking.token, result: 'approved' });
  let c = await adm('GET', '/cash?date=2026-11-03');
  assert.equal(c.income, 18000);
  assert.equal(c.byMethod.mercadopago.in, 18000);
  assert.equal(c.pending[0].rest, 42000); // saldo por cobrar en la casa
  // Recepción cobra el saldo en efectivo y carga un egreso.
  c = await adm('POST', '/cash/moves', { date: '2026-11-03', type: 'in', method: 'efectivo', amount: 42000, booking_id: st.bookings[0].id }, rec);
  assert.equal(c.pending.length, 0);
  c = await adm('POST', '/cash/moves', { date: '2026-11-03', type: 'out', method: 'efectivo', amount: 5000, concept: 'Insumos' }, rec);
  assert.equal(c.income, 60000);
  assert.equal(c.expenses, 5000);
  assert.equal(c.cash.expected, 37000);
  await assert.rejects(adm('POST', '/cash/moves', { type: 'in', method: 'efectivo', amount: 100 }, rec), (e) => e.status === 422); // sin concepto
  // Cierre: faltan $1.000, se retiran $30.000 y quedan $6.000 de fondo para mañana.
  c = await adm('POST', '/cash/close', { date: '2026-11-03', counted: 36000, withdrawn: 30000 }, rec);
  assert.equal(c.closing.diff, -1000);
  assert.equal(c.closing.leaves, 6000);
  await assert.rejects(adm('POST', '/cash/moves', { date: '2026-11-03', type: 'in', method: 'efectivo', amount: 100, concept: 'x' }, rec), (e) => e.status === 409);
  assert.equal((await adm('GET', '/cash?date=2026-11-04')).cash.opening, 6000);
  // Solo administración reabre.
  await assert.rejects(adm('POST', '/cash/reopen', { date: '2026-11-03' }, rec), (e) => e.status === 403);
  c = await adm('POST', '/cash/reopen', { date: '2026-11-03' });
  assert.equal(c.closing, null);
  const g = await adm('GET', '/cash?date=2026-11-03');
  assert.ok(g.billing.length === 14 && g.billing[0].income === 60000);
});

test('Trinidad y Belén con 40% de comisión, también en estados guardados', async () => {
  const pct = (st, n) => st.staff.find((u) => u.name === n).pay.percent;
  const st = seedState();
  assert.equal(pct(st, 'Trinidad'), 40);
  assert.equal(pct(st, 'Belén'), 40);
  const old = seedState(), env = makeEnv();
  for (const u of old.staff.filter((x) => x.role === 'pro')) u.pay = { type: 'comision', percent: 0, base: 0 };
  old.meta.migrations = old.meta.migrations.filter((k) => k !== 'comision-asesoras-2026-11');
  await call(old, env, 'GET', '/api/site');
  assert.equal(pct(old, 'Trinidad'), 40);
  assert.equal(pct(old, 'Belén'), 40);
});

test('ganancias y pérdidas: mes a mes con turnos, clientas, ingresos, egresos y comisiones', async () => {
  const st = bare(), env = makeEnv();
  const admin = { id: 1, email: 'a@a.com', name: 'Admin', role: 'admin', password_hash: 'x$x' }; st.staff.push(admin); st.ids.staff = 1;
  const pro = { id: 2, name: 'Tri', role: 'pro', active: true, services: [], pay: { type: 'comision', percent: 40, base: 0 } }; st.staff.push(pro);
  const adm = (m, p, b, who = admin) => call(st, env, m, '/api/admin' + p, b, who);
  const svc = st.services.find((s) => s.slug === 'ritual-esencial');
  const r = await call(st, env, 'POST', '/api/bookings', { service_id: svc.id, date: '2026-11-04', time: '10:00', ...who });
  await call(st, env, 'POST', '/api/pay/simulate', { kind: 'booking', token: r.booking.token, result: 'approved' });
  Object.assign(st.bookings[0], { status: 'completed', pro_id: pro.id, pro_name: pro.name });
  await adm('POST', '/cash/moves', { date: '2026-11-03', type: 'in', method: 'efectivo', amount: 42000, booking_id: st.bookings[0].id });
  await adm('POST', '/cash/moves', { date: '2026-11-03', type: 'out', method: 'efectivo', amount: 5000, concept: 'Insumos' });
  const p = await adm('GET', '/pnl?months=3');
  const nov = p.months.find((m) => m.month === '2026-11');
  assert.equal(p.months.length, 3);
  assert.equal(nov.bookings, 1);
  assert.equal(nov.clients, 1);
  assert.equal(nov.turnover, 60000);
  assert.equal(nov.income, 18000 + 42000);
  assert.equal(nov.expenses, 5000);
  assert.equal(nov.commissions, 24000);
  assert.equal(nov.result, 60000 - 5000 - 24000);
  assert.equal(p.total.result, nov.result);
  // Recepción no lo ve.
  await assert.rejects(adm('GET', '/pnl', undefined, { id: 3, role: 'staff', name: 'R', password_hash: 'x$x' }), (e) => e.status === 403 || e.status === 401);
});

test('horario de cada asesora: sus días y franjas, sus días libres y los turnos que quedan afuera', async () => {
  const st = seedState(), env = makeEnv(); // martes 3/11/2026
  const admin = { id: 900, email: 'a@a.com', name: 'Admin', role: 'admin', password_hash: 'x$x' }; st.staff.push(admin);
  const tri = st.staff.find((u) => u.name === 'Trinidad'); tri.password_hash = 'x$x';
  const svc = st.services.find((s) => s.slug === 'ritual-esencial');
  const slots = (date) => call(st, env, 'GET', `/api/availability?service=${svc.id}&from=${date}&days=1`).then((r) => r.days[0].slots);
  // Por defecto sigue el horario de la casa (10 a 19).
  assert.ok((await slots('2026-11-05')).includes('10:00'));
  // Un turno el jueves a las 11 con Trinidad.
  await call(st, env, 'POST', '/api/bookings', { service_id: svc.id, date: '2026-11-05', time: '11:00', ...who });
  await call(st, env, 'POST', '/api/pay/simulate', { kind: 'booking', token: st.bookings[0].token, result: 'approved' });
  // Ella misma carga su horario: martes a sábado de 14 a 19 (el jueves a la mañana ya no está).
  const me = (m, p, b) => call(st, env, m, '/api/admin' + p, b, tri);
  const week = { 0: [], 1: [], 2: [{ from: '14:00', to: '19:00' }], 3: [{ from: '14:00', to: '19:00' }], 4: [{ from: '14:00', to: '19:00' }], 5: [{ from: '14:00', to: '19:00' }], 6: [{ from: '14:00', to: '19:00' }] };
  let r = await me('PUT', '/schedule', { follows: false, week });
  assert.equal(r.follows, false);
  assert.equal(r.conflicts.length, 1); // el turno del jueves 11 h quedó afuera: hay que reprogramarlo
  const thu = await slots('2026-11-05');
  assert.ok(!thu.includes('10:00') && thu.includes('14:00') && !thu.includes('18:30'));
  assert.equal((await slots('2026-11-09')).length, 0); // lunes: no trabaja
  // Día libre el viernes.
  r = await me('POST', '/schedule/timeoff', { date: '2026-11-06', reason: 'Turno médico' });
  assert.equal(r.timeoff.length, 1);
  assert.equal((await slots('2026-11-06')).length, 0);
  // Los días libres de las asesoras no se mezclan con los bloqueos de la casa.
  const bl = await call(st, env, 'GET', '/api/admin/blocks', undefined, admin);
  assert.equal(bl.blocks.length, 0);
  assert.equal(bl.pros.find((p) => p.name === 'Trinidad').timeoff, 1);
  // Administración lo edita desde su ficha: vuelve al horario de la casa.
  r = await call(st, env, 'PUT', `/api/admin/pros/${tri.id}/schedule`, { follows: true }, admin);
  assert.equal(r.follows, true);
  assert.equal(r.conflicts.length, 0);
  // El día libre sigue: se quita.
  r = await call(st, env, 'DELETE', `/api/admin/pros/${tri.id}/schedule/timeoff/${r.timeoff[0].id}`, undefined, admin);
  assert.equal(r.timeoff.length, 0);
  assert.ok((await slots('2026-11-06')).includes('10:00'));
});

test('Nifty: arma el lote sin datos personales, con el canal; reintenta si falla; el comprobante queda en el turno', async () => {
  const { niftyBatch, niftyDone } = await import('../server/core/spa-core.js');
  const st = bare(), env = { ...makeEnv(), saveImage: async (d, p, o) => `uploads/${p}-${o?.pdf ? 'pdf' : 'img'}.bin` };
  const admin = { id: 1, email: 'a@a.com', name: 'Admin', role: 'admin', password_hash: 'x$x' }; st.staff.push(admin); st.ids.staff = 1;
  const svc = st.services.find((s) => s.slug === 'ritual-esencial');
  st.settings.pay = { ...st.settings.pay, transferEnabled: true, alias: 'casa.samadhi' };
  const r = await call(st, env, 'POST', '/api/bookings', { service_id: svc.id, date: '2026-11-05', time: '10:00', ...who, pay_method: 'transfer', origen: { canal: 'Meta', fuente: 'instagram', campania: 'Head spa', pagina: 'turnero' } });
  assert.equal(niftyBatch(st, env), null); // apagada
  await assert.rejects(call(st, env, 'PUT', '/api/admin/nifty', { enabled: true, url: 'http://ejemplo.com/x', secret: 'nft_' + 'a'.repeat(48) }, admin), (e) => e.status === 422); // tiene que ser https
  await call(st, env, 'PUT', '/api/admin/nifty', { enabled: true, url: 'https://nifty-agency.com/webhooks/turnos/47', secret: 'nft_' + 'a'.repeat(48) }, admin);
  const v = await call(st, env, 'GET', '/api/admin/nifty', undefined, admin);
  assert.equal(v.has_secret, true); assert.equal(v.secret, undefined); // la clave no se devuelve
  let job = niftyBatch(st, env);
  const t = JSON.parse(job.body).turnos[0];
  assert.deepEqual([t.codigo, t.estado, t.canal, t.fuente, t.campania, t.origen, t.fecha, t.hora], [r.booking.code, 'pendiente', 'Meta', 'instagram', 'Head spa', 'turnero', '2026-11-05', '10:00']);
  assert.ok(!job.body.includes(who.email) && !job.body.includes(who.name) && !job.body.includes('555')); // sin datos personales
  // Falla: reintenta más tarde
  niftyDone(st, env, job, { ok: false, error: 'HTTP 500' });
  assert.equal(niftyBatch(st, env), null);
  env.advance(3 * 60e3);
  job = niftyBatch(st, env); niftyDone(st, env, job, { ok: true });
  assert.equal(niftyBatch(st, env), null); // al día
  // Sube el comprobante: queda en el turno y el turno cambia → vuelve a mandarse
  const tr = await call(st, env, 'POST', `/api/bookings/${r.booking.token}/transfer-sent`, { comprobante: 'data:application/pdf;base64,JVBERi0=' });
  assert.equal(tr.booking.transfer.has_proof, true);
  assert.equal(st.bookings[0].transfer_proof, 'uploads/comprobante-pdf.bin');
  await call(st, env, 'PATCH', `/api/admin/bookings/${st.bookings[0].id}`, { transfer: 'confirm', amount: 18000 }, admin);
  job = niftyBatch(st, env);
  assert.equal(JSON.parse(job.body).turnos[0].estado, 'confirmado');
  assert.equal(JSON.parse(job.body).turnos[0].sena, 18000);
});

test('cancelar con aviso (y mensaje) o sin aviso; eliminar turnos; en Nifty quedan como cancelados', async () => {
  const { niftyBatch, niftyDone } = await import('../server/core/spa-core.js');
  const st = seedState(), env = { ...makeEnv(), deleteImage: async (r) => env.deleted.push(r), deleted: [] };
  const admin = { id: 900, email: 'adm@ejemplo.com', name: 'Adm', role: 'admin', password_hash: 'x$x' }, recep = { id: 901, email: 'rec@ejemplo.com', name: 'Rec', role: 'staff', password_hash: 'x$x' };
  st.staff.push(admin, recep);
  const book = async (time, extra = {}) => (await call(st, env, 'POST', '/api/admin/bookings', { service_id: 1, date: '2026-11-05', time, name: 'Ana Prueba', email: 'ana@ejemplo.com', phone: '221 555 1234', ...extra }, admin)).booking;
  // Cancelar avisando, con mensaje para la clienta
  const a = await book('10:00');
  env.sent.length = 0;
  await call(st, env, 'PATCH', `/api/admin/bookings/${a.id}`, { status: 'cancelled', reason: 'pidió cancelar', message: 'Escribinos y te damos otro horario.', notify: true }, recep);
  const m = env.sent.find((x) => x.template === 'booking_cancelled');
  assert.equal(m.to, 'ana@ejemplo.com');
  assert.ok(m.html.includes('Escribinos y te damos otro horario.') && !m.html.includes('pidió cancelar')); // el motivo interno no va en el correo
  assert.equal(st.bookings.find((x) => x.id === a.id).status, 'cancelled');
  // Cancelar sin avisar
  const b = await book('12:00');
  env.sent.length = 0;
  await call(st, env, 'PATCH', `/api/admin/bookings/${b.id}`, { status: 'cancelled', notify: false }, admin);
  assert.ok(!env.sent.some((x) => x.template === 'booking_cancelled'));
  // Eliminar: solo administración; si tiene cobros en la caja, primero se borran
  await call(st, env, 'PUT', '/api/admin/nifty', { enabled: true, url: 'https://nifty-agency.com/webhooks/turnos/47', secret: 'nft_' + 'a'.repeat(48) }, admin);
  const c = await book('15:00');
  niftyDone(st, env, niftyBatch(st, env), { ok: true }); // Nifty ya los tiene
  st.bookings.find((x) => x.id === c.id).transfer_proof = 'uploads/comprobante-x.png';
  await assert.rejects(call(st, env, 'DELETE', `/api/admin/bookings/${c.id}`, undefined, recep), (e) => e.status === 403);
  await call(st, env, 'POST', '/api/admin/cash/moves', { type: 'in', method: 'efectivo', amount: 5000, booking_id: c.id }, admin);
  await assert.rejects(call(st, env, 'DELETE', `/api/admin/bookings/${c.id}`, undefined, admin), (e) => e.status === 409);
  st.cash.moves = [];
  env.sent.length = 0;
  await call(st, env, 'DELETE', `/api/admin/bookings/${c.id}`, undefined, admin);
  assert.ok(!st.bookings.some((x) => x.id === c.id));
  assert.deepEqual(env.deleted, ['uploads/comprobante-x.png']);
  assert.equal(env.sent.length, 0); // eliminar no manda correos
  assert.ok(slotsFor(st, env, st.services[0], '2026-11-05').includes('15:00')); // el horario queda libre
  const job = niftyBatch(st, env);
  const t = JSON.parse(job.body).turnos.find((x) => x.codigo === c.code);
  assert.equal(t.estado, 'cancelado');
  niftyDone(st, env, job, { ok: true });
  assert.equal(niftyBatch(st, env), null);
  assert.ok(st.audit.some((x) => x.action.startsWith(`Eliminó el turno ${c.code}`)));
});

test('borrar asesoras: con turnos por venir o realizados no; con solo cancelados sí (y su usuario)', async () => {
  const st = seedState(), env = makeEnv();
  const admin = { id: 900, email: 'adm@ejemplo.com', name: 'Adm', role: 'admin', password_hash: 'x$x' }; st.staff.push(admin);
  const tri = st.staff.find((u) => u.name === 'Trinidad'), bel = st.staff.find((u) => u.name === 'Belén');
  const r = await call(st, env, 'POST', '/api/bookings', { service_id: 1, date: '2026-11-05', time: '10:00', ...who });
  assert.equal(st.bookings[0].pro_id, tri.id);
  await assert.rejects(call(st, env, 'DELETE', `/api/admin/pros/${tri.id}`, undefined, admin), (e) => e.status === 409 && /por venir/.test(e.message));
  await call(st, env, 'POST', `/api/bookings/${r.booking.token}/cancel`, {});
  await call(st, env, 'DELETE', `/api/admin/pros/${tri.id}`, undefined, admin);
  await call(st, env, 'DELETE', `/api/admin/pros/${bel.id}`, undefined, admin);
  assert.ok(!st.staff.some((u) => u.role === 'pro'));
  assert.equal(st.bookings[0].pro_id, null);
  assert.equal(st.bookings[0].pro_name, 'Trinidad'); // en el historial sigue figurando
  // Sin asesoras, el turnero sigue ofreciendo horarios (el turno queda sin asignar).
  assert.ok(slotsFor(st, env, st.services[0], '2026-11-05').includes('10:00'));
  // Una asesora con turnos realizados no se borra: se da de baja.
  const p = (await call(st, env, 'POST', '/api/admin/pros', { name: 'Sofía', services: [1], pay: { type: 'comision', percent: 40 } }, admin)).pro;
  st.bookings.push({ ...st.bookings[0], id: 999, pro_id: p.id, status: 'completed' });
  await assert.rejects(call(st, env, 'DELETE', `/api/admin/pros/${p.id}`, undefined, admin), (e) => e.status === 409 && /dala de baja/.test(e.message));
});

test('avisos de turno nuevo: al correo de la casa y a la asesora que lo atiende', async () => {
  const st = seedState(), env = makeEnv();
  assert.equal(st.settings.booking.staffEmails, 'casasamadhi.laplata@gmail.com');
  // En una base ya publicada sin correo del equipo, la migración lo carga (sin pisar uno que ya esté).
  const { ensure } = await import('../server/core/spa-core.js').then((m) => ({ ensure: m.handle }));
  const old = seedState(); old.settings.booking.staffEmails = ''; old.meta.migrations = old.meta.migrations.filter((k) => k !== 'avisos-equipo-2026-11');
  await ensure(old, env, { method: 'GET', path: '/api/site', query: {}, body: {} });
  assert.equal(old.settings.booking.staffEmails, 'casasamadhi.laplata@gmail.com');
  const mine = seedState(); mine.settings.booking.staffEmails = 'otro@ejemplo.com'; mine.meta.migrations = mine.meta.migrations.filter((k) => k !== 'avisos-equipo-2026-11');
  await ensure(mine, env, { method: 'GET', path: '/api/site', query: {}, body: {} });
  assert.equal(mine.settings.booking.staffEmails, 'otro@ejemplo.com');
  // Trinidad con correo: al confirmarse la seña le llega su turno; al equipo, "Tenés un turno nuevo".
  st.staff.find((u) => u.name === 'Trinidad').email = 'trinidad@ejemplo.com';
  const r = await call(st, env, 'POST', '/api/bookings', { service_id: 1, date: '2026-11-04', time: '10:00', ...who });
  await call(st, env, 'POST', '/api/pay/simulate', { kind: 'booking', token: r.booking.token, result: 'approved' });
  const team = env.sent.find((m) => m.template === 'booking_staff'), pro = env.sent.find((m) => m.template === 'pro_booking');
  assert.equal(team.to, 'casasamadhi.laplata@gmail.com');
  assert.match(team.subject, /^Tenés un turno nuevo/);
  assert.equal(pro.to, 'trinidad@ejemplo.com');
  assert.match(pro.html, /Tenés un turno nuevo/);
});

test('la web sin JavaScript (Google, revisión de anuncios): links reales de WhatsApp y de reservar, sin "#"', async () => {
  const { readFileSync } = await import('node:fs');
  const { SITE } = await import('../server/core/defaults.js');
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.ok(!/href="#"/.test(html), 'no quedan links "#"');
  const num = '549' + SITE.whatsapp.replace(/\D/g, '').replace(/^0/, '');
  const was = [...html.matchAll(/href="(https:\/\/wa\.me\/[^"?]+)/g)].map((m) => m[1]);
  assert.ok(was.length >= 4);
  assert.ok(was.every((u) => u === 'https://wa.me/' + num), 'el WhatsApp del HTML es el de la casa');
  assert.ok(html.includes('href="/turnos" data-book>Reservar turno</a>'));
  assert.ok(html.includes('href="/turnos?seccion=manicuria" data-book-cat="manicuria">Reservar manicuría</a>'));
  assert.ok(!/<button[^>]*data-book[\s>]/.test(html), 'los Reservar son links, no botones');
});
