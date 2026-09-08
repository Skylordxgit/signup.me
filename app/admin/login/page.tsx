"use client";

import { useState } from "react";
import { Mail } from "lucide-react";

type LoginView = "options" | "email";

export default function LoginPage() {
  const [view, setView] = useState<LoginView>("options");
  const [notice, setNotice] = useState("");
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
    <main className="authShell">
      <div className="authBrandRow">
        <div className="authBrandMark">SL</div>
        <strong>SmartLink</strong>
      </div>

      <section className="authCard">
        <h1>Authorization</h1>

        {view === "options" && (
          <>
            <div className="authOptions">
              <button
                type="button"
                className="authOptionButton authOptionGoogle"
                onClick={() => setNotice("Google sign-in isn't configured yet.")}
              >
                <span className="authOptionIcon authOptionIconLight" aria-hidden="true">
                  <GoogleGlyph />
                </span>
                Login with Google
              </button>
              <button
                type="button"
                className="authOptionButton authOptionApple"
                onClick={() => setNotice("Apple sign-in isn't configured yet.")}
              >
                <span className="authOptionIcon authOptionIconDark" aria-hidden="true">
                  <AppleGlyph />
                </span>
                Login with Apple
              </button>
              <button type="button" className="authOptionButton authOptionEmail" onClick={() => setView("email")}>
                <span className="authOptionIcon authOptionIconOutline" aria-hidden="true">
                  <Mail size={16} />
                </span>
                Login with Email
              </button>
            </div>
            {notice && <p className="authNotice">{notice}</p>}
            <p className="authFooter">
              Don&apos;t have account?{" "}
              <button type="button" className="authLink" onClick={() => setNotice("Contact your administrator for access.")}>
                Sign Up
              </button>
            </p>
          </>
        )}

        {view === "email" && (
          <form className="authEmailForm" onSubmit={submit}>
            <input name="email" type="email" placeholder="admin@example.com" required />
            <input name="password" type="password" placeholder="Password" required />
            {error && <span className="formError">{error}</span>}
            <button type="submit" disabled={loading}>
              {loading ? "Signing in..." : "Login"}
            </button>
            <button type="button" className="authLink authBackLink" onClick={() => setView("options")}>
              Back
            </button>
            <small>Demo login: admin@example.com / admin123</small>
          </form>
        )}
      </section>
    </main>
  );
}

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.5 0 10.4-1.9 14.3-5.1l-6.6-5.6C29.6 35 26.9 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.6 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.6 5.6C41.7 35.9 44 30.3 44 24c0-1.3-.1-2.7-.4-3.5z" />
    </svg>
  );
}

function AppleGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
      <path d="M16.365 1.43c0 1.14-.42 2.05-1.05 2.76-.72.82-1.87 1.45-2.9 1.36-.13-1.1.42-2.24 1.06-2.95.71-.8 1.96-1.4 2.89-1.17zm2.86 16.14c-.42.95-.62 1.37-1.16 2.21-.75 1.16-1.81 2.6-3.12 2.61-1.16.01-1.46-.75-3.03-.74-1.57.01-1.9.76-3.06.75-1.31-.01-2.31-1.31-3.06-2.47-2.1-3.24-2.32-7.04-1.02-9.06.92-1.44 2.38-2.28 3.75-2.28 1.4 0 2.28.77 3.44.77 1.12 0 1.8-.77 3.42-.77 1.22 0 2.52.66 3.44 1.8-3.03 1.66-2.54 5.98.4 7.18z" />
    </svg>
  );
}
