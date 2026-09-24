import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultWorkspaceBranding,
  getCachedWorkspaceBranding,
  getWorkspaceBranding,
  invalidateWorkspaceBranding,
  normalizeWorkspaceBranding,
  resetWorkspaceBranding,
  resolveEffectivePageBranding,
  saveWorkspaceBranding,
} from '../lib/workspaceBranding';
import { defaultBranding, getBranding } from '../lib/branding';
import type { SmartPage } from '../lib/types';
import { defaultTheme } from '../lib/defaults';

test('each workspace gets its own isolated branding settings', async () => {
  const wsA = 'ws-test-alpha-' + Date.now();
  const wsB = 'ws-test-beta-' + Date.now();

  // Initially, both workspaces return defaults based on their ID
  const initialA = await getWorkspaceBranding(wsA);
  const initialB = await getWorkspaceBranding(wsB);
  assert.equal(initialA.workspaceId, wsA);
  assert.equal(initialB.workspaceId, wsB);

  // Save branding for Workspace A
  const savedA = await saveWorkspaceBranding(wsA, {
    workspaceName: 'Brand Alpha',
    siteTitle: 'Brand Alpha Portal',
    metaDescription: 'Official Brand Alpha bio links',
    logoUrl: 'https://alpha.example.com/logo.png',
    faviconUrl: 'https://alpha.example.com/favicon.ico',
    loginTitle: 'Sign in to Alpha',
    loginSubtitle: 'Alpha team portal',
    primaryColor: '#e11d48',
    secondaryColor: '#f43f5e',
    buttonColor: '#be123c',
    linkColor: '#e11d48',
    footerText: '© 2026 Alpha Inc.',
  });

  assert.equal(savedA.workspaceName, 'Brand Alpha');
  assert.equal(savedA.primaryColor, '#e11d48');
  assert.equal(savedA.buttonColor, '#be123c');

  // Save branding for Workspace B with completely different values
  const savedB = await saveWorkspaceBranding(wsB, {
    workspaceName: 'Brand Beta',
    siteTitle: 'Brand Beta Hub',
    metaDescription: 'Official Brand Beta bio links',
    logoUrl: 'https://beta.example.com/logo.png',
    faviconUrl: 'https://beta.example.com/favicon.ico',
    loginTitle: 'Sign in to Beta',
    loginSubtitle: 'Beta workspace only',
    primaryColor: '#059669',
    secondaryColor: '#10b981',
    buttonColor: '#047857',
    linkColor: '#059669',
    footerText: '© 2026 Beta LLC.',
  });

  assert.equal(savedB.workspaceName, 'Brand Beta');
  assert.equal(savedB.primaryColor, '#059669');

  // Verify Workspace A branding did NOT leak or change Workspace B
  const fetchedA = await getWorkspaceBranding(wsA);
  const fetchedB = await getWorkspaceBranding(wsB);

  assert.equal(fetchedA.workspaceName, 'Brand Alpha');
  assert.equal(fetchedA.siteTitle, 'Brand Alpha Portal');
  assert.equal(fetchedA.primaryColor, '#e11d48');
  assert.equal(fetchedA.buttonColor, '#be123c');
  assert.equal(fetchedA.footerText, '© 2026 Alpha Inc.');

  assert.equal(fetchedB.workspaceName, 'Brand Beta');
  assert.equal(fetchedB.siteTitle, 'Brand Beta Hub');
  assert.equal(fetchedB.primaryColor, '#059669');
  assert.equal(fetchedB.buttonColor, '#047857');
  assert.equal(fetchedB.footerText, '© 2026 Beta LLC.');

  // Confirm Global Master branding remains untouched
  const masterBrand = await getBranding();
  assert.equal(masterBrand.name, defaultBranding.name);
});

test('workspace branding caching and invalidation work seamlessly', async () => {
  const wsId = 'ws-cache-test-' + Date.now();

  await saveWorkspaceBranding(wsId, {
    workspaceName: 'Initial Cache Name',
    primaryColor: '#1e40af',
  });

  // Cached read
  const cached1 = await getCachedWorkspaceBranding(wsId);
  assert.equal(cached1.workspaceName, 'Initial Cache Name');

  // Update branding and verify cache updates immediately
  await saveWorkspaceBranding(wsId, {
    workspaceName: 'Updated Cache Name',
    primaryColor: '#7c3aed',
  });

  const cached2 = await getCachedWorkspaceBranding(wsId);
  assert.equal(cached2.workspaceName, 'Updated Cache Name');
  assert.equal(cached2.primaryColor, '#7c3aed');
});

