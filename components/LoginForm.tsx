"use client";

/* eslint-disable @next/next/no-html-link-for-pages -- Auth navigation must survive the production RSC Link failure. */
import { useRef, useState } from "react";
import { submitLogin } from "@/lib/loginClient";

export function LoginForm({
  signupEnabled,
  title,
  subtitle,
  buttonColor,
  primaryColor,
}: {
  signupEnabled: boolean;
  title?: string;
  subtitle?: string;
  buttonColor?: string;
  primaryColor?: string;
}) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const { redirect } = await submitLogin({ email: form.get("email"), password: form.get("password") });
      if (redirect === "/admin/master") {
        window.location.replace(redirect);
        return;
      }
      const cookieSlug = document.cookie.split("; ").find(value => value.startsWith("smartlink_claim="))?.split("=")[1];
      const slug = new URLSearchParams(window.location.search).get("slug") || cookieSlug || "";
      const target = slug && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(slug)
        ? `/admin/pages/new?slug=${encodeURIComponent(slug)}`
        : "/admin/dashboard";
      window.location.replace(target);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Sign in failed. Please try again.");
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }

  return (
    <>
      <h1>{title || "Sign in to dashboard"}</h1>
      <p className="authIntro">{subtitle || "Enter your administrator email and password."}</p>
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
        <button
          type="submit"
          disabled={loading}
          style={buttonColor || primaryColor ? { background: buttonColor || primaryColor } : undefined}
        >
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
