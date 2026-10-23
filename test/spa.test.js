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
