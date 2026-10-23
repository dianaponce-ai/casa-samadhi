// Datos iniciales de Casa Samadhi: servicios, horarios y textos.
// Precios y servicios tomados del Instagram @casasamadhistyle (octubre 2026). Todo se puede cambiar desde el panel.
// Las duraciones que no figuraban en Instagram son estimadas y conviene revisarlas.

export const CATEGORIES = [
  { key: 'rituales', name: 'Rituales', title: 'Head spa & masajes', intro: 'Un ritual para soltar el cuerpo, la cabeza y el día. Agua tibia, aromas, manos que saben y silencio.' },
  { key: 'manicuria', name: 'Manicuría', title: 'Manicuría', intro: 'Todos nuestros servicios de manicuría incluyen café de cortesía, mensaje de oráculo y spa de manos.' },
  { key: 'terapias', name: 'Terapias', title: 'Terapias holísticas', intro: 'Sesiones para armonizar cuerpo, mente y energía, con especialistas que se suman a la casa.' },
];

export const RESOURCES = [
  { key: 'headspa', name: 'Sala de head spa', capacity: 1 },
  { key: 'manicuria', name: 'Manicuría', capacity: 1 },
  { key: 'terapias', name: 'Sala de terapias', capacity: 1 },
];

// mode: 'online' (turno con seña), 'whatsapp' (se coordina por WhatsApp), 'menu' (solo figura en la lista de precios).
export const SERVICES = [
  { slug: 'ritual-esencial', category: 'rituales', resource: 'headspa', mode: 'online', name: 'Ritual esencial', tag: 'Head spa', duration: 60, price: 55000, image: 'media/headspa-ritual.webp', featured: true,
    short: 'El head spa completo: masaje capilar, lavado profundo y un rato para vos.',
    includes: ['Relajación guiada', 'Aromaterapia', 'Masaje capilar cervical y craneal', 'Lavado profundo con productos naturales', 'Toques faciales y mascarilla', 'Secado suave', 'Infusión de cortesía'] },
  { slug: 'ritual-profundo', category: 'rituales', resource: 'headspa', mode: 'online', name: 'Ritual profundo con pindas', tag: 'Head spa + masajes', duration: 90, price: 80000, image: 'media/headspa-agua.webp', featured: true,
    short: 'La experiencia más completa y sensorial de la casa.',
    includes: ['Todo el ritual esencial', 'Masajes relajantes', 'Pindas herbales calientes', 'Sonidos de cuencos'] },
  { slug: 'masoterapia-relajante', category: 'rituales', resource: 'headspa', mode: 'online', name: 'Masoterapia relajante', tag: 'Masaje corporal', duration: 60, price: 45000, image: 'media/camilla.webp', featured: true,
    short: 'Perfecto para liberar tensión física. No incluye head spa.',
    includes: ['Masaje relajante corporal', 'Aromaterapia', 'Pindas herbales calientes', 'Sonidos de cuencos'] },

  { slug: 'esmaltado-semipermanente', category: 'manicuria', resource: 'manicuria', mode: 'online', name: 'Esmaltado semipermanente', duration: 60, price: 16000, image: 'media/unas.webp' },
  { slug: 'esmaltado-tradicional', category: 'manicuria', resource: 'manicuria', mode: 'online', name: 'Esmaltado tradicional', duration: 45, price: 10000 },
  { slug: 'capping-gel', category: 'manicuria', resource: 'manicuria', mode: 'online', name: 'Capping gel nivelador', duration: 75, price: 20000 },
  { slug: 'soft-gel-sencillo', category: 'manicuria', resource: 'manicuria', mode: 'online', name: 'Soft gel', tag: 'Diseño sencillo', duration: 90, price: 25000 },
  { slug: 'soft-gel-complejo', category: 'manicuria', resource: 'manicuria', mode: 'online', name: 'Soft gel', tag: 'Diseño complejo', duration: 120, price: 30000 },
  { slug: 'retirado-semi-capping', category: 'manicuria', resource: 'manicuria', mode: 'online', name: 'Retirado de semi o capping', duration: 20, price: 5000 },
  { slug: 'retirado-soft-gel', category: 'manicuria', resource: 'manicuria', mode: 'online', name: 'Retirado de soft gel', duration: 30, price: 7000 },
  { slug: 'retirado-nuevo-servicio', category: 'manicuria', resource: 'manicuria', mode: 'menu', name: 'Retirado + nuevo servicio', tag: 'Se suma al servicio nuevo', duration: 0, price: 1500 },
  { slug: 'retirado-otro-salon', category: 'manicuria', resource: 'manicuria', mode: 'online', name: 'Retirado de otro salón', duration: 30, price: 9000 },

  { slug: 'reiki', category: 'terapias', resource: 'terapias', mode: 'whatsapp', name: 'Reiki', tag: 'Energía que sana, equilibra y transforma', duration: 60, price: null, image: 'media/deco-cristal.webp',
    short: 'Armoniza cuerpo, mente y espíritu, libera bloqueos, reduce el estrés y eleva tu bienestar integral.' },
  { slug: 'armonizacion', category: 'terapias', resource: 'terapias', mode: 'whatsapp', name: 'Armonización facial y corporal', tag: 'Belleza que refleja tu equilibrio interior', duration: 60, price: null, image: 'media/camilla.webp',
    short: 'Técnica holística que trabaja los músculos del rostro y del cuerpo: libera tensiones, mejora la circulación y estimula tu energía vital.',
    includes: ['Relaja y descontractura', 'Tonifica y rejuvenece', 'Realza tu belleza natural', 'Armoniza tu cuerpo y tu energía'] },
  { slug: 'barras-de-access', category: 'terapias', resource: 'terapias', mode: 'whatsapp', name: 'Barras de Access', tag: 'Un reinicio mental', duration: 60, price: null, image: 'media/barras-access.webp',
    short: 'Toques suaves en 32 puntos de la cabeza para soltar pensamientos y emociones que pesan. Relajación profunda y claridad mental.',
    includes: ['Reduce el estrés', 'Mejora la calidad del sueño', 'Más energía y creatividad', 'Claridad mental y enfoque'] },
  { slug: 'tarot-y-oraculo', category: 'terapias', resource: 'terapias', mode: 'whatsapp', name: 'Tarot y oráculo', tag: 'Lecturas personalizadas', duration: 45, price: null, image: 'media/deco-cristal.webp',
    short: 'Una lectura para hacerle una pregunta al tarot y recibir el mensaje del oráculo.' },
];

