"use client";

import { useState } from "react";
import { submitSignup } from "@/lib/signupClient";

export function SignupForm() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
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
    <>
      <h1>Create account</h1>
      <form className="authEmailForm" onSubmit={submit}>
        <input name="name" type="text" maxLength={120} placeholder="Your name (optional)" autoComplete="name" />
        <input name="email" type="email" maxLength={190} placeholder="you@example.com" autoComplete="email" required />
        <input name="password" type="password" minLength={8} maxLength={128} placeholder="Password (at least 8 characters)" autoComplete="new-password" required />
        {error && <span className="formError" role="alert">{error}</span>}
        <button type="submit" disabled={loading}>{loading ? "Creating account..." : "Create account"}</button>
        <small>
          You get your own workspace. If a team already invited this email,
          you join that workspace instead.
        </small>
      </form>
    </>
  );
}
