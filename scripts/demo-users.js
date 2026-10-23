// Crea (o borra con --borrar) los usuarios de prueba en la base del servidor.
import { withState } from '../server/lib/store.js';
import { addStaff, addCustomer } from '../server/core/spa-core.js';
import { env } from '../server/index.js';
import { DEMO_USERS } from './demo-users-list.js';

const borrar = process.argv.includes('--borrar');
const emails = DEMO_USERS.map((u) => u.email);
await withState(async (st) => {
  st.customers = st.customers || [];
  if (borrar) {
    st.staff = st.staff.filter((u) => !emails.includes(u.email));
    st.customers = st.customers.filter((c) => !emails.includes(c.email));
    return;
  }
  for (const u of DEMO_USERS) {
    if (u.kind === 'staff' && !st.staff.some((x) => x.email === u.email)) await addStaff(st, env, u);
    if (u.kind === 'customer' && !st.customers.some((x) => x.email === u.email)) await addCustomer(st, env, u);
  }
});
console.log(borrar ? 'Usuarios de prueba borrados.' : DEMO_USERS.map((u) => `${u.kind === 'staff' ? (u.role === 'admin' ? 'Administración' : 'Recepción') : 'Clienta'}: ${u.email} / ${u.password}`).join('\n'));
process.exit(0);
