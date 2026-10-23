// Emails de Casa Samadhi. Funciones puras: reciben los datos y devuelven { subject, html }.
// Las usa el servidor (para enviarlos) y la vista previa (para mostrarlos en el panel).
// Desde el panel se puede cambiar el asunto y el texto de cada uno, con variables como {nombre}.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = (n) => '$ ' + Math.round(Number(n) || 0).toLocaleString('es-AR');
const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export function longDate(start) {
  const [d, t] = String(start).split(' ');
  const [y, m, dd] = d.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, dd)).getUTCDay();
  return `${DAYS[wd]} ${dd} de ${MONTHS[m - 1]}${t ? ` a las ${t} h` : ''}`;
}
const dayOnly = (iso) => longDate(String(iso || '').slice(0, 10));
const first = (n) => String(n || '').trim().split(/\s+/)[0] || '';

function layout({ site, title, intro, body, cta, ctaUrl, cta2, cta2Url, foot }) {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f4efe6;font-family:Helvetica,Arial,sans-serif;color:#191816">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4efe6;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;background:#faf7f1;border:1px solid #d8cebe">
<tr><td style="padding:30px 32px 10px;text-align:center"><div style="font-family:Georgia,serif;font-size:26px;letter-spacing:.06em">CASA SAMADHI</div><div style="font-size:10px;letter-spacing:.5em;color:#6d675d;margin-top:4px">CAFÉ &amp; SPA</div></td></tr>
<tr><td style="padding:18px 32px 6px"><h1 style="font-family:Georgia,serif;font-weight:400;font-size:26px;margin:0 0 10px">${esc(title)}</h1>${intro ? `<p style="font-size:15px;line-height:1.6;margin:0 0 14px">${intro}</p>` : ''}</td></tr>
<tr><td style="padding:0 32px">${body || ''}</td></tr>
${cta ? `<tr><td style="padding:18px 32px 6px"><a href="${esc(ctaUrl)}" style="display:inline-block;background:#191816;color:#f4efe6;text-decoration:none;padding:14px 26px;font-size:12px;letter-spacing:.24em;text-transform:uppercase">${esc(cta)}</a>${cta2 ? ` <a href="${esc(cta2Url)}" style="display:inline-block;border:1px solid #191816;color:#191816;text-decoration:none;padding:13px 22px;font-size:12px;letter-spacing:.24em;text-transform:uppercase;margin-top:8px">${esc(cta2)}</a>` : ''}</td></tr>` : ''}
<tr><td style="padding:22px 32px 28px;font-size:12px;line-height:1.6;color:#6d675d">${foot || ''}${foot ? '<br><br>' : ''}${esc(site.address)} · ${esc(site.city)}<br>WhatsApp ${esc(site.whatsapp)} · @${esc(site.instagram)}</td></tr>
</table></td></tr></table></body></html>`;
}
const rows = (list) => `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid #d8cebe;font-size:14px">${list.filter(Boolean).map(([k, v]) => `<tr><td style="padding:10px 0;border-bottom:1px solid #d8cebe;color:#6d675d">${esc(k)}</td><td style="padding:10px 0;border-bottom:1px solid #d8cebe;text-align:right">${v}</td></tr>`).join('')}</table>`;
const rest = (b) => Math.max(0, b.price - (b.deposit_paid || 0) - (b.gift_applied || 0));
function bookingRows(b, { contact = false } = {}) {
  return rows([
    ['Servicio', esc(b.service_name)],
    ['Día y hora', esc(longDate(b.start))],
    b.duration ? ['Duración', `${b.duration} min`] : null,
    contact ? ['Clienta', `${esc(b.name)}<br>${esc(b.phone)}${b.email ? `<br>${esc(b.email)}` : ''}`] : null,
    b.price ? ['Precio', money(b.price)] : null,
    b.gift_applied ? ['Gift card', `− ${money(b.gift_applied)}`] : null,
    b.deposit_paid ? ['Seña pagada', money(b.deposit_paid)] : null,
    b.price ? ['Resta abonar en la casa', `<b>${money(rest(b))}</b>`] : null,
    ['Código de reserva', `<b>${esc(b.code)}</b>`],
    contact && b.notes ? ['Notas', `<i>${esc(b.notes)}</i>`] : null,
  ]);
}
function giftBox(g) {
  return `<div style="background:#4c5a3d;color:#f4efe6;padding:26px;text-align:center;margin:6px 0">
<div style="font-size:10px;letter-spacing:.5em">GIFT CARD</div>
<div style="font-family:Georgia,serif;font-size:34px;margin:10px 0">${esc(g.service_name || money(g.amount))}</div>
${g.message ? `<div style="font-family:Georgia,serif;font-style:italic;font-size:16px;margin:8px 0 14px">“${esc(g.message)}”</div>` : ''}
<div style="font-size:11px;letter-spacing:.3em">CÓDIGO</div><div style="font-size:22px;letter-spacing:.18em;margin-top:4px"><b>${esc(g.code)}</b></div>
${g.balance !== undefined && g.balance < g.amount ? `<div style="font-size:13px;margin-top:10px">Saldo: ${money(g.balance)}</div>` : ''}
<div style="font-size:12px;margin-top:12px;opacity:.85">Válida hasta el ${esc(dayOnly(g.expires_at))}</div></div>`;
}

// Variables que se pueden usar en el asunto y el texto de cada email.
export const VARS = {
  '{nombre}': 'Nombre de la clienta (o de quien compró la gift card)',
  '{servicio}': 'Servicio o ritual',
  '{fecha}': 'Día y hora del turno',
  '{codigo}': 'Código del turno o de la gift card',
  '{monto}': 'Seña, monto o saldo según el email',
};
function varsFor(c) {
  const b = c.booking, g = c.gift, w = c.w;
  return {
    '{nombre}': first(b?.name || g?.buyer_name || w?.name || c.person?.name || ''),
    '{servicio}': b?.service_name || g?.service_name || '',
    '{fecha}': b ? longDate(b.start) : g?.expires_at ? dayOnly(g.expires_at) : '',
    '{codigo}': b?.code || g?.code || w?.code || '',
    '{monto}': b ? money(b.deposit_due || b.deposit_paid || b.price) : g ? money(g.balance ?? g.amount) : '',
  };
}
const fill = (text, v) => String(text || '').replace(/\{[a-z]+\}/g, (k) => (k in v ? v[k] : k));

// group: 'turnos' | 'giftcards' | 'casa' · to: a quién le llega · when: cuándo se manda
export const TEMPLATES = {
  booking_confirmed: { group: 'turnos', label: 'Turno confirmado', to: 'Clienta', when: 'Cuando se acredita la seña, o al reservar si no hay seña o la cubre una gift card.',
    render: (c) => ({ subject: `Tu turno está confirmado · ${c.booking.service_name}`, title: 'Te esperamos', intro: `Hola ${esc(first(c.booking.name))}, tu turno en Casa Samadhi está confirmado.`,
      body: bookingRows(c.booking), cta: 'Ver o cancelar mi turno', ctaUrl: c.link, foot: `Te pedimos llegar 10 minutos antes. Podés cancelar o reprogramar hasta ${c.cancelHours} horas antes desde el botón de arriba o por WhatsApp.` }) },
  booking_pending: { group: 'turnos', label: 'Falta pagar la seña', to: 'Clienta', when: 'Si reservó y no pagó la seña, unos minutos después (se configura abajo), mientras el horario sigue guardado.',
    render: (c) => ({ subject: `Te guardamos el horario · ${c.booking.service_name}`, title: 'Te falta un paso', intro: `Hola ${esc(first(c.booking.name))}, reservaste ${esc(c.booking.service_name)} para el ${esc(longDate(c.booking.start))}. Para confirmarlo falta pagar la seña de ${money(c.booking.deposit_due)}.`,
      body: bookingRows(c.booking), cta: 'Pagar la seña', ctaUrl: c.link, foot: `Guardamos el horario hasta las ${esc(c.holdUntil || '')}. Después se libera para otra persona.` }) },
  booking_expired: { group: 'turnos', label: 'Se liberó el horario', to: 'Clienta', when: 'Cuando vence el tiempo para pagar la seña y el horario se libera.',
    render: (c) => ({ subject: 'Se liberó tu horario en Casa Samadhi', title: 'No llegamos a confirmar tu turno', intro: `Hola ${esc(first(c.booking.name))}, como no se acreditó la seña, liberamos el horario del ${esc(longDate(c.booking.start))}. Si querés, podés reservar de nuevo.`,
      body: '', cta: 'Reservar de nuevo', ctaUrl: c.home + '#reservar', foot: 'Si pagaste y te llegó este email, escribinos por WhatsApp y lo resolvemos.' }) },
  booking_rescheduled: { group: 'turnos', label: 'Turno reprogramado', to: 'Clienta', when: 'Cuando el equipo cambia el día u horario desde el panel (si se marca "Avisarle por email").',
    render: (c) => ({ subject: `Cambiamos tu turno · ${longDate(c.booking.start)}`, title: 'Tu turno tiene nuevo horario', intro: `Hola ${esc(first(c.booking.name))}, tu turno quedó para el <b>${esc(longDate(c.booking.start))}</b>.`,
      body: bookingRows(c.booking), cta: 'Ver mi turno', ctaUrl: c.link }) },
  booking_reminder: { group: 'turnos', label: 'Recordatorio', to: 'Clienta', when: 'Antes del turno (24 horas por defecto, se cambia en Configuración).',
    render: (c) => ({ subject: `Te esperamos · ${c.booking.service_name}`, title: 'Recordatorio de tu turno', intro: `Hola ${esc(first(c.booking.name))}, te recordamos tu turno en Casa Samadhi.`,
      body: bookingRows(c.booking), cta: 'Ver mi turno', ctaUrl: c.link, foot: 'Si no podés venir, avisanos así le damos el horario a otra persona.' }) },
  booking_cancelled: { group: 'turnos', label: 'Turno cancelado', to: 'Clienta', when: 'Cuando la clienta cancela desde su link o el equipo lo cancela en el panel.',
    render: (c) => ({ subject: `Tu turno fue cancelado · ${c.booking.service_name}`, title: 'Turno cancelado', intro: `Hola ${esc(first(c.booking.name))}, cancelamos tu turno del ${esc(longDate(c.booking.start))}.${c.booking.deposit_paid ? ' Te escribimos para devolverte la seña o pasarla a otra fecha.' : ''}`,
      body: '', cta: 'Reservar otro turno', ctaUrl: c.home + '#reservar' }) },
  booking_thanks: { group: 'turnos', label: 'Gracias por venir', to: 'Clienta', when: 'Al día siguiente de un turno realizado. Invita a dejar una reseña y a volver.',
    render: (c) => ({ subject: '¡Gracias por venir a Casa Samadhi!', title: 'Gracias por regalarte este momento', intro: `Hola ${esc(first(c.booking.name))}, gracias por elegirnos para tu ${esc(c.booking.service_name)}. Nos encantaría saber cómo te sentiste.`,
      body: '', cta: c.reviewUrl ? 'Dejar una reseña' : 'Reservar otra vez', ctaUrl: c.reviewUrl || c.home + '#reservar', cta2: c.reviewUrl ? 'Reservar otra vez' : '', cta2Url: c.home + '#reservar', foot: 'También podés regalarle una gift card a alguien que lo necesite.' }) },

  giftcard_buyer: { group: 'giftcards', label: 'Gift card comprada', to: 'Quien la compra', when: 'Cuando se acredita el pago de la gift card (o al emitirla en el panel con email).',
    render: (c) => ({ subject: `Tu gift card de Casa Samadhi · ${c.gift.service_name || money(c.gift.amount)}`, title: '¡Gracias por regalar bienestar!', intro: `Hola ${esc(first(c.gift.buyer_name))}, tu gift card ya está activa.${c.gift.to_email && c.gift.send_to_recipient ? ` También se la mandamos a ${esc(c.gift.to_name || c.gift.to_email)}.` : ' Podés reenviarla o imprimirla desde el botón.'}`,
      body: giftBox(c.gift), cta: 'Ver la gift card', ctaUrl: c.link }) },
  giftcard_recipient: { group: 'giftcards', label: 'Gift card recibida', to: 'Quien la recibe', when: 'Si quien compra elige mandársela por email a quien la recibe.',
    render: (c) => ({ subject: `${first(c.gift.buyer_name)} te regaló un momento en Casa Samadhi`, title: 'Un regalo para vos', intro: `Hola ${esc(first(c.gift.to_name))}, ${esc(c.gift.buyer_name)} te regaló una gift card de Casa Samadhi.`,
      body: giftBox(c.gift), cta: 'Reservar mi turno', ctaUrl: c.home + '#reservar', foot: 'Al reservar, escribí el código de la tarjeta y se descuenta del total.' }) },
  giftcard_expiring: { group: 'giftcards', label: 'Gift card por vencer', to: 'Quien la compra', when: 'Cuando falta poco para que venza y todavía tiene saldo (30 días antes por defecto).',
    render: (c) => ({ subject: 'Tu gift card de Casa Samadhi vence pronto', title: 'No te olvides de tu gift card', intro: `Hola ${esc(first(c.gift.buyer_name))}, la gift card <b>${esc(c.gift.code)}</b> vence el ${esc(dayOnly(c.gift.expires_at))} y todavía tiene ${money(c.gift.balance)} de saldo.`,
      body: giftBox(c.gift), cta: 'Reservar un turno', ctaUrl: c.home + '#reservar' }) },
  withdrawal: { group: 'giftcards', label: 'Arrepentimiento recibido', to: 'Clienta', when: 'Cuando alguien usa el Botón de arrepentimiento. Incluye el código de trámite (obligatorio).',
    render: (c) => ({ subject: `Recibimos tu pedido de arrepentimiento · ${c.w.code}`, title: 'Recibimos tu pedido', intro: `Hola ${esc(first(c.w.name))}, registramos tu pedido de arrepentimiento. Tu código de trámite es <b>${esc(c.w.code)}</b>. Te escribimos dentro de las 48 horas hábiles para coordinar la devolución.`, body: '' }) },

  password_reset: { group: 'cuenta', label: 'Recuperar contraseña', to: 'Clienta o equipo', when: 'Cuando alguien toca "¿Te olvidaste la contraseña?" y escribe su email. El link vale 1 hora y se usa una sola vez.',
    render: (c) => ({ subject: 'Cambiá tu contraseña de Casa Samadhi', title: 'Elegí una contraseña nueva', intro: `Hola ${esc(first(c.person?.name))}, recibimos un pedido para cambiar la contraseña de tu cuenta${c.person?.staff ? ' del panel' : ''}. Tocá el botón para elegir una nueva.`,
      body: '', cta: 'Cambiar mi contraseña', ctaUrl: c.resetLink, foot: 'El link vale 1 hora y se puede usar una sola vez. Si no lo pediste vos, ignorá este email: tu contraseña no cambia.' }) },

  booking_staff: { group: 'casa', label: 'Turno nuevo', to: 'Equipo', when: 'Cada vez que se confirma un turno reservado en la web.',
    render: (c) => ({ subject: `Turno nuevo: ${c.booking.service_name} · ${longDate(c.booking.start)}`, title: 'Entró un turno', intro: '', body: bookingRows(c.booking, { contact: true }), cta: 'Abrir el panel', ctaUrl: c.home + 'admin/' }) },
  staff_cancelled: { group: 'casa', label: 'Cancelación de una clienta', to: 'Equipo', when: 'Cuando una clienta cancela su turno desde el link del email.',
    render: (c) => ({ subject: `Canceló: ${c.booking.name} · ${longDate(c.booking.start)}`, title: 'Una clienta canceló', intro: c.booking.deposit_paid ? `Tenía una seña paga de <b>${money(c.booking.deposit_paid)}</b>: hay que devolverla o pasarla a otra fecha.` : 'El horario quedó libre.',
      body: bookingRows(c.booking, { contact: true }), cta: 'Abrir el panel', ctaUrl: c.home + 'admin/' }) },
  staff_attention: { group: 'casa', label: 'Turno para revisar', to: 'Equipo', when: 'Si una seña se acredita tarde y el horario ya estaba ocupado: hay que reprogramar o devolver.',
    render: (c) => ({ subject: `Revisar: seña fuera de término · ${c.booking.code}`, title: 'Hay un turno para revisar', intro: `${esc(c.booking.name)} pagó la seña después de que venció la reserva y el horario ya estaba tomado. Coordiná otro horario o la devolución.`,
      body: bookingRows(c.booking, { contact: true }), cta: 'Abrir el panel', ctaUrl: c.home + 'admin/' }) },
  staff_giftcard: { group: 'casa', label: 'Gift card vendida', to: 'Equipo', when: 'Cuando se acredita el pago de una gift card en la web.',
    render: (c) => ({ subject: `Gift card vendida · ${c.gift.service_name || money(c.gift.amount)}`, title: 'Se vendió una gift card', intro: `${esc(c.gift.buyer_name)} (${esc(c.gift.buyer_email)}) compró una gift card${c.gift.to_name ? ` para ${esc(c.gift.to_name)}` : ''}.`, body: giftBox(c.gift) }) },
  staff_withdrawal: { group: 'casa', label: 'Pedido de arrepentimiento', to: 'Equipo', when: 'Cuando alguien usa el Botón de arrepentimiento. Hay que responder dentro de las 48 horas hábiles.',
    render: (c) => ({ subject: `Arrepentimiento ${c.w.code} · ${c.w.ref}`, title: 'Pedido de arrepentimiento', intro: `${esc(c.w.name)} (${esc(c.w.email)}) pidió arrepentirse de <b>${esc(c.w.ref)}</b>.${c.w.reason ? `<br><i>${esc(c.w.reason)}</i>` : ''}`, body: '', cta: 'Abrir el panel', ctaUrl: c.home + 'admin/' }) },
  staff_daily: { group: 'casa', label: 'Agenda de mañana', to: 'Equipo', when: 'Todos los días a la hora que elijas, con los turnos del día siguiente.',
    render: (c) => ({ subject: `Agenda de mañana · ${c.day ? longDate(c.day) : ''} · ${c.list.length} turno${c.list.length === 1 ? '' : 's'}`, title: `Mañana: ${c.day ? longDate(c.day) : ''}`, intro: c.list.length ? '' : 'No hay turnos para mañana.',
      body: c.list.length ? rows(c.list.map((b) => [`${b.start.slice(11)} · ${b.service_name}`, `${esc(b.name)}<br><span style="color:#6d675d">${esc(b.phone)}${b.price ? ` · resta ${money(rest(b))}` : ''}</span>`])) : '', cta: 'Ver la agenda', ctaUrl: c.home + 'admin/' }) },
};
export const GROUPS = { turnos: 'Turnos', giftcards: 'Gift cards y legales', cuenta: 'Cuenta', casa: 'Para el equipo' };

/** custom: { subject, intro } escritos en el panel (opcionales). */
export function renderEmail(template, ctx, custom = {}) {
  const t = TEMPLATES[template];
  if (!t) throw new Error('Plantilla desconocida: ' + template);
  const r = t.render(ctx);
  const v = varsFor(ctx);
  const subject = custom.subject?.trim() ? fill(custom.subject, v) : r.subject;
  const intro = custom.intro?.trim() ? esc(fill(custom.intro, v)).replace(/\n/g, '<br>') : r.intro;
  const title = custom.title?.trim() ? fill(custom.title, v) : r.title;
  return { subject, html: layout({ ...r, title, intro, site: ctx.site }), defaults: { subject: r.subject, title: r.title } };
}

/** Datos de ejemplo para ver y probar cada email desde el panel. */
export function sampleContext(template, site, now = Date.now()) {
  const d = new Date(now - 3 * 3600e3 + 2 * 864e5);
  const day = d.toISOString().slice(0, 10);
  const booking = { code: 'T-1042', token: 'ejemplo', service_name: 'Ritual esencial', start: `${day} 11:00`, duration: 60, price: 55000, deposit: 16500, deposit_due: 16500, deposit_paid: template === 'booking_pending' ? 0 : 16500, gift_applied: 0, name: 'Lucía Fernández', email: 'lucia@ejemplo.com', phone: '221 555-1234', notes: 'Primera vez' };
  const gift = { code: 'CS-K7QM-2XPA', token: 'ejemplo', amount: 55000, balance: template === 'giftcard_expiring' ? 25000 : 55000, service_name: 'Ritual esencial', buyer_name: 'Martina Herrera', buyer_email: 'martina@ejemplo.com', to_name: 'Sofía', to_email: 'sofia@ejemplo.com', message: '¡Feliz cumple! Regalate un momento para vos.', send_to_recipient: true, expires_at: new Date(now + (template === 'giftcard_expiring' ? 25 : 180) * 864e5).toISOString() };
  const w = { code: 'ARR-7KQ2MX', name: 'Lucía Fernández', email: 'lucia@ejemplo.com', ref: 'T-1042', reason: 'No voy a poder ir.' };
  const list = [{ ...booking }, { ...booking, code: 'T-1043', start: `${day} 15:30`, service_name: 'Esmaltado semipermanente', duration: 60, price: 16000, deposit_paid: 4800, name: 'Carolina Gómez', phone: '221 555-9876' }];
  return { site, booking, gift, w, list, day, person: { name: 'Lucía Fernández' }, resetLink: (site.publicUrl || '') + '/#clave/ejemplo', link: '#', home: (site.publicUrl || '') + '/', cancelHours: 24, holdUntil: '11:30', reviewUrl: site.reviewUrl || '' };
}
