import { getPublicPageBySlug } from '@/lib/store';
import { isValidSlug } from '@/lib/utils';

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = isValidSlug(slug) ? await getPublicPageBySlug(slug) : null;
  if (!page) return new Response('Page not found', { status: 404 });
  return Response.json({
    id: `/${page.slug}`,
    name: page.title || page.name,
    short_name: (page.title || page.name).slice(0, 30),
    start_url: `/${page.slug}`,
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#2465d7',
    icons: [{ src: '/favicon.png', sizes: '512x512', type: 'image/png', purpose: 'any' }],
  }, { headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'no-cache' } });
}
