#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import http from "node:http";

const MIN_DB_SIZE_BYTES = 10 * 1024 * 1024; // 10MB minimum
const DEFAULT_URLS = [
  "https://raw.githubusercontent.com/P3TERX/GeoLite.mmdb/download/GeoLite2-City.mmdb",
  "https://github.com/P3TERX/GeoLite.mmdb/raw/download/GeoLite2-City.mmdb",
];

export async function downloadGeoIpDatabase(options = {}) {
  const customPath = process.env.GEOIP_DB_PATH || process.env.GEOIP_DATABASE_PATH;
  const targetPath = options.targetPath || (customPath ? path.resolve(customPath.trim()) : path.resolve("data/GeoLite2-City.mmdb"));
  const targetDir = path.dirname(targetPath);

  // Check if existing file is already valid
  if (fs.existsSync(targetPath)) {
    try {
      const stats = fs.statSync(targetPath);
      if (stats.size >= MIN_DB_SIZE_BYTES) {
        console.log(`[GeoIP Download] Valid database already exists at ${targetPath} (${(stats.size / (1024 * 1024)).toFixed(1)} MB).`);
        return { ok: true, path: targetPath, size: stats.size };
      }
    } catch {
      // Continue to download if corrupted or unreadable
    }
  }

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const tmpPath = `${targetPath}.tmp.${Date.now()}`;
  console.log(`[GeoIP Download] Fetching MaxMind GeoLite2-City database to ${targetPath}...`);

  let downloadUrl = DEFAULT_URLS[0];
  if (process.env.MAXMIND_LICENSE_KEY) {
    downloadUrl = `https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-City&license_key=${encodeURIComponent(process.env.MAXMIND_LICENSE_KEY)}&suffix=tar.gz`;
  }

  const downloadToFile = (url, destPath, redirects = 5) => {
    return new Promise((resolve, reject) => {
      if (redirects < 0) return reject(new Error("Too many redirects"));
      const protocol = url.startsWith("https") ? https : http;
      const request = protocol.get(url, { headers: { "User-Agent": "Signup888-GeoIP-Setup/1.0" } }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const nextUrl = new URL(res.headers.location, url).toString();
          return resolve(downloadToFile(nextUrl, destPath, redirects - 1));
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} ${res.statusMessage}`));
        }

        const fileStream = fs.createWriteStream(destPath);
        res.pipe(fileStream);
        fileStream.on("finish", () => {
          fileStream.close(() => resolve());
        });
        fileStream.on("error", (err) => {
          fs.unlink(destPath, () => {});
          reject(err);
        });
      });
      request.on("error", (err) => {
        fs.unlink(destPath, () => {});
        reject(err);
      });
      request.setTimeout(120000, () => {
        request.destroy();
        fs.unlink(destPath, () => {});
        reject(new Error("Download timed out after 120s"));
      });
    });
  };

  let downloaded = false;
  for (const url of DEFAULT_URLS) {
    try {
      await downloadToFile(url, tmpPath);
      const stats = fs.statSync(tmpPath);
      if (stats.size < MIN_DB_SIZE_BYTES) {
        throw new Error(`Downloaded file too small (${stats.size} bytes)`);
      }
      fs.renameSync(tmpPath, targetPath);
      downloaded = true;
      console.log(`[GeoIP Download] Download complete: ${(stats.size / (1024 * 1024)).toFixed(1)} MB.`);
      break;
    } catch (err) {
      console.warn(`[GeoIP Download] Mirror failed (${url}):`, err.message);
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    }
  }

  if (!downloaded) {
    console.warn("[GeoIP Download] Warning: Could not download local GeoLite2-City.mmdb.");
    console.warn("[GeoIP Download] Real-time HTTP geolocation fallback will resolve subscriber locations.");
    return { ok: false, error: "Download failed across all mirrors" };
  }

  // Verify downloaded database
  try {
    const { MMDBReader } = await import("../lib/mmdbReader.ts");
    const reader = await MMDBReader.open(targetPath);
    const testResult = reader.lookup("81.2.69.160");
    if (!testResult?.countryName) {
      throw new Error("Verification lookup failed on test IP");
    }
    console.log(`[GeoIP Download] Database verified: ${reader.databaseType}, test lookup: ${testResult.city}, ${testResult.countryName}.`);
    return { ok: true, path: targetPath };
  } catch (verifyErr) {
    console.warn("[GeoIP Download] Warning: Verification failed:", verifyErr.message);
    return { ok: true, path: targetPath, verified: false };
  }
}

import { fileURLToPath } from "node:url";

// If run directly as a script
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  downloadGeoIpDatabase()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.warn("[GeoIP Download] Non-fatal script error:", err.message);
      process.exit(0);
    });
}
