// Casa Samadhi · web pública
// Habla con el servidor por /api. En la vista previa sin servidor, window.__CASA_API responde en su lugar.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (n) => '$ ' + Math.round(Number(n) || 0).toLocaleString('es-AR');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const MEDIA = window.__CASA_MEDIA || ((u) => '/' + String(u || '').replace(/^\//, ''));
const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const DAYS_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MONTHS_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const ICON_X = '<svg viewBox="0 0 16 16"><path d="M2 2l12 12M14 2L2 14"/></svg>';

let SITE = null;
let ACC = null; // clienta con sesión iniciada (datos de Mi cuenta)
async function api(path, body, method) {
  method = method || (body ? 'POST' : 'GET');
  if (window.__CASA_API) return window.__CASA_API(path, { method, body });
  const res = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || 'No pudimos completar el pedido. Probá de nuevo.'); e.data = data; throw e; }
  return data;
}
const wa = (num, text = '') => `https://wa.me/549${String(num || '').replace(/\D/g, '').replace(/^0/, '').replace(/^549?/, '')}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
const dayLabel = (key) => { const [y, m, d] = key.split('-').map(Number); const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); return { wd, d, m, w: DAYS_SHORT[wd], long: `${DAYS[wd]} ${d} de ${MONTHS_L[m - 1]}` }; };
const deposit = (price) => Math.round((price * (SITE.booking.depositPercent || 0) / 100) / 100) * 100;
const cap = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
const durTxt = (m) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`);
function md(text) {
  // Formato simple: ## título, ### subtítulo, - ítem, **negrita**
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  return String(text || '').split(/\n{2,}/).map((block) => {
    const lines = block.split('\n');
    if (lines.every((l) => l.startsWith('- '))) return `<ul>${lines.map((l) => `<li>${inline(l.slice(2))}</li>`).join('')}</ul>`;
    return lines.map((l) => (l.startsWith('### ') ? `<h4>${inline(l.slice(4))}</h4>` : l.startsWith('## ') ? `<h3>${inline(l.slice(3))}</h3>` : l.startsWith('- ') ? `<ul><li>${inline(l.slice(2))}</li></ul>` : l.trim() ? `<p>${inline(l)}</p>` : '')).join('');
  }).join('');
}
let tt;
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('on'), 2600); }

// ── Portada ──────────────────────────────────────────────
const SLIDES = [
  { img: 'media/headspa-ritual.webp', pos: 'center 62%', eyebrow: 'Head spa', title: 'Un ritual esencial', sub: 'Agua tibia, aromas y manos que saben. Una hora solo para vos.', cta: ['Reservar', 'book:ritual-esencial'], cta2: ['Ver rituales', '#rituales'] },
  { img: 'media/camilla.webp', pos: 'center 55%', eyebrow: 'Masajes', title: 'Soltá el cuerpo', sub: 'Masoterapia relajante con pindas herbales calientes y sonidos de cuencos.', cta: ['Reservar', 'book:masoterapia-relajante'] },
  { img: 'media/manicuria-cafe.webp', eyebrow: 'Manicuría', title: 'Tu momento, tu lugar', sub: 'Con café de cortesía, mensaje de oráculo y spa de manos.', cta: ['Reservar manicuría', 'cat:manicuria'] },
  { img: 'media/cafeteria.webp', eyebrow: 'Cafetería & eventos', title: 'Café, spa & momentos', sub: 'Meriendas, talleres y encuentros en Calle 47 N° 679.', cta: ['Conocé la casa', '#cafe'] },
];
const hero = { i: 0, n: 0, timer: null, dur: 7000, busy: false, py: 0 };
function renderHero() {
  hero.n = SLIDES.length;
  const btn = ([label, act], solid) => act.startsWith('#') ? `<a class="btn${solid ? ' solid' : ''}" href="${act}" style="${solid ? 'background:var(--marfil);color:var(--tinta);border-color:var(--marfil)' : ''}">${esc(label)}</a>` : `<button class="btn" data-act="${esc(act)}" ${solid ? 'style="background:var(--marfil);color:var(--tinta);border-color:var(--marfil)"' : ''}>${esc(label)}</button>`;
  $('#slides').innerHTML = SLIDES.map((s, i) => `<div class="slide" role="group" aria-roledescription="diapositiva" aria-label="${i + 1} de ${SLIDES.length}">
    <div class="bg"><img src="${MEDIA(s.img)}" style="object-position:${s.pos || 'center 40%'}" alt="" ${i ? 'loading="lazy"' : 'fetchpriority="high"'}></div>
    <div class="copy"><div class="eyebrow">${esc(s.eyebrow)}</div><h2>${esc(s.title)}</h2><div class="sub">${esc(s.sub)}</div><div class="cta">${btn(s.cta, true)}${s.cta2 ? btn(s.cta2) : ''}</div></div></div>`).join('');
  $('#heroDots').innerHTML = SLIDES.map((s, i) => `<li><button data-slide="${i}" aria-label="Ir a ${esc(s.title)}"><span class="n">${String(i + 1).padStart(2, '0')}</span><span class="bar"><i></i></span></button></li>`).join('');
  $('#heroDots').style.setProperty('--dur', hero.dur + 'ms');
  layoutSlides(0, 0, false); updateDots(); startAuto();
}
function layoutSlides(active, dir, animate) {
  const slides = $$('.slide'), H = $('#hero');
  if (animate && !reduced) {
    const inc = slides[active];
    H.classList.remove('animating');
    inc.style.transform = `translate3d(0, ${dir > 0 ? 100 : -100}%, 0)`;
    inc.querySelector('.bg').style.transform = `translate3d(0, ${dir > 0 ? -40 : 40}%, 0) scale(1.08)`;
    void inc.offsetHeight;
    H.classList.add('animating');
  }
  slides.forEach((s, i) => {
    const bg = s.querySelector('.bg');
    s.classList.toggle('is-active', i === active);
    s.classList.toggle('leaving', animate && i === hero.prev);
    s.setAttribute('aria-hidden', i === active ? 'false' : 'true');
    if (i === active) { s.style.transform = 'translate3d(0,0,0)'; bg.style.transform = `translate3d(0, ${hero.py}px, 0) scale(1.08)`; }
    else if (animate && i === hero.prev) { s.style.transform = `translate3d(0, ${dir > 0 ? -100 : 100}%, 0)`; bg.style.transform = `translate3d(0, ${dir > 0 ? 45 : -45}%, 0) scale(1.08)`; }
    else s.style.transform = 'translate3d(0, 100%, 0)';
  });
  if (animate) setTimeout(() => { H.classList.remove('animating'); hero.busy = false; }, 1200);
}
function go(to, dir) {
  if (hero.busy || hero.n < 2) return;
  to = (to + hero.n) % hero.n;
  if (to === hero.i) return;
  hero.busy = true; hero.prev = hero.i; hero.i = to;
  layoutSlides(to, dir ?? (to > hero.prev ? 1 : -1), true);
  updateDots(); startAuto();
}
function updateDots() {
  $$('#heroDots button').forEach((b, i) => { b.setAttribute('aria-current', i === hero.i ? 'true' : 'false'); const bar = b.querySelector('.bar i'); bar.style.animation = 'none'; void bar.offsetHeight; bar.style.animation = ''; });
  $('#heroCount').textContent = `${String(hero.i + 1).padStart(2, '0')} / ${String(hero.n).padStart(2, '0')}`;
}
function startAuto() { clearTimeout(hero.timer); if (reduced || hero.n < 2 || $('#hero').classList.contains('paused')) return; hero.timer = setTimeout(() => go(hero.i + 1, 1), hero.dur); }
function bindHero() {
  $('#heroUp').addEventListener('click', () => go(hero.i - 1, -1));
  $('#heroDown').addEventListener('click', () => go(hero.i + 1, 1));
  $('#heroDots').addEventListener('click', (e) => { const b = e.target.closest('[data-slide]'); if (b) go(Number(b.dataset.slide)); });
  const H = $('#hero');
  H.addEventListener('mouseenter', () => { H.classList.add('paused'); clearTimeout(hero.timer); });
  H.addEventListener('mouseleave', () => { H.classList.remove('paused'); startAuto(); });
  H.addEventListener('focusin', () => { H.classList.add('paused'); clearTimeout(hero.timer); });
  H.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown') { e.preventDefault(); go(hero.i + 1, 1); } if (e.key === 'ArrowUp') { e.preventDefault(); go(hero.i - 1, -1); } });
  let t0 = null;
  H.addEventListener('touchstart', (e) => { t0 = { y: e.touches[0].clientY, x: e.touches[0].clientX, t: Date.now() }; }, { passive: true });
  H.addEventListener('touchend', (e) => {
    if (!t0) return;
    const dy = e.changedTouches[0].clientY - t0.y, dx = e.changedTouches[0].clientX - t0.x;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5 && Date.now() - t0.t < 600) go(hero.i + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
    t0 = null;
  });
  document.addEventListener('visibilitychange', () => (document.hidden ? clearTimeout(hero.timer) : startAuto()));
}
let ticking = false;
function onScroll() {
  $('header.top').classList.toggle('scrolled', window.scrollY > 40);
  document.body.classList.toggle('show-mbar', window.scrollY > innerHeight * 0.6);
  if (ticking || reduced) return;
  ticking = true;
  requestAnimationFrame(() => {
    ticking = false;
    const y = window.scrollY, H = $('#hero'), h = H.offsetHeight;
    if (y < h * 1.2 && !H.classList.contains('animating')) {
      hero.py = y * 0.38;
      const s = $$('.slide')[hero.i];
      if (s) { s.querySelector('.bg').style.transform = `translate3d(0, ${hero.py}px, 0) scale(1.08)`; const c = s.querySelector('.copy'); c.style.setProperty('--ty', `${y * 0.16}px`); c.style.setProperty('--to', Math.max(0, 1 - y / (h * 0.75)).toFixed(3)); }
    }
    const band = $('#ritual-band'), r = band.getBoundingClientRect();
    if (r.bottom > 0 && r.top < innerHeight) $('#bandBg').style.setProperty('--py', `${((r.top + r.height / 2) - innerHeight / 2) * -0.22}px`);
  });
}

