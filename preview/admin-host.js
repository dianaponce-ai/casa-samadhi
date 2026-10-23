// Monta el panel dentro de la vista previa, aislado en un Shadow DOM, y agrega un acceso en el pie.
const host = document.createElement('div');
host.id = 'adminHost'; host.hidden = true;
host.setAttribute('role', 'dialog'); host.setAttribute('aria-label', 'Panel de la casa');
document.body.appendChild(host);
const root = host.attachShadow({ mode: 'open' });
root.innerHTML = `<style>${window.__ADMIN_CSS}
:host { position: fixed; inset: 0; z-index: 300; overflow: auto; background: var(--bg); padding-top: env(safe-area-inset-top, 0px); }
.demo-flag { position: fixed; z-index: 40; left: 50%; transform: translateX(-50%); bottom: calc(14px + env(safe-area-inset-bottom, 0px)); display: flex; gap: 10px; align-items: center; background: var(--ink); color: var(--panel); padding: 7px 8px 7px 14px; border-radius: 999px; font-size: 12px; box-shadow: 0 6px 20px rgba(0,0,0,.18); white-space: nowrap; }
.demo-flag button { background: color-mix(in srgb, var(--panel) 18%, transparent); color: var(--panel); border-radius: 999px; padding: 4px 10px; font-size: 12px; }
</style><div class="admin-shell">${window.__ADMIN_HTML}</div>
<div class="demo-flag">Vista previa · datos de ejemplo <button id="demoBack">Volver a la web</button><button id="demoReset">Reiniciar datos</button></div>`;
function close(logout) { if (logout) window.__CASA_ADMIN_API('/logout', { method: 'POST', body: {} }); host.hidden = true; document.body.style.overflow = ''; location.hash = ''; window.dispatchEvent(new Event('casa-refresh')); }
root.getElementById('demoBack').onclick = close;
root.getElementById('demoReset').onclick = () => { window.__CASA_RESET(); location.hash = ''; location.reload(); };
window.__ADMIN_EMBED = { root, manualBoot: true, api: (p, o) => window.__CASA_ADMIN_API(p, o), exit: (logout) => close(logout), scrollTop: () => { host.scrollTop = 0; } };
async function open() { host.hidden = false; host.scrollTop = 0; document.body.style.overflow = 'hidden'; window.__adminBoot(); }
window.__CASA_OPEN_ADMIN = open;
