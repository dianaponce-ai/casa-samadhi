// Mercado Pago · Checkout Pro. Sin MP_ACCESS_TOKEN funciona en modo prueba con un pago simulado.
import { config } from '../lib/config.js';

const API = 'https://api.mercadopago.com';
async function mp(method, path, body, idem) {
  const res = await fetch(API + path, {
    method, signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${config.mp.accessToken}`, 'Content-Type': 'application/json', ...(idem ? { 'X-Idempotency-Key': idem } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Mercado Pago respondió con un error: ${data.message || data.error || res.status}`);
  return data;
}

/** Devuelve el link para pagar. kind: 'booking' (seña) o 'gift'. */
export async function createPayment({ kind, token, title, amount, email, ref }) {
  const back = `${config.publicUrl}/?pago=${kind}.${token}`;
  if (config.mp.mock) return `${back}&simulado=1`;
  const pref = await mp('POST', '/checkout/preferences', {
    items: [{ id: ref, title: title.slice(0, 250), quantity: 1, unit_price: Number(amount), currency_id: 'ARS' }],
    payer: { email },
    external_reference: `${kind}:${token}`,
    back_urls: { success: back, pending: back, failure: back },
    auto_return: 'approved',
    notification_url: `${config.publicUrl}/api/webhooks/mp`,
    statement_descriptor: 'CASA SAMADHI',
    expires: true,
    expiration_date_to: new Date(Date.now() + 2 * 3600e3).toISOString(),
    payment_methods: { installments: 1, excluded_payment_types: [{ id: 'ticket' }] },
  }, `${kind}-${token}`);
  return pref.init_point;
}

/** Lee un pago y devuelve { kind, token, status, amount, payment_id } o null si no es de esta web. */
export async function readPayment(id) {
  if (config.mp.mock) return null;
  const p = await mp('GET', `/v1/payments/${encodeURIComponent(id)}`);
  const [kind, token] = String(p.external_reference || '').split(':');
  if (!['booking', 'gift'].includes(kind) || !token) return null;
  return { kind, token, status: p.status, amount: p.transaction_amount, payment_id: String(p.id) };
}
