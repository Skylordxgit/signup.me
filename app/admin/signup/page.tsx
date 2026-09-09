"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import Link from "next/link";

type Branding = { name: string; logo: string };
const fallbackBranding: Branding = { name: "signup888", logo: "/signup888-logo.png" };

export default function SignupPage() {
  const [branding, setBranding] = useState<Branding>(fallbackBranding);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/branding", { cache: "no-store" })
      .then(async response => response.ok ? await response.json() as Partial<Branding> : null)
      .then((data: Partial<Branding> | null) => {
        if (!cancelled && data?.name && data.logo) setBranding({ name: data.name, logo: data.logo });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);

    const response = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: form.get("email"),
        password: form.get("password"),
        name: form.get("name"),
      }),
    });

    if (response.ok) {
      // The signup response already set the session, so go straight in.
      window.location.href = "/admin";
      return;
    }

    const data = (await response.json()) as { error?: string };
    setError(data.error || "Could not create the account.");
    setLoading(false);
  }

  return (
    <main className="authShell">
      <div className="authBrandRow">
        <img className="authBrandLogo" src={branding.logo} alt="" width={42} height={42} />
        <strong>{branding.name}</strong>
      </div>

      <section className="authCard">
        <h1>Create account</h1>
        <form className="authEmailForm" onSubmit={submit}>
          <input name="name" type="text" maxLength={120} placeholder="Your name (optional)" autoComplete="name" />
          <input name="email" type="email" maxLength={190} placeholder="you@example.com" autoComplete="email" required />
          <input name="password" type="password" minLength={8} maxLength={128} placeholder="Password (at least 8 characters)" autoComplete="new-password" required />
          {error && <span className="formError">{error}</span>}
          <button type="submit" disabled={loading}>{loading ? "Creating account..." : "Create account"}</button>
          <small>
            You get your own workspace. If a team already invited this email,
            you join that workspace instead.
          </small>
        </form>
        <p className="authFooter">
          Already have an account? <Link className="authLink" href="/admin/login">Login</Link>
        </p>
      </section>
    </main>
  );
}