// ── Secciones ────────────────────────────────────────────
const svcBySlug = (slug) => SITE.services.find((s) => s.slug === slug);
const cat = (k) => SITE.categories.find((c) => c.key === k) || {};
function actionsFor(s) {
  if (s.mode === 'online') return `<button class="btn solid sm" data-book-svc="${s.id}">Reservar</button><button class="btn sm" data-gift-svc="${s.id}">Regalar</button>`;
  return `<a class="btn sm" href="${wa(s.whatsapp || SITE.site.whatsapp, `Hola! Quiero consultar por ${s.name} en Casa Samadhi.`)}" target="_blank" rel="noopener">Consultar por WhatsApp</a>`;
}
function renderSections() {
  const S = SITE.site;
  $('#announce').textContent = S.announcement || 'Head spa · Manicuría · Terapias · Cafetería';
  $('#year').textContent = new Date().getFullYear();
  $('#ritIntro').textContent = cat('rituales').intro || '';
  $('#maniIntro').textContent = cat('manicuria').intro || '';
  $('#terIntro').textContent = cat('terapias').intro || '';
  const rit = SITE.services.filter((s) => s.category === 'rituales');
  $('#ritualList').innerHTML = rit.map((s) => `<article class="ritual">
    <div class="ph">${s.image ? `<img src="${MEDIA(s.image)}" alt="${esc(s.name)}" loading="lazy">` : ''}${s.tag ? `<span class="tag">${esc(s.tag)}</span>` : ''}</div>
    <div class="body"><h3>${esc(s.name)}</h3>
      <div class="meta"><span class="price">${s.price ? fmt(s.price) : 'Consultar'}</span><span class="dur">${s.duration ? durTxt(s.duration) : ''}</span></div>
      ${s.short ? `<p>${esc(s.short)}</p>` : ''}
      ${s.includes?.length ? `<ul>${s.includes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      <div class="actions">${actionsFor(s)}</div></div></article>`).join('');
  const mani = SITE.services.filter((s) => s.category === 'manicuria');
  $('#maniMenu').innerHTML = mani.map((s) => `<li><span class="nm">${esc(s.name)}${s.tag ? `<small>${esc(s.tag)}</small>` : ''}</span><span class="pr">${s.price ? fmt(s.price) : 'Consultar'}</span></li>`).join('');
  const ther = SITE.services.filter((s) => s.category === 'terapias' || !['rituales', 'manicuria'].includes(s.category));
  $('#therList').innerHTML = ther.map((s) => `<article class="ther">
    ${s.image ? `<div class="ph"><img src="${MEDIA(s.image)}" alt="${esc(s.name)}" loading="lazy"></div>` : ''}
    <div class="body">${s.tag ? `<div class="tg">${esc(s.tag)}</div>` : ''}<h3>${esc(s.name)}</h3>${s.short ? `<p>${esc(s.short)}</p>` : ''}${s.price ? `<p>${fmt(s.price)}${s.duration ? ` · ${durTxt(s.duration)}` : ''}</p>` : ''}
    <div class="actions">${s.mode === 'online' ? `<button class="btn solid sm" data-book-svc="${s.id}">Reservar</button>` : actionsFor(s)}</div></div></article>`).join('');
  $('#events').innerHTML = SITE.events.map((e) => { const d = dayLabel(e.date); return `<div class="event"><div class="d">${d.d}<small>${MONTHS[d.m - 1]}</small></div><div><h4>${esc(e.title)}</h4><p>${esc(d.long)}${e.from ? ` · ${esc(e.from)}${e.to ? ` a ${esc(e.to)}` : ''} h` : ''}${e.price ? ` · ${fmt(e.price)}` : ''}</p>${e.description ? `<p>${esc(e.description)}</p>` : ''}<p><a href="${wa(S.whatsapp, `Hola! Quiero reservar un lugar para "${e.title}" (${d.long}).`)}" target="_blank" rel="noopener">Reservar mi lugar por WhatsApp →</a></p></div></div>`; }).join('');
  $('#eventsWa').href = wa(S.eventsWhatsapp || S.whatsapp, 'Hola! Quiero consultar por un evento en Casa Samadhi.');
  $('#faqList').innerHTML = SITE.faq.map((f, i) => `<details class="qa"${i === 0 ? ' open' : ''}><summary>${esc(f.q)}<i aria-hidden="true"></i></summary><div class="qa-a">${md(f.a)}</div></details>`).join('');
  const H = SITE.hours;
  const fmtW = (list) => (list?.length ? list.map((w) => `${w.from} a ${w.to}`).join(' y ') : 'Cerrado');
  const order = [1, 2, 3, 4, 5, 6, 0];
  const rows = []; // agrupa días seguidos con el mismo horario
  for (const d of order) { const t = fmtW(H[d]); const last = rows.at(-1); if (last && last.t === t) last.to = d; else rows.push({ from: d, to: d, t }); }
  $('#hours').innerHTML = rows.map((r) => `<dt>${DAYS[r.from]}${r.to !== r.from ? ` a ${DAYS[r.to]}` : ''}</dt><dd>${esc(r.t)}</dd>`).join('');
  $('#visitTitle').textContent = S.address.split(',')[0];
  $('#visitAddr').textContent = `${S.address.split(',').slice(1).join(',').trim() || ''}${S.address.includes(',') ? ' · ' : ''}${S.city}`;
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${S.address.replace(/,.*/, '')}, ${S.city}`)}`;
  $('#mapsLink').href = maps;
  $$('.wa-link').forEach((a) => (a.href = wa(S.whatsapp, 'Hola! Tengo una consulta.')));
  $('#waTop').href = wa(S.whatsapp, 'Hola! Quiero hacer una consulta.');
  for (const a of [$('#storeLink'), $('#storeCard')]) a.href = S.storeUrl || '#';
  $('#footContact').innerHTML = [
    `<li><a href="${maps}" target="_blank" rel="noopener">${esc(S.address)}<br>${esc(S.city)}</a></li>`,
    `<li><a href="${wa(S.whatsapp)}" target="_blank" rel="noopener">WhatsApp · ${esc(S.whatsapp)}</a></li>`,
    `<li><a href="https://instagram.com/${esc(S.instagram)}" target="_blank" rel="noopener">Instagram · @${esc(S.instagram)}</a></li>`,
    S.email ? `<li><a href="mailto:${esc(S.email)}">${esc(S.email)}</a></li>` : '',
    `<li><a href="${esc(S.storeUrl)}" target="_blank" rel="noopener">Tienda Samadhi Style ↗</a></li>`,
  ].join('');
  $('#mnav').innerHTML = `<div class="caps" style="color:var(--suave)">Menú</div>
    <button data-book>Reservar turno</button><button data-account>Mi cuenta</button><a href="#rituales">Head spa &amp; masajes</a><a href="#manicuria">Manicuría</a><a href="#terapias">Terapias</a><a href="#cafe">Cafetería &amp; eventos</a><button data-gift>Gift cards</button><a href="#espacio">La casa</a><a href="#visita">Cómo llegar</a>
    <hr><a class="sm" href="${esc(S.storeUrl)}" target="_blank" rel="noopener">Tienda Samadhi Style ↗</a><a class="sm" href="${wa(S.whatsapp)}" target="_blank" rel="noopener">WhatsApp</a><a class="sm" href="https://instagram.com/${esc(S.instagram)}" target="_blank" rel="noopener">Instagram</a>`;
  if (!SITE.giftcards.enabled) { $('#giftcards').hidden = true; $$('[data-gift]').forEach((b) => (b.hidden = true)); }
  const g = SITE.services.find((s) => s.slug === 'ritual-esencial');
  if (g?.price) $('#gcardAmount').textContent = `${g.name} · ${fmt(g.price)}`;
}

// ── Panel lateral ────────────────────────────────────────
let lastFocus = null;
function openDrawer(html, { doc = false, label = 'Reservar' } = {}) {
  const d = $('#drawer');
  if (!d.classList.contains('on')) lastFocus = document.activeElement;
  d.classList.toggle('doc', doc);
  d.setAttribute('aria-label', label);
  d.innerHTML = html;
  d.classList.add('on'); $('#scrim').classList.add('on'); $('#mnav').classList.remove('on');
  document.body.style.overflow = 'hidden';
  setTimeout(() => (d.querySelector('[autofocus]') || d.querySelector('h3'))?.focus?.({ preventScroll: true }), 60);
}
function closeAll() {
  $('#drawer').classList.remove('on'); $('#mnav').classList.remove('on'); $('#scrim').classList.remove('on');
  document.body.style.overflow = '';
  if (/^#(turno|gift|pago|reservar|regalar|terminos|arrepentimiento|cuenta)/.test(location.hash)) setHash('');
  lastFocus?.focus?.({ preventScroll: true });
}
function setHash(h) { try { history.replaceState(null, '', h || location.pathname + location.search); } catch {} }
const head = (title, back) => `<div class="dhead">${back ? `<button class="back" data-back="${back}">← Volver</button>` : ''}<h3 tabindex="-1">${esc(title)}</h3><button class="close" data-close aria-label="Cerrar">${ICON_X}</button></div>`;

// ── Reserva ──────────────────────────────────────────────
const bk = { step: 1, service: null, days: [], date: '', time: '', loading: false, form: {}, errors: {}, gift: null, giftErr: '', sending: false, error: '' };
function openBooking({ serviceId = null, category = null } = {}) {
  if (ACC && !bk.form.email) bk.form = { ...bk.form, name: ACC.customer.name, email: ACC.customer.email, phone: ACC.customer.phone };
  Object.assign(bk, { step: serviceId ? 2 : 1, service: serviceId ? SITE.services.find((s) => s.id === Number(serviceId)) : null, days: [], date: '', time: '', errors: {}, error: '', sending: false, filter: category });
  setHash('#reservar');
  renderBooking(true);
  if (bk.service) loadDays();
}
async function loadDays(more = false) {
  bk.loading = true; renderBooking();
  try {
    const from = more && bk.days.length ? addDay(bk.days.at(-1).date, 1) : '';
    const r = await api(`/api/availability?service=${bk.service.id}&days=21${from ? `&from=${from}` : ''}`);
    bk.days = more ? [...bk.days, ...r.days] : r.days;
    bk.maxDate = r.maxDate;
    if (!bk.date || !bk.days.some((d) => d.date === bk.date)) bk.date = (bk.days.find((d) => d.slots.length) || {}).date || '';
  } catch (e) { bk.error = e.message; }
  bk.loading = false; renderBooking();
}
const addDay = (k, n) => new Date(Date.parse(k + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
function renderBooking(open = false) {
  const steps = `<div class="steps" aria-hidden="true">${[1, 2, 3].map((n) => `<span class="${bk.step >= n ? 'on' : ''}"></span>`).join('')}</div>`;
  let body = '', foot = '';
  if (bk.step === 1) {
    const groups = SITE.categories.map((c) => ({ c, list: SITE.services.filter((s) => s.category === c.key && s.mode === 'online') })).filter((g) => g.list.length && (!bk.filter || g.c.key === bk.filter));
    const waOnly = SITE.services.filter((s) => s.mode === 'whatsapp' && (!bk.filter || s.category === bk.filter));
    body = groups.map((g) => `<div class="svc-group"><div class="step-t">${esc(g.c.title || g.c.name)}</div>${g.list.map((s) => `<button class="svc" data-pick="${s.id}" aria-pressed="${bk.service?.id === s.id}"><span class="n">${esc(s.name)}${s.tag && s.category === 'manicuria' ? ` · ${esc(s.tag)}` : ''}</span><span class="p">${fmt(s.price)}</span><span class="m">${durTxt(s.duration)}</span></button>`).join('')}</div>`).join('')
      + (bk.filter ? `<p class="note" style="margin-top:16px"><button class="link-btn" data-allsvc>Ver todos los servicios</button></p>` : '')
      + (waOnly.length ? `<div class="step-t">Se coordinan por WhatsApp</div><p class="note">${waOnly.map((s) => esc(s.name)).join(' · ')}. <a href="${wa(SITE.site.whatsapp, 'Hola! Quiero consultar por una terapia.')}" target="_blank" rel="noopener">Escribinos</a>.</p>` : '');
  } else if (bk.step === 2) {
    const s = bk.service;
    const day = bk.days.find((d) => d.date === bk.date);
    body = `<div class="sel-sum"><span class="n">${esc(s.name)}${s.tag && s.category === 'manicuria' ? ` · ${esc(s.tag)}` : ''}</span><span class="w">${durTxt(s.duration)} · ${fmt(s.price)}</span><button class="link-btn" data-step="1" style="justify-self:start;margin-top:4px">Cambiar servicio</button></div>
      <div class="step-t">Elegí el día</div>
      ${bk.loading && !bk.days.length ? '<div class="spinner"></div>' : `<div class="daystrip" id="dayStrip">${bk.days.map((d) => { const l = dayLabel(d.date); return `<button class="day" data-day="${d.date}" ${d.slots.length ? '' : 'disabled'} aria-pressed="${d.date === bk.date}" aria-label="${esc(l.long)}${d.slots.length ? '' : ', sin turnos'}"><span class="w">${l.w}</span><span class="d">${l.d}</span><span class="mo">${MONTHS[l.m - 1]}</span></button>`; }).join('')}${bk.days.length && bk.days.at(-1).date < bk.maxDate ? `<button class="day" data-more><span class="w">más</span><span class="d">+</span><span class="mo">días</span></button>` : ''}</div>`}
      ${bk.error ? `<p class="form-err">${esc(bk.error)}</p>` : ''}
      ${bk.date ? `<div class="step-t">Horarios del ${esc(dayLabel(bk.date).long)}</div>${day?.slots.length ? `<div class="times">${day.slots.map((t) => `<button class="time" data-time="${t}" aria-pressed="${t === bk.time}">${t}</button>`).join('')}</div>` : '<p class="empty-slots">No quedan horarios este día.</p>'}` : (bk.days.length ? '<p class="empty-slots">No hay turnos libres en estos días. Probá con más días o escribinos.</p>' : '')}`;
    foot = `<button class="btn solid wide" data-step="3" ${bk.time ? '' : 'disabled'}>Continuar</button>`;
  } else if (bk.step === 3) {
    const s = bk.service, f = bk.form, e = bk.errors;
    const dep = deposit(s.price), giftAmt = bk.gift ? Math.min(bk.gift.balance, s.price) : 0, due = Math.max(0, dep - giftAmt);
    const field = (k, label, type = 'text', extra = '') => `<div class="fl"><label for="b_${k}">${label}</label><input id="b_${k}" name="${k}" type="${type}" value="${esc(f[k] || '')}" ${e[k] ? 'aria-invalid="true"' : ''} ${extra}>${e[k] ? `<span class="err">${esc(e[k])}</span>` : ''}</div>`;
    body = `<div class="sel-sum"><span class="n">${esc(s.name)}${s.tag && s.category === 'manicuria' ? ` · ${esc(s.tag)}` : ''}</span><span class="w">${esc(dayLabel(bk.date).long)} · ${bk.time} h · ${durTxt(s.duration)}</span><button class="link-btn" data-step="2" style="justify-self:start;margin-top:4px">Cambiar día u horario</button></div>
      <form class="bk" id="bkForm" novalidate>
        <div class="step-t" style="margin-bottom:0">Tus datos</div>
        ${field('name', 'Nombre y apellido', 'text', 'autocomplete="name" autofocus')}
        <div class="row2">${field('email', 'Email', 'email', 'autocomplete="email" inputmode="email"')}${field('phone', 'Celular (WhatsApp)', 'tel', 'autocomplete="tel" inputmode="tel"')}</div>
        <div class="fl"><label for="b_notes">¿Algo que debamos saber? (opcional)</label><textarea id="b_notes" name="notes" rows="2" placeholder="Alergias, embarazo, preferencias…">${esc(f.notes || '')}</textarea></div>
        <div class="gift-apply"><div class="fl"><label for="b_gift">¿Tenés una gift card?</label><input id="b_gift" name="gift_code" value="${esc(f.gift_code || bk.gift?.code || '')}" placeholder="CS-XXXX-XXXX" autocomplete="off" style="text-transform:uppercase" ${bk.giftErr ? 'aria-invalid="true"' : ''}>${bk.giftErr ? `<span class="err">${esc(bk.giftErr)}</span>` : ''}</div><button class="btn sm" type="button" data-gift-check>${bk.gift ? 'Quitar' : 'Aplicar'}</button></div>
        ${bk.gift ? `<p class="gift-ok">Gift card aplicada: se descuentan ${fmt(giftAmt)} (saldo ${fmt(bk.gift.balance)}).</p>` : ''}
        <label class="check"><input type="checkbox" name="accept" ${f.accept ? 'checked' : ''}><span>Acepto los <button type="button" class="link-btn" data-legal style="font-size:inherit;letter-spacing:0;text-transform:none">términos y la política de cancelación</button>: puedo cancelar o reprogramar hasta ${SITE.booking.cancelHours} horas antes.</span></label>
        ${e.accept ? `<span class="form-err">${esc(e.accept)}</span>` : ''}
        ${bk.error ? `<p class="form-err" role="alert">${esc(bk.error)}</p>` : ''}
      </form>`;
    foot = `<div class="sum"><span>Precio del servicio</span><span class="money">${fmt(s.price)}</span></div>
      ${giftAmt ? `<div class="sum"><span>Gift card</span><span class="money">− ${fmt(giftAmt)}</span></div>` : ''}
      <div class="sum"><span>${due ? `Seña a pagar ahora (${SITE.booking.depositPercent}%)` : 'A pagar ahora'}</span><b class="money">${fmt(due)}</b></div>
      <p class="note">${due ? `El resto (${fmt(Math.max(0, s.price - dep - Math.max(0, giftAmt - dep)))}) lo pagás en la casa. Guardamos el horario ${SITE.booking.holdMinutes} minutos mientras pagás.` : giftAmt >= s.price ? 'Tu gift card cubre todo el servicio.' : `El resto (${fmt(s.price - giftAmt)}) lo pagás en la casa.`}</p>
      <button class="btn solid wide" form="bkForm" type="submit" ${bk.sending ? 'disabled' : ''}>${bk.sending ? 'Un momento…' : due ? 'Pagar seña con Mercado Pago' : 'Confirmar turno'}</button>`;
  }
  const html = `${head(bk.step === 1 ? 'Reservá tu turno' : bk.step === 2 ? 'Día y horario' : 'Confirmá tu turno', bk.step > 1 ? String(bk.step - 1) : '')}${steps}<div class="dbody">${body}</div>${foot ? `<div class="dfoot">${foot}</div>` : ''}`;
  if (open || !$('#drawer').classList.contains('on')) openDrawer(html, { label: 'Reservar turno' });
  else { const sc = $('#drawer .dbody')?.scrollTop || 0, ds = $('#dayStrip')?.scrollLeft || 0; $('#drawer').innerHTML = html; if ($('#drawer .dbody')) $('#drawer .dbody').scrollTop = sc; if ($('#dayStrip')) $('#dayStrip').scrollLeft = ds; }
}
function readBkForm() { const f = $('#bkForm'); if (!f) return; const d = new FormData(f); bk.form = { name: d.get('name') || '', email: d.get('email') || '', phone: d.get('phone') || '', notes: d.get('notes') || '', gift_code: d.get('gift_code') || '', accept: !!d.get('accept') }; }
async function submitBooking() {
  readBkForm();
  bk.errors = {}; bk.error = '';
  const f = bk.form;
  if (f.name.trim().length < 3) bk.errors.name = 'Escribí tu nombre y apellido.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim())) bk.errors.email = 'Revisá el email: ahí te llega la confirmación.';
  if (f.phone.replace(/\D/g, '').length < 8) bk.errors.phone = 'Dejanos un teléfono con WhatsApp.';
  if (!f.accept) bk.errors.accept = 'Para reservar tenés que aceptar las condiciones.';
  if (Object.keys(bk.errors).length) { renderBooking(); $('#drawer [aria-invalid="true"]')?.focus(); return; }
  bk.sending = true; renderBooking();
  try {
    const r = await api('/api/bookings', { service_id: bk.service.id, date: bk.date, time: bk.time, ...f, gift_code: bk.gift?.code || '' });
    if (r.pay_url) { bk.sending = false; goPay(r.pay_url); return; }
    showBooking(r.booking.token, r.booking);
  } catch (e) {
    bk.sending = false;
    if (e.data?.taken) { bk.step = 2; bk.time = ''; bk.error = e.message; await loadDays(); return; }
    bk.errors = e.data?.errors || {}; bk.error = Object.keys(bk.errors).length ? '' : e.message; renderBooking();
  }
}
function goPay(url) { if (url.startsWith('#')) { location.hash = url; route(); } else location.href = url; }

// ── Estado del turno (link del email) ────────────────────
async function showBooking(token, pre) {
  setHash('#turno/' + token);
  openDrawer(`${head('Tu turno')}<div class="dbody"><div class="spinner" style="margin-top:20px"></div></div>`, { label: 'Tu turno' });
  try {
    const b = pre || (await api('/api/bookings/' + encodeURIComponent(token))).booking;
    const okS = ['confirmed', 'completed'].includes(b.status), badS = ['cancelled', 'expired', 'no_show'].includes(b.status);
    const rest = Math.max(0, b.price - b.deposit_paid - b.gift_applied);
    $('#drawer').innerHTML = `${head('Tu turno')}<div class="dbody"><div class="status">
      <span class="pill ${okS ? 'ok' : badS ? 'bad' : ''}">${esc(b.status_label)}</span>
      <div class="big">${b.status === 'confirmed' ? '¡Te esperamos!' : b.status === 'pending_payment' ? 'Falta la seña' : esc(b.service_name)}</div>
      ${b.status === 'pending_payment' ? `<p>Guardamos tu horario hasta las ${new Date(b.hold_until).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}. Si el pago no se acredita, se libera.</p>` : ''}
      <dl class="kv"><div><dt>Servicio</dt><dd>${esc(b.service_name)}</dd></div><div><dt>Día y hora</dt><dd>${esc(cap(b.when))}</dd></div><div><dt>Duración</dt><dd>${durTxt(b.duration)}</dd></div>
        ${b.price ? `<div><dt>Precio</dt><dd>${fmt(b.price)}</dd></div>` : ''}${b.gift_applied ? `<div><dt>Gift card</dt><dd>− ${fmt(b.gift_applied)}</dd></div>` : ''}${b.deposit_paid ? `<div><dt>Seña pagada</dt><dd>${fmt(b.deposit_paid)}</dd></div>` : ''}
        ${b.status === 'confirmed' && b.price ? `<div><dt>Resta en la casa</dt><dd><b>${fmt(rest)}</b></dd></div>` : ''}<div><dt>Código</dt><dd>${esc(b.code)}</dd></div></dl>
      ${b.status === 'confirmed' ? `<p class="note">Te mandamos la confirmación a ${esc(b.email)}. Llegá 10 minutos antes: ${esc(SITE.site.address)}.</p>` : ''}
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${b.pay_url ? `<button class="btn solid" data-pay="${esc(b.pay_url)}">Pagar la seña</button>` : ''}
        ${b.can_cancel ? `<button class="btn" data-cancel="${esc(b.token)}">Cancelar turno</button>` : ''}
        <a class="btn" href="${wa(SITE.site.whatsapp, `Hola! Tengo el turno ${b.code} (${b.service_name}, ${b.when}).`)}" target="_blank" rel="noopener">WhatsApp</a>
        ${['cancelled', 'expired'].includes(b.status) ? '<button class="btn solid" data-book>Reservar otro turno</button>' : ''}
      </div></div></div>`;
  } catch (e) { $('#drawer .dbody').innerHTML = `<p class="form-err" style="margin-top:20px">${esc(e.message)}</p>`; }
}

// ── Gift cards ───────────────────────────────────────────
const gf = { choice: null, form: {}, errors: {}, error: '', sending: false };
function openGift(serviceId = null) {
  Object.assign(gf, { choice: serviceId ? { service_id: Number(serviceId) } : gf.choice || null, errors: {}, error: '', sending: false });
  setHash('#regalar');
  renderGift(true);
}
function renderGift(open = false) {
  const G = SITE.giftcards, f = gf.form, e = gf.errors;
  const rituals = SITE.services.filter((s) => s.mode === 'online' && s.price && s.category === 'rituales');
  const amount = gf.choice?.service_id ? SITE.services.find((s) => s.id === gf.choice.service_id)?.price : gf.choice?.amount;
  const field = (k, label, type = 'text', extra = '') => `<div class="fl"><label for="g_${k}">${label}</label><input id="g_${k}" name="${k}" type="${type}" value="${esc(f[k] || '')}" ${e[k] ? 'aria-invalid="true"' : ''} ${extra}>${e[k] ? `<span class="err">${esc(e[k])}</span>` : ''}</div>`;
  const html = `${head('Regalá una gift card')}<div class="dbody">
    <div class="step-t">Un ritual</div><div class="amounts">${rituals.map((s) => `<button class="amt" data-gchoice="s${s.id}" aria-pressed="${gf.choice?.service_id === s.id}"><b>${esc(s.name)}</b><small>${fmt(s.price)}</small></button>`).join('')}</div>
    <div class="step-t">O un monto</div><div class="amounts">${G.amounts.map((a) => `<button class="amt" data-gchoice="a${a}" aria-pressed="${!gf.choice?.service_id && gf.choice?.amount === a}"><b>${fmt(a)}</b><small>Para lo que elija</small></button>`).join('')}</div>
    <div class="fl" style="margin-top:12px"><label for="g_custom">Otro monto (mínimo ${fmt(G.min)})</label><input id="g_custom" name="custom" inputmode="numeric" value="${gf.choice?.custom ? esc(gf.choice.amount) : ''}" placeholder="$"></div>
    ${e.amount ? `<p class="form-err">${esc(e.amount)}</p>` : ''}
    <form class="bk" id="gfForm" novalidate>
      <div class="step-t" style="margin-bottom:0">Tus datos</div>
      <div class="row2">${field('buyer_name', 'Tu nombre', 'text', 'autocomplete="name"')}${field('buyer_email', 'Tu email', 'email', 'autocomplete="email" inputmode="email"')}</div>
      <div class="step-t" style="margin-bottom:0">Para quién es</div>
      ${field('to_name', 'Nombre de quien la recibe (opcional)')}
      <div class="fl"><label for="g_message">Dedicatoria (opcional)</label><textarea id="g_message" name="message" rows="2" maxlength="240">${esc(f.message || '')}</textarea></div>
      <label class="check"><input type="checkbox" name="send_to_recipient" ${f.send_to_recipient ? 'checked' : ''} data-gsend><span>Mandársela por email a quien la recibe</span></label>
      ${f.send_to_recipient ? field('to_email', 'Email de quien la recibe', 'email', 'inputmode="email"') : ''}
      <label class="check"><input type="checkbox" name="accept" ${f.accept ? 'checked' : ''}><span>Acepto los <button type="button" class="link-btn" data-legal style="font-size:inherit;letter-spacing:0;text-transform:none">términos y condiciones</button>. La gift card vale ${Math.round(G.validityDays / 30)} meses.</span></label>
      ${e.accept ? `<span class="form-err">${esc(e.accept)}</span>` : ''}
      ${gf.error ? `<p class="form-err" role="alert">${esc(gf.error)}</p>` : ''}
    </form></div>
    <div class="dfoot"><div class="sum"><span>Total</span><b class="money">${amount ? fmt(amount) : '—'}</b></div><button class="btn solid wide" type="submit" form="gfForm" ${gf.sending ? 'disabled' : ''}>${gf.sending ? 'Un momento…' : 'Pagar con Mercado Pago'}</button></div>`;
  if (open || !$('#drawer').classList.contains('on')) openDrawer(html, { label: 'Gift card' });
  else { const sc = $('#drawer .dbody')?.scrollTop || 0; $('#drawer').innerHTML = html; $('#drawer .dbody').scrollTop = sc; }
}
function readGfForm() {
  const f = $('#gfForm'); if (!f) return;
  const d = new FormData(f);
  gf.form = { buyer_name: d.get('buyer_name') || '', buyer_email: d.get('buyer_email') || '', to_name: d.get('to_name') || '', to_email: d.get('to_email') || gf.form.to_email || '', message: d.get('message') || '', send_to_recipient: !!d.get('send_to_recipient'), accept: !!d.get('accept') };
}
async function submitGift() {
  readGfForm();
  const f = gf.form; gf.errors = {}; gf.error = '';
  const c = $('#g_custom')?.value.replace(/\D/g, '');
  if (c) gf.choice = { amount: Number(c), custom: true };
  if (!gf.choice) gf.errors.amount = 'Elegí un ritual o un monto.';
  if (f.buyer_name.trim().length < 3) gf.errors.buyer_name = 'Escribí tu nombre.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.buyer_email.trim())) gf.errors.buyer_email = 'Revisá tu email: ahí te mandamos la gift card.';
  if (f.send_to_recipient && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.to_email.trim())) gf.errors.to_email = 'Revisá el email de quien la recibe.';
  if (!f.accept) gf.errors.accept = 'Tenés que aceptar las condiciones.';
  if (Object.keys(gf.errors).length) { renderGift(); return; }
  gf.sending = true; renderGift();
  try {
    const r = await api('/api/giftcards', { ...f, ...(gf.choice.service_id ? { service_id: gf.choice.service_id } : { amount: gf.choice.amount }) });
    gf.sending = false; goPay(r.pay_url);
  } catch (e) { gf.sending = false; gf.errors = e.data?.errors || {}; gf.error = Object.keys(gf.errors).length ? '' : e.message; renderGift(); }
}
async function showGift(token, pre) {
  setHash('#gift/' + token);
  openDrawer(`${head('Gift card')}<div class="dbody"><div class="spinner" style="margin-top:20px"></div></div>`, { label: 'Gift card' });
  try {
    const g = pre || (await api('/api/giftcards/' + encodeURIComponent(token))).gift;
    const exp = g.expires_at ? new Date(g.expires_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    $('#drawer').innerHTML = `${head('Gift card')}<div class="dbody"><div class="status">
      <span class="pill ${g.status === 'active' ? 'ok' : ['expired', 'cancelled', 'used'].includes(g.status) ? 'bad' : ''}">${esc(g.status_label)}</span>
      ${g.status === 'pending_payment' ? '<div class="big">Falta el pago</div><p>Cuando se acredite te llega por email.</p>' : ''}
      <div class="gcard big"><div class="caps">Gift card</div><div class="gname">Casa Samadhi</div>
        <div class="gamount">${esc(g.service_name || fmt(g.amount))}${g.to_name ? ` · para ${esc(g.to_name)}` : ''}</div>
        ${g.message ? `<div class="msg">“${esc(g.message)}”</div>` : ''}
        ${g.code ? `<div class="gfoot">Código</div><div class="code">${esc(g.code)}</div>` : ''}
        ${exp ? `<div class="gfoot">Válida hasta el ${esc(exp)}${g.balance < g.amount ? ` · saldo ${fmt(g.balance)}` : ''}</div>` : ''}</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${g.pay_url ? `<button class="btn solid" data-pay="${esc(g.pay_url)}">Pagar</button>` : ''}
        ${g.status === 'active' ? `<button class="btn solid" data-book-gift="${esc(g.code)}">Reservar con esta gift card</button><button class="btn" data-print>Imprimir</button>` : ''}
      </div></div></div>`;
  } catch (e) { $('#drawer .dbody').innerHTML = `<p class="form-err" style="margin-top:20px">${esc(e.message)}</p>`; }
}

// ── Pago simulado (modo prueba, sin Mercado Pago) ────────
function showSimPay(kind, token) {
  openDrawer(`${head('Pago de prueba')}<div class="dbody"><div class="status">
    <div class="mp-sim"><div class="brand"><i></i> Mercado Pago · modo prueba</div><p class="note">Todavía no está cargada la cuenta de Mercado Pago, así que este pago es simulado. Elegí cómo termina:</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn solid" data-sim="approved" data-kind="${kind}" data-token="${esc(token)}">Aprobar pago</button><button class="btn" data-sim="rejected" data-kind="${kind}" data-token="${esc(token)}">Rechazar</button></div></div></div></div>`, { label: 'Pago de prueba' });
}
async function simulate(kind, token, result) {
  try {
    const r = await api('/api/pay/simulate', { kind, token, result });
    if (result === 'rejected') toast('Pago rechazado (prueba)');
    if (kind === 'gift') showGift(token, r.gift); else showBooking(token, r.booking);
  } catch (e) { toast(e.message); }
}

