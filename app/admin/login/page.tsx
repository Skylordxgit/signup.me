import { AuthBranding } from "@/components/AuthBranding";
import { LoginForm } from "@/components/LoginForm";
import { getBranding } from "@/lib/branding";

export default async function LoginPage() {
  const branding = await getBranding();

  return (
    <main className="authShell">
      <AuthBranding />

      <section className="authCard">
        <LoginForm signupEnabled={branding.signupEnabled} />
      </section>
    </main>
  );
}
