// Crea un usuario del panel, o le pone contraseña si ya existe (por ejemplo, el web master):
// npm run create-admin -- email@ejemplo.com "contraseña larga" "Nombre" [admin|staff|webmaster]
import { withState } from '../server/lib/store.js';
import { addStaff } from '../server/core/spa-core.js';
import { env, hashPassword } from '../server/index.js';
const [email, password, name = '', role = 'admin'] = process.argv.slice(2);
if (!email || !password || password.length < 10 || !['admin', 'staff', 'webmaster'].includes(role)) { console.log('Uso: npm run create-admin -- email "contraseña de 10+ caracteres" "Nombre" [admin|staff|webmaster]'); process.exit(1); }
const out = await withState(async (st) => {
  const u = st.staff.find((x) => x.email === email.toLowerCase().trim());
  if (u) { u.password_hash = hashPassword(password); return `Contraseña actualizada: ${u.email} (${u.role})`; }
  const n = await addStaff(st, env, { email, password, name, role });
  return `Listo: ${n.email} (${n.role})`;
});
console.log(out);
process.exit(0);
