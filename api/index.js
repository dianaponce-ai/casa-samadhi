// Vercel: el servidor de Casa Samadhi como función. Atiende /api/* y /uploads/* (ver vercel.json);
// la web, el turnero, las páginas de gracias y el panel son archivos que arma `npm run build:vercel`.
// Necesita la base de datos (DATABASE_URL o POSTGRES_URL, la que crea Supabase al conectarlo desde Vercel).
let app = null;

export default async function handler(req, res) {
  if (!(process.env.DATABASE_URL || process.env.POSTGRES_URL)) {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ error: 'Falta conectar la base de datos (Supabase) en Vercel.' }));
  }
  // Si Vercel entrega la dirección reescrita (/api?__route=…), se recupera la original.
  const u = new URL(req.url, 'http://x');
  const route = u.searchParams.get('__route');
  if (route !== null) { u.searchParams.delete('__route'); req.url = '/' + route.replace(/^\/+/, '') + (u.search || ''); }
  try {
    app ||= (await import('../server/index.js')).app;
  } catch (e) {
    console.error('No arrancó el servidor:', e);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ error: 'No pudimos conectar con la base de datos. Probá de nuevo en un momento.' }));
  }
  return app(req, res);
}
