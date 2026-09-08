import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { mysqlPool } from "../lib/mysql";
import { listMediaUploads, readUpload, resolveUploadPath, storeUpload, uploadCategories } from "../lib/uploads";

test("database uploads survive reads without any local file, and failed writes are not accepted", async (t) => {
  const originalUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "mysql://test:test@localhost/test";
  t.after(() => {
    if (originalUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalUrl;
  });
  const rows = new Map<string, { path: string; name: string; category: string; mime: string; bytes: number; data: Buffer; updatedAt: Date }>();
  const pool = mysqlPool();
  t.mock.method(pool, "query", async () => [[], []]);
  t.mock.method(pool, "execute", async (sql: string, values: unknown[] = []) => {
    if (sql.startsWith("INSERT")) {
      const [path, name, category, mime, bytes, data, updatedAt] = values as [string, string, string, string, number, Buffer, Date];
      if (!rows.has(path)) rows.set(path, { path, name, category, mime, bytes, data, updatedAt });
      return [{ affectedRows: 1 }, []];
    }
    if (sql.includes("WHERE storage_path")) {
      const row = rows.get(String(values[0]));
      return [row ? [{ data: row.data }] : [], []];
    }
    return [[...rows.values()].map(row => ({ path: row.path, name: row.name, category: row.category, mime: row.mime, bytes: row.bytes, updatedAt: row.updatedAt })), []];
  });

  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  for (const category of uploadCategories) {
    const stored = await storeUpload(category, bytes, { mime: "image/png", ext: "png" });
    const segments = stored.path.split("/").slice(2);
    assert.equal(existsSync(resolveUploadPath(segments)!), false);
    const loaded = await readUpload(segments);
    assert.deepEqual(loaded?.bytes, bytes);
    assert.equal(loaded?.mime, "image/png");
    assert.ok((await listMediaUploads()).some(file => file.path === stored.path && file.bytes === bytes.length));
  }
  assert.equal(await readUpload(["profile", "..", "secret.png"]), null);
  assert.equal(await readUpload(["profile", "missing.png"]), null);
  t.mock.method(pool, "execute", async () => { throw new Error("Database unavailable"); });
  await assert.rejects(storeUpload("profile", bytes, { mime: "image/png", ext: "png" }), /Database unavailable/);
});
