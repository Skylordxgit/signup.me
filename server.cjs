// Hostinger loads Node entry files with CommonJS require().
// Vinext itself is ESM, so start it through a non-blocking dynamic import.
const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

Object.defineProperty(process, "stdin", {
  configurable: true,
  value: { isTTY: false },
});

const standaloneServer = path.join(__dirname, "dist", "standalone", "server.js");

async function start() {
  if (!fs.existsSync(standaloneServer)) {
    console.log("Production build not found. Running build step...");
    execSync("npx vinext build", {
      cwd: __dirname,
      stdio: "inherit",
      env: { ...process.env, NODE_ENV: "production" },
    });
  }

  await import("./dist/standalone/server.js");
}

start().catch((error) => {
  console.error("Failed to start the Vinext production server", error);
  process.exit(1);
});

