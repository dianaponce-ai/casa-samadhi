// Datos iniciales de Casa Samadhi: servicios, horarios y textos.
// Precios y servicios tomados del Instagram @casasamadhistyle (octubre 2026; manicuría y rituales actualizados en noviembre 2026).
// La casa: cafetería en planta baja y eventos en el patio; arriba, el salón de manicuría y pedicuría y la sala de head spa; la terraza se alquila para eventos. Todo se puede cambiar desde el panel.
// Las duraciones que no figuraban en Instagram son estimadas y conviene revisarlas.

export const CATEGORIES = [
  { key: 'rituales', name: 'Rituales', title: 'Head spa & masajes', intro: 'Un ritual para soltar el cuerpo, la cabeza y el día. Agua tibia, aromas, manos que saben y silencio.' },
  { key: 'manicuria', name: 'Manicuría', title: 'Manicuría y pedicuría', intro: 'En el salón de arriba. Todos los servicios incluyen café de cortesía, mensaje de oráculo y spa de manos.' },
  { key: 'terapias', name: 'Terapias', title: 'Terapias holísticas', intro: 'Sesiones para armonizar cuerpo, mente y energía, con especialistas que se suman a la casa.' },
  { key: 'espacio', name: 'Alquiler de la terraza', title: 'Una terraza para tus eventos', intro: 'Casa Samadhi abre su terraza para celebraciones y encuentros.' },
];

export const RESOURCES = [
  { key: 'headspa', name: 'Sala de head spa', capacity: 1 },
  { key: 'manicuria', name: 'Manicuría', capacity: 1 },
  { key: 'terapias', name: 'Sala de terapias', capacity: 1 },
];

// mode: 'online' (turno con seña), 'whatsapp' (se coordina por WhatsApp), 'menu' (solo figura en la lista de precios).
// includes: uno por línea; con "Título — explicación" el turnero muestra la explicación debajo (como en las placas).
export const SERVICES = [
  { slug: 'ritual-esencial', category: 'rituales', resource: 'headspa', mode: 'online', name: 'Ritual esencial', tag: 'Head spa', duration: 60, price: 60000, image: 'media/headspa-ritual.webp', featured: true,
    short: 'Un tratamiento completo para renovar tu cuerpo y tu mente.',
    includes: [
      'Relajación guiada — Con técnicas de respiración y relajación profunda para liberar el estrés.',
      'Aromaterapia — Aceites esenciales que equilibran cuerpo, mente y emociones.',
      'Masaje capilar cervical y craneal — Alivia tensiones, mejora la circulación y aporta una sensación de ligereza.',
      'Lavado profundo con productos naturales — Limpieza suave y consciente para revitalizar tu cabello.',
      'Toques faciales y mascarilla — Hidratación y nutrición para una piel fresca y radiante.',
      'Secado suave — Con cuidado y productos que protegen tu cabello.',
      'Infusión de cortesía — Un momento de calma para completar tu experiencia.',
    ] },
  { slug: 'ritual-profundo', category: 'rituales', resource: 'headspa', mode: 'online', name: 'Ritual profundo con pindas', tag: 'Head spa + masajes', duration: 90, price: 90000, image: 'media/headspa-agua.webp', featured: true,
    short: 'La experiencia más completa y sensorial para tu bienestar.',
    includes: [
      'Todo el ritual esencial — Relajación guiada, masaje capilar, lavado profundo, toques faciales, secado e infusión.',
      'Masajes relajantes — Alivian tensiones y promueven una sensación profunda de bienestar.',
      'Pindas herbales calientes — Liberan toxinas, relajan músculos y equilibran tu energía.',
      'Sonidos de cuenco — Frecuencias que armonizan tu mente y te conectan con la calma.',
      'Aromaterapia — Esencias naturales que relajan, revitalizan y renuevan.',
    ] },

  // works: trabajos de ejemplo (antes y después). El "antes" es el mismo para todos: SITE.worksBefore.
  // Manicuría: carta de noviembre 2026. `price` es el precio en efectivo (sobre ese se calcula la seña); `price_transfer`, con transferencia.
  { slug: 'esmaltado-semipermanente', category: 'manicuria', resource: 'manicuria', mode: 'online', name: 'Semipermanente', duration: 60, price: 20000, price_transfer: 22000, image: 'media/unas.webp',
    works: [{ id: 'w1', after: 'media/trabajos/semi-verde-oliva.webp' }, { id: 'w2', after: 'media/trabajos/semi-negro-glitter.webp' }] },
  { slug: 'soft-gel', category: 'manicuria', resource: 'manicuria', mode: 'online', name: 'Soft gel', duration: 90, price: 30000, price_transfer: 32000,
    works: [{ id: 'w3', after: 'media/trabajos/softgel-rosa-glitter.webp' }] },
  { slug: 'dipping', category: 'manicuria', resource: 'manicuria', mode: 'online', name: 'Dipping', duration: 75, price: 22000, price_transfer: 24000,
    works: [{ id: 'w4', after: 'media/trabajos/dipping-blanco-lechoso.webp' }] },
  { slug: 'belleza-de-pies', category: 'manicuria', resource: 'manicuria', mode: 'online', name: 'Belleza de pies', duration: 60, price: 23000, price_transfer: 25000 },
  { slug: 'combo-manos-y-pies-semi', category: 'manicuria', resource: 'manicuria', mode: 'online', name: 'Combo manos y pies', tag: 'Semipermanente', duration: 120, price: 40000, price_transfer: 42000 },
  { slug: 'pedicuria', category: 'manicuria', resource: 'manicuria', mode: 'online', name: 'Pedicuría', duration: 75, price: 32000, price_transfer: 34000 },
  { slug: 'retirado-de-esmalte', category: 'manicuria', resource: 'manicuria', mode: 'online', name: 'Retirado de esmalte', duration: 20, price: 5000 },

  { slug: 'tarot-y-oraculo', category: 'terapias', resource: 'terapias', mode: 'whatsapp', name: 'Tarot y oráculo', tag: 'Lecturas personalizadas', duration: 45, price: null, image: 'media/deco-cristal.webp',
    short: 'Una lectura para hacerle una pregunta al tarot y recibir el mensaje del oráculo.' },

  // La terraza: todavía sin fotos (cuando estén, se eligen en Panel → Servicios).
  { slug: 'alquiler-del-espacio', category: 'espacio', resource: 'terapias', mode: 'whatsapp', name: 'Alquiler de la terraza', tag: 'Para eventos', duration: 0, price: null, image: '',
    short: 'La terraza de la casa se alquila para cumpleaños, celebraciones y encuentros. Consultanos por fechas disponibles y armamos la propuesta.',
    includes: ['Terraza al aire libre', 'Cumpleaños, celebraciones y encuentros', 'Cafetería de la casa en planta baja', 'Calle 47 N° 679, La Plata'] },
];

