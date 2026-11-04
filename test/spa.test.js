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
  assert.equal(r.booking.deposit_due, 16500);
  await assert.rejects(call(st, env, 'POST', '/api/bookings', { service_id: 2, date: '2026-11-04', time: '10:30', ...who }), (e) => e instanceof ApiError && e.status === 409);
  const p = await call(st, env, 'POST', '/api/pay/simulate', { kind: 'booking', token: r.booking.token, result: 'approved' });
  assert.equal(p.booking.status, 'confirmed');
  assert.equal(p.booking.deposit_paid, 16500);
  assert.ok(env.sent.some((m) => m.template === 'booking_confirmed' && m.to === 'ana@ejemplo.com'));
  // La manicuría usa otro espacio: ese horario sigue libre para ella.
  assert.ok(slotsFor(st, env, st.services.find((s) => s.slug === 'esmaltado-tradicional'), '2026-11-04').includes('10:00'));
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
  assert.equal(st.giftcards[0].balance, 55000);
});

test('bloqueos y panel', async () => {
  const st = seedState(), env = makeEnv();
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
  const st = seedState(), env = makeEnv();
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
  assert.equal(t.sent, 22);
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
  assert.equal(c.spent, 55000);
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
  assert.equal(r.booking.price, 55000 + 16000);
  assert.equal(r.booking.deposit_due, 16500 + 4800);
  assert.equal(st.bookings[0].group, st.bookings[1].group);
  const p = await call(st, env, 'POST', '/api/pay/simulate', { kind: 'booking', token: r.booking.token });
  assert.equal(p.booking.status, 'confirmed');
  assert.deepEqual(st.bookings.map((b) => b.deposit_paid), [16500, 4800]);
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
  assert.equal(r.booking.transfer.amount, 16500);
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
  assert.equal(st.bookings[0].deposit_paid, 16500);
  assert.ok(env.sent.some((m) => m.template === 'booking_confirmed'));
  assert.ok(st.audit.some((a) => a.user === 'Admin' && a.action.includes('Confirmó la transferencia')));
});

test('profesionales: se asignan solas, ven solo lo suyo, pueden cancelar y cobran su comisión', async () => {
  const st = seedState(), env = makeEnv();
  const admin = { id: 1, email: 'a@a.com', name: 'Admin', role: 'admin', password_hash: 'x$x' }; st.staff.push(admin); st.ids.staff = 1;
  const adm = (m, p, b) => call(st, env, m, '/api/admin' + p, b, admin);
  const ana = (await adm('POST', '/pros', { name: 'Ana Gómez', email: 'ana.pro@ejemplo.com', password: 'clave-de-ana', services: [1, 2, 3], pay: { type: 'comision', percent: 40 } })).pro;
  const sol = (await adm('POST', '/pros', { name: 'Sol Ruiz', services: [1], pay: { type: 'basico_comision', percent: 20, base: 300000 } })).pro;
  assert.equal(sol.has_access, false);
  // Dos turnos a la misma hora: una profesional cada uno. Un tercero ya no entra.
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
  await assert.rejects(proCall('GET', '/clients'), (e) => e.status === 403);
  const other = st.bookings.find((b) => b.pro_id !== ana.id);
  await assert.rejects(proCall('GET', '/bookings/' + other.id), (e) => e.status === 404);
  await assert.rejects(proCall('PATCH', '/bookings/' + mine.bookings[0].id, { status: 'completed' }), (e) => e.status === 403);
  // Comisiones: 40% de 55.000 para Ana; básico + 20% para Sol.
  const c = await proCall('GET', '/commissions?month=2026-11');
  assert.equal(c.upcoming, 22000);
  env.advance(3 * 864e5); await tick(st, env);
  const c2 = await proCall('GET', '/commissions?month=2026-11');
  assert.equal(c2.earned, 22000);
  const list = await adm('GET', '/pros?month=2026-11');
  const solRow = list.pros.find((p) => p.id === sol.id);
  assert.equal(solRow.month.total, 300000 + 11000);
  // Si cambia el porcentaje, lo ya realizado queda con el de ese momento.
  await adm('PATCH', '/pros/' + ana.id, { pay: { type: 'comision', percent: 50 } });
  assert.equal((await proCall('GET', '/commissions?month=2026-11')).earned, 22000);
  // Cancelar un turno propio queda registrado con el motivo.
  const b4 = await call(st, env, 'POST', '/api/bookings', { service_id: 2, date: '2026-11-10', time: '15:00', ...who });
  await call(st, env, 'POST', '/api/pay/simulate', { kind: 'booking', token: b4.booking.token });
  const id4 = st.bookings.at(-1).id;
  await assert.rejects(proCall('PATCH', '/bookings/' + id4, { status: 'cancelled' }), (e) => e.status === 422);
  await proCall('PATCH', '/bookings/' + id4, { status: 'cancelled', reason: 'Estoy enferma' });
  assert.equal(st.bookings.at(-1).status, 'cancelled');
  const log = await adm('GET', '/audit?user=' + ana.id);
  assert.ok(log.audit.some((a) => a.action.includes('Canceló el turno') && a.action.includes('Estoy enferma')));
  assert.ok((await adm('GET', '/audit')).audit.some((a) => a.user === 'Admin' && a.action.includes('Creó la profesional Ana Gómez')));
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
