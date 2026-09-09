/* eslint-disable @next/next/no-html-link-for-pages -- Keep auth navigation independent of the production RSC Link path. */
import { AuthBranding } from "@/components/AuthBranding";
import { SignupForm } from "@/components/SignupForm";
import { getBranding } from "@/lib/branding";

export default async function SignupPage() {
  const branding = await getBranding();

  return (
    <main className="authShell">
      <AuthBranding />

      <section className="authCard">
        {branding.signupEnabled ? (
          <SignupForm />
        ) : (
          <>
            <h1>Signup is closed</h1>
            <p className="authNotice">New account creation is currently turned off.</p>
          </>
        )}
        <p className="authFooter">
          Already have an account? <a className="authLink" href="/admin/login">Login</a>
        </p>
      </section>
    </main>
  );
}