export const SITE = {
  name: 'Casa Samadhi',
  kicker: 'Café & Spa',
  tagline: 'Un espacio para desconectar',
  subtitle: 'Café, spa & momentos para vos',
  address: 'Calle 47 N° 679, entre 8 y 9',
  city: 'La Plata, Buenos Aires',
  whatsapp: '11 4928-2503',
  eventsWhatsapp: '221 504-6554',
  instagram: 'casasamadhistyle',
  storeInstagram: 'samadhistyle',
  email: '',
  storeUrl: 'https://samadhi-store.vercel.app',
  announcement: 'Head spa · Manicuría · Terapias · Cafetería — Calle 47 N° 679, La Plata',
  hoursText: '',
};

// Horario de atención por día (0 = domingo). Es un punto de partida: confirmalo en el panel.
export const HOURS = {
  0: [], 1: [{ from: '10:00', to: '19:00' }], 2: [{ from: '10:00', to: '19:00' }], 3: [{ from: '10:00', to: '19:00' }],
  4: [{ from: '10:00', to: '19:00' }], 5: [{ from: '10:00', to: '19:00' }], 6: [{ from: '10:00', to: '19:00' }],
};

export const BOOKING = {
  depositPercent: 30, // seña que se paga online con Mercado Pago (0 = sin seña)
  minNoticeHours: 3, // anticipación mínima para reservar online
  maxDaysAhead: 45,
  slotStep: 30, // cada cuántos minutos arrancan los turnos
  holdMinutes: 30, // cuánto se guarda el turno mientras se paga la seña
  cancelHours: 24, // hasta cuántas horas antes se puede cancelar online
  reminderHours: 24,
  staffEmails: '',
};

export const GIFTCARDS = {
  enabled: true,
  amounts: [45000, 55000, 80000, 100000],
  min: 20000,
  validityDays: 180,
};

