// Usuarios de prueba de Casa Samadhi (vista previa y servidor de prueba).
// Antes de abrir la web al público borralos con: npm run demo-users -- --borrar
export const DEMO_USERS = [
  { kind: 'staff', role: 'admin', name: 'Administración (prueba)', email: 'admin@casasamadhi.demo', password: 'CasaSamadhi.Admin26' },
  { kind: 'staff', role: 'staff', name: 'Recepción (prueba)', email: 'recepcion@casasamadhi.demo', password: 'CasaSamadhi.Recep26' },
  { kind: 'staff', role: 'pro', name: 'Ana Gómez (prueba)', email: 'profesional@casasamadhi.demo', password: 'Profesional.Samadhi26', specialty: 'Head spa y masajes',
    services: ['ritual-esencial', 'ritual-profundo', 'masoterapia-relajante'], pay: { type: 'comision', percent: 40, base: 0 } },
  { kind: 'customer', name: 'Lucía Fernández', email: 'clienta@casasamadhi.demo', phone: '221 555-1234', password: 'Clienta.Samadhi26' },
];
