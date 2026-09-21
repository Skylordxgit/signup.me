import { resolvePublicHost } from '@/lib/domainRouting';
import { getPublicPageBySlug } from '@/lib/store';
import { isValidSlug } from '@/lib/utils';

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const host = await resolvePublicHost(request.headers.get('host'));
  const page = host.kind !== 'unknown' && host.kind !== 'master' && isValidSlug(slug) ? await getPublicPageBySlug(slug, host.kind === 'custom' ? host.workspaceId : undefined) : null;
  if (!page) return new Response('Page not found', { status: 404 });
  return Response.json({
    id: `/${page.slug}`,
    name: page.title || page.name,
    short_name: (page.title || page.name).slice(0, 30),
    start_url: host.kind === 'custom' ? '/' : `/${page.slug}`,
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#2465d7',
    icons: [{ src: '/favicon.png', sizes: '512x512', type: 'image/png', purpose: 'any' }],
  }, { headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'no-cache' } });
}
