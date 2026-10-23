// Panel de Casa Samadhi: agenda, turnos, servicios, horarios, gift cards, eventos y configuración.
// Se puede montar dentro de otra página (vista previa): window.__ADMIN_EMBED = { root, api, exit }.
const EMBED = window.__ADMIN_EMBED || null;
const ROOT = EMBED?.root || document;
const $ = (s, el = ROOT) => el.querySelector(s);
const $$ = (s, el = ROOT) => [...el.querySelectorAll(s)];
let ME = { role: 'admin' };
const isAdmin = () => ME.role === 'admin';
let embedHash = 'agenda';
const currentHash = () => (EMBED ? embedHash : location.hash.slice(1));
const navTo = (h) => { if (EMBED) { embedHash = h; route(); } else location.hash = h; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (n) => '$ ' + Math.round(Number(n) || 0).toLocaleString('es-AR');
const num = (n) => Number(n || 0).toLocaleString('es-AR');
const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const capF = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const longDay = (k) => { const [y, m, d] = k.split('-').map(Number); return `${DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} de ${MONTHS[m - 1]}`; };
const shortWhen = (s) => { const [d, t] = s.split(' '); const [, m, dd] = d.split('-'); return `${dd}/${m} ${t}`; };
const at = (iso) => (iso ? new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' }) : '');
const todayKey = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const addDay = (k, n) => new Date(Date.parse(k + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

let toastT;
function toast(msg, bad = false) { const t = $('#toast'); t.textContent = msg; t.className = 'toast on' + (bad ? ' bad' : ''); clearTimeout(toastT); toastT = setTimeout(() => (t.className = 'toast'), 2600); }
async function api(path, { method = 'GET', body } = {}) {
  if (EMBED) return EMBED.api(path, { method, body });
  const res = await fetch('/api/admin' + path, { method, headers: { 'x-casa-admin': '1', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/login') { showLogin(); throw new Error(data.error || 'Tu sesión venció.'); }
  if (!res.ok) { const e = new Error(data.error || 'No se pudo completar. Probá de nuevo.'); e.data = data; throw e; }
  return data;
}
function confirmInline(anchor, message, onYes, yesLabel = 'Confirmar') {
  const box = document.createElement('div');
  box.className = 'confirm';
  box.innerHTML = `<span>${esc(message)}</span><button class="btn sm danger" data-yes>${esc(yesLabel)}</button><button class="btn sm" data-no>Cancelar</button>`;
  anchor.after(box); anchor.hidden = true;
  box.querySelector('[data-no]').onclick = () => { box.remove(); anchor.hidden = false; };
  box.querySelector('[data-yes]').onclick = async () => { box.querySelectorAll('button').forEach((b) => (b.disabled = true)); try { await onYes(); } finally { box.remove(); anchor.hidden = false; } };
}

// ── Sesión ───────────────────────────────────────────────
async function showLogin() {
  if (EMBED) return EMBED.exit();
  $('#app').hidden = true; $('#login').hidden = false;
  try { const r = await fetch('/api/admin/setup-needed').then((r) => r.json()); $('#lHint').hidden = !r.needed; } catch {}
  $('#lEmail').focus();
}
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault(); $('#lErr').textContent = '';
  try { await api('/login', { method: 'POST', body: { email: $('#lEmail').value, password: $('#lPass').value } }); $('#lPass').value = ''; boot(); } catch (err) { $('#lErr').textContent = err.message; }
});
$('#logout').addEventListener('click', async () => { if (EMBED) return EMBED.exit(true); await api('/logout', { method: 'POST', body: {} }).catch(() => {}); location.href = '/'; });
ROOT.addEventListener('click', (e) => { const a = e.target.closest('a[href^="#"]'); if (a && EMBED) { e.preventDefault(); navTo(a.getAttribute('href').slice(1)); } });

// ── Navegación ───────────────────────────────────────────
const SECTIONS = [['agenda', 'Agenda'], ['resumen', 'Resumen'], ['turnos', 'Turnos'], ['clientas', 'Clientas'], ['servicios', 'Servicios'], ['horarios', 'Horarios y bloqueos'], ['giftcards', 'Gift cards'], ['eventos', 'Eventos'], ['contenido', 'Textos de la web'], ['emails', 'Emails'], ['arrepentimientos', 'Arrepentimientos'], ['configuracion', 'Configuración'], ['usuarios', 'Usuarios']];
const ADMIN_ONLY = new Set(['contenido', 'configuracion', 'usuarios']);
let attention = 0;
function renderNav(active) {
  $('#nav').innerHTML = SECTIONS.filter(([k]) => isAdmin() || !ADMIN_ONLY.has(k)).map(([k, l]) => `<button data-nav="${k}" ${k === active ? 'aria-current="page"' : ''}>${l}${k === 'resumen' && attention ? `<span class="count">${attention}</span>` : ''}</button>`).join('');
}
$('#nav').addEventListener('click', (e) => { const b = e.target.closest('[data-nav]'); if (b) navTo(b.dataset.nav); });
if (!EMBED) window.addEventListener('hashchange', route);
function route() {
  let [sec = 'agenda', id] = currentHash().split('/');
  if (ADMIN_ONLY.has(sec) && !isAdmin()) sec = 'agenda';
  renderNav({ turno: 'turnos', giftcard: 'giftcards' }[sec] || sec);
  const view = $('#view');
  view.innerHTML = '<p class="muted">Cargando…</p>';
  const fn = { agenda: () => viewAgenda(id), resumen: viewDashboard, turnos: viewBookings, turno: () => viewBooking(id), clientas: viewClients, servicios: viewServices, horarios: viewHours, giftcards: viewGifts, giftcard: () => viewGift(id), eventos: viewEvents, contenido: viewContent, emails: viewEmails, arrepentimientos: viewWithdrawals, configuracion: viewSettings, usuarios: viewUsers }[sec] || viewAgenda;
  Promise.resolve(fn()).catch((err) => { view.innerHTML = `<div class="notice">${esc(err.message)}</div>`; });
  view.focus({ preventScroll: true });
  if (EMBED) EMBED.scrollTop?.(); else window.scrollTo(0, 0);
}
const STATUS = { pending_payment: 'Esperando seña', confirmed: 'Confirmado', completed: 'Realizado', cancelled: 'Cancelado', no_show: 'No vino', expired: 'Seña vencida', attention: 'Revisar' };
const GSTATUS = { pending_payment: 'Esperando pago', active: 'Activa', used: 'Usada', expired: 'Vencida', cancelled: 'Anulada' };
const pill = (s, map = STATUS) => `<span class="pill s-${s}">${esc(map[s] || s)}</span>`;
let SERVICES = null, RESOURCES = null;
async function services() { if (!SERVICES) { const r = await api('/services'); SERVICES = r.services; RESOURCES = r.resources; } return SERVICES; }

// ── Agenda ───────────────────────────────────────────────
async function viewAgenda(date) {
  date = /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date : todayKey();
  const [a, svcs] = await Promise.all([api('/agenda?date=' + date), services()]);
  const open = a.hours.length ? Math.min(...a.hours.map((w) => toMin(w.from))) : 9 * 60;
  const close = a.hours.length ? Math.max(...a.hours.map((w) => toMin(w.to))) : 19 * 60;
  const first = Math.min(open, ...a.bookings.map((b) => toMin(b.start.slice(11)))), last = Math.max(close, ...a.bookings.map((b) => toMin(b.start.slice(11)) + b.duration));
  const from = Math.floor(first / 60) * 60, to = Math.ceil(last / 60) * 60, PX = 1.1; // px por minuto
  const y = (m) => (m - from) * PX;
  const hoursLbl = []; for (let m = from; m <= to; m += 60) hoursLbl.push(`<span style="top:${y(m)}px">${String(m / 60).padStart(2, '0')}:00</span>`);
  const active = a.bookings.filter((b) => b.status !== 'cancelled');
  $('#view').innerHTML = `
    <div class="page-head"><div><h1>Agenda</h1><div class="sub">${active.length} turno${active.length === 1 ? '' : 's'} · ${a.hours.length ? a.hours.map((w) => `${w.from} a ${w.to}`).join(' y ') : 'cerrado'}</div></div>
      <div class="actions"><button class="btn primary" id="newBk">Cargar turno</button></div></div>
    <div class="daynav" style="margin-bottom:14px"><button class="btn sm" data-d="${addDay(date, -1)}">← Anterior</button><button class="btn sm" data-d="${todayKey()}">Hoy</button><button class="btn sm" data-d="${addDay(date, 1)}">Siguiente →</button><input type="date" id="agDate" value="${date}"><span class="t">${esc(capF(longDay(date)))}</span></div>
    <div id="bkForm"></div>
    <div class="agenda" style="--cols:${a.resources.length};--h:${y(to)}px;--hour:${60 * PX}px">
      <div class="colh"></div>${a.resources.map((r) => `<div class="colh">${esc(r.name)}${r.capacity > 1 ? ` · ${r.capacity} a la vez` : ''}</div>`).join('')}
      <div class="times">${hoursLbl.join('')}</div>
      ${a.resources.map((r) => {
        const bks = a.bookings.filter((b) => b.resource === r.key);
        const blocks = a.blocks.filter((k) => k.resource === 'all' || k.resource === r.key);
        return `<div class="col">${!a.hours.length && !bks.length ? '<div class="closed">Cerrado</div>' : ''}
          ${blocks.map((k) => { const s = k.from ? toMin(k.from) : from, e = k.to ? toMin(k.to) : to; return `<div class="blk" style="top:${y(Math.max(from, s))}px;height:${(Math.min(to, e) - Math.max(from, s)) * PX}px">Bloqueado${k.reason ? ` · ${esc(k.reason)}` : ''}</div>`; }).join('')}
          ${bks.map((b, i) => { const s = toMin(b.start.slice(11)); const same = bks.filter((x, j) => j < i && toMin(x.start.slice(11)) < s + b.duration && s < toMin(x.start.slice(11)) + x.duration).length; return `<a class="ev s-${b.status}" href="#turno/${b.id}" style="top:${y(s)}px;height:${Math.max(26, b.duration * PX - 2)}px;${same ? `left:${4 + same * 18}px` : ''}"><b>${b.start.slice(11)} · ${esc(b.name)}</b>${esc(b.service_name)}${b.status !== 'confirmed' ? ` · ${esc(STATUS[b.status])}` : ''}</a>`; }).join('')}</div>`;
      }).join('')}
    </div>
    ${a.bookings.length ? `<div class="card" style="margin-top:14px"><h2>Lista del día</h2><div class="tablewrap"><table><tr><th>Hora</th><th>Clienta</th><th>Servicio</th><th>Estado</th><th class="r">Resta cobrar</th></tr>
      ${a.bookings.map((b) => `<tr class="click" data-href="turno/${b.id}"><td class="n">${b.start.slice(11)}</td><td>${esc(b.name)}<div class="small muted">${esc(b.phone)}</div></td><td>${esc(b.service_name)}</td><td>${pill(b.status)}</td><td class="r n">${b.price ? fmt(Math.max(0, b.price - b.deposit_paid - b.gift_applied)) : '—'}</td></tr>`).join('')}</table></div></div>` : ''}`;
  $$('[data-d]').forEach((b) => (b.onclick = () => navTo('agenda/' + b.dataset.d)));
  $('#agDate').onchange = (e) => e.target.value && navTo('agenda/' + e.target.value);
  $$('tr[data-href]').forEach((tr) => (tr.onclick = () => navTo(tr.dataset.href)));
  $('#newBk').onclick = () => manualBooking($('#bkForm'), date, svcs);
}
function manualBooking(box, date, svcs) {
  box.innerHTML = `<div class="card form" style="margin-bottom:14px"><h2>Cargar turno (WhatsApp, teléfono o en la casa)</h2>
    <div class="row"><label class="fl"><span>Servicio</span><select id="mSvc">${svcs.filter((s) => s.duration > 0).map((s) => `<option value="${s.id}">${esc(s.name)}${s.tag && s.category === 'manicuria' ? ` · ${esc(s.tag)}` : ''} (${s.duration} min)</option>`).join('')}</select></label>
      <label class="fl"><span>Día</span><input type="date" id="mDate" value="${date}"></label><label class="fl"><span>Hora</span><select id="mTime"></select></label></div>
    <div class="row"><label class="fl"><span>Nombre</span><input id="mName"></label><label class="fl"><span>Teléfono</span><input id="mPhone" inputmode="tel"></label><label class="fl"><span>Email (opcional)</span><input id="mEmail" type="email"></label></div>
    <div class="row"><label class="fl"><span>Seña recibida ($)</span><input id="mDep" type="number" min="0" value="0"></label><label class="fl"><span>Notas</span><input id="mNotes"></label></div>
    <label class="check"><input type="checkbox" id="mNotify"> Mandarle la confirmación por email</label>
    <label class="check"><input type="checkbox" id="mForce"> Cargar igual aunque el horario esté ocupado o fuera de horario</label>
    <p class="err" id="mErr"></p>
    <div class="actions"><button class="btn primary" id="mSave">Guardar turno</button><button class="btn" id="mCancel">Cancelar</button></div></div>`;
  const loadTimes = async () => {
    const r = await api(`/slots?service=${$('#mSvc').value}&date=${$('#mDate').value}`);
    $('#mTime').innerHTML = r.slots.length ? r.slots.map((t) => `<option>${t}</option>`).join('') : '<option value="">Sin horarios libres</option>';
    if (!r.slots.length) $('#mTime').insertAdjacentHTML('beforeend', Array.from({ length: 24 }, (_, i) => `<option>${String(8 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}</option>`).join(''));
  };
  $('#mSvc').onchange = loadTimes; $('#mDate').onchange = loadTimes; loadTimes();
  $('#mCancel').onclick = () => (box.innerHTML = '');
  $('#mSave').onclick = async () => {
    $('#mErr').textContent = '';
    try {
      const r = await api('/bookings', { method: 'POST', body: { service_id: Number($('#mSvc').value), date: $('#mDate').value, time: $('#mTime').value, name: $('#mName').value, phone: $('#mPhone').value, email: $('#mEmail').value, deposit_paid: $('#mDep').value, notes: $('#mNotes').value, notify: $('#mNotify').checked, force: $('#mForce').checked } });
      toast(`Turno ${r.booking.code} cargado`); navTo('agenda/' + $('#mDate').value);
    } catch (e) { $('#mErr').textContent = e.message; }
  };
}

// ── Resumen ──────────────────────────────────────────────
async function viewDashboard() {
  const d = await api('/dashboard');
  attention = d.attention.length; renderNav('resumen');
  $('#view').innerHTML = `
    <div class="page-head"><div><h1>Resumen</h1><div class="sub">${esc(capF(longDay(d.today)))}</div></div><div class="actions"><a class="btn primary" href="#agenda">Ver la agenda</a></div></div>
    ${d.mock ? '<div class="notice">Mercado Pago está en <b>modo prueba</b>: las señas y las gift cards se pagan con un pago simulado. Cargá MP_ACCESS_TOKEN para cobrar de verdad.</div>' : ''}
    ${d.attention.length ? `<div class="card" style="margin-bottom:14px;border-color:var(--bad)"><h2>Para revisar</h2><table>${d.attention.map((b) => `<tr class="click" data-href="turno/${b.id}"><td>${esc(b.code)}</td><td>${esc(b.name)}</td><td>${esc(b.service_name)} · ${shortWhen(b.start)}</td><td>${b.status === 'attention' ? 'Pagó la seña fuera de término y el horario estaba ocupado' : `Cancelado con seña de ${fmt(b.deposit_paid)}: devolver o pasar a otra fecha`}</td></tr>`).join('')}</table></div>` : ''}
    <div class="grid g4">
      <div class="card kpi accent"><div class="l">Turnos hoy</div><div class="v">${num(d.todays.filter((b) => b.status !== 'cancelled').length)}</div><div class="l">${num(d.week)} en los próximos 7 días</div></div>
      <div class="card kpi"><div class="l">Señas cobradas · 30 días</div><div class="v">${fmt(d.deposits30)}</div><div class="l">${num(d.bookings30)} turnos reservados</div></div>
      <div class="card kpi"><div class="l">Gift cards vendidas · 30 días</div><div class="v">${fmt(d.gifts30)}</div><div class="l">${num(d.giftActive)} activas</div></div>
      <div class="card kpi"><div class="l">Saldo en gift cards</div><div class="v">${fmt(d.giftBalance)}</div><div class="l">por usar</div></div>
    </div>
    <div class="grid g2" style="margin-top:14px">
      <div class="card"><h2>Hoy</h2>${d.todays.length ? `<table>${d.todays.map((b) => `<tr class="click" data-href="turno/${b.id}"><td class="n">${b.start.slice(11)}</td><td>${esc(b.name)}</td><td>${esc(b.service_name)}</td><td>${pill(b.status)}</td></tr>`).join('')}</table>` : '<p class="muted">No hay turnos hoy.</p>'}</div>
      <div class="card"><h2>Lo más reservado · 30 días</h2>${d.top.length ? `<table>${d.top.map(([n, c]) => `<tr><td>${esc(n)}</td><td class="r n">${c}</td></tr>`).join('')}</table>` : '<p class="muted">Todavía no hay reservas.</p>'}${d.pending ? `<p class="small muted" style="margin-top:10px">${d.pending} reserva${d.pending > 1 ? 's' : ''} esperando que paguen la seña.</p>` : ''}</div>
    </div>`;
  $$('tr[data-href]').forEach((tr) => (tr.onclick = () => navTo(tr.dataset.href)));
}

// ── Turnos ───────────────────────────────────────────────
async function viewBookings() {
  $('#view').innerHTML = `<div class="page-head"><div><h1>Turnos</h1></div></div>
    <div class="toolbar"><input id="bq" placeholder="Buscar por nombre, email, teléfono o código"><select id="bs"><option value="">Todos los estados</option>${Object.entries(STATUS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select>
      <select id="bw"><option value="next">Próximos</option><option value="past">Anteriores</option><option value="all">Todos</option></select></div><div id="blist"><p class="muted">Cargando…</p></div>`;
  const load = async () => {
    const w = $('#bw').value, t = todayKey();
    const qs = new URLSearchParams({ q: $('#bq').value, status: $('#bs').value, ...(w === 'next' ? { from: t, order: 'asc' } : w === 'past' ? { to: addDay(t, -1) } : {}) });
    const r = await api('/bookings?' + qs);
    $('#blist').innerHTML = r.bookings.length ? `<div class="card tablewrap"><table><tr><th>Código</th><th>Día y hora</th><th>Clienta</th><th>Servicio</th><th>Estado</th><th class="r">Precio</th><th class="r">Seña</th></tr>
      ${r.bookings.map((b) => `<tr class="click" data-href="turno/${b.id}"><td>${esc(b.code)}</td><td class="n">${shortWhen(b.start)}</td><td>${esc(b.name)}<div class="small muted">${esc(b.phone)}</div></td><td>${esc(b.service_name)}</td><td>${pill(b.status)}${b.refund_pending ? ' <span class="pill s-attention">Devolver seña</span>' : ''}</td><td class="r n">${b.price ? fmt(b.price) : '—'}</td><td class="r n">${b.deposit_paid ? fmt(b.deposit_paid) : '—'}</td></tr>`).join('')}</table></div>` : '<div class="empty card">No hay turnos con ese filtro.</div>';
    $$('tr[data-href]').forEach((tr) => (tr.onclick = () => navTo(tr.dataset.href)));
  };
  let t; $('#bq').oninput = () => { clearTimeout(t); t = setTimeout(load, 250); };
  $('#bs').onchange = load; $('#bw').onchange = load;
  load();
}
async function viewBooking(id) {
  const { booking: b, emails } = await api('/bookings/' + id);
  const rest = Math.max(0, b.price - b.deposit_paid - b.gift_applied);
  const wa = `https://wa.me/549${String(b.phone).replace(/\D/g, '').replace(/^0/, '').replace(/^549?/, '')}`;
  $('#view').innerHTML = `
    <div class="page-head"><div><h1>Turno ${esc(b.code)}</h1><div class="sub">${pill(b.status)} ${b.refund_pending ? '<span class="pill s-attention">Seña por devolver</span>' : ''} · ${b.source === 'panel' ? 'cargado en el panel' : 'reservado en la web'} el ${at(b.created_at)}</div></div>
      <div class="actions"><a class="btn" href="#agenda/${b.start.slice(0, 10)}">Ver en la agenda</a></div></div>
    <div class="grid g2">
      <div class="card form"><h2>${esc(b.service_name)}</h2>
        <dl class="kv"><dt>Día y hora</dt><dd>${esc(capF(longDay(b.start.slice(0, 10))))} · ${b.start.slice(11)} h</dd><dt>Duración</dt><dd>${b.duration} min</dd>
          <dt>Precio</dt><dd>${b.price ? fmt(b.price) : '—'}</dd>${b.gift_applied ? `<dt>Gift card</dt><dd>− ${fmt(b.gift_applied)} (${esc(b.gift_code)})</dd>` : ''}<dt>Seña pagada</dt><dd>${fmt(b.deposit_paid)}${b.payment_id ? ` <span class="small muted">· pago ${esc(b.payment_id)}</span>` : ''}</dd>
          <dt>Resta cobrar en la casa</dt><dd><b>${fmt(rest)}</b></dd></dl>
        <div class="row"><label class="fl"><span>Estado</span><select id="bStatus">${Object.entries(STATUS).map(([k, l]) => `<option value="${k}" ${k === b.status ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <label class="fl"><span>Notas internas</span><input id="bNotes" value="${esc(b.notes)}"></label></div>
        ${b.refund_pending ? '<label class="check"><input type="checkbox" id="bRefund" checked> La seña todavía no se devolvió ni se pasó a otro turno</label>' : ''}
        <div class="actions"><button class="btn primary" id="bSave">Guardar</button></div>
        <h2 style="margin-top:8px">Reprogramar</h2>
        <div class="row"><label class="fl"><span>Día</span><input type="date" id="rDate" value="${b.start.slice(0, 10)}"></label><label class="fl"><span>Hora</span><select id="rTime"></select></label></div>
        <label class="check"><input type="checkbox" id="rNotify" ${b.email ? 'checked' : ''}> Avisarle por email</label><label class="check"><input type="checkbox" id="rForce"> Cargar igual aunque el horario esté ocupado</label>
        <p class="err" id="rErr"></p><div class="actions"><button class="btn" id="rSave">Cambiar horario</button></div>
      </div>
      <div class="card form"><h2>Clienta</h2>
        <dl class="kv"><dt>Nombre</dt><dd>${esc(b.name)}</dd><dt>Teléfono</dt><dd>${esc(b.phone)} ${b.phone ? `· <a href="${wa}" target="_blank" rel="noopener">WhatsApp</a>` : ''}</dd><dt>Email</dt><dd>${b.email ? `<a href="mailto:${esc(b.email)}">${esc(b.email)}</a>` : '—'}</dd></dl>
        <h2>Historial</h2><ul class="history">${b.history.map((h) => `<li><span>${at(h.at)}</span><span>${esc(h.text)}</span></li>`).join('') || '<li class="muted">Sin movimientos.</li>'}</ul>
        ${emails.length ? `<h2>Emails</h2><ul class="history">${emails.map((m) => `<li><span>${at(m.at)}</span><span>${esc(m.subject)} · <i>${esc(m.status)}</i></span></li>`).join('')}</ul>` : ''}
      </div>
    </div>`;
  const loadTimes = async () => {
    const r = await api(`/slots?service=${b.service_id}&date=${$('#rDate').value}&ignore=${b.id}`);
    const cur = $('#rDate').value === b.start.slice(0, 10) ? b.start.slice(11) : '';
    $('#rTime').innerHTML = (cur && !r.slots.includes(cur) ? [cur, ...r.slots] : r.slots).map((t) => `<option ${t === cur ? 'selected' : ''}>${t}</option>`).join('') || '<option value="">Sin horarios libres</option>';
  };
  $('#rDate').onchange = loadTimes; loadTimes();
  $('#bSave').onclick = async () => {
    try { await api('/bookings/' + b.id, { method: 'PATCH', body: { status: $('#bStatus').value, notes: $('#bNotes').value, ...($('#bRefund') ? { refund_pending: $('#bRefund').checked } : {}) } }); toast('Guardado'); viewBooking(b.id); } catch (e) { toast(e.message, true); }
  };
  $('#rSave').onclick = async () => {
    $('#rErr').textContent = '';
    try { await api('/bookings/' + b.id, { method: 'PATCH', body: { date: $('#rDate').value, time: $('#rTime').value, notify: $('#rNotify').checked, force: $('#rForce').checked } }); toast('Turno reprogramado'); viewBooking(b.id); } catch (e) { $('#rErr').textContent = e.message; }
  };
}

// ── Clientas ─────────────────────────────────────────────
async function viewClients() {
  $('#view').innerHTML = `<div class="page-head"><div><h1>Clientas</h1><div class="sub">Armado a partir de los turnos</div></div></div><div class="toolbar"><input id="cq" placeholder="Buscar"></div><div id="clist"></div>`;
  const load = async () => {
    const r = await api('/clients?q=' + encodeURIComponent($('#cq').value));
    $('#clist').innerHTML = r.clients.length ? `<div class="card tablewrap"><table><tr><th>Nombre</th><th>Contacto</th><th>Lo que más se hace</th><th class="r">Visitas</th><th class="r">Próximos</th><th>Último turno</th></tr>
      ${r.clients.map((c) => `<tr><td>${esc(c.name)}</td><td>${esc(c.phone)}<div class="small muted">${esc(c.email)}</div></td><td>${esc(c.top)}</td><td class="r n">${c.visits}</td><td class="r n">${c.upcoming}</td><td class="n">${c.last ? shortWhen(c.last) : ''}</td></tr>`).join('')}</table></div>` : '<div class="empty card">Todavía no hay clientas.</div>';
  };
  let t; $('#cq').oninput = () => { clearTimeout(t); t = setTimeout(load, 250); };
  load();
}

// ── Servicios ────────────────────────────────────────────
const MODES = { online: 'Reserva online con seña', whatsapp: 'Se coordina por WhatsApp', menu: 'Solo en la lista de precios' };
async function viewServices(editId = null) {
  SERVICES = null;
  const list = await services();
  const r = await api('/services');
  const cats = r.categories, res = r.resources;
  const ed = editId === 'new' ? { id: null, name: '', tag: '', short: '', includes: [], category: cats[0].key, resource: res[0].key, mode: 'online', duration: 60, price: '', image: '', visible: true, featured: false, days: [], whatsapp: '' } : list.find((s) => s.id === editId);
  $('#view').innerHTML = `<div class="page-head"><div><h1>Servicios</h1><div class="sub">${list.length} servicios · los precios y duraciones se ven en la web</div></div><div class="actions"><button class="btn primary" id="sNew">Nuevo servicio</button></div></div>
    ${ed ? `<div class="card form" id="sEd" style="margin-bottom:14px"><h2>${ed.id ? 'Editar servicio' : 'Nuevo servicio'}</h2>
      <div class="row"><label class="fl"><span>Nombre</span><input id="eName" value="${esc(ed.name)}"></label><label class="fl"><span>Etiqueta (opcional)</span><input id="eTag" value="${esc(ed.tag)}" placeholder="Head spa, Diseño sencillo…"></label></div>
      <div class="row"><label class="fl"><span>Sección de la web</span><select id="eCat">${cats.map((c) => `<option value="${c.key}" ${c.key === ed.category ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
        <label class="fl"><span>Cómo se reserva</span><select id="eMode">${Object.entries(MODES).map(([k, l]) => `<option value="${k}" ${k === ed.mode ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="fl"><span>Dónde se hace</span><select id="eRes">${res.map((x) => `<option value="${x.key}" ${x.key === ed.resource ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select><span class="help">Dos servicios del mismo espacio no se superponen.</span></label></div>
      <div class="row"><label class="fl"><span>Precio ($)</span><input id="ePrice" type="number" min="0" value="${ed.price ?? ''}" placeholder="Vacío = consultar"></label><label class="fl"><span>Duración (minutos)</span><input id="eDur" type="number" min="0" step="5" value="${ed.duration}"></label>
        <label class="fl"><span>WhatsApp propio (opcional)</span><input id="eWa" value="${esc(ed.whatsapp)}" placeholder="Si lo atiende otra persona"></label></div>
      <label class="fl"><span>Descripción corta</span><textarea id="eShort" rows="2">${esc(ed.short)}</textarea></label>
      <label class="fl"><span>Qué incluye (uno por línea)</span><textarea id="eInc" rows="4">${esc((ed.includes || []).join('\n'))}</textarea></label>
      <div class="row"><label class="fl"><span>Foto</span><select id="eImg"><option value="">Sin foto</option>${['headspa-ritual', 'headspa-agua', 'headspa-joya', 'camilla', 'manicuria-cafe', 'unas', 'barras-access', 'deco-cristal', 'cafeteria', 'cafe-plantas', 'vitrina'].map((f) => `<option value="media/${f}.webp" ${ed.image === `media/${f}.webp` ? 'selected' : ''}>${f}</option>`).join('')}${ed.image && !ed.image.startsWith('media/') ? `<option selected value="${esc(ed.image)}">${esc(ed.image)}</option>` : ''}</select></label>
        <div class="fl"><span>Días en que se ofrece</span><div class="chips">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<label><input type="checkbox" data-day="${d}" ${!ed.days?.length || ed.days.includes(d) ? 'checked' : ''}> ${DAYS[d].slice(0, 3)}</label>`).join('')}</div></div></div>
      <label class="check"><input type="checkbox" id="eVis" ${ed.visible ? 'checked' : ''}> Visible en la web</label>
      <p class="err" id="eErr"></p>
      <div class="actions"><button class="btn primary" id="eSave">Guardar</button><button class="btn" id="eCancel">Cancelar</button>${ed.id ? '<button class="btn danger" id="eDel">Borrar</button>' : ''}</div></div>` : ''}
    ${cats.map((c) => { const items = list.filter((s) => s.category === c.key); return items.length ? `<div class="card" style="margin-bottom:14px"><h2>${esc(c.name)}</h2><div class="tablewrap"><table><tr><th>Servicio</th><th>Reserva</th><th class="r">Duración</th><th class="r">Precio</th><th></th></tr>
      ${items.map((s) => `<tr class="click" data-edit="${s.id}"><td>${esc(s.name)}${s.tag ? ` <span class="muted">· ${esc(s.tag)}</span>` : ''}${s.visible ? '' : ' <span class="pill">Oculto</span>'}</td><td>${MODES[s.mode]}</td><td class="r n">${s.duration ? s.duration + ' min' : '—'}</td><td class="r n">${s.price ? fmt(s.price) : 'Consultar'}</td>
        <td class="r"><button class="btn sm" data-move="${s.id}:-1" title="Subir">↑</button> <button class="btn sm" data-move="${s.id}:1" title="Bajar">↓</button></td></tr>`).join('')}</table></div></div>` : ''; }).join('')}`;
  $('#sNew').onclick = () => viewServices('new');
  $$('[data-edit]').forEach((tr) => (tr.onclick = (e) => { if (e.target.closest('[data-move]')) return; viewServices(Number(tr.dataset.edit)); }));
  $$('[data-move]').forEach((b) => (b.onclick = async () => {
    const [id, dir] = b.dataset.move.split(':').map(Number);
    const s = list.find((x) => x.id === id), same = list.filter((x) => x.category === s.category);
    const i = same.indexOf(s), j = i + dir;
    if (j < 0 || j >= same.length) return;
    const o = same[j];
    await api('/services/' + s.id, { method: 'PATCH', body: { position: o.position } });
    await api('/services/' + o.id, { method: 'PATCH', body: { position: s.position } });
    viewServices();
  }));
  if (!ed) return;
  $('#sEd').scrollIntoView({ block: 'start' });
  $('#eCancel').onclick = () => viewServices();
  $('#eSave').onclick = async () => {
    const days = $$('[data-day]').filter((c) => c.checked).map((c) => Number(c.dataset.day));
    const body = { name: $('#eName').value, tag: $('#eTag').value, category: $('#eCat').value, mode: $('#eMode').value, resource: $('#eRes').value, price: $('#ePrice').value, duration: $('#eDur').value, whatsapp: $('#eWa').value, short: $('#eShort').value, includes: $('#eInc').value, image: $('#eImg').value, visible: $('#eVis').checked, days: days.length === 7 ? [] : days };
    try { await (ed.id ? api('/services/' + ed.id, { method: 'PATCH', body }) : api('/services', { method: 'POST', body })); toast('Servicio guardado'); viewServices(); } catch (e) { $('#eErr').textContent = e.message; }
  };
  $('#eDel')?.addEventListener('click', (e) => confirmInline(e.target, '¿Borrar el servicio?', async () => { try { await api('/services/' + ed.id, { method: 'DELETE' }); toast('Borrado'); viewServices(); } catch (err) { $('#eErr').textContent = err.message; } }, 'Borrar'));
}

// ── Horarios, bloqueos y espacios ────────────────────────
async function viewHours() {
  const [{ settings: S }, bl] = await Promise.all([api('/settings'), api('/blocks')]);
  const order = [1, 2, 3, 4, 5, 6, 0];
  const winRow = (d, w, i) => `<span class="w" data-win="${d}"><input type="time" value="${w.from}" data-f> a <input type="time" value="${w.to}" data-t> <button class="btn sm" data-rmw title="Quitar">×</button></span>`;
  $('#view').innerHTML = `<div class="page-head"><div><h1>Horarios y bloqueos</h1><div class="sub">Con esto se arman los turnos libres de la web</div></div></div>
    <div class="grid g2">
      <div class="card form"><h2>Horario de atención</h2><div class="hours-ed">${order.map((d) => `<div class="d"><b>${capF(DAYS[d])}</b><div class="w" id="wd${d}">${(S.hours[d] || []).map((w, i) => winRow(d, w, i)).join('')}<button class="btn sm" data-addw="${d}">${(S.hours[d] || []).length ? '+ franja' : 'Abrir este día'}</button></div></div>`).join('')}</div>
        <p class="small muted">Para cortar al mediodía, agregá dos franjas (por ejemplo 10 a 13 y 15 a 19). Un día sin franjas queda cerrado.</p>
        ${isAdmin() ? '<div class="actions"><button class="btn primary" id="hSave">Guardar horario</button></div>' : ''}</div>
      <div class="card form"><h2>Bloquear días u horarios</h2>
        <p class="small muted">Feriados, vacaciones, un turno médico… En ese rango no se ofrecen turnos en la web.</p>
        <div class="row"><label class="fl"><span>Desde el día</span><input type="date" id="bDate" value="${todayKey()}"></label><label class="fl"><span>Hasta el día</span><input type="date" id="bTo"></label></div>
        <div class="row"><label class="fl"><span>Desde la hora (vacío = todo el día)</span><input type="time" id="bFrom"></label><label class="fl"><span>Hasta la hora</span><input type="time" id="bUntil"></label></div>
        <div class="row"><label class="fl"><span>Qué se bloquea</span><select id="bRes"><option value="all">Toda la casa</option>${S.resources.map((r) => `<option value="${r.key}">${esc(r.name)}</option>`).join('')}</select></label><label class="fl"><span>Motivo (solo lo ve el equipo)</span><input id="bReason"></label></div>
        <p class="err" id="bErr"></p><div class="actions"><button class="btn primary" id="bAdd">Bloquear</button></div>
        ${bl.blocks.length ? `<table>${bl.blocks.map((k) => `<tr><td class="n">${k.date.split('-').reverse().slice(0, 2).join('/')}</td><td>${k.from ? `${k.from} a ${k.to || 'cierre'}` : 'Todo el día'}</td><td>${k.resource === 'all' ? 'Toda la casa' : esc(S.resources.find((r) => r.key === k.resource)?.name || k.resource)}</td><td>${esc(k.reason)}</td><td class="r"><button class="btn sm" data-rmb="${k.id}">Quitar</button></td></tr>`).join('')}</table>` : '<p class="muted">No hay bloqueos por delante.</p>'}
      </div>
      ${isAdmin() ? `<div class="card form"><h2>Espacios</h2><p class="small muted">Cada servicio se hace en un espacio. Si un espacio atiende a dos personas a la vez (por ejemplo, dos manicuras), subí la capacidad.</p>
        <div id="resEd">${S.resources.map((r) => `<div class="row" data-res="${esc(r.key)}"><label class="fl"><span>Nombre</span><input value="${esc(r.name)}" data-rn></label><label class="fl"><span>A la vez</span><input type="number" min="1" max="20" value="${r.capacity}" data-rc></label></div>`).join('')}</div>
        <div class="actions"><button class="btn" id="resAdd">+ Espacio</button><button class="btn primary" id="resSave">Guardar espacios</button></div></div>` : ''}
    </div>`;
  ROOT.querySelector('#view').onclick = (e) => {
    const add = e.target.closest('[data-addw]');
    if (add) { const d = add.dataset.addw; add.insertAdjacentHTML('beforebegin', winRow(d, { from: '10:00', to: '19:00' })); add.textContent = '+ franja'; }
    if (e.target.closest('[data-rmw]')) e.target.closest('[data-win]').remove();
  };
  $('#hSave')?.addEventListener('click', async () => {
    const body = {}; for (const d of order) body[d] = $$(`[data-win="${d}"]`).map((w) => ({ from: w.querySelector('[data-f]').value, to: w.querySelector('[data-t]').value })).filter((w) => w.from && w.to);
    try { await api('/settings/hours', { method: 'PUT', body }); toast('Horario guardado'); } catch (e) { toast(e.message, true); }
  });
  $('#bAdd').onclick = async () => {
    $('#bErr').textContent = '';
    try { await api('/blocks', { method: 'POST', body: { date: $('#bDate').value, to_date: $('#bTo').value, from: $('#bFrom').value, to: $('#bUntil').value, resource: $('#bRes').value, reason: $('#bReason').value } }); toast('Bloqueado'); viewHours(); } catch (e) { $('#bErr').textContent = e.message; }
  };
  $$('[data-rmb]').forEach((b) => (b.onclick = async () => { await api('/blocks/' + b.dataset.rmb, { method: 'DELETE' }); viewHours(); }));
  $('#resAdd')?.addEventListener('click', () => $('#resEd').insertAdjacentHTML('beforeend', '<div class="row" data-res=""><label class="fl"><span>Nombre</span><input data-rn></label><label class="fl"><span>A la vez</span><input type="number" min="1" value="1" data-rc></label></div>'));
  $('#resSave')?.addEventListener('click', async () => {
    const resources = $$('[data-res]').map((r) => ({ key: r.dataset.res, name: r.querySelector('[data-rn]').value, capacity: r.querySelector('[data-rc]').value }));
    try { await api('/settings/resources', { method: 'PUT', body: { resources } }); SERVICES = null; toast('Espacios guardados'); viewHours(); } catch (e) { toast(e.message, true); }
  });
}

// ── Gift cards ───────────────────────────────────────────
async function viewGifts() {
  const svcs = await services();
  $('#view').innerHTML = `<div class="page-head"><div><h1>Gift cards</h1></div><div class="actions"><button class="btn primary" id="gNew">Emitir gift card</button></div></div>
    <div id="gForm"></div>
    <div class="toolbar"><input id="gq" placeholder="Buscar por código o nombre"><select id="gs"><option value="">Todas</option>${Object.entries(GSTATUS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div><div id="glist"></div>`;
  const load = async () => {
    const r = await api('/giftcards?' + new URLSearchParams({ q: $('#gq').value, status: $('#gs').value }));
    $('#glist').innerHTML = r.giftcards.length ? `<div class="card tablewrap"><table><tr><th>Código</th><th>Compró</th><th>Para</th><th>Estado</th><th class="r">Valor</th><th class="r">Saldo</th><th>Vence</th></tr>
      ${r.giftcards.map((g) => `<tr class="click" data-href="giftcard/${g.id}"><td><code>${esc(g.code)}</code></td><td>${esc(g.buyer_name)}<div class="small muted">${esc(g.buyer_email)}</div></td><td>${esc(g.to_name)}</td><td>${pill(g.status, GSTATUS)}</td><td class="r n">${esc(g.service_name || fmt(g.amount))}</td><td class="r n">${fmt(g.balance)}</td><td class="n">${g.expires_at ? new Date(g.expires_at).toLocaleDateString('es-AR') : '—'}</td></tr>`).join('')}</table></div>` : '<div class="empty card">Todavía no hay gift cards.</div>';
    $$('tr[data-href]').forEach((tr) => (tr.onclick = () => navTo(tr.dataset.href)));
  };
  let t; $('#gq').oninput = () => { clearTimeout(t); t = setTimeout(load, 250); };
  $('#gs').onchange = load; load();
  $('#gNew').onclick = () => {
    $('#gForm').innerHTML = `<div class="card form" style="margin-bottom:14px"><h2>Emitir gift card (venta en la casa)</h2>
      <div class="row"><label class="fl"><span>Ritual</span><select id="nSvc"><option value="">Por monto</option>${svcs.filter((s) => s.price && s.mode === 'online' && s.category === 'rituales').map((s) => `<option value="${s.id}">${esc(s.name)} · ${fmt(s.price)}</option>`).join('')}</select></label><label class="fl"><span>Monto ($)</span><input id="nAmt" type="number" min="0"></label></div>
      <div class="row"><label class="fl"><span>Quién la compra</span><input id="nBuyer"></label><label class="fl"><span>Email (para mandársela)</span><input id="nEmail" type="email"></label><label class="fl"><span>Para quién</span><input id="nTo"></label></div>
      <label class="fl"><span>Dedicatoria</span><input id="nMsg" maxlength="240"></label>
      <p class="err" id="nErr"></p><div class="actions"><button class="btn primary" id="nSave">Emitir</button><button class="btn" id="nCancel">Cancelar</button></div></div>`;
    $('#nCancel').onclick = () => ($('#gForm').innerHTML = '');
    $('#nSave').onclick = async () => {
      try { const r = await api('/giftcards', { method: 'POST', body: { service_id: $('#nSvc').value || null, amount: $('#nAmt').value, buyer_name: $('#nBuyer').value, buyer_email: $('#nEmail').value, to_name: $('#nTo').value, message: $('#nMsg').value } }); toast(`Gift card ${r.gift.code} emitida`); navTo('giftcard/' + (await api('/giftcards?q=' + r.gift.code)).giftcards[0].id); } catch (e) { $('#nErr').textContent = e.message; }
    };
  };
}
async function viewGift(id) {
  const r = await api('/giftcards?q=');
  const g = r.giftcards.find((x) => x.id === Number(id));
  if (!g) throw new Error('No encontramos esa gift card.');
  $('#view').innerHTML = `<div class="page-head"><div><h1>Gift card ${esc(g.code)}</h1><div class="sub">${pill(g.status, GSTATUS)} · ${g.source === 'local' ? 'emitida en la casa' : 'comprada en la web'} el ${at(g.created_at)}</div></div><div class="actions"><a class="btn" href="#giftcards">Volver</a></div></div>
    <div class="grid g2">
      <div class="card form"><div class="gift-mini"><span class="small">GIFT CARD · ${esc(g.service_name || fmt(g.amount))}</span><span class="code">${esc(g.code)}</span><span>Saldo ${fmt(g.balance)}${g.expires_at ? ` · vence el ${new Date(g.expires_at).toLocaleDateString('es-AR')}` : ''}</span>${g.message ? `<i>“${esc(g.message)}”</i>` : ''}</div>
        <dl class="kv"><dt>Compró</dt><dd>${esc(g.buyer_name)} ${g.buyer_email ? `· ${esc(g.buyer_email)}` : ''}</dd><dt>Para</dt><dd>${esc(g.to_name || '—')} ${g.to_email ? `· ${esc(g.to_email)}` : ''}</dd>${g.payment_id ? `<dt>Pago</dt><dd>${esc(g.payment_id)}</dd>` : ''}</dl>
        ${g.status === 'active' ? `<h2>Usar en la casa</h2><div class="row"><label class="fl"><span>Monto a descontar ($)</span><input id="uAmt" type="number" min="1" max="${g.balance}" value="${g.balance}"></label><label class="fl"><span>Detalle</span><input id="uNote" placeholder="Ritual esencial 12/11"></label></div><div class="actions"><button class="btn primary" id="uSave">Descontar</button>${g.buyer_email ? '<button class="btn" id="uResend">Reenviar email</button>' : ''}</div>` : ''}
        <div class="row"><label class="fl"><span>Vencimiento</span><input type="date" id="uExp" value="${g.expires_at ? g.expires_at.slice(0, 10) : ''}"></label><label class="fl"><span>Estado</span><select id="uSt">${Object.entries(GSTATUS).map(([k, l]) => `<option value="${k}" ${k === g.status ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
        <div class="actions"><button class="btn" id="uUpd">Guardar cambios</button></div></div>
      <div class="card"><h2>Movimientos</h2><ul class="history">${g.history.map((h) => `<li><span>${at(h.at)}</span><span>${h.amount ? `${h.amount > 0 ? '+' : '−'} ${fmt(Math.abs(h.amount))} · ` : ''}${esc(h.note)}</span></li>`).join('')}</ul></div>
    </div>`;
  $('#uSave')?.addEventListener('click', async () => { try { await api(`/giftcards/${g.id}/redeem`, { method: 'POST', body: { amount: $('#uAmt').value, note: $('#uNote').value } }); toast('Descontado'); viewGift(g.id); } catch (e) { toast(e.message, true); } });
  $('#uResend')?.addEventListener('click', async () => { await api(`/giftcards/${g.id}/resend`, { method: 'POST', body: {} }); toast('Email reenviado'); });
  $('#uUpd').onclick = async () => { try { await api('/giftcards/' + g.id, { method: 'PATCH', body: { status: $('#uSt').value, expires_at: $('#uExp').value } }); toast('Guardado'); viewGift(g.id); } catch (e) { toast(e.message, true); } };
}

// ── Eventos ──────────────────────────────────────────────
async function viewEvents(editId = null) {
  const r = await api('/events');
  const ed = editId === 'new' ? { title: '', date: todayKey(), from: '', to: '', price: '', description: '', active: true } : r.events.find((e) => e.id === editId);
  $('#view').innerHTML = `<div class="page-head"><div><h1>Eventos y talleres</h1><div class="sub">Los próximos se muestran en la web, en la sección Cafetería &amp; eventos. Se reservan por WhatsApp.</div></div><div class="actions"><button class="btn primary" id="evNew">Nuevo evento</button></div></div>
    ${ed ? `<div class="card form" style="margin-bottom:14px"><h2>${ed.id ? 'Editar' : 'Nuevo'} evento</h2>
      <label class="fl"><span>Título</span><input id="vT" value="${esc(ed.title)}" placeholder="Tarot & merienda"></label>
      <div class="row"><label class="fl"><span>Fecha</span><input type="date" id="vD" value="${ed.date}"></label><label class="fl"><span>Desde</span><input type="time" id="vF" value="${ed.from}"></label><label class="fl"><span>Hasta</span><input type="time" id="vU" value="${ed.to}"></label><label class="fl"><span>Valor ($)</span><input type="number" id="vP" value="${ed.price ?? ''}"></label></div>
      <label class="fl"><span>Descripción</span><textarea id="vDs" rows="3">${esc(ed.description)}</textarea></label>
      <label class="check"><input type="checkbox" id="vA" ${ed.active ? 'checked' : ''}> Publicado</label><p class="err" id="vErr"></p>
      <div class="actions"><button class="btn primary" id="vSave">Guardar</button><button class="btn" id="vCancel">Cancelar</button>${ed.id ? '<button class="btn danger" id="vDel">Borrar</button>' : ''}</div></div>` : ''}
    ${r.events.length ? `<div class="card tablewrap"><table><tr><th>Fecha</th><th>Evento</th><th>Horario</th><th class="r">Valor</th><th></th></tr>${r.events.map((e) => `<tr class="click" data-ev="${e.id}"><td class="n">${e.date.split('-').reverse().join('/')}</td><td>${esc(e.title)}</td><td>${e.from ? `${e.from}${e.to ? ` a ${e.to}` : ''}` : ''}</td><td class="r n">${e.price ? fmt(e.price) : ''}</td><td>${e.active ? '' : '<span class="pill">Oculto</span>'}</td></tr>`).join('')}</table></div>` : '<div class="empty card">Todavía no cargaste eventos. Por ejemplo: talleres de tarot, skincare, cerámica o meriendas.</div>'}`;
  $('#evNew').onclick = () => viewEvents('new');
  $$('[data-ev]').forEach((tr) => (tr.onclick = () => viewEvents(Number(tr.dataset.ev))));
  if (!ed) return;
  $('#vCancel').onclick = () => viewEvents();
  $('#vSave').onclick = async () => {
    const body = { title: $('#vT').value, date: $('#vD').value, from: $('#vF').value, to: $('#vU').value, price: $('#vP').value, description: $('#vDs').value, active: $('#vA').checked };
    try { await (ed.id ? api('/events/' + ed.id, { method: 'PATCH', body }) : api('/events', { method: 'POST', body })); toast('Evento guardado'); viewEvents(); } catch (e) { $('#vErr').textContent = e.message; }
  };
  $('#vDel')?.addEventListener('click', (e) => confirmInline(e.target, '¿Borrar el evento?', async () => { await api('/events/' + ed.id, { method: 'DELETE' }); viewEvents(); }, 'Borrar'));
}

// ── Textos de la web ─────────────────────────────────────
async function viewContent() {
  const { settings: S } = await api('/settings');
  const C = S.content;
  $('#view').innerHTML = `<div class="page-head"><div><h1>Textos de la web</h1></div><div class="actions"><button class="btn primary" id="cSave">Guardar</button></div></div>
    <div class="grid g2">
      <div class="card form"><h2>Introducción de cada sección</h2>${S.categories.map((c) => `<label class="fl"><span>${esc(c.name)} · título</span><input data-ct="${c.key}" value="${esc(c.title)}"></label><label class="fl"><span>${esc(c.name)} · bajada</span><textarea data-ci="${c.key}" rows="2">${esc(c.intro)}</textarea></label>`).join('')}</div>
      <div class="card form"><h2>Preguntas frecuentes</h2><div id="faqEd">${C.faq.map((f) => `<div class="faq-ed"><div class="faq-ed-f"><input data-q value="${esc(f.q)}"><textarea data-a rows="3">${esc(f.a)}</textarea></div><div class="faq-ed-b"><button class="btn sm" data-rmq>Quitar</button></div></div>`).join('')}</div><button class="btn sm" id="faqAdd">+ Pregunta</button></div>
      <div class="card form legal-ed" style="grid-column:1/-1"><h2>Términos y condiciones</h2><p class="small muted">Formato: <code>### Subtítulo</code>, <code>- ítem</code>, <code>**negrita**</code>. Completá razón social y CUIT.</p><textarea id="cTerms" rows="18">${esc(C.terms)}</textarea></div>
    </div>`;
  $('#faqAdd').onclick = () => $('#faqEd').insertAdjacentHTML('beforeend', '<div class="faq-ed"><div class="faq-ed-f"><input data-q placeholder="Pregunta"><textarea data-a rows="3" placeholder="Respuesta"></textarea></div><div class="faq-ed-b"><button class="btn sm" data-rmq>Quitar</button></div></div>');
  $('#faqEd').onclick = (e) => { if (e.target.closest('[data-rmq]')) e.target.closest('.faq-ed').remove(); };
  $('#cSave').onclick = async () => {
    try {
      await api('/settings/content', { method: 'PUT', body: { faq: $$('#faqEd .faq-ed').map((x) => ({ q: x.querySelector('[data-q]').value, a: x.querySelector('[data-a]').value })), terms: $('#cTerms').value, categories: S.categories.map((c) => ({ key: c.key, title: $(`[data-ct="${c.key}"]`).value, intro: $(`[data-ci="${c.key}"]`).value })) } });
      toast('Textos guardados');
    } catch (e) { toast(e.message, true); }
  };
}

// ── Emails ───────────────────────────────────────────────
async function viewEmails() {
  const r = await api('/emails');
  $('#view').innerHTML = `<div class="page-head"><div><h1>Emails</h1><div class="sub">Lo que la web mandó automáticamente</div></div></div>
    <div class="grid g2"><div class="card"><div class="mail-list">${r.emails.length ? r.emails.map((m) => `<button class="mail-row" data-mail="${m.id}"><span class="mail-subject">${esc(m.subject)}</span><span class="mail-meta">${esc(r.templates[m.template]?.label || m.template)} · ${esc(m.to)} · ${at(m.at)} · ${esc(m.status)}</span></button>`).join('') : '<p class="muted">Todavía no se mandó ningún email.</p>'}</div></div><div class="card" id="mailView"><p class="muted">Elegí un email para verlo.</p></div></div>`;
  $$('[data-mail]').forEach((b) => (b.onclick = async () => { const { email: m } = await api('/emails/' + b.dataset.mail); $('#mailView').innerHTML = `<h2>${esc(m.subject)}</h2><p class="small muted">Para ${esc(m.to)} · ${at(m.at)}</p><iframe class="mail-frame" sandbox="" title="Vista del email"></iframe>`; $('#mailView iframe').srcdoc = m.html; }));
}
async function viewWithdrawals() {
  const r = await api('/withdrawals');
  $('#view').innerHTML = `<div class="page-head"><div><h1>Arrepentimientos</h1><div class="sub">Pedidos hechos con el Botón de arrepentimiento. Respondé dentro de las 48 horas hábiles.</div></div></div>
    ${r.withdrawals.length ? `<div class="card tablewrap"><table><tr><th>Código</th><th>Fecha</th><th>Nombre</th><th>Turno / gift card</th><th>Motivo</th><th>Estado</th></tr>${r.withdrawals.map((w) => `<tr><td><code>${esc(w.code)}</code></td><td class="n">${at(w.created_at)}</td><td>${esc(w.name)}<div class="small muted">${esc(w.email)}</div></td><td>${esc(w.ref)}</td><td>${esc(w.reason)}</td><td><select data-w="${w.id}">${['nuevo', 'en curso', 'resuelto'].map((s) => `<option ${s === w.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td></tr>`).join('')}</table></div>` : '<div class="empty card">No hay pedidos.</div>'}`;
  $$('[data-w]').forEach((s) => (s.onchange = async () => { await api('/withdrawals/' + s.dataset.w, { method: 'PATCH', body: { status: s.value } }); toast('Actualizado'); }));
}

// ── Configuración ────────────────────────────────────────
async function viewSettings() {
  const { settings: S } = await api('/settings');
  const s = S.site, b = S.booking, g = S.giftcards;
  const inp = (k, label, v, extra = '') => `<label class="fl"><span>${label}</span><input data-k="${k}" value="${esc(v)}" ${extra}></label>`;
  $('#view').innerHTML = `<div class="page-head"><div><h1>Configuración</h1></div><div class="actions"><button class="btn primary" id="setSave">Guardar cambios</button></div></div>
    <div class="grid g2">
      <div class="card form"><h2>La casa</h2>${inp('site.name', 'Nombre', s.name)}${inp('site.tagline', 'Frase', s.tagline)}${inp('site.announcement', 'Barra de anuncios', s.announcement)}
        <div class="row">${inp('site.address', 'Dirección', s.address)}${inp('site.city', 'Ciudad', s.city)}</div>
        <div class="row">${inp('site.whatsapp', 'WhatsApp de turnos', s.whatsapp)}${inp('site.eventsWhatsapp', 'WhatsApp de eventos', s.eventsWhatsapp)}</div>
        <div class="row">${inp('site.instagram', 'Instagram', s.instagram)}${inp('site.email', 'Email de contacto', s.email, 'type="email"')}</div>
        ${inp('site.storeUrl', 'Dirección de la tienda Samadhi Style (botón "Tienda")', s.storeUrl, 'type="url"')}</div>
      <div class="card form"><h2>Reservas</h2>
        <div class="row">${inp('booking.depositPercent', 'Seña (%)', b.depositPercent, 'type="number" min="0" max="100"')}${inp('booking.minNoticeHours', 'Anticipación mínima (horas)', b.minNoticeHours, 'type="number" min="0"')}${inp('booking.maxDaysAhead', 'Hasta cuántos días adelante', b.maxDaysAhead, 'type="number" min="1"')}</div>
        <div class="row">${inp('booking.slotStep', 'Turnos cada (minutos)', b.slotStep, 'type="number" min="5" step="5"')}${inp('booking.holdMinutes', 'Minutos para pagar la seña', b.holdMinutes, 'type="number" min="10"')}${inp('booking.cancelHours', 'Cancelar online hasta (horas antes)', b.cancelHours, 'type="number" min="0"')}</div>
        <div class="row">${inp('booking.reminderHours', 'Recordatorio (horas antes)', b.reminderHours, 'type="number" min="0"')}${inp('booking.staffEmails', 'Avisos de turnos nuevos a (emails separados por coma)', b.staffEmails)}</div>
        <p class="small muted">Con seña en 0% los turnos online se confirman sin pagar nada.</p></div>
      <div class="card form"><h2>Gift cards</h2><label class="check"><input type="checkbox" data-k="giftcards.enabled" ${g.enabled ? 'checked' : ''}> Vender gift cards en la web</label>
        ${inp('giftcards.amounts', 'Montos sugeridos (separados por coma)', g.amounts.join(', '))}<div class="row">${inp('giftcards.min', 'Monto mínimo', g.min, 'type="number" min="0"')}${inp('giftcards.validityDays', 'Validez (días)', g.validityDays, 'type="number" min="7"')}</div></div>
    </div>`;
  $('#setSave').onclick = async () => {
    const groups = { site: {}, booking: {}, giftcards: {} };
    for (const el of $$('[data-k]')) { const [grp, k] = el.dataset.k.split('.'); groups[grp][k] = el.type === 'checkbox' ? el.checked : el.value; }
    groups.giftcards.amounts = String(groups.giftcards.amounts).split(/[,;\s]+/).map((x) => Number(x.replace(/\D/g, ''))).filter(Boolean);
    try { for (const [k, v] of Object.entries(groups)) await api('/settings/' + k, { method: 'PUT', body: v }); toast('Configuración guardada'); } catch (e) { toast(e.message, true); }
  };
}
async function viewUsers() {
  const r = await api('/users');
  $('#view').innerHTML = `<div class="page-head"><div><h1>Usuarios</h1><div class="sub">Recepción ve la agenda, turnos, clientas, servicios, horarios, gift cards y eventos. Administración, además, la configuración.</div></div></div>
    <div class="grid g2"><div class="card"><table>${r.users.map((u) => `<tr><td>${esc(u.name || '—')}<div class="small muted">${esc(u.email)}</div></td><td>${esc(u.role_label)}</td><td class="r">${u.id === ME.id ? '<span class="muted small">Vos</span>' : `<button class="btn sm danger" data-rmu="${u.id}">Quitar</button>`}</td></tr>`).join('')}</table></div>
      <div class="card form"><h2>Nuevo usuario</h2><label class="fl"><span>Nombre</span><input id="uN"></label><label class="fl"><span>Email</span><input id="uE" type="email"></label><label class="fl"><span>Contraseña (10+ caracteres)</span><input id="uP" type="password" autocomplete="new-password"></label>
        <label class="fl"><span>Rol</span><select id="uR">${Object.entries(r.roles).map(([k, l]) => `<option value="${k}" ${k === 'staff' ? 'selected' : ''}>${l}</option>`).join('')}</select></label><p class="err" id="uErr"></p><div class="actions"><button class="btn primary" id="uAdd">Crear</button></div></div></div>`;
  $('#uAdd').onclick = async () => { try { await api('/users', { method: 'POST', body: { name: $('#uN').value, email: $('#uE').value, password: $('#uP').value, role: $('#uR').value } }); toast('Usuario creado'); viewUsers(); } catch (e) { $('#uErr').textContent = e.message; } };
  $$('[data-rmu]').forEach((b) => (b.onclick = (e) => confirmInline(e.target, '¿Quitar el acceso?', async () => { try { await api('/users/' + b.dataset.rmu, { method: 'DELETE' }); viewUsers(); } catch (err) { toast(err.message, true); } }, 'Quitar')));
}

// ── Arranque ─────────────────────────────────────────────
async function boot() {
  try {
    const r = await api('/me');
    ME = r.me;
    $('#login').hidden = true; $('#app').hidden = false;
    $('#whoami').innerHTML = `${esc(ME.name || ME.email)}<span>${esc(ME.role_label)}</span>`;
    SERVICES = null;
    api('/dashboard').then((d) => { attention = d.attention.length; renderNav(currentHash().split('/')[0] || 'agenda'); }).catch(() => {});
    route();
  } catch { showLogin(); }
}
if (EMBED?.manualBoot) window.__adminBoot = boot; else boot();
