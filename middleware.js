/** Redirect hosts legados → canônico dopraxis.app. */
export const config = {
  matcher: '/:path*',
};

const CANONICAL_HOST = 'dopraxis.app';

const LEGACY_HOSTS = new Set([
  'forja-do-jota.vercel.app',
  'www.forja-do-jota.vercel.app',
  'praxis-jota.vercel.app',
  'www.praxis-jota.vercel.app',
  'dopraxis.vercel.app',
  'www.dopraxis.app',
]);

export default function middleware(request) {
  const host = (request.headers.get('host') || '').split(':')[0].toLowerCase();
  if (!LEGACY_HOSTS.has(host)) return;
  // Enquanto DNS de dopraxis.app não estiver no ar, não redirecionar
  // hosts *.vercel.app que ainda servem o app (evita loop/quebrar prod).
  // www.dopraxis.app → apex quando o custom domain estiver ativo.
  if (host === 'www.dopraxis.app') {
    const url = new URL(request.url);
    url.hostname = CANONICAL_HOST;
    url.protocol = 'https:';
    return Response.redirect(url, 308);
  }
}
