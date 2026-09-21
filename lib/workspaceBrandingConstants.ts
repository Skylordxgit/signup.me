import { defaultBranding } from './brandingConstants';
import { DEFAULT_WORKSPACE_ID } from './workspaceConstants';

export type WorkspaceBranding = {
  id?: number;
  workspaceId: string;
  workspaceName: string;
  siteTitle: string;
  metaDescription: string;
  logoUrl: string;
  faviconUrl: string;
  loginLogoUrl: string;
  loginBackgroundUrl: string;
  loginTitle: string;
  loginSubtitle: string;
  primaryColor: string;
  secondaryColor: string;
  buttonColor: string;
  linkColor: string;
  footerText: string;
  createdAt?: string;
  updatedAt?: string;
};

export type WorkspaceBrandingInput = Partial<Omit<WorkspaceBranding, 'id' | 'workspaceId' | 'createdAt' | 'updatedAt'>>;

export function defaultWorkspaceBranding(workspaceId: string = DEFAULT_WORKSPACE_ID, workspaceName?: string): WorkspaceBranding {
  const name = (workspaceName || '').trim() || (workspaceId === DEFAULT_WORKSPACE_ID ? defaultBranding.name : 'My Workspace');
  return {
    workspaceId,
    workspaceName: name,
    siteTitle: `${name} - Links & Pages`,
    metaDescription: `Discover all links, announcements, and updates from ${name}.`,
    logoUrl: defaultBranding.logo,
    faviconUrl: defaultBranding.favicon,
    loginLogoUrl: '',
    loginBackgroundUrl: '',
    loginTitle: `Sign in to ${name}`,
    loginSubtitle: 'Enter your credentials to access your dashboard.',
    primaryColor: '#2465d7',
    secondaryColor: '#3b82f6',
    buttonColor: '#2465d7',
    linkColor: '#2465d7',
    footerText: '',
  };
}
