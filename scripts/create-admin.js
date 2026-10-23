// Crea un usuario del panel: npm run create-admin -- email@ejemplo.com "contraseña larga" "Nombre" [admin|staff]
import { withState } from '../server/lib/store.js';
import { addStaff } from '../server/core/spa-core.js';
import { env } from '../server/index.js';
const [email, password, name = '', role = 'admin'] = process.argv.slice(2);
if (!email || !password || password.length < 10) { console.log('Uso: npm run create-admin -- email "contraseña de 10+ caracteres" "Nombre" [admin|staff]'); process.exit(1); }
const u = await withState((st) => { if (st.staff.some((x) => x.email === email.toLowerCase())) throw new Error('Ya existe ese usuario.'); return addStaff(st, env, { email, password, name, role }); });
console.log(`Listo: ${u.email} (${u.role})`);
process.exit(0);
