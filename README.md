# Casa Samadhi · Café & Spa

Web de Casa Samadhi (Calle 47 N° 679, La Plata): head spa, masajes, manicuría, terapias, cafetería y eventos.
Mismo diseño que la tienda [Samadhi Style](https://github.com/dianaponce-ai/samadhi-store), con un botón para ir de una a la otra.

## Qué hace
- **Turnos online con seña**: la clienta elige servicio, día y horario libre, paga la seña con Mercado Pago y recibe la confirmación por email. Puede cancelar desde el link del email hasta 24 h antes.
- **Por WhatsApp**: las terapias sin precio fijo (Reiki, Barras de Access, armonización, tarot) se consultan con un botón que abre WhatsApp con el mensaje escrito.
- **Gift cards**: se compran online (un ritual o un monto), llegan por email con un código y se usan al reservar. También se pueden emitir en la casa desde el panel.
- **Panel** (`/admin`): agenda por día y por espacio, turnos, clientas, servicios y precios, horarios y bloqueos (feriados, vacaciones), gift cards, eventos, textos, emails, arrepentimientos y usuarios (Administración y Recepción).
- **Avisos automáticos**: confirmación, recordatorio 24 h antes, cancelación, gift card comprada y recibida.
- Legales argentinos: Botón de arrepentimiento, leyenda AAIP y enlace a Defensa del Consumidor.

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
- Duraciones de los servicios que no figuraban en Instagram (masoterapia y manicuría): Panel → Servicios.
- Porcentaje de seña (30%) y política de cancelación (24 h): Panel → Configuración.
- Razón social y CUIT en los términos: Panel → Textos de la web.
- La dirección de la tienda para el botón "Tienda": Panel → Configuración.
