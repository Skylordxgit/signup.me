"use client";

/* eslint-disable @next/next/no-html-link-for-pages -- Keep the return to login independent of RSC navigation too. */
import { useEffect, useState } from "react";
import { AuthBranding } from "@/components/AuthBranding";
import { submitSignup } from "@/lib/signupClient";

export default function SignupPage() {
  const [enabled, setEnabled] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/signup")
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        if (!cancelled && data && typeof data === "object" && "enabled" in data && data.enabled === false) setEnabled(false);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || !enabled) return;
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);

    try {
      await submitSignup({
        email: form.get("email"),
        password: form.get("password"),
        name: form.get("name"),
      });
      // The signup response already set the session, so go straight in.
      window.location.href = "/admin";
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not create the account. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="authShell">
      <AuthBranding />

      <section className="authCard">
        <h1>Create account</h1>
        <form className="authEmailForm" onSubmit={submit}>
          <input name="name" type="text" maxLength={120} placeholder="Your name (optional)" autoComplete="name" disabled={!enabled} />
          <input name="email" type="email" maxLength={190} placeholder="you@example.com" autoComplete="email" required disabled={!enabled} />
          <input name="password" type="password" minLength={8} maxLength={128} placeholder="Password (at least 8 characters)" autoComplete="new-password" required disabled={!enabled} />
          {!enabled && <span className="formError" role="status">Signup is currently turned off. Please contact the administrator.</span>}
          {error && <span className="formError" role="alert">{error}</span>}
          <button type="submit" disabled={loading || !enabled}>{loading ? "Creating account..." : "Create account"}</button>
          <small>
            You get your own workspace. If a team already invited this email,
            you join that workspace instead.
          </small>
        </form>
        <p className="authFooter">
          Already have an account? <a className="authLink" href="/admin/login">Login</a>
        </p>
      </section>
    </main>
  );
}
