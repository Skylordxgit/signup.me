import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = fileURLToPath(new URL("../.next/renderer-tests/", import.meta.url));

await build({
  configFile: false,
  root,
  logLevel: "error",
  resolve: { alias: { "@": root } },
  build: {
    ssr: fileURLToPath(new URL("./PageRenderer.test.tsx", import.meta.url)),
    outDir: output,
    emptyOutDir: false,
    rollupOptions: { output: { entryFileNames: "tests.mjs" } },
  },
});

const result = spawnSync(process.execPath, ["--test", `${output}/tests.mjs`], { stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
