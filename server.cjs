// Hostinger loads Node entry files with CommonJS require().
// Vinext itself is ESM, so start it through a non-blocking dynamic import.
Object.defineProperty(process, "stdin", {
  configurable: true,
  value: { isTTY: false },
});

import("./dist/standalone/server.js").catch((error) => {
  console.error("Failed to start the Vinext production server", error);
  process.exit(1);
});
