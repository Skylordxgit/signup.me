// Hostinger's managed Node runner can expose stdin as an already-open socket.
// Vinext only reads its TTY flag during startup, so provide a non-interactive stream.
Object.defineProperty(process, "stdin", {
  configurable: true,
  value: { isTTY: false },
});

await import("./dist/standalone/server.js");
