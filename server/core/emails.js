// Emails de Casa Samadhi. Funciones puras: reciben los datos y devuelven { subject, html }.
// Las usa el servidor (para enviarlos) y la vista previa (para mostrarlos en el panel).

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

function layout({ site, title, intro, body, cta, ctaUrl, foot }) {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f4efe6;font-family:Helvetica,Arial,sans-serif;color:#191816">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4efe6;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;background:#faf7f1;border:1px solid #d8cebe">
<tr><td style="padding:30px 32px 10px;text-align:center"><div style="font-family:Georgia,serif;font-size:26px;letter-spacing:.06em">CASA SAMADHI</div><div style="font-size:10px;letter-spacing:.5em;color:#6d675d;margin-top:4px">CAFÉ &amp; SPA</div></td></tr>
<tr><td style="padding:18px 32px 6px"><h1 style="font-family:Georgia,serif;font-weight:400;font-size:26px;margin:0 0 10px">${esc(title)}</h1>${intro ? `<p style="font-size:15px;line-height:1.6;margin:0 0 14px">${intro}</p>` : ''}</td></tr>
<tr><td style="padding:0 32px">${body || ''}</td></tr>
${cta ? `<tr><td style="padding:18px 32px 6px"><a href="${esc(ctaUrl)}" style="display:inline-block;background:#191816;color:#f4efe6;text-decoration:none;padding:14px 26px;font-size:12px;letter-spacing:.24em;text-transform:uppercase">${esc(cta)}</a></td></tr>` : ''}
<tr><td style="padding:22px 32px 28px;font-size:12px;line-height:1.6;color:#6d675d">${foot || ''}${foot ? '<br><br>' : ''}${esc(site.address)} · ${esc(site.city)}<br>WhatsApp ${esc(site.whatsapp)} · @${esc(site.instagram)}</td></tr>
</table></td></tr></table></body></html>`;
}
const rows = (list) => `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid #d8cebe;font-size:14px">${list.filter(Boolean).map(([k, v]) => `<tr><td style="padding:10px 0;border-bottom:1px solid #d8cebe;color:#6d675d">${esc(k)}</td><td style="padding:10px 0;border-bottom:1px solid #d8cebe;text-align:right">${v}</td></tr>`).join('')}</table>`;

function bookingRows(b) {
  return rows([
    ['Servicio', esc(b.service_name)],
    ['Día y hora', esc(longDate(b.start))],
    ['Duración', `${b.duration} min`],
    b.price ? ['Precio', money(b.price)] : null,
    b.gift_applied ? ['Gift card', `− ${money(b.gift_applied)}`] : null,
    b.deposit_paid ? ['Seña pagada', money(b.deposit_paid)] : null,
    b.price ? ['Resta abonar en la casa', `<b>${money(Math.max(0, b.price - (b.deposit_paid || 0) - (b.gift_applied || 0)))}</b>`] : null,
    ['Código de reserva', `<b>${esc(b.code)}</b>`],
  ]);
}

export const TEMPLATES = {
  booking_confirmed: { label: 'Turno confirmado', to: 'clienta', render: (c) => ({
    subject: `Tu turno está confirmado · ${c.booking.service_name}`,
    html: layout({ site: c.site, title: 'Te esperamos', intro: `Hola ${esc(c.booking.name.split(' ')[0])}, tu turno está confirmado.`, body: bookingRows(c.booking),
      cta: 'Ver o cancelar mi turno', ctaUrl: c.link, foot: `Te pedimos llegar 10 minutos antes. Podés cancelar o reprogramar hasta ${c.cancelHours} horas antes desde el botón de arriba o por WhatsApp.` }),
  }) },
  booking_staff: { label: 'Aviso de turno nuevo', to: 'casa', render: (c) => ({
    subject: `Turno nuevo: ${c.booking.service_name} · ${longDate(c.booking.start)}`,
    html: layout({ site: c.site, title: 'Entró un turno', intro: `${esc(c.booking.name)} · ${esc(c.booking.phone)} · ${esc(c.booking.email)}${c.booking.notes ? `<br><i>${esc(c.booking.notes)}</i>` : ''}`, body: bookingRows(c.booking) }),
  }) },
  booking_reminder: { label: 'Recordatorio del turno', to: 'clienta', render: (c) => ({
    subject: `Mañana te esperamos · ${c.booking.service_name}`,
    html: layout({ site: c.site, title: 'Recordatorio de tu turno', intro: `Hola ${esc(c.booking.name.split(' ')[0])}, te recordamos tu turno en Casa Samadhi.`, body: bookingRows(c.booking),
      cta: 'Ver mi turno', ctaUrl: c.link, foot: 'Si no podés venir, avisanos así le damos el horario a otra persona.' }),
  }) },
  booking_cancelled: { label: 'Turno cancelado', to: 'clienta', render: (c) => ({
    subject: `Tu turno fue cancelado · ${c.booking.service_name}`,
    html: layout({ site: c.site, title: 'Turno cancelado', intro: `Hola ${esc(c.booking.name.split(' ')[0])}, cancelamos tu turno del ${esc(longDate(c.booking.start))}.${c.booking.deposit_paid ? ' Te escribimos para devolverte la seña o pasarla a otra fecha.' : ''}`,
      body: '', cta: 'Reservar otro turno', ctaUrl: c.home }),
  }) },
  giftcard_buyer: { label: 'Gift card comprada', to: 'clienta', render: (c) => ({
    subject: `Tu gift card de Casa Samadhi · ${money(c.gift.amount)}`,
    html: layout({ site: c.site, title: '¡Gracias por regalar bienestar!', intro: `Hola ${esc(c.gift.buyer_name.split(' ')[0])}, tu gift card ya está activa.${c.gift.to_email && c.gift.send_to_recipient ? ` También se la mandamos a ${esc(c.gift.to_name || c.gift.to_email)}.` : ' Podés reenviarla o imprimirla desde el botón.'}`,
      body: giftBox(c.gift), cta: 'Ver la gift card', ctaUrl: c.link }),
  }) },
  giftcard_recipient: { label: 'Gift card recibida', to: 'quien la recibe', render: (c) => ({
    subject: `${c.gift.buyer_name.split(' ')[0]} te regaló un momento en Casa Samadhi`,
    html: layout({ site: c.site, title: 'Un regalo para vos', intro: `Hola ${esc((c.gift.to_name || '').split(' ')[0] || '')}, ${esc(c.gift.buyer_name)} te regaló una gift card de Casa Samadhi.`,
      body: giftBox(c.gift), cta: 'Reservar mi turno', ctaUrl: c.home, foot: 'Al reservar, escribí el código de la tarjeta y se descuenta del total.' }),
  }) },
  withdrawal: { label: 'Arrepentimiento recibido', to: 'clienta', render: (c) => ({
    subject: `Recibimos tu pedido de arrepentimiento · ${c.w.code}`,
    html: layout({ site: c.site, title: 'Recibimos tu pedido', intro: `Hola ${esc(c.w.name.split(' ')[0])}, registramos tu pedido de arrepentimiento. Tu código de trámite es <b>${esc(c.w.code)}</b>. Te escribimos dentro de las 48 horas hábiles para coordinar la devolución.`, body: '' }),
  }) },
};

function giftBox(g) {
  return `<div style="background:#4c5a3d;color:#f4efe6;padding:26px;text-align:center;margin:6px 0">
<div style="font-size:10px;letter-spacing:.5em">GIFT CARD</div>
<div style="font-family:Georgia,serif;font-size:34px;margin:10px 0">${esc(g.service_name || money(g.amount))}</div>
${g.message ? `<div style="font-family:Georgia,serif;font-style:italic;font-size:16px;margin:8px 0 14px">“${esc(g.message)}”</div>` : ''}
<div style="font-size:11px;letter-spacing:.3em">CÓDIGO</div><div style="font-size:22px;letter-spacing:.18em;margin-top:4px"><b>${esc(g.code)}</b></div>
<div style="font-size:12px;margin-top:12px;opacity:.85">Válida hasta el ${esc(longDate(g.expires_at).replace(/ a las .*/, ''))}</div></div>`;
}

export function renderEmail(template, ctx) {
  const t = TEMPLATES[template];
  if (!t) throw new Error('Plantilla desconocida: ' + template);
  return t.render(ctx);
}
