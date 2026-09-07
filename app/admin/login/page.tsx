"use client";

import { useState } from "react";

export default function LoginPage() {
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
      window.location.href = "/admin";
      return;
    }

    const data = await response.json();
    setError(data.error || "Login failed");
    setLoading(false);
  }

  return (
    <main className="loginShell">
      <form className="loginCard" onSubmit={submit}>
        <div className="brandMark">SL</div>
        <p>Admin only</p>
        <h1>Sign in to manage public pages.</h1>
        <input name="email" type="email" placeholder="admin@example.com" required />
        <input name="password" type="password" placeholder="Password" required />
        {error && <span className="formError">{error}</span>}
        <button type="submit" disabled={loading}>
          {loading ? "Signing in..." : "Login"}
        </button>
        <small>Demo login: admin@example.com / admin123</small>
      </form>
    </main>
  );
}