// Profesionales que atienden los turnos. La comisión y el acceso al panel se completan en Panel → Profesionales.
export const PROS = [
  { name: 'Trinidad', specialty: 'Head spa y masajes', categories: ['rituales'] },
  { name: 'Belén', specialty: 'Manicuría y pedicuría', categories: ['manicuria'] },
];

export const SITE = {
  name: 'Casa Samadhi',
  kicker: 'Café & Spa',
  tagline: 'Un espacio para desconectar',
  subtitle: 'Café, spa & momentos para vos',
  address: 'Calle 47 N° 679, entre 8 y 9',
  city: 'La Plata, Buenos Aires',
  whatsapp: '221 504-6554', // consultas generales, manicuría, terapias, eventos y el local
  ritualsWhatsapp: '11 4928-2503', // solo head spa y masajes
  eventsWhatsapp: '221 504-6554',
  instagram: 'casasamadhistyle',
  storeInstagram: 'samadhistyle',
  worksBefore: 'media/trabajos/antes.webp', // foto de "antes" para todos los trabajos (se cambia en Panel → Servicios)
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

// Cómo se paga la seña: Mercado Pago y/o transferencia. Los datos bancarios se le muestran a la clienta al reservar.
export const PAYMENTS = {
  mpEnabled: true,
  transferEnabled: true,
  transferHoldHours: 12, // cuánto se guarda el turno mientras llega la transferencia
  alias: '',
  cbu: '',
  holder: '',
  bank: '',
  cuit: '',
};

export const GIFTCARDS = {
  enabled: true,
  amounts: [45000, 60000, 90000, 100000],
  min: 20000,
  validityDays: 180,
};

export const FAQ = [
  { q: '¿Cómo reservo un turno?', a: 'Tocá **Reservar**, elegí el servicio, el día y el horario libre y completá tus datos. Para confirmarlo pagás una seña con Mercado Pago y te llega la confirmación por email. Si preferís, escribinos por WhatsApp y lo coordinamos.' },
  { q: '¿Qué es el head spa?', a: 'Es un ritual de cuidado del cuero cabelludo y relajación: masaje capilar cervical y craneal, lavado profundo con agua tibia y productos naturales, aromaterapia y un secado suave. Sale con la cabeza liviana y el pelo limpio.' },
  { q: '¿Cuánto es la seña y cómo se paga?', a: 'La seña es un porcentaje del servicio y se descuenta del total. La pagás con **Mercado Pago** o por **transferencia**: con Mercado Pago el turno se confirma al instante; con transferencia te mostramos los datos y lo confirmamos apenas la recibimos. El resto lo pagás en la casa, el día del turno.' },
  { q: '¿Puedo reservar más de un servicio?', a: 'Sí. Después de elegir el primero tocá **Agregar otro servicio** y sumá el que quieras para el mismo día, por ejemplo un head spa y una manicuría. Pagás una sola seña por todo.' },
  { q: '¿Puedo cambiar o cancelar mi turno?', a: 'Sí. Hasta 24 horas antes podés cancelarlo desde el link del email de confirmación o escribirnos para pasarlo a otro día; la seña queda a cuenta del nuevo turno o te la devolvemos. Con menos de 24 horas de aviso la seña no se devuelve.' },
  { q: '¿Cómo funcionan las gift cards?', a: 'Elegís un monto o un ritual, la pagás online y te llega una tarjeta con un código. Quien la recibe lo escribe al reservar y se descuenta del total. Vale por 6 meses.' },
  { q: '¿Qué incluye la manicuría?', a: 'Todos los servicios incluyen exfoliación e hidratación de manos, café de cortesía, mensaje de oráculo y spa de manos.' },
  { q: '¿Hacen eventos privados?', a: 'Sí, **la terraza** se alquila para cumpleaños, celebraciones y encuentros. En el **patio** hacemos los eventos y talleres de la casa. Escribinos por WhatsApp y armamos la propuesta.' },
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
