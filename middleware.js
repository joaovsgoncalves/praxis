/** Redirect legado forja-do-jota → praxis-jota (onda 20). */
export const config = {
  matcher: '/:path*',
};

export default function middleware(request) {
  const host = request.headers.get('host') || '';
  if (host === 'forja-do-jota.vercel.app' || host === 'www.forja-do-jota.vercel.app') {
    const url = new URL(request.url);
    url.hostname = 'praxis-jota.vercel.app';
    url.protocol = 'https:';
    return Response.redirect(url, 308);
  }
}