// ── Legales ──────────────────────────────────────────────
function openLegal() {
  setHash('#terminos');
  openDrawer(`${head('Términos y condiciones')}<div class="dbody"><div class="doc-body">${md(SITE.terms)}</div></div>`, { doc: true, label: 'Términos y condiciones' });
}
function openWithdraw(done) {
  setHash('#arrepentimiento');
  openDrawer(`${head('Botón de arrepentimiento')}<div class="dbody">${done ? `<div class="status"><span class="pill ok">Recibido</span><div class="big">${esc(done)}</div><p>Ese es tu código de trámite. Te lo mandamos por email y te escribimos dentro de las 48 horas hábiles para coordinar la devolución.</p></div>` : `
    <p class="doc-body">Tenés 10 días corridos desde que reservaste o compraste una gift card para arrepentirte, sin dar explicaciones, siempre que el servicio no se haya realizado. Te devolvemos el total.</p>
    <form class="bk" id="wdForm" novalidate>
      <div class="fl"><label for="w_name">Nombre y apellido</label><input id="w_name" name="name" autocomplete="name" autofocus></div>
      <div class="fl"><label for="w_email">Email</label><input id="w_email" name="email" type="email" autocomplete="email"></div>
      <div class="fl"><label for="w_ref">Código del turno o de la gift card</label><input id="w_ref" name="ref" placeholder="T-1001 o CS-XXXX-XXXX" style="text-transform:uppercase"></div>
      <div class="fl"><label for="w_reason">Motivo (opcional)</label><textarea id="w_reason" name="reason" rows="2"></textarea></div>
      <p class="form-err" id="wdErr" role="alert"></p>
      <button class="btn solid" type="submit">Enviar pedido</button>
    </form>`}</div>`, { label: 'Botón de arrepentimiento' });
}

