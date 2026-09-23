"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Keep technical details out of the UI while preserving them for browser diagnostics.
    console.error("Application render failed", error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main style={{ display: "grid", minHeight: "100vh", placeItems: "center", padding: "24px", fontFamily: "Arial, sans-serif" }}>
          <section style={{ maxWidth: "420px", textAlign: "center" }}>
            <h1>Something did not load</h1>
            <p>The page could not finish loading. Your saved work is safe. Please retry the page.</p>
            <button type="button" onClick={reset}>Retry page</button>
          </section>
        </main>
      </body>
    </html>
  );
}
