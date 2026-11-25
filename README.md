# Casa Samadhi · Café & Spa

Web de Casa Samadhi (Calle 47 N° 679, La Plata): head spa, masajes, manicuría, pedicuría, cafetería y eventos.
Mismo diseño que la tienda [Samadhi Style](https://github.com/dianaponce-ai/samadhi-store), con un botón para ir de una a la otra.

## Qué hace
- **Turnos online con seña**: la clienta elige servicio, día y horario libre, paga la seña con Mercado Pago y recibe la confirmación por email. Puede cancelar desde el link del email hasta 24 h antes.
- **Por WhatsApp**: los servicios sin precio fijo (por ejemplo, el alquiler de la terraza) se consultan con un botón que abre WhatsApp con el mensaje escrito.
- **Varios servicios en una reserva**: después de elegir el primero, "Agregar otro servicio" suma hasta 4 para el mismo día (por ejemplo head spa + manicuría), sin horarios superpuestos y con una sola seña.
- **Seña por Mercado Pago o transferencia**: con Mercado Pago se confirma sola al acreditarse. Con transferencia la clienta ve el alias/CBU (en la web y por email), el turno queda guardado (12 h por defecto, nunca después de 1 h antes del turno), avisa "Ya transferí" y el equipo la confirma desde el Resumen o el turno; ahí le llega la confirmación a la clienta y el aviso a la asesora. Datos bancarios en Panel → Configuración → Medios de pago.
- **Asesoras** (`/admin` → Asesoras, solo administración): ficha con datos personales, servicios que hace, acceso al panel y forma de pago (solo comisión, o básico + comisión). Los turnos se asignan solos a una asesora libre que haga el servicio (la clienta puede elegir con quién). Liquidación por mes: realizados, comisión ganada, básico, a cobrar y lo que viene. El porcentaje queda fijo en cada turno al realizarse.
- **Usuario de asesora**: entra en `/admin` y ve solo sus turnos (sin el email de la clienta), su agenda, los servicios que hace con su comisión y sus comisiones del mes. Puede cancelar un turno suyo con motivo; le llega a la clienta y al equipo.
- **Historial de cambios** (solo administración): quién hizo qué y cuándo — turnos cargados, cancelados, movidos o reasignados, transferencias confirmadas, precios, asesoras y configuración. También aparece en cada turno y en cada asesora.
- **Gift cards**: se compran online (un ritual o un monto), llegan por email con un código y se usan al reservar. También se pueden emitir en la casa desde el panel.
- **Mi cuenta**: las clientas se registran, ven sus próximos turnos, el historial y sus gift cards, cancelan y reservan de nuevo con los datos ya cargados. La web las recuerda: saluda por el nombre, muestra la última visita y el tratamiento favorito, ofrece "Repetir" lo último y completa la reserva con sus datos y lo que contaron la vez anterior (alergias, preferencias).
- **Clientas (CRM)**: ficha de cada clienta con nombre y apellido, celular, correo, cumpleaños, dónde vive, fotos de antes y después, visitas, gasto, ticket promedio, cada cuántos días vuelve, última visita y próximo turno, tratamientos que más hace, gift cards e historial completo. El equipo carga etiquetas (VIP, Frecuente, Sensible…), preferencias y notas internas, y puede dar de alta clientas que todavía no reservaron. Lo que la clienta carga en Mi cuenta (cumpleaños, dónde vive) queda en su ficha. Cada asesora ve sus clientas y les suma fotos. Filtros por frecuentes, nuevas, sin venir hace 60+ días y cumpleaños del mes, y WhatsApp directo desde la ficha.
- **Caja y facturación** (Panel → Administración): facturación del día por medio de pago (señas online, gift cards, cobros en la casa, ingresos y egresos cargados a mano), saldos por cobrar de los turnos del día, efectivo en caja y **cierre de caja** (efectivo contado, diferencia, retiro y fondo para el día siguiente). Facturación de los últimos 14 días. Solo administración reabre una caja cerrada. Desde cada turno se registra el cobro del saldo.
- **Horarios**: Panel → Turnos y servicios → Horarios y bloqueos es el horario general de la casa (días y franjas, cierres y salas), con un resumen de cuándo atiende cada asesora. Cada asesora carga sus días y horarios y sus días libres en **Mis días y horarios** (o administración desde su ficha). El turnero solo ofrece un horario si la casa está abierta y alguna asesora que hace el servicio trabaja y está libre; si alguien marca un día libre con turnos tomados, el panel los lista para reprogramarlos.
- **Páginas de gracias** (para medir conversiones): `/gracias-turno` al reservar (o al volver de pagar la seña) y `/gracias-comprobante` al subir el comprobante de la transferencia. Disparan los eventos del Meta Pixel `Schedule` y `ComprobanteEnviado`. El código del turno no va en la dirección.
- **Comprobante de transferencia**: la clienta lo sube (foto o PDF) desde la página del turno; queda en el turno del panel.
- **Integración con Nifty** (Configuración): cada turno nuevo o que cambia se manda al embudo de Casa Samadhi en Nifty, firmado con la clave del cliente y sin datos de las clientas, con el canal de origen (Meta, Google u Otro, según los UTM, fbclid o gclid con los que llegó). Se envía cada minuto, con reintentos.
- **Turnos en el calendario**: la página del turno y los emails traen Agregar a Google Calendar y el archivo .ics (Apple, Outlook). Desde el link del email la clienta cambia el día u horario o cancela.
- **Panel** (`/admin`, o desde el ícono de la persona en la web): menú a la izquierda en tres secciones — **Turnos** (agenda, turnos, horarios y bloqueos, servicios, gift cards, eventos), **CRM** (clientas, emails, arrepentimientos) y **Administración** (resumen, caja y facturación, asesoras de belleza, usuarios, textos de la web, configuración, historial).
- **Roles**: **Web master** y **Administración** ven todo; **Recepción** ve turnos, agenda, clientas, servicios, horarios, gift cards, eventos y la caja; cada **Asesora de belleza** ve sus turnos, sus clientas y sus comisiones. En Usuarios se crean todos los que hagan falta de cada rol (solo un web master crea otro web master). El web master (diana@nifty-agency.com) se crea sin contraseña: la define con "¿Olvidaste tu contraseña?", con `WEBMASTER_PASSWORD` en el `.env` o con `npm run create-admin`.
- **Avisos automáticos**: confirmación, recordatorio 24 h antes, cancelación, gift card comprada y recibida.
- Legales argentinos: Botón de arrepentimiento, leyenda AAIP y enlace a Defensa del Consumidor.

## Usuarios de prueba
| Rol | Email | Contraseña |
|---|---|---|
| Web master | webmaster@casasamadhi.demo | WebMaster.Samadhi26 |
| Administración | admin@casasamadhi.demo | CasaSamadhi.Admin26 |
| Recepción | recepcion@casasamadhi.demo | CasaSamadhi.Recep26 |
| Asesora de belleza | asesora@casasamadhi.demo | Asesora.Samadhi26 |
| Clienta | clienta@casasamadhi.demo | Clienta.Samadhi26 |

Se ingresa desde el ícono de la persona (**Mi cuenta**). Si alguien se olvida la contraseña (clienta o equipo), pide un link por email que vale 1 hora y se usa una sola vez: la clienta ve sus turnos y gift cards; el equipo entra al panel. También en `/admin`.
En la demo de Vercel ya vienen cargados. En el servidor real se crean con `npm run demo-users` y **se borran antes de abrir al público** con `npm run demo-users -- --borrar`.

## Probarlo en tu compu
```bash
npm install
cp .env.example .env   # completá ADMIN_EMAIL y ADMIN_PASSWORD
npm start              # http://localhost:3001 y el panel en /admin
```
Sin `MP_ACCESS_TOKEN` los pagos son simulados; sin `SMTP_URL` los emails no salen pero se ven en el panel (sección Emails).

## Publicarlo
- **Demo en Vercel** (lo que se ve en `casa-samadhi.vercel.app`): importá el repo en Vercel y dejá todo como viene; lee `vercel.json`. Es una versión de muestra que guarda los datos en el navegador, con pagos simulados y un acceso al panel en el pie.
- **Versión real**: necesita un servidor Node 22 con disco (Railway, Render, un VPS…) porque guarda los turnos en `data/casa-samadhi.db`. Completá el `.env`, configurá en Mercado Pago el webhook `PUBLIC_URL/api/webhooks/mp` (evento Pagos) y hacé copias de seguridad de la carpeta `data`.

## Para revisar antes de abrir
- Horarios de atención (vienen de lunes a sábado de 10 a 19): Panel → Horarios y bloqueos.
- Duraciones de los servicios que no figuraban en Instagram (manicuría): Panel → Servicios.
- Porcentaje de seña (30%) y política de cancelación (24 h): Panel → Configuración.
- Razón social y CUIT en los términos: Panel → Textos de la web.
- Alias o CBU para las transferencias: Panel → Configuración → Medios de pago (sin eso, la web solo ofrece Mercado Pago).
- Cargar las asesoras con sus servicios y comisiones: Panel → Asesoras.
- La dirección de la tienda para el botón "Tienda": Panel → Configuración.
