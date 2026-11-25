// La página del turnero (/turnos) es la misma que la web, con su propio título y descripción
// (lo que se ve al compartir el link, por ejemplo desde la bio de Instagram).
/** Páginas de gracias: misma página, con su título (y sin indexar). */
export function thanksPage(html, kind) {
  const t = kind === 'comprobante' ? '¡Gracias! Recibimos tu comprobante · Casa Samadhi' : '¡Gracias por reservar! · Casa Samadhi';
  return html.replace(/<title>[^<]*<\/title>/, `<title>${t}</title>`).replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<meta name="robots" content="noindex">');
}
export function turnosPage(html) {
  return html
    .replace(/<title>[^<]*<\/title>/, '<title>Reservá tu turno · Casa Samadhi</title>')
    .replace(/<meta name="description" content="[^"]*">/, '<meta name="description" content="Reservá tu turno en Casa Samadhi: head spa, masajes, manicuría y pedicuría en La Plata. Elegí el servicio, el día y el horario.">')
    .replace(/<meta property="og:title" content="[^"]*">/, '<meta property="og:title" content="Reservá tu turno · Casa Samadhi">')
    .replace(/<meta property="og:description" content="[^"]*">/, '<meta property="og:description" content="Head spa, masajes, manicuría y pedicuría en La Plata. Elegí el día y el horario.">');
}