export const FAQ = [
  { q: '¿Cómo reservo un turno?', a: 'Tocá **Reservar**, elegí el servicio, el día y el horario libre y completá tus datos. Para confirmarlo pagás una seña con Mercado Pago y te llega la confirmación por email. Si preferís, escribinos por WhatsApp y lo coordinamos.' },
  { q: '¿Qué es el head spa?', a: 'Es un ritual de cuidado del cuero cabelludo y relajación: masaje capilar cervical y craneal, lavado profundo con agua tibia y productos naturales, aromaterapia y un secado suave. Sale con la cabeza liviana y el pelo limpio.' },
  { q: '¿Cuánto es la seña y cómo se descuenta?', a: 'La seña es un porcentaje del servicio y se descuenta del total. El resto lo pagás en la casa, el día del turno.' },
  { q: '¿Puedo cambiar o cancelar mi turno?', a: 'Sí. Hasta 24 horas antes podés cancelarlo desde el link del email de confirmación o escribirnos para pasarlo a otro día; la seña queda a cuenta del nuevo turno o te la devolvemos. Con menos de 24 horas de aviso la seña no se devuelve.' },
  { q: '¿Cómo funcionan las gift cards?', a: 'Elegís un monto o un ritual, la pagás online y te llega una tarjeta con un código. Quien la recibe lo escribe al reservar y se descuenta del total. Vale por 6 meses.' },
  { q: '¿Qué incluye la manicuría?', a: 'Todos los servicios incluyen exfoliación e hidratación de manos, café de cortesía, mensaje de oráculo y spa de manos.' },
  { q: '¿Hacen eventos privados?', a: 'Sí, el espacio está disponible para meriendas, reuniones, talleres y coworking. Escribinos por WhatsApp y armamos la propuesta.' },
];

export const TERMS = `## Términos y condiciones

Estas condiciones regulan las reservas de turnos y la compra de gift cards en el sitio de **Casa Samadhi** (Calle 47 N° 679, La Plata). Al reservar o comprar, las aceptás.

### Quiénes somos
Casa Samadhi · [Razón social] · CUIT [completar] · Calle 47 N° 679, La Plata, Provincia de Buenos Aires.

### Turnos y seña
- Los turnos se confirman con el pago de la seña que se indica al reservar. El resto se abona en la casa el día del turno.
- Mientras pagás, el horario queda reservado durante 30 minutos. Si el pago no se acredita en ese tiempo, el turno se libera.
- Te pedimos llegar 10 minutos antes. Si llegás tarde, puede que el servicio sea más corto para no demorar el turno siguiente.

### Cambios y cancelaciones
- Podés cancelar o reprogramar hasta 24 horas antes del turno; la seña queda a cuenta de un nuevo turno o te la devolvemos por el mismo medio de pago.
- Con menos de 24 horas de aviso, o si no venís, la seña no se devuelve.

### Gift cards
- Valen por el plazo que figura en la tarjeta (6 meses desde la compra) y se pueden usar en cualquier servicio de la casa.
- No se canjean por dinero. Si el servicio cuesta más que el saldo, la diferencia se abona aparte.

### Derecho de arrepentimiento
Podés revocar la compra de una gift card o la reserva de un turno dentro de los 10 días corridos desde que la hiciste, siempre que el servicio no se haya prestado, usando el **Botón de arrepentimiento** al pie del sitio (artículo 34 de la Ley 24.240 y artículo 1110 del Código Civil y Comercial). Te devolvemos el total pagado.

### Datos personales
- Usamos tus datos solo para gestionar tus turnos y compras y avisarte sobre ellos. No los vendemos ni los cedemos.
- El titular de los datos personales tiene la facultad de ejercer el derecho de acceso a los mismos en forma gratuita a intervalos no inferiores a seis meses, salvo que se acredite un interés legítimo al efecto, conforme lo establecido en el artículo 14, inciso 3 de la Ley N° 25.326.
- La AGENCIA DE ACCESO A LA INFORMACIÓN PÚBLICA, en su carácter de Órgano de Control de la Ley N° 25.326, tiene la atribución de atender las denuncias y reclamos que interpongan quienes resulten afectados en sus derechos por incumplimiento de las normas vigentes en materia de protección de datos personales.

### Defensa del consumidor
Ante cualquier reclamo podés escribirnos. También podés acudir a Defensa del Consumidor desde el enlace que está al pie del sitio.`;
