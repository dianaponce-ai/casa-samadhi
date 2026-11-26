// Casa Samadhi · web pública
// Habla con el servidor por /api. En la vista previa sin servidor, window.__CASA_API responde en su lugar.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (n) => '$ ' + Math.round(Number(n) || 0).toLocaleString('es-AR');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
// Turnero solo: el link de Instagram (/turnos) abre directo la reserva, sin la web.
// Páginas de gracias (/gracias-turno y /gracias-comprobante): se ven como el turnero, con su propia dirección para medir conversiones.
const THANKS = (/\/gracias-(turno|comprobante)(\.html)?\/?$/.exec(location.pathname) || [])[1] || (['turno', 'comprobante'].includes(new URLSearchParams(location.search).get('gracias')) ? new URLSearchParams(location.search).get('gracias') : '');
const SOLO = !!THANKS || /\/turnos(\.html)?\/?$/.test(location.pathname) || /^#turnos/.test(location.hash) || new URLSearchParams(location.search).has('turnos');
// De dónde llegó la clienta (UTM, fbclid, gclid): se guarda 30 días y viaja con la reserva (para Nifty y las campañas).
(function captureOrigin() {
  try {
    const p = new URLSearchParams(location.search), src = (p.get('utm_source') || '').toLowerCase(), med = (p.get('utm_medium') || '').toLowerCase();
    const organic = /^(organic|organico|bio|social|referral|perfil|historia|stories)$/.test(med);
    let canal = '';
    if (!organic && (p.get('fbclid') || /^(facebook|instagram|fb|ig|meta)$/.test(src))) canal = 'Meta';
    else if (!organic && (p.get('gclid') || p.get('gbraid') || p.get('wbraid') || src === 'google')) canal = 'Google';
    if (canal || src) localStorage.setItem('cs-origen', JSON.stringify({ canal: canal || 'Otro', fuente: src || (canal === 'Meta' ? 'meta' : canal === 'Google' ? 'google' : ''), campania: p.get('utm_campaign') || '', at: Date.now() }));
  } catch {}
})();
const origen = () => { let o = null; try { o = JSON.parse(localStorage.getItem('cs-origen') || 'null'); } catch {} if (o && Date.now() - o.at > 30 * 864e5) o = null; return { canal: o?.canal || 'Otro', fuente: o?.fuente || '', campania: o?.campania || '', pagina: SOLO ? 'turnero' : 'web' }; };
// Meta Pixel: eventos estándar (si el pixel está cargado).
const px = (ev, data) => { try { window.fbq?.('track', ev, data); } catch {} };
const pxc = (ev, data) => { try { window.fbq?.('trackCustom', ev, data); } catch {} };
// Una sola vez por gift card en este navegador (para no contar dos veces si vuelven a abrir el link).
const pxOnce = (key, ev, data) => { try { const k = 'px:' + key; if (localStorage.getItem(k)) return; localStorage.setItem(k, '1'); } catch {} px(ev, data); };
const MEDIA = window.__CASA_MEDIA || ((u) => (/^https?:\/\//.test(u) ? u : '/' + String(u || '').replace(/^\//, '')));
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

// ── Portada: banner bajo con un collage de fotitos de los servicios ──
// Cada foto se muestra chica (más chica que su tamaño real), así se ve nítida.
const COLLAGE = [
  { img: 'media/headspa-ritual.webp', pos: 'center 62%', label: 'Ritual esencial', act: 'book:ritual-esencial' },
  { img: 'media/trabajos/softgel-rosa-glitter.webp', label: 'Soft gel', act: 'book:soft-gel' },
  { img: 'media/manicuria-cafe.webp', label: 'Manicuría', act: 'cat:manicuria' },
  { img: 'media/headspa-agua.webp', pos: 'center 45%', label: 'Ritual profundo', act: 'book:ritual-profundo' },
  { img: 'media/unas.webp', label: 'Semipermanente', act: 'book:esmaltado-semipermanente' },
  { img: 'media/cafeteria.webp', label: 'Cafetería', act: '#cafe' },
];
function renderHero() {
  $('#collage').innerHTML = COLLAGE.map((c, i) => {
    const inner = `<img src="${MEDIA(c.img)}" alt="" style="object-position:${c.pos || 'center'}" ${i < 3 ? 'fetchpriority="high"' : 'loading="lazy"'}><span>${esc(c.label)}</span>`;
    return c.act.startsWith('#') ? `<a class="tile t${i + 1}" href="${c.act}">${inner}</a>` : `<button class="tile t${i + 1}" data-act="${esc(c.act)}" aria-label="${esc(c.label)}">${inner}</button>`;
  }).join('');
}
function bindHero() {}
let ticking = false;
function onScroll() {
  $('header.top').classList.toggle('scrolled', window.scrollY > 40);
  document.body.classList.toggle('show-mbar', window.scrollY > innerHeight * 0.6);
  if (ticking || reduced) return;
  ticking = true;
  requestAnimationFrame(() => {
    ticking = false;
    const band = $('#ritual-band'), r = band.getBoundingClientRect();
    if (r.bottom > 0 && r.top < innerHeight) $('#bandBg').style.setProperty('--py', `${((r.top + r.height / 2) - innerHeight / 2) * -0.22}px`);
  });
}

// ── Secciones ────────────────────────────────────────────
// WhatsApp que atiende cada servicio: el propio, el de head spa y masajes, o el general del local.
const svcWa = () => SITE.site.whatsapp; // un solo WhatsApp para toda la casa
const svcBySlug = (slug) => SITE.services.find((s) => s.slug === slug);
const cat = (k) => SITE.categories.find((c) => c.key === k) || {};
function actionsFor(s) {
  if (s.mode === 'online') return `<button class="btn solid sm" data-book-svc="${s.id}">Reservar</button><button class="btn sm" data-gift-svc="${s.id}">Regalar</button>`;
  return `<a class="btn sm" href="${wa(svcWa(s), `Hola! Quiero consultar por ${s.name} en Casa Samadhi.`)}" target="_blank" rel="noopener">Consultar por WhatsApp</a>`;
}
function renderSections() {
  const S = SITE.site;
  $('#announce').textContent = S.announcement || 'Head spa · Manicuría · Cafetería';
  $('#year').textContent = new Date().getFullYear();
  $('#ritIntro').textContent = cat('rituales').intro || '';
  $('#maniIntro').textContent = cat('manicuria').intro || '';
  $('#terIntro').textContent = cat('terapias').intro || '';
  if (cat('terapias').title) $('#terTitle').textContent = cat('terapias').title;
  const rit = SITE.services.filter((s) => s.category === 'rituales');
  $('#ritualList').innerHTML = rit.map((s) => `<article class="ritual">
    <div class="ph">${s.image ? `<img src="${MEDIA(s.image)}" alt="${esc(s.name)}" loading="lazy">` : ''}${s.tag ? `<span class="tag">${esc(s.tag)}</span>` : ''}</div>
    <div class="body"><h3>${esc(s.name)}</h3>
      <div class="meta"><span class="price">${s.price ? fmt(s.price) : 'Consultar'}</span><span class="dur">${s.duration ? durTxt(s.duration) : ''}</span></div>
      ${s.short ? `<p>${esc(s.short)}</p>` : ''}
      ${s.includes?.length ? `<ul>${s.includes.map((x) => `<li>${esc(splitInc(x)[0])}</li>`).join('')}</ul>` : ''}
      ${worksStrip(s)}
      <div class="actions">${actionsFor(s)}</div></div></article>`).join('');
  const mani = SITE.services.filter((s) => s.category === 'manicuria');
  // Dos columnas cuando hay precio con transferencia: efectivo y transferencia.
  const twoPrices = mani.some((s) => s.price_transfer);
  $('#maniMenu').classList.toggle('two', twoPrices);
  $('#maniMenu').innerHTML = (twoPrices ? '<li class="hd" aria-hidden="true"><span></span><span class="pr">Efectivo</span><span class="pr">Transferencia</span></li>' : '')
    + mani.map((s) => `<li><span class="nm">${esc(s.name)}${s.tag ? `<small>${esc(s.tag)}</small>` : ''}${worksStrip(s, { label: false })}</span>${twoPrices && s.price_transfer
      ? `<span class="pr" aria-label="Efectivo ${s.price ? fmt(s.price) : 'Consultar'}">${s.price ? fmt(s.price) : 'Consultar'}</span><span class="pr" aria-label="Transferencia ${fmt(s.price_transfer)}">${fmt(s.price_transfer)}</span>`
      : `<span class="pr${twoPrices ? ' span' : ''}">${s.price ? fmt(s.price) : 'Consultar'}</span>`}</li>`).join('');
  const ther = SITE.services.filter((s) => s.category === 'terapias' || !['rituales', 'manicuria', 'espacio'].includes(s.category));
  $('#terapias').hidden = !ther.length; // sin servicios, la sección no se muestra
  // Alquiler del espacio: sección propia con foto grande.
  const space = SITE.services.filter((s) => s.category === 'espacio');
  const sp = space[0], spCat = cat('espacio');
  $('#alquiler').hidden = !sp;
  if (sp) {
    $('#spaceTitle').textContent = spCat.title || sp.name;
    $('#spaceTag').textContent = sp.tag || sp.name;
    $('#spaceIntro').textContent = spCat.intro || '';
    $('#spaceShort').textContent = sp.short || '';
    $('#spaceList').innerHTML = (sp.includes || []).map((x) => `<li>${esc(splitInc(x)[0])}</li>`).join('');
    // Sin foto cargada (la terraza todavía no tiene) la sección se muestra solo con el texto.
    $('#alquiler').classList.toggle('no-photo', !sp.image);
    if (sp.image) $('#spaceImg').src = MEDIA(sp.image);
    $('#spaceWa').href = wa(svcWa(sp), `Hola! Quiero consultar por el ${sp.name.toLowerCase()} de Casa Samadhi para un evento. ¿Qué fechas tienen disponibles?`);
  }
  $('#therList').innerHTML = ther.map((s) => `<article class="ther">
    ${s.image ? `<div class="ph"><img src="${MEDIA(s.image)}" alt="${esc(s.name)}" loading="lazy"></div>` : ''}
    <div class="body">${s.tag ? `<div class="tg">${esc(s.tag)}</div>` : ''}<h3>${esc(s.name)}</h3>${s.short ? `<p>${esc(s.short)}</p>` : ''}${s.price ? `<p>${fmt(s.price)}${s.duration ? ` · ${durTxt(s.duration)}` : ''}</p>` : ''}
    <div class="actions">${s.mode === 'online' ? `<button class="btn solid sm" data-book-svc="${s.id}">Reservar</button>` : actionsFor(s)}</div></div></article>`).join('');
  $('#events').innerHTML = SITE.events.map((e) => { const d = dayLabel(e.date); return `<div class="event"><div class="d">${d.d}<small>${MONTHS[d.m - 1]}</small></div><div><h4>${esc(e.title)}</h4><p>${esc(d.long)}${e.from ? ` · ${esc(e.from)}${e.to ? ` a ${esc(e.to)}` : ''} h` : ''}${e.price ? ` · ${fmt(e.price)}` : ''}</p>${e.description ? `<p>${esc(e.description)}</p>` : ''}<p><a href="${wa(S.whatsapp, `Hola! Quiero reservar un lugar para "${e.title}" (${d.long}).`)}" target="_blank" rel="noopener">Reservar mi lugar por WhatsApp →</a></p></div></div>`; }).join('');
  $('#eventsWa').href = wa(S.whatsapp, 'Hola! Quiero consultar por un evento en Casa Samadhi.');
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
    <button data-book>Reservar turno</button><button data-account>Mi cuenta</button><a href="#rituales">Head spa &amp; masajes</a><a href="#manicuria">Manicuría &amp; pedicuría</a><a href="#cafe">Cafetería &amp; eventos</a><a href="#alquiler">Alquiler de la terraza</a><button data-gift>Gift cards</button><a href="#espacio">La casa</a><a href="#visita">Cómo llegar</a>
    <hr><a class="sm" href="${esc(S.storeUrl)}" target="_blank" rel="noopener">Tienda Samadhi Style ↗</a><a class="sm" href="${wa(S.whatsapp)}" target="_blank" rel="noopener">WhatsApp</a><a class="sm" href="https://instagram.com/${esc(S.instagram)}" target="_blank" rel="noopener">Instagram</a>`;
  if (!SITE.giftcards.enabled) { $('#giftcards').hidden = true; $$('[data-gift]').forEach((b) => (b.hidden = true)); }
  const g = SITE.services.find((s) => s.slug === 'ritual-esencial');
  if (g?.price) $('#gcardAmount').textContent = `${g.name} · ${fmt(g.price)}`;
}

// ── Íconos de línea para el turnero (estilo de las placas) ──
const IC = {
  hand: '<path d="M7 11V5.8a1.4 1.4 0 0 1 2.8 0V10M9.8 9.5V4.4a1.4 1.4 0 0 1 2.8 0v5.1M12.6 9.6V5.2a1.4 1.4 0 0 1 2.8 0v5.6M15.4 10.6a1.4 1.4 0 0 1 2.8 0v2.9c0 4-2.8 7-6.6 7-2.6 0-4.1-1.3-5.4-3.4l-2.4-4a1.4 1.4 0 0 1 2.4-1.5L8.6 14"/>',
  aroma: '<path d="M10 2.8h4v2.6h-4zM8.8 5.4h6.4l1 2.8v10.6a2 2 0 0 1-2 2H9.8a2 2 0 0 1-2-2V8.2zM8 12.5h8"/><path d="M17.5 16.5c2.2-.2 3.6-1.6 3.7-3.8-2.2.1-3.6 1.5-3.7 3.8zM17.5 16.5l2-2"/>',
  head: '<path d="M12 4.5a5 5 0 0 1 5 5v1.8a5 5 0 0 1-10 0V9.5a5 5 0 0 1 5-5zM7.5 21c.9-2.2 2.6-3.5 4.5-3.5s3.6 1.3 4.5 3.5M10 11.5h.01M14 11.5h.01M10.6 14.2c.8.6 2 .6 2.8 0"/><path d="M5 9c-1.2-1.3-1.2-2.7 0-4M19 9c1.2-1.3 1.2-2.7 0-4M3 11.5c-.8-.9-.8-1.9 0-2.8M21 11.5c.8-.9.8-1.9 0-2.8"/>',
  bowl: '<path d="M3.5 11.5h17a8.5 8.5 0 0 1-17 0zM9 20.5h6M13.5 11.5l5.5-7"/>',
  face: '<path d="M12 3.5c3.6 0 6 3 6 7.2 0 4.6-2.7 9.3-6 9.3s-6-4.7-6-9.3c0-4.2 2.4-7.2 6-7.2zM6.3 9c2.6.2 5-1 6.7-3.3 1 1.7 2.7 3 5 3.3"/><path d="M9.8 12.5h.01M14.2 12.5h.01M10.6 15.8c.8.5 2 .5 2.8 0M20.5 3.5v3M19 5h3M3.5 16v2.4M2.3 17.2h2.4"/>',
  dryer: '<path d="M3.5 8a4.5 4.5 0 0 1 4.5-4.5h6.5v9H8A4.5 4.5 0 0 1 3.5 8zM14.5 4.5l5-1.2v9.4l-5-1.2M8 8h.01M8.5 12.5l1 6h2.5l.8-6M10.8 18.5v2.5"/>',
  cup: '<path d="M4.5 10.5h12v3.5a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5zM16.5 11.5h1.7a2.2 2.2 0 0 1 0 4.4h-2.3M3.5 21h14M8.5 3c-1 1.4 1 2.3 0 4.3M12.5 3c-1 1.4 1 2.3 0 4.3"/>',
  pinda: '<path d="M8 10.5c-2.2 1.9-3.3 3.9-3.3 5.9a4 4 0 0 0 4 4h6.6a4 4 0 0 0 4-4c0-2-1.1-4-3.3-5.9zM8 10.5h8M10 10.5l-.8-2.6h5.6l-.8 2.6M12 2.8c-1 1 1 2 0 3.2M9 3.4c-.8.8.8 1.6 0 2.4M15 3.4c-.8.8.8 1.6 0 2.4"/>',
  leaf: '<path d="M12 21V9.5M12 13.5c-3.2 0-5.2-2-5.2-5.2 3.2 0 5.2 2 5.2 5.2zM12 11.5c3.2 0 5.2-2 5.2-5.2-3.2 0-5.2 2-5.2 5.2zM12 17.5c-2.6 0-4.2-1.6-4.2-4.2 2.6 0 4.2 1.6 4.2 4.2zM12 17.5c2.6 0 4.2-1.6 4.2-4.2-2.6 0-4.2 1.6-4.2 4.2z"/>',
  lotus: '<path d="M12 18.5c-1.8-1.8-2.6-3.8-2.6-6S10.2 8 12 6.2c1.8 1.8 2.6 4 2.6 6.3s-.8 4.2-2.6 6zM12 18.5c-2.6.2-5-.6-7-2.6 1.2-1.6 2.8-2.5 4.6-2.7M12 18.5c2.6.2 5-.6 7-2.6-1.2-1.6-2.8-2.5-4.6-2.7M4 20.5h16"/>',
  polish: '<path d="M10.2 2.8h3.6v5.4h-3.6zM8.6 8.2h6.8l1.3 3v8a2 2 0 0 1-2 2H9.3a2 2 0 0 1-2-2v-8zM9.5 14.5h5"/>',
  foot: '<path d="M10 9.2c-2.2.2-3.6 2.6-3.6 5.8 0 3.6 1.5 6 3.9 6s3.4-1.9 3-4.2c-.3-1.6-.9-2.4-.9-3.9 0-1.2.5-2-.1-2.9-.5-.7-1.3-.9-2.3-.8z"/><circle cx="9" cy="5.5" r="1.3"/><circle cx="12.2" cy="4.5" r="1.1"/><circle cx="14.8" cy="5.6" r="1"/><circle cx="16.5" cy="7.6" r=".9"/><circle cx="17.2" cy="10" r=".8"/>',
  spark: '<path d="M12 3l1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7zM18.5 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
};
const icon = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true">${IC[k] || IC.leaf}</svg>`;
/** Ícono para un paso de "Qué incluye", según de qué habla. */
function incIcon(t) {
  const x = t.toLowerCase();
  if (x.includes('ritual esencial')) return 'lotus';
  if (x.includes('capilar') || x.includes('cabez')) return 'head';
  if (x.includes('relaj') || x.includes('masaje')) return 'hand';
  if (x.includes('aroma') || x.includes('aceite')) return 'aroma';
  if (x.includes('lavado') || x.includes('cuenco')) return 'bowl';
  if (x.includes('facial') || x.includes('mascarilla')) return 'face';
  if (x.includes('secado')) return 'dryer';
  if (x.includes('infusi') || x.includes('café') || x.includes('cafe') || x.includes('merienda')) return 'cup';
  if (x.includes('pinda')) return 'pinda';
  if (x.includes('oráculo')) return 'spark';
  if (x.includes('mano')) return 'hand';
  return 'leaf';
}
/** Ícono del servicio en la lista del turnero. */
function svcIcon(s) {
  const n = s.name.toLowerCase();
  if (n.includes('manos y pies')) return 'hand';
  if (n.includes('pie') || n.includes('pedicur')) return 'foot';
  if (n.includes('retirado')) return 'spark';
  if (s.category === 'manicuria') return 'polish';
  if (n.includes('profundo') || n.includes('pinda')) return 'pinda';
  if (n.includes('masaje')) return 'hand';
  if (s.category === 'rituales') return 'head';
  if (s.category === 'terapias') return 'spark';
  return 'leaf';
}
/** "Título — explicación" (como en las placas); sin explicación, solo el título. */
const splitInc = (x) => { const m = String(x).split(/\s+[—–]\s+/); return [m[0], m.slice(1).join(' — ')]; };
const SPRIG = '<svg class="orn" viewBox="0 0 120 16" aria-hidden="true"><path d="M2 8h44M74 8h44"/><path d="M60 13c-3-2.5-4.4-5-4.4-8 2.6.6 4.4 2.4 4.4 5.2 0-2.8 1.8-4.6 4.4-5.2 0 3-1.4 5.5-4.4 8zM53.5 9.5c1.8 0 3.6.9 5.2 3M66.5 9.5c-1.8 0-3.6.9-5.2 3"/></svg>';
/** La "plaquita" del servicio: lo que incluye, el precio y la duración, como las piezas de Instagram. */
function plaque(s) {
  const c = cat(s.category), inc = (s.includes || []).filter(Boolean);
  const lead = s.short || (!inc.length ? c.intro : '');
  const price = s.price_transfer
    ? `<span class="pps"><span class="pp"><small>Efectivo</small>${fmt(s.price)}</span><span class="pp"><small>Transferencia</small>${fmt(s.price_transfer)}</span></span>`
    : `<span class="pp big">${s.price ? fmt(s.price) : 'Consultar'}</span>`;
  return `<article class="plaque">
    ${s.image ? `<div class="pl-ph"><img src="${MEDIA(s.image)}" alt="" loading="lazy"></div>` : ''}
    <div class="pl-in">
      <div class="pl-ic">${icon(svcIcon(s))}</div>
      <h4 class="pl-t">${esc(s.name)}</h4>
      ${s.tag ? `<div class="pl-tag"><span>${esc(s.tag)}</span></div>` : SPRIG}
      ${lead ? `<p class="pl-lead">${esc(lead)}</p>` : ''}
      ${inc.length ? `<div class="pl-inc-t">Incluye</div><ul class="pl-inc">${inc.map((x) => { const [t, d] = splitInc(x); return `<li><span class="ic">${icon(incIcon(t))}</span><span class="tx"><b>${esc(t)}</b>${d ? `<small>${esc(d)}</small>` : ''}</span></li>`; }).join('')}</ul>` : ''}
      <div class="pl-price${s.price_transfer ? ' two' : ''}">${price}<span class="sep" aria-hidden="true"></span><span class="pd">${icon('clock')}${durTxt(s.duration)}</span></div>
      ${worksStrip(s)}
    </div>
  </article>`;
}

// ── Trabajos: antes y después ────────────────────────────
// Cada servicio muestra sus trabajos en miniatura (hasta 8 en la web y 4 en el celular). Al tocar uno se abre
// la comparación: la foto de "antes" (la misma para todos, salvo que el trabajo tenga la suya) y la de "después".
const worksOf = (s) => (s?.works || []).filter((w) => w.after);
const beforeOf = (w) => w.before || SITE.site.worksBefore || '';
function worksStrip(s, { label = true } = {}) {
  const list = worksOf(s).slice(0, 8);
  if (!list.length) return '';
  return `<div class="works">${label ? `<span class="works-t">Antes &amp; después</span>` : ''}<div class="works-row">${list.map((w, i) => `<button type="button" class="work" data-work="${s.id}:${i}" aria-label="Ver antes y después de ${esc(s.name)} (${i + 1} de ${list.length})"><img src="${MEDIA(w.after)}" alt="" loading="lazy"></button>`).join('')}</div></div>`;
}
const wl = { s: null, i: 0 };
function openWork(serviceId, i) {
  const s = SITE.services.find((x) => x.id === Number(serviceId));
  if (!s || !worksOf(s).length) return;
  Object.assign(wl, { s, i });
  renderWork();
  $('#workBox').hidden = false; document.body.classList.add('lb-on');
  setTimeout(() => $('#workBox .wb-range')?.focus({ preventScroll: true }), 50);
}
function renderWork() {
  const list = worksOf(wl.s).slice(0, 8), w = list[wl.i], n = list.length;
  const before = beforeOf(w);
  $('#workBox').innerHTML = `<div class="wb" role="dialog" aria-modal="true" aria-label="Antes y después · ${esc(wl.s.name)}">
    <div class="wb-head"><div><div class="wb-k">Antes &amp; después</div><div class="wb-n">${esc(wl.s.name)}</div></div><button class="close" data-wclose aria-label="Cerrar">${ICON_X}</button></div>
    <div class="wb-cmp" style="--pos:50%">
      <img class="aft" src="${MEDIA(w.after)}" alt="Después: ${esc(wl.s.name)}" draggable="false">
      ${before ? `<img class="bef" src="${MEDIA(before)}" alt="Antes" draggable="false">` : ''}
      ${before ? '<span class="wb-l l">Antes</span><span class="wb-l r">Después</span><span class="wb-bar" aria-hidden="true"><i></i></span>' : '<span class="wb-l r">Después</span>'}
      ${before ? '<input class="wb-range" type="range" min="0" max="100" value="50" aria-label="Deslizá para comparar antes y después">' : ''}
      ${n > 1 ? `<button class="wb-nav p" data-wnav="-1" aria-label="Trabajo anterior">‹</button><button class="wb-nav n" data-wnav="1" aria-label="Trabajo siguiente">›</button>` : ''}
    </div>
    ${n > 1 ? `<div class="wb-dots">${list.map((x, j) => `<button data-wgo="${j}" aria-label="Trabajo ${j + 1}" aria-current="${j === wl.i}"><img src="${MEDIA(x.after)}" alt=""></button>`).join('')}</div>` : ''}
    ${wl.s.mode === 'online' ? `<button class="btn solid wide" data-wbook="${wl.s.id}">Reservar ${esc(wl.s.name)}</button>` : ''}
  </div>`;
}
function closeWork() { $('#workBox').hidden = true; $('#workBox').innerHTML = ''; document.body.classList.remove('lb-on'); }

// ── Panel lateral ────────────────────────────────────────
let lastFocus = null;
function openDrawer(html, { doc = false, label = 'Reservar' } = {}) {
  const d = $('#drawer');
  if (!d.classList.contains('on')) lastFocus = document.activeElement;
  d.classList.toggle('doc', doc);
  d.setAttribute('aria-label', label);
  d.innerHTML = html;
  d.classList.add('on'); $('#scrim').classList.add('on'); $('#mnav').classList.remove('on');
  if (!SOLO) document.body.style.overflow = 'hidden';
  setTimeout(() => (d.querySelector('[autofocus]') || d.querySelector('h3'))?.focus?.({ preventScroll: true }), 60);
}
function closeAll() {
  // En el turnero solo no hay web detrás: cerrar vuelve a la reserva (sin perder lo elegido).
  if (SOLO) { $('#mnav').classList.remove('on'); $('#scrim').classList.remove('on'); if (/^#(turno|pago)/.test(location.hash)) setHash(''); return renderBooking(true); }
  $('#drawer').classList.remove('on'); $('#mnav').classList.remove('on'); $('#scrim').classList.remove('on');
  document.body.style.overflow = '';
  if (/^#(turno|gift|pago|reservar|regalar|terminos|arrepentimiento|cuenta|clave|olvide)/.test(location.hash)) setHash('');
  lastFocus?.focus?.({ preventScroll: true });
}
function setHash(h) { try { history.replaceState(null, '', h || location.pathname + location.search); } catch {} }
const head = (title, back) => `<div class="dhead">${back ? `<button class="back" data-back="${back}">← Volver</button>` : ''}<h3 tabindex="-1">${esc(title)}</h3><button class="close" data-close aria-label="${SOLO ? 'Volver a la reserva' : 'Cerrar'}">${ICON_X}</button></div>`;

// ── Reserva ──────────────────────────────────────────────
// Se puede reservar más de un servicio: `bk.items` son los ya elegidos y bk.service/date/time/pro el que se está eligiendo.
const bk = { step: 1, info: null, items: [], service: null, pro: null, days: [], date: '', time: '', loading: false, form: {}, errors: {}, gift: null, giftErr: '', sending: false, error: '', payMethod: 'mp' };
const MAX_ITEMS = 4;
const svcName = (s) => `${s.name}${s.tag && s.category === 'manicuria' ? ` · ${s.tag}` : ''}`;
const toMinC = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const lockDate = () => bk.items[0]?.date || '';
/** Dirección propia del turnero: /turnos (o el mismo archivo con ?turnos en la vista previa). */
function turneroUrl(q = {}) {
  const p = new URLSearchParams(Object.entries(q).filter(([, v]) => v));
  const qs = p.toString();
  if (location.protocol === 'file:' || /\.html?$/.test(location.pathname)) return `${location.pathname}?turnos${qs ? '&' + qs : ''}`;
  return '/turnos' + (qs ? '?' + qs : '');
}
const homeUrl = () => (location.protocol === 'file:' || /\.html?$/.test(location.pathname) ? location.pathname : '/');
/** Desde la web, reservar abre el turnero en su página; en el turnero, se reserva ahí mismo. */
function openBooking(opts = {}) {
  if (SOLO) return openBookingHere(opts);
  const s = opts.serviceId ? SITE.services.find((x) => x.id === Number(opts.serviceId)) : null;
  location.href = turneroUrl({ servicio: s?.slug, seccion: opts.category, regalo: opts.gift });
}
function openBookingHere({ serviceId = null, category = null } = {}) {
  if (ACC && !bk.form.email) bk.form = { ...bk.form, name: ACC.customer.name, email: ACC.customer.email, phone: ACC.customer.phone, notes: bk.form.notes || ACC.stats?.lastNotes || '' };
  Object.assign(bk, { step: serviceId ? 2 : 1, info: null, items: [], service: serviceId ? SITE.services.find((s) => s.id === Number(serviceId)) : null, pro: null, days: [], date: '', time: '', errors: {}, error: '', sending: false, filter: category });
  if (!SOLO) setHash('#reservar');
  renderBooking(true);
  if (bk.service) loadDays();
}
/** Horarios que no chocan con los servicios ya elegidos (la clienta no puede estar en dos a la vez). */
function freeSlots(d) {
  if (!d || !bk.service) return [];
  const dur = bk.service.duration;
  return d.slots.filter((t) => !bk.items.some((it) => it.date === d.date && toMinC(t) < toMinC(it.time) + it.service.duration && toMinC(it.time) < toMinC(t) + dur));
}
async function loadDays(more = false) {
  bk.loading = true; renderBooking();
  try {
    const lock = lockDate();
    const from = lock || (more && bk.days.length ? addDay(bk.days.at(-1).date, 1) : '');
    const r = await api(`/api/availability?service=${bk.service.id}&days=${lock ? 1 : 21}${from ? `&from=${from}` : ''}${bk.pro ? `&pro=${bk.pro}` : ''}`);
    bk.days = more && !lock ? [...bk.days, ...r.days] : r.days;
    bk.maxDate = lock || r.maxDate;
    if (!bk.date || !bk.days.some((d) => d.date === bk.date)) bk.date = (bk.days.find((d) => freeSlots(d).length) || bk.days[0] || {}).date || '';
    if (bk.time && !freeSlots(bk.days.find((d) => d.date === bk.date)).includes(bk.time)) bk.time = '';
  } catch (e) { bk.error = e.message; }
  bk.loading = false; renderBooking();
}
const addDay = (k, n) => new Date(Date.parse(k + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
/** Totales como los calcula el servidor: seña por servicio, menos la gift card servicio por servicio. */
function totals() {
  let left = bk.gift ? bk.gift.balance : 0, due = 0, giftAmt = 0, price = 0, dep = 0;
  for (const it of bk.items) {
    const p = it.service.price, d = deposit(p), g = Math.min(left, p);
    left -= g; giftAmt += g; price += p; dep += d; due += Math.max(0, d - g);
  }
  return { price, dep, giftAmt, due, rest: Math.max(0, price - giftAmt - due) };
}
const payOpts = () => SITE.booking.pay || { mp: true, transfer: false };
function renderBooking(open = false) {
  const steps = `<div class="steps" aria-hidden="true">${[1, 2, 3].map((n) => `<span class="${bk.step >= n ? 'on' : ''}"></span>`).join('')}</div>`;
  const adding = bk.items.length > 0;
  let body = '', foot = '', back = bk.step > 1 ? String(bk.step - 1) : '';
  if (bk.step === 1) {
    const groups = SITE.categories.map((c) => ({ c, list: SITE.services.filter((s) => s.category === c.key && s.mode === 'online') })).filter((g) => g.list.length && (!bk.filter || g.c.key === bk.filter));
    const waOnly = SITE.services.filter((s) => s.mode === 'whatsapp' && (!bk.filter || s.category === bk.filter));
    const lv = ACC?.stats?.lastVisit;
    const again = !adding && lv && SITE.services.find((x) => lv.service_name.startsWith(x.name) && x.mode === 'online');
    if (adding) back = 'sum';
    if (bk.info) {
      // La plaquita del servicio tocado: lo que incluye antes de elegir el día.
      back = 'info';
      body = plaque(bk.info);
      foot = `<button class="btn solid wide" data-choose="${bk.info.id}">Elegir día y horario</button>`;
    } else body = (adding ? `<div class="sel-sum"><span class="n">Sumá otro servicio</span><span class="w">Para el ${esc(dayLabel(lockDate()).long)}, antes o después de ${bk.items.map((it) => esc(it.service.name)).join(' y ')}. Pagás una sola seña por todo.</span></div>`
      : ACC ? `<div class="sel-sum welcome"><span class="n">Hola de nuevo, ${esc(ACC.customer.name.split(' ')[0])}</span>${lv ? `<span class="w">Tu última visita fue ${esc(lv.when)}: ${esc(lv.service_name)}.</span>` : '<span class="w">Tus datos ya están cargados para reservar.</span>'}${again && !bk.filter ? `<button class="btn sm" data-pick="${again.id}" style="justify-self:start;margin-top:6px">Repetir ${esc(again.name)}</button>` : ''}</div>` : '')
      + groups.map((g) => `<div class="svc-group"><div class="step-t grp">${esc(g.c.title || g.c.name)}</div>${g.list.map((s) => `<button class="svc" data-pick="${s.id}" aria-pressed="${bk.service?.id === s.id}"><span class="ic">${icon(svcIcon(s))}</span><span class="n">${esc(svcName(s))}</span><span class="p">${fmt(s.price)}${s.price_transfer ? `<small>Transf. ${fmt(s.price_transfer)}</small>` : ''}</span><span class="m">${durTxt(s.duration)} · Ver qué incluye</span></button>`).join('')}</div>`).join('')
      + (bk.filter ? `<p class="note" style="margin-top:16px"><button class="link-btn" data-allsvc>Ver todos los servicios</button></p>` : '')
      + (waOnly.length && !adding ? `<div class="step-t">Se coordinan por WhatsApp</div><p class="note">${waOnly.map((s) => esc(s.name)).join(' · ')}. <a href="${wa(SITE.site.whatsapp, 'Hola! Quiero hacer una consulta.')}" target="_blank" rel="noopener">Escribinos</a>.</p>` : '');
  } else if (bk.step === 2) {
    const s = bk.service;
    const day = bk.days.find((d) => d.date === bk.date);
    const slots = freeSlots(day);
    const pros = s.pros || [];
    body = `<div class="sel-sum"><span class="n">${esc(svcName(s))}</span><span class="w">${durTxt(s.duration)} · ${fmt(s.price)}</span><button class="link-btn" data-step="1" style="justify-self:start;margin-top:4px">Cambiar servicio</button></div>
      ${pros.length > 1 ? `<div class="step-t">¿Con quién?</div><div class="times pros">${[{ id: 0, name: 'Cualquiera' }, ...pros].map((p) => `<button class="time" data-pro="${p.id}" aria-pressed="${(bk.pro || 0) === p.id}">${esc(p.name)}</button>`).join('')}</div>` : pros.length === 1 ? `<p class="note" style="margin-top:12px">Te atiende ${esc(pros[0].name)}.</p>` : ''}
      ${adding ? `<div class="step-t">Día</div><p class="note">${esc(cap(dayLabel(lockDate()).long))}: los servicios de una misma reserva son el mismo día.</p>`
      : `<div class="step-t">Elegí el día</div>
      ${bk.loading && !bk.days.length ? '<div class="spinner"></div>' : `<div class="daystrip" id="dayStrip">${bk.days.map((d) => { const l = dayLabel(d.date); const n = freeSlots(d).length; return `<button class="day" data-day="${d.date}" ${n ? '' : 'disabled'} aria-pressed="${d.date === bk.date}" aria-label="${esc(l.long)}${n ? '' : ', sin turnos'}"><span class="w">${l.w}</span><span class="d">${l.d}</span><span class="mo">${MONTHS[l.m - 1]}</span></button>`; }).join('')}${bk.days.length && bk.days.at(-1).date < bk.maxDate ? `<button class="day" data-more><span class="w">más</span><span class="d">+</span><span class="mo">días</span></button>` : ''}</div>`}`}
      ${bk.error ? `<p class="form-err">${esc(bk.error)}</p>` : ''}
      ${bk.loading && adding ? '<div class="spinner"></div>' : bk.date ? `<div class="step-t">Horarios del ${esc(dayLabel(bk.date).long)}</div>${slots.length ? `<div class="times">${slots.map((t) => `<button class="time" data-time="${t}" aria-pressed="${t === bk.time}">${t}</button>`).join('')}</div>` : `<p class="empty-slots">${adding ? 'No quedan horarios para este servicio ese día. Probá con otro servicio.' : 'No quedan horarios este día.'}</p>`}` : (bk.days.length ? '<p class="empty-slots">No hay turnos libres en estos días. Probá con más días o escribinos.</p>' : '')}`;
    foot = `<button class="btn solid wide" data-take ${bk.time ? '' : 'disabled'}>${adding ? 'Sumar a la reserva' : 'Continuar'}</button>`;
  } else if (bk.step === 3) {
    const f = bk.form, e = bk.errors, t = totals(), P = payOpts();
    back = '';
    const both = P.mp && P.transfer;
    if (!both) bk.payMethod = P.transfer && !P.mp ? 'transfer' : 'mp';
    const field = (k, label, type = 'text', extra = '') => `<div class="fl"><label for="b_${k}">${label}</label><input id="b_${k}" name="${k}" type="${type}" value="${esc(f[k] || '')}" ${e[k] ? 'aria-invalid="true"' : ''} ${extra}>${e[k] ? `<span class="err">${esc(e[k])}</span>` : ''}</div>`;
    const sorted = bk.items.map((it, i) => ({ it, i })).sort((a, b) => a.it.time.localeCompare(b.it.time));
    body = `<div class="step-t">Tu reserva · ${esc(dayLabel(lockDate()).long)}</div>
      <div class="items">${sorted.map(({ it, i }) => `<div class="sel-sum item"><span class="n">${esc(svcName(it.service))}</span><span class="w">${it.time} h · ${durTxt(it.service.duration)} · ${fmt(it.service.price)}${it.proName ? ` · con ${esc(it.proName)}` : ''}</span>
        <span class="acts"><button class="link-btn" data-edit-item="${i}">Cambiar</button>${bk.items.length > 1 ? `<button class="link-btn" data-rm-item="${i}">Quitar</button>` : ''}</span></div>`).join('')}</div>
      ${bk.items.length < MAX_ITEMS ? `<button class="btn sm add-item" data-add-item>+ Agregar otro servicio</button>` : ''}
      <form class="bk" id="bkForm" novalidate>
        <div class="step-t" style="margin-bottom:0">Tus datos</div>
        ${field('name', 'Nombre y apellido', 'text', 'autocomplete="name"')}
        <div class="row2">${field('email', 'Email', 'email', 'autocomplete="email" inputmode="email"')}${field('phone', 'Celular (WhatsApp)', 'tel', 'autocomplete="tel" inputmode="tel"')}</div>
        <div class="fl"><label for="b_notes">¿Algo que debamos saber? (opcional)</label><textarea id="b_notes" name="notes" rows="2" placeholder="Alergias, embarazo, preferencias…">${esc(f.notes || '')}</textarea>${ACC && f.email === ACC.customer.email ? '<span class="note">Recordamos tus datos y lo que nos contaste la última vez. Cambialo si hace falta.</span>' : ''}</div>
        <div class="gift-apply"><div class="fl"><label for="b_gift">¿Tenés una gift card?</label><input id="b_gift" name="gift_code" value="${esc(f.gift_code || bk.gift?.code || '')}" placeholder="CS-XXXX-XXXX" autocomplete="off" style="text-transform:uppercase" ${bk.giftErr ? 'aria-invalid="true"' : ''}>${bk.giftErr ? `<span class="err">${esc(bk.giftErr)}</span>` : ''}</div><button class="btn sm" type="button" data-gift-check>${bk.gift ? 'Quitar' : 'Aplicar'}</button></div>
        ${bk.gift ? `<p class="gift-ok">Gift card aplicada: se descuentan ${fmt(t.giftAmt)} (saldo ${fmt(bk.gift.balance)}).</p>` : ''}
        ${t.due && both ? `<fieldset class="paym"><legend class="step-t">¿Cómo pagás la seña?</legend>
          <label class="opt"><input type="radio" name="pay_method" value="mp" ${bk.payMethod === 'mp' ? 'checked' : ''}><span><b>Mercado Pago</b><small>Tarjeta, débito o dinero en cuenta. El turno se confirma al instante.</small></span></label>
          <label class="opt"><input type="radio" name="pay_method" value="transfer" ${bk.payMethod === 'transfer' ? 'checked' : ''}><span><b>Transferencia</b><small>Te mostramos el alias y te guardamos el turno ${P.transferHoldHours || 12} h. Lo confirmamos cuando llega.</small></span></label>
        </fieldset>` : ''}
        <label class="check"><input type="checkbox" name="accept" ${f.accept ? 'checked' : ''}><span>Acepto los <button type="button" class="link-btn" data-legal style="font-size:inherit;letter-spacing:0;text-transform:none">términos y la política de cancelación</button>: puedo cancelar o reprogramar hasta ${SITE.booking.cancelHours} horas antes.</span></label>
        ${e.accept ? `<span class="form-err">${esc(e.accept)}</span>` : ''}
        ${bk.error ? `<p class="form-err" role="alert">${esc(bk.error)}</p>` : ''}
      </form>`;
    const tr = bk.payMethod === 'transfer';
    foot = `<div class="sum"><span>${bk.items.length > 1 ? `${bk.items.length} servicios` : 'Precio del servicio'}</span><span class="money">${fmt(t.price)}</span></div>
      ${t.giftAmt ? `<div class="sum"><span>Gift card</span><span class="money">− ${fmt(t.giftAmt)}</span></div>` : ''}
      <div class="sum"><span>${t.due ? `Seña a pagar ahora (${SITE.booking.depositPercent}%)` : 'A pagar ahora'}</span><b class="money">${fmt(t.due)}</b></div>
      <p class="note">${t.due ? `El resto (${fmt(t.rest)}) lo pagás en la casa. ${tr ? `Te guardamos el turno ${P.transferHoldHours || 12} horas mientras llega la transferencia.` : `Guardamos el horario ${SITE.booking.holdMinutes} minutos mientras pagás.`}` : t.giftAmt >= t.price ? 'Tu gift card cubre todo.' : `El resto (${fmt(t.price - t.giftAmt)}) lo pagás en la casa.`}</p>
      <button class="btn solid wide" form="bkForm" type="submit" ${bk.sending ? 'disabled' : ''}>${bk.sending ? 'Un momento…' : !t.due ? 'Confirmar turno' : tr ? 'Reservar y ver datos para transferir' : 'Pagar seña con Mercado Pago'}</button>`;
  }
  const title = bk.step === 1 ? (bk.info ? 'Conocé el servicio' : adding ? 'Agregar servicio' : 'Reservá tu turno') : bk.step === 2 ? 'Día y horario' : 'Confirmá tu reserva';
  const html = `${head(title, back)}${steps}<div class="dbody">${body}</div>${foot ? `<div class="dfoot">${foot}</div>` : ''}`;
  if (open || !$('#drawer').classList.contains('on')) openDrawer(html, { label: 'Reservar turno' });
  else { const sc = $('#drawer .dbody')?.scrollTop || 0, ds = $('#dayStrip')?.scrollLeft || 0; $('#drawer').innerHTML = html; if ($('#drawer .dbody')) $('#drawer .dbody').scrollTop = sc; if ($('#dayStrip')) $('#dayStrip').scrollLeft = ds; }
}
/** Pasa el servicio que se está eligiendo a la lista de la reserva. */
function takeItem() {
  if (!bk.service || !bk.time) return;
  const pros = bk.service.pros || [];
  const proName = bk.pro ? pros.find((p) => p.id === bk.pro)?.name || '' : pros.length === 1 ? pros[0].name : '';
  bk.items.push({ service: bk.service, date: bk.date, time: bk.time, pro: bk.pro || null, proName });
  Object.assign(bk, { service: null, pro: null, time: '', days: [], step: 3, error: '' });
  renderBooking();
}
/** Vuelve a elegir un servicio que ya estaba en la reserva. */
function editItem(i) {
  const [it] = bk.items.splice(i, 1);
  Object.assign(bk, { service: it.service, pro: it.pro, date: it.date, time: it.time, days: [], step: 2, error: '' });
  renderBooking(); loadDays();
}
function readBkForm() { const f = $('#bkForm'); if (!f) return; const d = new FormData(f); bk.form = { name: d.get('name') || '', email: d.get('email') || '', phone: d.get('phone') || '', notes: d.get('notes') || '', gift_code: d.get('gift_code') || '', accept: !!d.get('accept') }; if (d.get('pay_method')) bk.payMethod = d.get('pay_method'); }
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
    const items = bk.items.map((it) => ({ service_id: it.service.id, date: it.date, time: it.time, pro_id: it.pro || null }));
    const r = await api('/api/bookings', { items, ...f, gift_code: bk.gift?.code || '', pay_method: bk.payMethod, origen: origen() });
    px('InitiateCheckout', { content_name: bk.items.map((it) => it.service.name).join(' + '), num_items: bk.items.length, value: bk.items.reduce((a, it) => a + (it.service.price || 0), 0), currency: 'ARS' });
    bk.items = [];
    if (r.pay_url) { bk.sending = false; goPay(r.pay_url); return; }
    goThanks('turno', r.booking.token);
  } catch (e) {
    bk.sending = false;
    if (e.data?.taken && bk.items.length === 1) { editItem(0); bk.error = e.message; return; }
    bk.errors = e.data?.errors || {};
    bk.error = Object.keys(bk.errors).every((k) => ['name', 'email', 'phone', 'accept'].includes(k)) && Object.keys(bk.errors).length ? '' : e.message;
    if (bk.errors.gift_code) bk.giftErr = bk.errors.gift_code;
    renderBooking();
  }
}
function goPay(url) { if (url.startsWith('#')) { location.hash = url; route(); } else location.href = url; }

// ── Estado del turno (link del email) ────────────────────
function transferBlock(b) {
  const T = b.transfer;
  const row = (k, v, copy) => (v ? `<div><dt>${k}</dt><dd><b>${esc(v)}</b>${copy ? ` <button class="link-btn" data-copy="${esc(v)}">Copiar</button>` : ''}</dd></div>` : '');
  const msg = `Hola! Te mando el comprobante de la seña del turno ${b.code} (${b.service_name}, ${b.when}).`;
  return `<div class="transfer"><div class="step-t" style="margin-top:0">Datos para transferir</div>
    <dl class="kv">${row('Monto', fmt(T.amount), false)}${row('Alias', T.alias, true)}${row('CBU / CVU', T.cbu, true)}${row('Titular', T.holder)}${row('Banco', T.bank)}${row('CUIT', T.cuit)}${row('Referencia', b.code)}</dl>
    <p class="note">Guardamos tu turno hasta el ${esc(new Date(b.hold_until).toLocaleString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Argentina/Buenos_Aires' }).replace(',', ''))}. Cuando veamos la transferencia te llega la confirmación por email.</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">
      ${T.notified && T.has_proof ? '<span class="pill ok">Recibimos tu comprobante: lo estamos verificando</span>' : `<label class="btn solid proof-btn"><input type="file" accept="image/*,application/pdf" data-tproof="${esc(b.token)}" hidden>${T.notified ? 'Subir el comprobante' : 'Ya transferí: subir comprobante'}</label>`}
      ${T.notified ? '' : `<button class="btn" data-tsent="${esc(b.token)}">Ya transferí (sin comprobante)</button>`}
      <a class="btn" href="${wa(b.whatsapp || SITE.site.whatsapp, msg)}" target="_blank" rel="noopener">Mandar por WhatsApp</a>
      ${T.can_mp ? `<button class="btn" data-paymp="${esc(b.token)}">Prefiero pagar con Mercado Pago</button>` : ''}
    </div></div>`;
}
async function showBooking(token, pre) {
  setHash('#turno/' + token);
  openDrawer(`${head('Tu turno')}<div class="dbody"><div class="spinner" style="margin-top:20px"></div></div>`, { label: 'Tu turno' });
  try {
    const b = pre || (await api('/api/bookings/' + encodeURIComponent(token))).booking;
    const okS = ['confirmed', 'completed'].includes(b.status), badS = ['cancelled', 'expired', 'no_show'].includes(b.status);
    const rest = Math.max(0, b.price - b.deposit_paid - b.gift_applied);
    const many = b.items?.length > 1;
    $('#drawer').innerHTML = `${head(many ? 'Tu reserva' : 'Tu turno')}<div class="dbody"><div class="status">
      <span class="pill ${okS ? 'ok' : badS ? 'bad' : ''}">${esc(b.status_label)}</span>
      <div class="big">${b.status === 'confirmed' ? '¡Te esperamos!' : b.status === 'pending_payment' ? 'Falta la seña' : b.status === 'pending_transfer' ? 'Falta la transferencia' : esc(b.service_name)}</div>
      ${b.status === 'pending_payment' ? `<p>Guardamos tu horario hasta las ${new Date(b.hold_until).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}. Si el pago no se acredita, se libera.</p>` : ''}
      ${b.transfer ? transferBlock(b) : ''}
      <dl class="kv">${many ? b.items.map((it) => `<div><dt>${it.start.slice(11)} h</dt><dd>${esc(it.service_name)}${it.pro_name ? ` · con ${esc(it.pro_name)}` : ''}${it.status !== b.status ? ` · ${esc(it.status_label)}` : ''}</dd></div>`).join('') : `<div><dt>Servicio</dt><dd>${esc(b.service_name)}</dd></div>`}
        <div><dt>Día y hora</dt><dd>${esc(cap(b.when))}</dd></div>${!many && b.pro_name ? `<div><dt>Te atiende</dt><dd>${esc(b.pro_name)}</dd></div>` : ''}<div><dt>Duración</dt><dd>${durTxt(b.duration)}${many ? ' en total' : ''}</dd></div>
        ${b.price ? `<div><dt>Precio</dt><dd>${fmt(b.price)}</dd></div>` : ''}${b.gift_applied ? `<div><dt>Gift card</dt><dd>− ${fmt(b.gift_applied)}</dd></div>` : ''}${b.deposit_paid ? `<div><dt>Seña pagada</dt><dd>${fmt(b.deposit_paid)}${b.pay_method_label ? ` · ${esc(b.pay_method_label)}` : ''}</dd></div>` : ''}
        ${b.status === 'confirmed' && b.price ? `<div><dt>Resta en la casa</dt><dd><b>${fmt(rest)}</b></dd></div>` : ''}<div><dt>Código</dt><dd>${esc(b.code)}</dd></div></dl>
      ${b.status === 'confirmed' ? `<p class="note">Te mandamos la confirmación a ${esc(b.email)}. Llegá 10 minutos antes: ${esc(SITE.site.address)}.</p>` : ''}
      ${b.calendar ? `<div class="cal-add"><span class="step-t" style="margin:0">Agregalo a tu calendario</span><div class="cal-btns"><a class="btn sm" href="${esc(b.calendar.google)}" target="_blank" rel="noopener">Google Calendar</a><button class="btn sm" data-ics="${esc(b.token)}">Apple / Outlook</button></div></div>` : ''}
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${b.pay_url ? `<button class="btn solid" data-pay="${esc(b.pay_url)}">Pagar la seña</button>` : ''}
        ${b.can_reschedule ? `<button class="btn solid" data-resched="${esc(b.token)}">Cambiar día u horario</button>` : ''}
        ${b.can_cancel ? `<button class="btn" data-cancel="${esc(b.token)}">Cancelar ${many ? 'la reserva' : 'turno'}</button>` : ''}
        ${b.transfer ? '' : `<a class="btn" href="${wa(b.whatsapp || SITE.site.whatsapp, `Hola! Tengo el turno ${b.code} (${b.service_name}, ${b.when}).`)}" target="_blank" rel="noopener">WhatsApp</a>`}
        ${['cancelled', 'expired'].includes(b.status) ? '<button class="btn solid" data-book>Reservar otro turno</button>' : ''}
      </div></div></div>`;
  } catch (e) { $('#drawer .dbody').innerHTML = `<p class="form-err" style="margin-top:20px">${esc(e.message)}</p>`; }
}

// ── La clienta cambia su turno ───────────────────────────
// Mismo servicio y misma asesora; ve los horarios libres sin contar su propio turno.
const rs = { b: null, days: [], date: '', time: '', loading: false, error: '', sending: false };
async function openReschedule(token) {
  Object.assign(rs, { b: null, days: [], date: '', time: '', error: '', sending: false, loading: true });
  renderReschedule();
  try {
    rs.b = (await api('/api/bookings/' + encodeURIComponent(token))).booking;
    const r = await api(`/api/availability?service=${rs.b.service_id}&days=21&ignore=${encodeURIComponent(token)}`);
    rs.days = r.days.filter((d) => d.slots.length);
    rs.date = (rs.days.find((d) => d.date === rs.b.start.slice(0, 10)) || rs.days[0] || {}).date || '';
  } catch (e) { rs.error = e.message; }
  rs.loading = false; renderReschedule();
}
function renderReschedule() {
  const day = rs.days.find((d) => d.date === rs.date);
  const cur = rs.b?.start || '';
  const body = rs.loading ? '<div class="spinner" style="margin-top:20px"></div>' : !rs.b ? `<p class="form-err">${esc(rs.error)}</p>` : `
    <div class="sel-sum"><span class="n">${esc(rs.b.service_name)}</span><span class="w">Ahora: ${esc(cap(rs.b.when))}${rs.b.pro_name ? ` · con ${esc(rs.b.pro_name)}` : ''}</span></div>
    <div class="step-t">Elegí el nuevo día</div>
    ${rs.days.length ? `<div class="daystrip">${rs.days.map((d) => { const l = dayLabel(d.date); return `<button class="day" data-rsday="${d.date}" aria-pressed="${d.date === rs.date}"><span class="w">${l.w}</span><span class="d">${l.d}</span><span class="mo">${MONTHS[l.m - 1]}</span></button>`; }).join('')}</div>` : '<p class="empty-slots">No hay otros horarios libres en las próximas semanas. Escribinos por WhatsApp.</p>'}
    ${day ? `<div class="step-t">Horarios del ${esc(dayLabel(day.date).long)}</div><div class="times">${day.slots.map((t) => `<button class="time" data-rstime="${t}" aria-pressed="${t === rs.time}" ${`${day.date} ${t}` === cur ? 'disabled title="Es tu horario actual"' : ''}>${t}</button>`).join('')}</div>` : ''}
    ${rs.error ? `<p class="form-err" role="alert">${esc(rs.error)}</p>` : ''}`;
  const foot = rs.b ? `<button class="btn solid wide" data-rsgo ${rs.time && !rs.sending ? '' : 'disabled'}>${rs.sending ? 'Un momento…' : rs.time ? `Pasar al ${esc(dayLabel(rs.date).long)} a las ${rs.time}` : 'Elegí un horario'}</button>` : '';
  const html = `${head('Cambiar tu turno', 'turno')}<div class="dbody">${body}</div>${foot ? `<div class="dfoot">${foot}</div>` : ''}`;
  if (!$('#drawer').classList.contains('on')) openDrawer(html, { label: 'Cambiar tu turno' }); else $('#drawer').innerHTML = html;
}
async function sendReschedule() {
  rs.sending = true; rs.error = ''; renderReschedule();
  try {
    const r = await api(`/api/bookings/${encodeURIComponent(rs.b.token)}/reschedule`, { date: rs.date, time: rs.time });
    toast('Listo, cambiamos tu turno'); showBooking(r.booking.token, r.booking);
  } catch (e) {
    rs.sending = false; rs.error = e.message;
    if (e.data?.taken) { rs.time = ''; try { const r = await api(`/api/availability?service=${rs.b.service_id}&days=21&ignore=${encodeURIComponent(rs.b.token)}`); rs.days = r.days.filter((d) => d.slots.length); } catch {} }
    renderReschedule();
  }
}
/** El turno como archivo .ics para Apple Calendar, Outlook y otros (se arma en el navegador). */
async function downloadIcs(token) {
  const b = (await api('/api/bookings/' + encodeURIComponent(token))).booking;
  const ms = Date.parse(b.start.replace(' ', 'T') + ':00Z') + 3 * 3600e3; // hora argentina → UTC
  const st = (x) => new Date(x).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const t = (s) => String(s || '').replace(/[\\;,]/g, (c) => '\\' + c);
  const link = location.origin + (SOLO ? location.pathname : '/turnos') + '#turno/' + b.token;
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Casa Samadhi//Turnos//ES', 'BEGIN:VEVENT', `UID:${b.code}@casasamadhi`, `DTSTAMP:${st(Date.now())}`,
    `DTSTART:${st(ms)}`, `DTEND:${st(ms + (b.duration || 60) * 60e3)}`, `SUMMARY:${t(b.service_name + ' · Casa Samadhi')}`,
    `LOCATION:${t(`Casa Samadhi, ${SITE.site.address}, ${SITE.site.city}`)}`, `DESCRIPTION:${t(`Código ${b.code}${b.pro_name ? ` · Te atiende ${b.pro_name}` : ''}. Ver, cambiar o cancelar: ${link}`)}`,
    'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', 'DESCRIPTION:Turno en Casa Samadhi', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })); a.download = `turno-${b.code}.ics`;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// ── Páginas de gracias ───────────────────────────────────
// Dirección propia (para medir conversiones en Meta). El código del turno NO va en la dirección (el pixel la manda a Meta): queda en el navegador.
const thanksUrl = (kind) => (location.protocol === 'file:' || /\.html?$/.test(location.pathname) && !/gracias-/.test(location.pathname) ? `${location.pathname.replace(/gracias-(turno|comprobante)\.html$/, 'index.html')}?turnos&gracias=${kind}` : `/gracias-${kind}`);
// Pausa breve antes de cambiar de página, para que el pixel termine de mandar el evento anterior (InitiateCheckout).
function goThanks(kind, token) { try { sessionStorage.setItem('cs-gracias', token); } catch {} setTimeout(() => { location.href = thanksUrl(kind); }, 300); }
async function showThanks(kind) {
  let token = ''; try { token = sessionStorage.getItem('cs-gracias') || ''; } catch {}
  const title = kind === 'comprobante' ? '¡Gracias!' : '¡Gracias por reservar!';
  document.title = `${title} · Casa Samadhi`;
  openDrawer(`${head(title)}<div class="dbody"><div class="spinner" style="margin-top:20px"></div></div>`, { label: title });
  let b = null; if (token) try { b = (await api('/api/bookings/' + encodeURIComponent(token))).booking; } catch {}
  const many = b?.items?.length > 1;
  const sum = b ? `<dl class="kv">${many ? b.items.map((it) => `<div><dt>${it.start.slice(11)} h</dt><dd>${esc(it.service_name)}${it.pro_name ? ` · con ${esc(it.pro_name)}` : ''}</dd></div>`).join('') : `<div><dt>Servicio</dt><dd>${esc(b.service_name)}</dd></div>`}
    <div><dt>Día y hora</dt><dd>${esc(cap(b.when))}</dd></div>${!many && b.pro_name ? `<div><dt>Te atiende</dt><dd>${esc(b.pro_name)}</dd></div>` : ''}<div><dt>Código</dt><dd>${esc(b.code)}</dd></div></dl>` : '';
  let lead, big;
  if (kind === 'comprobante') { big = 'Recibimos tu comprobante'; lead = 'Lo verificamos y te confirmamos el turno por correo. Si necesitás algo, escribinos por WhatsApp.'; }
  else if (b?.status === 'pending_transfer') { big = 'Te guardamos el turno'; lead = 'Para confirmarlo, transferí la seña y subí el comprobante acá abajo.'; }
  else if (b?.status === 'pending_payment') { big = 'Falta la seña'; lead = 'Tu horario está guardado mientras se acredita el pago.'; }
  else { big = '¡Te esperamos!'; lead = b ? `Te mandamos la confirmación a ${esc(b.email)}. Llegá 10 minutos antes: ${esc(SITE.site.address)}.` : 'Tu turno quedó reservado. Te llega la confirmación por correo.'; }
  $('#drawer').innerHTML = `${head(title)}<div class="dbody"><div class="status thanks">
      <span class="pill ok">${kind === 'comprobante' ? 'Comprobante enviado' : b?.status === 'confirmed' ? 'Turno confirmado' : 'Turno reservado'}</span>
      <div class="big">${big}</div><p>${lead}</p>
      ${sum}
      ${kind === 'turno' && b?.transfer ? transferBlock(b) : ''}
      ${b?.calendar && kind === 'turno' ? `<div class="cal-add"><span class="step-t" style="margin:0">Agregalo a tu calendario</span><div class="cal-btns"><a class="btn sm" href="${esc(b.calendar.google)}" target="_blank" rel="noopener">Google Calendar</a><button class="btn sm" data-ics="${esc(b.token)}">Apple / Outlook</button></div></div>` : ''}
      <div style="display:flex;gap:10px;flex-wrap:wrap">${b ? `<button class="btn solid" data-show-turno="${esc(b.token)}">Ver mi turno</button>` : ''}<button class="btn" data-book>Reservar otro turno</button><a class="btn" href="${wa(SITE.site.whatsapp, 'Hola! Tengo una consulta sobre mi turno.')}" target="_blank" rel="noopener">WhatsApp</a></div>
    </div></div>`;
  // Conversión para Meta (una sola vez por turno)
  const k = `cs-px-${kind}-${token}`; let done = false; try { done = !!sessionStorage.getItem(k); sessionStorage.setItem(k, '1'); } catch {}
  if (!done) {
    if (kind === 'turno') px('Schedule', { content_name: b?.service_name || '', value: b?.price || 0, currency: 'ARS' });
    else pxc('ComprobanteEnviado', { value: b?.transfer?.amount || b?.deposit_due || 0, currency: 'ARS' });
  }
}
/** Sube el comprobante (foto achicada en el navegador, o PDF de hasta 3 MB). */
async function readProof(file) {
  if (file.type === 'application/pdf') {
    if (file.size > 3 * 1024 * 1024) throw new Error('El PDF es muy pesado (máximo 3 MB). Probá con una captura de pantalla.');
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('No pudimos leer el archivo.')); r.readAsDataURL(file); });
  }
  const bmp = await createImageBitmap(file); const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const url = c.toDataURL('image/webp', 0.85); return url.startsWith('data:image/webp') ? url : c.toDataURL('image/jpeg', 0.88);
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
async function showGift(token, pre, track = false) {
  setHash('#gift/' + token);
  openDrawer(`${head('Gift card')}<div class="dbody"><div class="spinner" style="margin-top:20px"></div></div>`, { label: 'Gift card' });
  try {
    const g = pre || (await api('/api/giftcards/' + encodeURIComponent(token))).gift;
    // Purchase: al volver del pago con la gift card ya activa (una vez por gift card; no al abrir el link del email).
    if (track && g.status === 'active' && g.token) pxOnce('gift:' + g.token, 'Purchase', { content_name: 'Gift card' + (g.service_name ? ' · ' + g.service_name : ''), content_type: 'product', value: g.amount || 0, currency: 'ARS' });
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
    if (kind === 'gift') showGift(token, r.gift, true); else if (result === 'rejected') showBooking(token, r.booking); else goThanks('turno', token);
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
async function openReset(tk) {
  ACC = null; acc.staff = null; acc.mode = 'reset'; acc.resetToken = tk; acc.error = ''; acc.errors = {};
  openDrawer(`${head('Contraseña nueva')}<div class="dbody"><div class="spinner" style="margin-top:20px"></div></div>`, { label: 'Contraseña nueva' });
  try { acc.resetInvalid = !(await api('/api/account/reset?token=' + encodeURIComponent(tk))).valid; } catch { acc.resetInvalid = true; }
  renderAccount();
}
async function openAccount(mode) {
  setHash('#cuenta');
  if (mode) acc.mode = mode;
  openDrawer(`${head('Mi cuenta')}<div class="dbody"><div class="spinner" style="margin-top:20px"></div></div>`, { label: 'Mi cuenta' });
  try { ACC = await api('/api/account/me'); } catch { ACC = null; }
  // Si el equipo salió del panel, ya no se muestra como sesión abierta.
  if (acc.staff) { try { await api('/api/admin/me'); } catch { acc.staff = null; acc.mode = 'login'; } }
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
    body = `<p class="doc-body" style="padding-top:14px">Ingresá para ver tus datos y tus turnos, y reservar más rápido. <span class="note" style="display:block;margin-top:6px">¿Sos del equipo de Casa Samadhi? Con tu usuario entrás directo al panel.</span></p>
      <form class="bk" id="loginForm" novalidate>${field('email', 'Email', 'email', 'autocomplete="email" autofocus')}${field('password', 'Contraseña', 'password', 'autocomplete="current-password"')}
      ${acc.error ? `<p class="form-err" role="alert">${esc(acc.error)}</p>` : ''}<button class="btn solid" type="submit" ${acc.sending ? 'disabled' : ''}>Ingresar</button></form>
      <p class="note" style="margin-top:18px">¿No tenés cuenta? <button class="link-btn" data-acc-mode="register">Creala acá</button>. <button class="link-btn" data-acc-mode="forgot">¿Te olvidaste la contraseña?</button></p>${demoHint()}`;
  } else if (!ACC && acc.mode === 'forgot') {
    body = acc.sent ? `<div class="status"><span class="pill ok">Listo</span><div class="big">Revisá tu email</div><p>Si hay una cuenta con <b>${esc(acc.sent)}</b>, te mandamos un link para elegir una contraseña nueva. Vale por 1 hora. Si no lo ves, buscalo en Spam o Promociones.</p>${window.__CASA_DEMO_RESET_LINK?.() ? `<div class="sel-sum"><span class="note">Vista previa: el email no sale a ningún correo. Abrí el link desde acá para probar el cambio de contraseña.</span><a class="btn sm" style="justify-self:start" href="${window.__CASA_DEMO_RESET_LINK()}">Abrir el link del email</a></div>` : ''}<button class="link-btn" data-acc-mode="login">Volver a ingresar</button></div>`
      : `<p class="doc-body" style="padding-top:14px">Escribí el email de tu cuenta y te mandamos un link para elegir una contraseña nueva. Sirve también para el equipo del panel.</p>
      <form class="bk" id="forgotForm" novalidate>${field('email', 'Email', 'email', 'autocomplete="email" autofocus')}
      ${acc.error ? `<p class="form-err" role="alert">${esc(acc.error)}</p>` : ''}<button class="btn solid" type="submit" ${acc.sending ? 'disabled' : ''}>Mandarme el link</button></form>
      <p class="note" style="margin-top:18px"><button class="link-btn" data-acc-mode="login">Volver a ingresar</button></p>`;
  } else if (!ACC && acc.mode === 'reset') {
    body = acc.resetInvalid ? `<div class="status"><span class="pill bad">Link vencido</span><div class="big">Pedí un link nuevo</div><p>El link para cambiar la contraseña venció o ya se usó.</p><button class="btn solid" data-acc-mode="forgot">Pedir otro link</button></div>`
      : `<p class="doc-body" style="padding-top:14px">Elegí tu contraseña nueva.</p>
      <form class="bk" id="resetForm" novalidate>${field('password', 'Contraseña nueva', 'password', 'autocomplete="new-password" autofocus')}${field('password2', 'Repetila', 'password', 'autocomplete="new-password"')}
      ${acc.error ? `<p class="form-err" role="alert">${esc(acc.error)}</p>` : ''}<button class="btn solid" type="submit" ${acc.sending ? 'disabled' : ''}>Guardar contraseña</button></form>`;
  } else if (!ACC) {
    body = `<p class="doc-body" style="padding-top:14px">Con tu cuenta ves todos tus turnos y gift cards en un solo lugar.</p>
      <form class="bk" id="registerForm" novalidate>${field('name', 'Nombre y apellido', 'text', 'autocomplete="name" autofocus')}<div class="row2">${field('email', 'Email', 'email', 'autocomplete="email"')}${field('phone', 'Celular (WhatsApp)', 'tel', 'autocomplete="tel"')}</div>${field('password', 'Contraseña (8 o más caracteres)', 'password', 'autocomplete="new-password"')}
      ${acc.error ? `<p class="form-err" role="alert">${esc(acc.error)}</p>` : ''}<button class="btn solid" type="submit" ${acc.sending ? 'disabled' : ''}>Crear mi cuenta</button></form>
      <p class="note" style="margin-top:18px">¿Ya tenés cuenta? <button class="link-btn" data-acc-mode="login">Ingresá</button>.</p>`;
  } else {
    const c = ACC.customer;
    const card = (b, past) => `<div class="kv" style="border-top:0"><div style="align-items:center"><dt><b style="font-weight:500;color:var(--tinta)">${esc(b.service_name)}</b><br>${esc(cap(b.when))}${past ? ` · ${esc(b.status_label)}` : b.status !== 'confirmed' ? ` · ${esc(b.status_label)}` : ''}</dt><dd>${past ? `<button class="btn sm" data-rebook="${esc(b.service_name)}">Reservar de nuevo</button>` : `<button class="btn sm" data-show-turno="${esc(b.token)}">Ver</button>`}</dd></div></div>`;
    const S = ACC.stats || {};
    const again = S.lastVisit && SITE.services.find((x) => S.lastVisit.service_name.startsWith(x.name) && x.mode === 'online');
    body = `<div class="status" style="gap:6px"><div class="big">Hola, ${esc(c.name.split(' ')[0])}</div><p class="note">${esc(c.email)} · ${esc(c.phone)}</p></div>
      <div class="acc-book"><button class="btn solid" data-book>Reservar un turno</button>${again ? `<button class="btn" data-book-svc="${again.id}">Repetir ${esc(again.name)}</button>` : ''}</div>
      ${S.lastVisit ? `<div class="sel-sum welcome" style="margin-top:14px"><span class="w">Tu última visita</span><span class="n">${esc(cap(S.lastVisit.when))}</span><span class="w">${esc(S.lastVisit.service_name)} · ${S.visits} visita${S.visits === 1 ? '' : 's'} en Casa Samadhi${S.favorite && S.visits > 1 ? ` · tu favorito: ${esc(S.favorite)}` : ''}</span><button class="btn sm" data-rebook="${esc(S.lastVisit.service_name)}" style="justify-self:start;margin-top:6px">Reservar lo mismo</button></div>` : ''}
      <div class="step-t">Próximos turnos</div>${ACC.upcoming.length ? ACC.upcoming.map((b) => card(b)).join('') : '<p class="empty-slots">No tenés turnos por delante.</p>'}
      ${ACC.giftcards.length ? `<div class="step-t" style="margin-top:26px">Gift cards</div>${ACC.giftcards.map((g) => `<div class="kv" style="border-top:0"><div style="align-items:center"><dt><b style="font-weight:500;color:var(--tinta)">${esc(g.service_name || fmt(g.amount))}</b> · ${esc(g.status_label)}<br>${esc(g.code || '')}${g.status === 'active' ? ` · saldo ${fmt(g.balance)}` : ''}</dt><dd><button class="btn sm" data-show-gift="${esc(g.token)}">Ver</button></dd></div></div>`).join('')}` : ''}
      ${ACC.past.length ? `<div class="step-t" style="margin-top:26px">Historial</div>${ACC.past.map((b) => card(b, true)).join('')}` : ''}
      <div class="step-t" style="margin-top:26px">Mis datos</div>
      <form class="bk" id="profileForm" novalidate><div class="row2"><div class="fl"><label for="p_name">Nombre y apellido</label><input id="p_name" name="name" value="${esc(c.name)}" autocomplete="name"></div><div class="fl"><label for="p_phone">Celular</label><input id="p_phone" name="phone" value="${esc(c.phone)}" autocomplete="tel"></div></div>
        <div class="row2"><div class="fl"><label for="p_bd">Cumpleaños</label><input id="p_bd" name="birthday" type="date" value="${esc(c.birthday || '')}"></div><div class="fl"><label for="p_addr">Dónde vivís</label><input id="p_addr" name="address" value="${esc(c.address || '')}" placeholder="Barrio o localidad" autocomplete="address-level2"></div></div>
        <div class="row2"><div class="fl"><label for="p_cur">Contraseña actual</label><input id="p_cur" name="current" type="password" autocomplete="current-password" placeholder="Solo si la querés cambiar"></div><div class="fl"><label for="p_new">Contraseña nueva</label><input id="p_new" name="password" type="password" autocomplete="new-password"></div></div>
        ${acc.error ? `<p class="form-err" role="alert">${esc(acc.error)}</p>` : ''}<div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn sm" type="submit">Guardar mis datos</button><button class="btn sm" type="button" data-logout>Salir</button></div></form>`;
  }
  $('#drawer').innerHTML = `${head(ACC ? 'Mi cuenta' : acc.staff ? 'Panel' : { register: 'Crear cuenta', forgot: 'Recuperar contraseña', reset: 'Contraseña nueva' }[acc.mode] || 'Ingresar')}<div class="dbody">${body}</div>`;
}
/** Alguien del equipo (web master, administración, recepción o asesora) entró: se abre el panel. */
function goPanel(staff) {
  acc.staff = staff; ACC = null;
  toast(`Hola, ${(staff.name || staff.email).split(' ')[0]}`);
  if (window.__CASA_OPEN_ADMIN) { closeAll(); window.__CASA_OPEN_ADMIN(); } else location.href = '/admin/';
}
async function accountSubmit(form) {
  const d = Object.fromEntries(new FormData(form));
  acc.error = ''; acc.errors = {}; acc.sending = true;
  try {
    if (form.id === 'loginForm') {
      const r = await api('/api/account/login', d);
      if (r.staff) { acc.sending = false; return goPanel(r.staff); }
      ACC = r; acc.staff = null; toast(`Hola, ${r.customer.name.split(' ')[0]}`);
    } else if (form.id === 'registerForm') { ACC = await api('/api/account/register', d); toast('Cuenta creada'); }
    else if (form.id === 'profileForm') { ACC = await api('/api/account/me', d, 'PATCH'); toast('Datos guardados'); }
    else if (form.id === 'forgotForm') { await api('/api/account/forgot', d); acc.sent = d.email; }
    else if (form.id === 'resetForm') {
      if (d.password !== d.password2) throw Object.assign(new Error('Las contraseñas no coinciden.'), { data: { errors: { password2: 'Las contraseñas no coinciden.' } } });
      const r = await api('/api/account/reset', { token: acc.resetToken, password: d.password });
      setHash('#cuenta'); acc.mode = 'login';
      if (r.staff) { acc.sending = false; toast('Contraseña cambiada'); return goPanel(r.staff); }
      ACC = r; toast('Contraseña cambiada');
    }
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
  else if (h === 'reservar' || h === 'turnos') openBooking();
  else if (h === 'regalar') openGift();
  else if (h === 'terminos') openLegal();
  else if (h === 'arrepentimiento') openWithdraw();
  else if (h === 'cuenta') openAccount();
  else if (h === 'olvide') openAccount('forgot');
  else if (h.startsWith('clave/')) openReset(h.slice(6));
}
function bind() {
  document.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.closest('a[href^="https://wa.me"]')) px('Contact', { content_name: 'WhatsApp' });
    const act = t.closest('[data-act]')?.dataset.act;
    if (act) { const [k, v] = act.split(':'); if (k === 'book') openBooking({ serviceId: svcBySlug(v)?.id }); if (k === 'cat') openBooking({ category: v }); return; }
    const wk = t.closest('[data-work]'); if (wk) { const [sid, i] = wk.dataset.work.split(':'); return openWork(sid, Number(i)); }
    if (t.closest('[data-wclose]') || t.id === 'workBox') return closeWork();
    const wn = t.closest('[data-wnav]'); if (wn) { const n = worksOf(wl.s).slice(0, 8).length; wl.i = (wl.i + Number(wn.dataset.wnav) + n) % n; return renderWork(); }
    const wg = t.closest('[data-wgo]'); if (wg) { wl.i = Number(wg.dataset.wgo); return renderWork(); }
    const wb = t.closest('[data-wbook]'); if (wb) { const id = Number(wb.dataset.wbook); closeWork(); if (SOLO) { bk.info = null; bk.service = SITE.services.find((s) => s.id === id); Object.assign(bk, { pro: null, step: 2, days: [], time: '', date: lockDate(), error: '' }); renderBooking(true); loadDays(); return; } return openBooking({ serviceId: id }); }
    if (t.closest('[data-close]')) return closeAll();
    // Los "Reservar" de la página son links a /turnos (así funcionan aunque no cargue el JavaScript); con la web cargada, se suma el servicio o la sección elegida.
    if (t.closest('[data-book]')) { if (!SITE) return; e.preventDefault(); return openBooking(); }
    const bs = t.closest('[data-book-svc]'); if (bs) return openBooking({ serviceId: bs.dataset.bookSvc });
    const bc = t.closest('[data-book-cat]'); if (bc) { if (!SITE) return; e.preventDefault(); return openBooking({ category: bc.dataset.bookCat }); }
    const gs = t.closest('[data-gift-svc]'); if (gs) return openGift(gs.dataset.giftSvc);
    if (t.closest('[data-gift]')) return openGift();
    if (t.closest('[data-legal]')) { if ($('#drawer').classList.contains('on') && (bk.step === 3 || $('#gfForm'))) { readBkForm(); readGfForm(); } return openLegal(); }
    if (t.closest('[data-withdraw]')) return openWithdraw();
    if (t.closest('[data-account]')) return openAccount();
    const am = t.closest('[data-acc-mode]'); if (am) { acc.mode = am.dataset.accMode; acc.error = ''; acc.errors = {}; acc.sent = ''; return renderAccount(); }
    const du = t.closest('[data-demo-user]'); if (du) { const [em, pw] = du.dataset.demoUser.split('|'); acc.mode = 'login'; renderAccount(); $('#a_email').value = em; $('#a_password').value = pw; return; }
    if (t.closest('[data-open-panel]')) { if (window.__CASA_OPEN_ADMIN) { closeAll(); window.__CASA_OPEN_ADMIN(); } else location.href = '/admin/'; return; }
    if (t.closest('[data-logout]')) { await api('/api/account/logout', {}); ACC = null; bk.form = {}; acc.mode = 'login'; toast('Cerraste sesión'); return renderAccount(); }
    const stt = t.closest('[data-show-turno]'); if (stt) return showBooking(stt.dataset.showTurno);
    const stg = t.closest('[data-show-gift]'); if (stg) return showGift(stg.dataset.showGift);
    const rb = t.closest('[data-rebook]'); if (rb) { const sv = SITE.services.find((x) => rb.dataset.rebook.startsWith(x.name) && x.mode === 'online'); return openBooking(sv ? { serviceId: sv.id } : {}); }
    const bg = t.closest('[data-book-gift]');
    if (bg && !SOLO) { location.href = turneroUrl({ regalo: bg.dataset.bookGift }); return; }
    if (bg) { openBooking(); bk.form.gift_code = bg.dataset.bookGift; api('/api/giftcards/check', { code: bg.dataset.bookGift }).then((g) => (bk.gift = g)).catch(() => {}); return; }
    if (t.closest('[data-print]')) return window.print();
    const pay = t.closest('[data-pay]'); if (pay) return goPay(pay.dataset.pay);
    const sim = t.closest('[data-sim]'); if (sim) return simulate(sim.dataset.kind, sim.dataset.token, sim.dataset.sim);
    const rsb = t.closest('[data-resched]'); if (rsb) return openReschedule(rsb.dataset.resched);
    const rsd = t.closest('[data-rsday]'); if (rsd) { rs.date = rsd.dataset.rsday; rs.time = ''; rs.error = ''; return renderReschedule(); }
    const rst = t.closest('[data-rstime]'); if (rst && !rst.disabled) { rs.time = rst.dataset.rstime; rs.error = ''; return renderReschedule(); }
    if (t.closest('[data-rsgo]')) return sendReschedule();
    const ics = t.closest('[data-ics]'); if (ics) { downloadIcs(ics.dataset.ics).catch((err) => toast(err.message)); return; }
    const cancel = t.closest('[data-cancel]');
    if (cancel) {
      if (cancel.dataset.sure) { cancel.disabled = true; try { const r = await api(`/api/bookings/${encodeURIComponent(cancel.dataset.cancel)}/cancel`, {}); toast('Turno cancelado'); showBooking(r.booking.token, r.booking); } catch (err) { toast(err.message); cancel.disabled = false; } }
      else { cancel.dataset.sure = '1'; cancel.textContent = '¿Seguro? Tocá para cancelar'; cancel.classList.add('solid'); }
      return;
    }
    const back = t.closest('[data-back]');
    if (back) {
      readBkForm(); bk.error = '';
      if (back.dataset.back === 'turno' && rs.b) return showBooking(rs.b.token);
      if (back.dataset.back === 'sum') { bk.step = 3; bk.service = null; return renderBooking(); }
      if (back.dataset.back === 'info') { bk.info = null; return renderBooking(); }
      const from = bk.step;
      bk.step = Number(back.dataset.back);
      // De "día y horario" se vuelve a la plaquita del servicio.
      if (bk.step === 1 && from === 2 && bk.service) bk.info = bk.service;
      if (bk.step === 1 && bk.items.length) bk.service = null;
      return renderBooking();
    }
    // Pasos de la reserva
    const pick = t.closest('[data-pick]');
    if (pick) { bk.info = SITE.services.find((s) => s.id === Number(pick.dataset.pick)) || null; if (bk.info) px('ViewContent', { content_name: bk.info.name, content_category: bk.info.category, content_ids: [bk.info.slug], content_type: 'product', value: bk.info.price || 0, currency: 'ARS' }); renderBooking(); $('#drawer .dbody')?.scrollTo(0, 0); if (SOLO) window.scrollTo(0, Math.min(window.scrollY, $('#drawer').offsetTop)); return; }
    const choose = t.closest('[data-choose]');
    if (choose) { bk.info = null; bk.service = SITE.services.find((s) => s.id === Number(choose.dataset.choose)); bk.pro = null; bk.step = 2; bk.days = []; bk.time = ''; bk.date = lockDate(); bk.error = ''; renderBooking(); loadDays(); return; }
    const proB = t.closest('[data-pro]'); if (proB) { bk.pro = Number(proB.dataset.pro) || null; bk.time = ''; bk.days = []; return loadDays(); }
    if (t.closest('[data-take]') && !t.closest('[data-take]').disabled) { readBkForm(); return takeItem(); }
    const ed = t.closest('[data-edit-item]'); if (ed) { readBkForm(); return editItem(Number(ed.dataset.editItem)); }
    const rm = t.closest('[data-rm-item]'); if (rm) { readBkForm(); bk.items.splice(Number(rm.dataset.rmItem), 1); return renderBooking(); }
    if (t.closest('[data-add-item]')) { readBkForm(); Object.assign(bk, { step: 1, service: null, pro: null, filter: null, error: '' }); return renderBooking(); }
    const cp = t.closest('[data-copy]'); if (cp) { try { await navigator.clipboard.writeText(cp.dataset.copy); toast('Copiado'); } catch { toast(cp.dataset.copy); } return; }
    const ts = t.closest('[data-tsent]');
    if (ts) { ts.disabled = true; try { const r = await api(`/api/bookings/${encodeURIComponent(ts.dataset.tsent)}/transfer-sent`, {}); goThanks('comprobante', r.booking.token); } catch (err) { toast(err.message); ts.disabled = false; } return; }
    const pm = t.closest('[data-paymp]');
    if (pm) { pm.disabled = true; try { const r = await api(`/api/bookings/${encodeURIComponent(pm.dataset.paymp)}/pay-mp`, {}); goPay(r.pay_url); } catch (err) { toast(err.message); pm.disabled = false; } return; }
    if (t.matches('input[name="pay_method"]')) { readBkForm(); return renderBooking(); }
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
  document.addEventListener('change', async (e) => {
    const f = e.target.closest?.('[data-tproof]'); if (!f || !f.files[0]) return;
    const lab = f.closest('label'); lab?.classList.add('busy'); if (lab) lab.lastChild.textContent = 'Subiendo…';
    try { const comprobante = await readProof(f.files[0]); const r = await api(`/api/bookings/${encodeURIComponent(f.dataset.tproof)}/transfer-sent`, { comprobante }); goThanks('comprobante', r.booking.token); }
    catch (err) { toast(err.message); lab?.classList.remove('busy'); if (lab) lab.lastChild.textContent = 'Subir el comprobante'; f.value = ''; }
  });
  document.addEventListener('submit', async (e) => {
    if (e.target.id === 'bkForm') { e.preventDefault(); submitBooking(); }
    if (e.target.id === 'gfForm') { e.preventDefault(); submitGift(); }
    if (['loginForm', 'registerForm', 'profileForm', 'forgotForm', 'resetForm'].includes(e.target.id)) { e.preventDefault(); accountSubmit(e.target); }
    if (e.target.id === 'wdForm') {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target));
      try { const r = await api('/api/withdrawals', d); openWithdraw(r.code); } catch (err) { $('#wdErr').textContent = err.message; }
    }
  });
  $('#menuBtn').addEventListener('click', () => { lastFocus = $('#menuBtn'); $('#mnav').classList.add('on'); $('#scrim').classList.add('on'); });
  $('#logoBtn').addEventListener('click', (e) => { e.preventDefault(); closeAll(); window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' }); });
  $('#scrim').addEventListener('click', closeAll);
  document.addEventListener('keydown', (e) => {
    if (!$('#workBox').hidden) { if (e.key === 'Escape') closeWork(); if (['ArrowLeft', 'ArrowRight'].includes(e.key) && e.target.type !== 'range') $(`#workBox [data-wnav="${e.key === 'ArrowLeft' ? -1 : 1}"]`)?.click(); return; }
    if (e.key === 'Escape') closeAll();
  });
  // Comparación antes/después: el deslizador mueve la línea.
  document.addEventListener('input', (e) => { if (e.target.classList?.contains('wb-range')) e.target.closest('.wb-cmp').style.setProperty('--pos', e.target.value + '%'); });
  // Y se arrastra con el dedo o el mouse en cualquier parte de la foto.
  let drag = null;
  const slide = (e) => { const r = drag.getBoundingClientRect(), v = Math.round(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100))); drag.style.setProperty('--pos', v + '%'); const rg = drag.querySelector('.wb-range'); if (rg) rg.value = v; };
  document.addEventListener('pointerdown', (e) => { const c = e.target.closest('.wb-cmp'); if (!c || e.target.closest('.wb-nav') || !c.querySelector('.bef')) return; drag = c; c.setPointerCapture?.(e.pointerId); slide(e); });
  document.addEventListener('pointermove', (e) => { if (drag) slide(e); });
  document.addEventListener('pointerup', () => (drag = null));
  document.addEventListener('pointercancel', () => (drag = null));
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
  const rejected = p.get('status') === 'rejected' || p.get('collection_status') === 'rejected';
  if (kind === 'gift') showGift(token, null, true); else if (rejected) showBooking(token); else { goThanks('turno', token); return true; }
  if (rejected) toast('El pago no se aprobó. Podés intentar de nuevo.');
  return true;
}

function startSolo() {
  document.body.classList.add('solo');
  document.title = 'Reservá tu turno · Casa Samadhi';
  $('#drawer').setAttribute('aria-modal', 'false');
  const S = SITE.site;
  $('#soloFoot').innerHTML = `<img src="${MEDIA('media/logo-casa.png')}" alt="Casa Samadhi" width="120" height="105">
    <p>${esc(S.address)} · ${esc(S.city)}</p>
    <p><a href="${wa(S.whatsapp, 'Hola! Tengo una consulta.')}" target="_blank" rel="noopener">WhatsApp ${esc(S.whatsapp)}</a> · <a href="https://instagram.com/${esc(S.instagram)}" target="_blank" rel="noopener">@${esc(S.instagram)}</a></p>
    <p class="links"><button type="button" class="link-btn" data-account>Mi cuenta</button> · <button type="button" class="link-btn" data-gift>Gift cards</button> · <a href="${homeUrl()}">Conocé Casa Samadhi</a></p>`;
  $('#soloHome').href = homeUrl();
}
async function start() {
  bind();
  try { SITE = await api('/api/site'); }
  catch { $('#ritualList').innerHTML = '<p class="it">No pudimos cargar los servicios. Recargá la página.</p>'; return; }
  renderHero(); bindHero(); renderSections(); onScroll();
  try { ACC = await api('/api/account/me'); } catch { ACC = null; }
  if (SOLO) startSolo();
  if (THANKS) { showThanks(THANKS); return; }
  if (!(await handleReturn())) route();
  if (SOLO && !$('#drawer').classList.contains('on')) {
    // /turnos?servicio=slug abre la plaquita de ese servicio; ?seccion=manicuria filtra; ?regalo=CÓDIGO aplica la gift card.
    const q = new URLSearchParams(location.search), sv = svcBySlug(q.get('servicio') || '');
    openBookingHere({ category: q.get('seccion') || null });
    if (sv && sv.mode === 'online') { bk.info = sv; renderBooking(); }
    const code = q.get('regalo');
    if (code) { bk.form.gift_code = code; api('/api/giftcards/check', { code }).then((g) => { bk.gift = g; renderBooking(); }).catch(() => {}); }
  }
  window.addEventListener('casa-refresh', async () => { try { SITE = await api('/api/site'); renderSections(); } catch {} });
}
start();