// ── Mi cuenta ────────────────────────────────────────────
const acc = { mode: 'login', error: '', errors: {}, sending: false };
async function openAccount(mode) {
  setHash('#cuenta');
  if (mode) acc.mode = mode;
  openDrawer(`${head('Mi cuenta')}<div class="dbody"><div class="spinner" style="margin-top:20px"></div></div>`, { label: 'Mi cuenta' });
  try { ACC = await api('/api/account/me'); } catch { ACC = null; }
  renderAccount();
}
function demoHint() {
  const U = window.__CASA_DEMO_USERS;
  if (!U) return '';
  return `<div class="sel-sum" style="margin-top:18px"><span class="n" style="font-size:17px">Usuarios de prueba</span>${U.map((u) => `<button type="button" class="link-btn" style="text-align:left;text-transform:none;letter-spacing:0;font-size:13px" data-demo-user="${esc(u.email)}|${esc(u.password)}">${u.kind === 'customer' ? 'Clienta' : u.role === 'admin' ? 'Administración' : 'Recepción'}: ${esc(u.email)} · ${esc(u.password)}</button>`).join('')}<span class="note">Tocá uno para completar el formulario.</span></div>`;
}
function renderAccount() {
  const e = acc.errors;
  const field = (k, label, type = 'text', extra = '') => `<div class="fl"><label for="a_${k}">${label}</label><input id="a_${k}" name="${k}" type="${type}" ${e[k] ? 'aria-invalid="true"' : ''} ${extra}>${e[k] ? `<span class="err">${esc(e[k])}</span>` : ''}</div>`;
  let body;
  if (acc.staff) {
    body = `<div class="status"><span class="pill ok">Equipo</span><div class="big">Hola, ${esc(acc.staff.name || acc.staff.email)}</div><p>Entraste con un usuario del equipo (${esc(acc.staff.role_label)}).</p><button class="btn solid" data-open-panel>Entrar al panel</button></div>`;
  } else if (!ACC && acc.mode === 'login') {
    body = `<p class="doc-body" style="padding-top:14px">Ingresá para ver tus turnos y gift cards, cancelar o reservar de nuevo más rápido.</p>
      <form class="bk" id="loginForm" novalidate>${field('email', 'Email', 'email', 'autocomplete="email" autofocus')}${field('password', 'Contraseña', 'password', 'autocomplete="current-password"')}
      ${acc.error ? `<p class="form-err" role="alert">${esc(acc.error)}</p>` : ''}<button class="btn solid" type="submit" ${acc.sending ? 'disabled' : ''}>Ingresar</button></form>
      <p class="note" style="margin-top:18px">¿No tenés cuenta? <button class="link-btn" data-acc-mode="register">Creala acá</button>. ¿Te olvidaste la contraseña? Escribinos por <a href="${wa(SITE.site.whatsapp, 'Hola! Me olvidé la contraseña de mi cuenta en la web.')}" target="_blank" rel="noopener">WhatsApp</a>.</p>${demoHint()}`;
  } else if (!ACC) {
    body = `<p class="doc-body" style="padding-top:14px">Con tu cuenta ves todos tus turnos y gift cards en un solo lugar.</p>
      <form class="bk" id="registerForm" novalidate>${field('name', 'Nombre y apellido', 'text', 'autocomplete="name" autofocus')}<div class="row2">${field('email', 'Email', 'email', 'autocomplete="email"')}${field('phone', 'Celular (WhatsApp)', 'tel', 'autocomplete="tel"')}</div>${field('password', 'Contraseña (8 o más caracteres)', 'password', 'autocomplete="new-password"')}
      ${acc.error ? `<p class="form-err" role="alert">${esc(acc.error)}</p>` : ''}<button class="btn solid" type="submit" ${acc.sending ? 'disabled' : ''}>Crear mi cuenta</button></form>
      <p class="note" style="margin-top:18px">¿Ya tenés cuenta? <button class="link-btn" data-acc-mode="login">Ingresá</button>.</p>`;
  } else {
    const c = ACC.customer;
    const card = (b, past) => `<div class="kv" style="border-top:0"><div style="align-items:center"><dt><b style="font-weight:500;color:var(--tinta)">${esc(b.service_name)}</b><br>${esc(cap(b.when))}${past ? ` · ${esc(b.status_label)}` : b.status !== 'confirmed' ? ` · ${esc(b.status_label)}` : ''}</dt><dd>${past ? `<button class="btn sm" data-rebook="${esc(b.service_name)}">Reservar de nuevo</button>` : `<button class="btn sm" data-show-turno="${esc(b.token)}">Ver</button>`}</dd></div></div>`;
    body = `<div class="status" style="gap:6px"><div class="big">Hola, ${esc(c.name.split(' ')[0])}</div><p class="note">${esc(c.email)} · ${esc(c.phone)}</p></div>
      <div class="step-t">Próximos turnos</div>${ACC.upcoming.length ? ACC.upcoming.map((b) => card(b)).join('') : '<p class="empty-slots">No tenés turnos por delante.</p>'}
      <button class="btn solid sm" data-book style="margin-top:10px">Reservar un turno</button>
      ${ACC.giftcards.length ? `<div class="step-t" style="margin-top:26px">Gift cards</div>${ACC.giftcards.map((g) => `<div class="kv" style="border-top:0"><div style="align-items:center"><dt><b style="font-weight:500;color:var(--tinta)">${esc(g.service_name || fmt(g.amount))}</b> · ${esc(g.status_label)}<br>${esc(g.code || '')}${g.status === 'active' ? ` · saldo ${fmt(g.balance)}` : ''}</dt><dd><button class="btn sm" data-show-gift="${esc(g.token)}">Ver</button></dd></div></div>`).join('')}` : ''}
      ${ACC.past.length ? `<div class="step-t" style="margin-top:26px">Historial</div>${ACC.past.map((b) => card(b, true)).join('')}` : ''}
      <div class="step-t" style="margin-top:26px">Mis datos</div>
      <form class="bk" id="profileForm" novalidate><div class="row2"><div class="fl"><label for="p_name">Nombre</label><input id="p_name" name="name" value="${esc(c.name)}"></div><div class="fl"><label for="p_phone">Celular</label><input id="p_phone" name="phone" value="${esc(c.phone)}"></div></div>
        <div class="row2"><div class="fl"><label for="p_cur">Contraseña actual</label><input id="p_cur" name="current" type="password" autocomplete="current-password" placeholder="Solo si la querés cambiar"></div><div class="fl"><label for="p_new">Contraseña nueva</label><input id="p_new" name="password" type="password" autocomplete="new-password"></div></div>
        ${acc.error ? `<p class="form-err" role="alert">${esc(acc.error)}</p>` : ''}<div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn sm" type="submit">Guardar mis datos</button><button class="btn sm" type="button" data-logout>Salir</button></div></form>`;
  }
  $('#drawer').innerHTML = `${head(ACC ? 'Mi cuenta' : acc.mode === 'register' ? 'Crear cuenta' : 'Ingresar')}<div class="dbody">${body}</div>`;
}
async function accountSubmit(form) {
  const d = Object.fromEntries(new FormData(form));
  acc.error = ''; acc.errors = {}; acc.sending = true;
  try {
    if (form.id === 'loginForm') {
      const r = await api('/api/account/login', d);
      if (r.staff) { acc.staff = r.staff; ACC = null; } else { ACC = r; acc.staff = null; toast(`Hola, ${r.customer.name.split(' ')[0]}`); }
    } else if (form.id === 'registerForm') { ACC = await api('/api/account/register', d); toast('Cuenta creada'); }
    else if (form.id === 'profileForm') { ACC = await api('/api/account/me', d, 'PATCH'); toast('Datos guardados'); }
  } catch (err) { acc.errors = err.data?.errors || {}; acc.error = Object.keys(acc.errors).length ? '' : err.message; }
  acc.sending = false; renderAccount();
  if (ACC) bk.form = { ...bk.form, name: ACC.customer.name, email: ACC.customer.email, phone: ACC.customer.phone };
}

