"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";

export default function SignupPage() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
        <Image className="authBrandLogo" src="/signup888-logo.png" alt="" width={42} height={42} priority />
        <strong>signup888</strong>
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
