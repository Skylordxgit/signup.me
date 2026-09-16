// Hostinger loads Node entry files with CommonJS require().
// Vinext itself is ESM, so start it through a non-blocking dynamic import.
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

Object.defineProperty(process, "stdin", {
  configurable: true,
  value: { isTTY: false },
});

const standaloneServer = path.join(__dirname, "dist", "standalone", "server.js");

async function start() {
  if (!fs.existsSync(standaloneServer)) {
    console.log("Production build not found. Running build step...");
    const executable = path.join(__dirname, "node_modules", "vinext", "dist", "cli.js");

    if (!fs.existsSync(executable)) {
      throw new Error("Vinext is not installed. Run npm install before starting the application.");
    }

    const result = spawnSync(process.execPath, [executable, "build"], {
      cwd: __dirname,
      stdio: "inherit",
      env: { ...process.env, NODE_ENV: "production" },
    });

    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`Vinext build failed with exit code ${result.status}`);
    }
  }

  await import("./dist/standalone/server.js");
}

start().catch((error) => {
  console.error("Failed to start the Vinext production server", error);
  process.exit(1);
});

