import { AuthBranding } from "@/components/AuthBranding";
import { LoginForm } from "@/components/LoginForm";
import { getBranding } from "@/lib/branding";
import { getSignupSettings } from "@/lib/signupSettings";

export default async function LoginPage() {
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
