import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = fileURLToPath(new URL("../.next/renderer-tests/", import.meta.url));

await build({
  configFile: false,
  root,
  logLevel: "error",
  resolve: { alias: { "@": root, "next/image": fileURLToPath(new URL("./next-image.tsx", import.meta.url)), "next/headers": fileURLToPath(new URL('./requestContext.ts', import.meta.url)) } },
  build: {
    ssr: fileURLToPath(new URL("./index.test.ts", import.meta.url)),
    outDir: output,
    emptyOutDir: false,
    rollupOptions: { output: { entryFileNames: "tests.mjs" } },
  },
});

const result = spawnSync(process.execPath, ["--test", `${output}/tests.mjs`], { stdio: "inherit", env: { ...process.env, SESSION_SECRET: 'isolated-test-session-secret-never-use-in-production' } });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