// ── Eventos ──────────────────────────────────────────────
function route() {
  const h = decodeURIComponent(location.hash.slice(1));
  if (h.startsWith('turno/')) showBooking(h.slice(6));
  else if (h.startsWith('gift/')) showGift(h.slice(5));
  else if (h.startsWith('pago/')) { const [, kind, token] = h.split('/'); showSimPay(kind, token); }
  else if (h === 'reservar') openBooking();
  else if (h === 'regalar') openGift();
  else if (h === 'terminos') openLegal();
  else if (h === 'arrepentimiento') openWithdraw();
  else if (h === 'cuenta') openAccount();
}
function bind() {
  document.addEventListener('click', async (e) => {
    const t = e.target;
    const act = t.closest('[data-act]')?.dataset.act;
    if (act) { const [k, v] = act.split(':'); if (k === 'book') openBooking({ serviceId: svcBySlug(v)?.id }); if (k === 'cat') openBooking({ category: v }); return; }
    if (t.closest('[data-close]')) return closeAll();
    if (t.closest('[data-book]')) return openBooking();
    const bs = t.closest('[data-book-svc]'); if (bs) return openBooking({ serviceId: bs.dataset.bookSvc });
    const bc = t.closest('[data-book-cat]'); if (bc) return openBooking({ category: bc.dataset.bookCat });
    const gs = t.closest('[data-gift-svc]'); if (gs) return openGift(gs.dataset.giftSvc);
    if (t.closest('[data-gift]')) return openGift();
    if (t.closest('[data-legal]')) { if ($('#drawer').classList.contains('on') && (bk.step === 3 || $('#gfForm'))) { readBkForm(); readGfForm(); } return openLegal(); }
    if (t.closest('[data-withdraw]')) return openWithdraw();
    if (t.closest('[data-account]')) return openAccount();
    const am = t.closest('[data-acc-mode]'); if (am) { acc.mode = am.dataset.accMode; acc.error = ''; acc.errors = {}; return renderAccount(); }
    const du = t.closest('[data-demo-user]'); if (du) { const [em, pw] = du.dataset.demoUser.split('|'); acc.mode = 'login'; renderAccount(); $('#a_email').value = em; $('#a_password').value = pw; return; }
    if (t.closest('[data-open-panel]')) { if (window.__CASA_OPEN_ADMIN) { closeAll(); window.__CASA_OPEN_ADMIN(); } else location.href = '/admin/'; return; }
    if (t.closest('[data-logout]')) { await api('/api/account/logout', {}); ACC = null; bk.form = {}; acc.mode = 'login'; toast('Cerraste sesión'); return renderAccount(); }
    const stt = t.closest('[data-show-turno]'); if (stt) return showBooking(stt.dataset.showTurno);
    const stg = t.closest('[data-show-gift]'); if (stg) return showGift(stg.dataset.showGift);
    const rb = t.closest('[data-rebook]'); if (rb) { const sv = SITE.services.find((x) => rb.dataset.rebook.startsWith(x.name) && x.mode === 'online'); return openBooking(sv ? { serviceId: sv.id } : {}); }
    const bg = t.closest('[data-book-gift]');
    if (bg) { openBooking(); bk.form.gift_code = bg.dataset.bookGift; api('/api/giftcards/check', { code: bg.dataset.bookGift }).then((g) => (bk.gift = g)).catch(() => {}); return; }
    if (t.closest('[data-print]')) return window.print();
    const pay = t.closest('[data-pay]'); if (pay) return goPay(pay.dataset.pay);
    const sim = t.closest('[data-sim]'); if (sim) return simulate(sim.dataset.kind, sim.dataset.token, sim.dataset.sim);
    const cancel = t.closest('[data-cancel]');
    if (cancel) {
      if (cancel.dataset.sure) { cancel.disabled = true; try { const r = await api(`/api/bookings/${encodeURIComponent(cancel.dataset.cancel)}/cancel`, {}); toast('Turno cancelado'); showBooking(r.booking.token, r.booking); } catch (err) { toast(err.message); cancel.disabled = false; } }
      else { cancel.dataset.sure = '1'; cancel.textContent = '¿Seguro? Tocá para cancelar'; cancel.classList.add('solid'); }
      return;
    }
    const back = t.closest('[data-back]');
    if (back) { readBkForm(); bk.step = Number(back.dataset.back); bk.error = ''; return renderBooking(); }
    // Pasos de la reserva
    const pick = t.closest('[data-pick]');
    if (pick) { bk.service = SITE.services.find((s) => s.id === Number(pick.dataset.pick)); bk.step = 2; bk.days = []; bk.time = ''; bk.date = ''; bk.error = ''; renderBooking(); loadDays(); return; }
    if (t.closest('[data-allsvc]')) { bk.filter = null; return renderBooking(); }
    const day = t.closest('[data-day]'); if (day && !day.disabled) { bk.date = day.dataset.day; bk.time = ''; return renderBooking(); }
    if (t.closest('[data-more]')) return loadDays(true);
    const time = t.closest('[data-time]'); if (time) { bk.time = time.dataset.time; renderBooking(); $('#drawer .dfoot .btn')?.focus(); return; }
    const step = t.closest('[data-step]'); if (step && !step.disabled) { readBkForm(); bk.step = Number(step.dataset.step); bk.error = ''; if (bk.step === 1) bk.filter = null; renderBooking(); if (bk.step === 2 && !bk.days.length) loadDays(); return; }
    if (t.closest('[data-gift-check]')) {
      readBkForm();
      if (bk.gift) { bk.gift = null; bk.form.gift_code = ''; bk.giftErr = ''; return renderBooking(); }
      try { bk.gift = await api('/api/giftcards/check', { code: bk.form.gift_code }); bk.giftErr = ''; } catch (err) { bk.giftErr = err.data?.errors?.gift_code || err.message; }
      return renderBooking();
    }
    const gc = t.closest('[data-gchoice]');
    if (gc) { readGfForm(); const v = gc.dataset.gchoice; gf.choice = v[0] === 's' ? { service_id: Number(v.slice(1)) } : { amount: Number(v.slice(1)) }; gf.errors.amount = ''; return renderGift(); }
    if (t.closest('[data-gsend]')) { readGfForm(); return renderGift(); }
    // Enlaces a secciones: si hay un panel abierto, se cierra primero.
    const a = t.closest('a[href^="#"]');
    if (a && a.getAttribute('href').length > 1 && $(a.getAttribute('href'))) { e.preventDefault(); closeAll(); $(a.getAttribute('href')).scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' }); }
  });
  document.addEventListener('input', (e) => {
    const fl = e.target.closest('#bkForm .fl, #gfForm .fl');
    if (fl && e.target.getAttribute('aria-invalid')) { e.target.removeAttribute('aria-invalid'); fl.querySelector('.err')?.remove(); const k = e.target.name; delete bk.errors[k]; delete gf.errors[k]; } if (e.target.id === 'g_custom') { const v = Number(e.target.value.replace(/\D/g, '')); gf.choice = v ? { amount: v, custom: true } : null; $$('#drawer .amt').forEach((b) => b.setAttribute('aria-pressed', 'false')); const s = $('#drawer .dfoot .sum b'); if (s) s.textContent = v ? fmt(v) : '—'; } });
  document.addEventListener('submit', async (e) => {
    if (e.target.id === 'bkForm') { e.preventDefault(); submitBooking(); }
    if (e.target.id === 'gfForm') { e.preventDefault(); submitGift(); }
    if (['loginForm', 'registerForm', 'profileForm'].includes(e.target.id)) { e.preventDefault(); accountSubmit(e.target); }
    if (e.target.id === 'wdForm') {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      try { const r = await api('/api/withdrawals', d); openWithdraw(r.code); } catch (err) { $('#wdErr').textContent = err.message; }
    }
  });
  $('#menuBtn').addEventListener('click', () => { lastFocus = $('#menuBtn'); $('#mnav').classList.add('on'); $('#scrim').classList.add('on'); });
  $('#logoBtn').addEventListener('click', (e) => { e.preventDefault(); closeAll(); window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' }); });
  $('#scrim').addEventListener('click', closeAll);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAll(); });
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('hashchange', route);
}

// Vuelta de Mercado Pago: ?pago=booking.TOKEN (&payment_id=… o &simulado=1)
async function handleReturn() {
  const p = new URLSearchParams(location.search);
  const pago = p.get('pago');
  if (!pago) return false;
  const [kind, token] = pago.split('.');
  try { history.replaceState(null, '', location.pathname); } catch {}
  if (p.get('simulado')) { showSimPay(kind, token); return true; }
  const pid = p.get('payment_id') || p.get('collection_id');
  if (pid) { try { await api('/api/pay/confirm', { kind, token, payment_id: pid }); } catch {} }
  if (kind === 'gift') showGift(token); else showBooking(token);
  if (p.get('status') === 'rejected' || p.get('collection_status') === 'rejected') toast('El pago no se aprobó. Podés intentar de nuevo.');
  return true;
}

async function start() {
  bind();
  try { SITE = await api('/api/site'); }
  catch { $('#ritualList').innerHTML = '<p class="it">No pudimos cargar los servicios. Recargá la página.</p>'; return; }
  renderHero(); bindHero(); renderSections(); onScroll();
  try { ACC = await api('/api/account/me'); } catch { ACC = null; }
  if (!(await handleReturn())) route();
  window.addEventListener('casa-refresh', async () => { try { SITE = await api('/api/site'); renderSections(); } catch {} });
}
start();