test('page-specific settings override workspace branding defaults correctly', () => {
  const wsBranding = normalizeWorkspaceBranding({
    workspaceId: 'ws-override-test',
    workspaceName: 'Acme Corp',
    siteTitle: 'Acme Corp Default Site Title',
    metaDescription: 'Acme Corp Default Meta Description',
    logoUrl: 'https://acme.com/default-logo.png',
    faviconUrl: 'https://acme.com/default-favicon.ico',
    buttonColor: '#2563eb',
    footerText: '© Acme Corp',
  });

  const pageWithOverrides: SmartPage = {
    id: 1,
    workspaceId: 'ws-override-test',
    slug: 'promo',
    name: 'Special Promo',
    title: 'Special Summer Offer',
    bio: 'Custom page bio',
    profileImage: 'https://acme.com/custom-profile.png',
    logoImage: 'https://acme.com/custom-logo.png',
    status: 'published',
    theme: {
      ...defaultTheme,
      buttonBackground: '#dc2626',
      footerText: 'Custom Page Footer',
    },
    seo: {
      seoTitle: 'Custom SEO Title',
      metaDescription: 'Custom SEO Description',
      favicon: 'https://acme.com/custom-favicon.ico',
      ogImage: 'https://acme.com/custom-og.png',
    },
    integrations: {},
    views: 0,
    uniqueVisitors: 0,
    blocks: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const effectiveOverrides = resolveEffectivePageBranding(pageWithOverrides, wsBranding);
  assert.equal(effectiveOverrides.siteTitle, 'Custom SEO Title');
  assert.equal(effectiveOverrides.metaDescription, 'Custom SEO Description');
  assert.equal(effectiveOverrides.logoImage, 'https://acme.com/custom-logo.png');
  assert.equal(effectiveOverrides.favicon, 'https://acme.com/custom-favicon.ico');
  assert.equal(effectiveOverrides.buttonColor, '#dc2626');
  assert.equal(effectiveOverrides.footerText, 'Custom Page Footer');

  // Page without overrides inherits workspace defaults
  const pageWithoutOverrides: SmartPage = {
    id: 2,
    workspaceId: 'ws-override-test',
    slug: 'standard',
    name: 'Standard Page',
    title: '',
    bio: '',
    profileImage: '',
    logoImage: '',
    status: 'published',
    theme: {
      ...defaultTheme,
      buttonBackground: '',
      footerText: '',
    },
    seo: {
      seoTitle: '',
      metaDescription: '',
      favicon: '',
      ogImage: '',
    },
    integrations: {},
    views: 0,
    uniqueVisitors: 0,
    blocks: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const effectiveInherited = resolveEffectivePageBranding(pageWithoutOverrides, wsBranding);
  assert.equal(effectiveInherited.siteTitle, 'Standard Page'); // Falls back to page.name or ws.siteTitle
  assert.equal(effectiveInherited.metaDescription, 'Acme Corp Default Meta Description');
  assert.equal(effectiveInherited.logoImage, 'https://acme.com/default-logo.png');
  assert.equal(effectiveInherited.favicon, 'https://acme.com/default-favicon.ico');
  assert.equal(effectiveInherited.buttonColor, '#2563eb');
  assert.equal(effectiveInherited.footerText, '© Acme Corp');
});

test('reset workspace branding restores defaults for that workspace only', async () => {
  const ws1 = 'ws-reset-1-' + Date.now();
  const ws2 = 'ws-reset-2-' + Date.now();

  await saveWorkspaceBranding(ws1, { workspaceName: 'Custom 1', primaryColor: '#111111' });
  await saveWorkspaceBranding(ws2, { workspaceName: 'Custom 2', primaryColor: '#222222' });

  // Reset WS1
  const reset1 = await resetWorkspaceBranding(ws1);
  assert.equal(reset1.primaryColor, '#2465d7'); // restored default

  // WS2 remains intact
  const fetched2 = await getWorkspaceBranding(ws2);
  assert.equal(fetched2.workspaceName, 'Custom 2');
  assert.equal(fetched2.primaryColor, '#222222');
});
