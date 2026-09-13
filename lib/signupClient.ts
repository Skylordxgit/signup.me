// Client-only request handling; do not import the server signup/auth modules here.
export async function submitSignup(input: { email: unknown; password: unknown; name?: unknown; token?: string }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    let response: Response;
    try {
      response = await fetch(input.token !== undefined ? '/api/auth/invite' : '/api/auth/signup', {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        credentials: "same-origin",
        signal: controller.signal,
        body: JSON.stringify(input),
      });
    } catch {
      throw new Error(controller.signal.aborted
        ? "Signup took too long. Try signing in with this email first; if no account was created, try again."
        : "Could not connect. Check your connection and try again.");
    }

    // A hosting challenge or proxy error may be HTML, even with a 200 status.
    const data: unknown = await response.json().catch(() => null);
    if (!data || typeof data !== "object") {
      throw new Error("Could not confirm signup. Try signing in with this email, or refresh and try again.");
    }
    if (!response.ok || !("ok" in data) || data.ok !== true) {
      throw new Error("error" in data && typeof data.error === "string"
        ? data.error
        : "Could not create the account. Please try again.");
    }
  } finally {
    clearTimeout(timeout);
  }
}
