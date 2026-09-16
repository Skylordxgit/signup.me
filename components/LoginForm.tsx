"use client";

/* eslint-disable @next/next/no-html-link-for-pages -- Auth navigation must survive the production RSC Link failure. */
import { useState } from "react";

export function LoginForm({ signupEnabled }: { signupEnabled: boolean }) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: form.get("email"),
        password: form.get("password"),
      }),
    });

    if (response.ok) {
      // A master admin session has no workspace, so it goes to its own area.
      const { redirect } = (await response.json()) as { redirect?: string };
      if (redirect === "/admin/master") {
        window.location.href = redirect;
        return;
      }
      const cookieSlug = document.cookie.split("; ").find(value => value.startsWith("smartlink_claim="))?.split("=")[1];
      const slug = new URLSearchParams(window.location.search).get("slug") || cookieSlug || "";
      window.location.href = slug && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(slug)
        ? `/admin?slug=${encodeURIComponent(slug)}`
        : "/admin";
      return;
    }

    const data = (await response.json()) as { error?: string };
    setError(data.error || "Login failed");
    setLoading(false);
  }

  return (
    <>
      <h1>Sign in to dashboard</h1>
      <p className="authIntro">Enter your administrator email and password.</p>
      <form className="authEmailForm" onSubmit={submit}>
        <label>
          <span>Email address</span>
          <input name="email" type="email" autoComplete="username" placeholder="admin@example.com" required />
        </label>
        <label>
          <span>Password</span>
          <input name="password" type="password" autoComplete="current-password" placeholder="Enter your password" required />
        </label>
        {error && <span className="formError" role="alert">{error}</span>}
        <button type="submit" disabled={loading}>
          {loading ? "Signing in..." : "Sign in"}
        </button>
        {signupEnabled && (
          <p className="authFooter">
            Don&apos;t have an account? <a className="authSignupButton" href="/admin/signup">Sign up</a>
          </p>
        )}
      </form>
    </>
  );
}
