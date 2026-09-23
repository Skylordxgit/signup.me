"use client";

import { useEffect } from "react";

export default function AdminRouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Admin route failed", error);
  }, [error]);

  return (
    <main className="admMain">
      <div className="admCard admFormStack" role="alert" style={{ maxWidth: "520px" }}>
        <h2 style={{ margin: 0 }}>This section could not load</h2>
        <p style={{ margin: 0 }}>A temporary problem interrupted this page. The rest of the admin area remains available.</p>
        <div><button className="admButton admPrimary" type="button" onClick={reset}>Retry this section</button></div>
      </div>
    </main>
  );
}
