import { AuthBranding } from "@/components/AuthBranding";
import { LoginForm } from "@/components/LoginForm";
import { getBranding } from "@/lib/branding";
import { resolveCurrentHost } from "@/lib/domainRouting";
import { getSignupSettings } from "@/lib/signupSettings";
import { getCachedWorkspaceBranding } from "@/lib/workspaceBranding";

export default async function LoginPage() {
  const host = await resolveCurrentHost();
  if (host.kind === 'custom' && host.workspaceId) {
    const ws = await getCachedWorkspaceBranding(host.workspaceId);
    return (
      <main
        className="authShell"
        style={{
          backgroundImage: ws.loginBackgroundUrl ? `url(${ws.loginBackgroundUrl})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          ['--c-accent' as string]: ws.primaryColor,
        }}
      >
        <AuthBranding name={ws.workspaceName} logo={ws.loginLogoUrl || ws.logoUrl} />

        <section className="authCard">
          <LoginForm
            signupEnabled={false}
            title={ws.loginTitle}
            subtitle={ws.loginSubtitle}
            buttonColor={ws.buttonColor}
            primaryColor={ws.primaryColor}
          />
        </section>
      </main>
    );
  }

  const [branding, signup] = await Promise.all([getBranding(), getSignupSettings()]);

  return (
    <main className="authShell">
      <AuthBranding />

      <section className="authCard">
        <LoginForm signupEnabled={branding.signupEnabled && signup.enabled} />
      </section>
    </main>
  );
}
