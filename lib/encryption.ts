import crypto from "node:crypto";

function getEncryptionKey(): Buffer {
  const customKey = process.env.SYSTEM_CONFIG_ENCRYPTION_KEY?.trim();
  if (customKey) {
    // Hash custom key with SHA-256 to ensure exact 32-byte key for AES-256
    return crypto.createHash("sha256").update(customKey, "utf8").digest();
  }

  // Fallback to SESSION_SECRET or internal secret
  const fallback =
    process.env.SESSION_SECRET?.trim() ||
    process.env.ADMIN_PASSWORD_HASH?.trim() ||
    "signup888-system-push-config-vault-fallback-secret";
  return crypto.createHash("sha256").update(`push-vault:${fallback}`, "utf8").digest();
}

/**
 * Encrypt sensitive server-side strings (e.g., VAPID private keys) using AES-256-GCM.
 * Output format: `iv_hex:tag_hex:ciphertext_hex`
 */
export function encryptSecret(plaintext: string): string {
  if (!plaintext) return "";
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12); // Standard 96-bit IV for GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

/**
 * Decrypt sensitive strings previously encrypted with AES-256-GCM.
 */
export function decryptSecret(payload: string): string {
  if (!payload) return "";
  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted payload format (expected iv:tag:ciphertext)");
  }

  const [ivHex, tagHex, ciphertextHex] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(tagHex, "hex");

  if (iv.length !== 12 || authTag.length !== 16) {
    throw new Error("Invalid IV or authentication tag length in encrypted payload");
  }

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertextHex, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/**
 * Generate a safe visual fingerprint of a public key (SHA-256, colon-separated).
 */
export function computeKeyFingerprint(key: string): string {
  if (!key) return "";
  const clean = key.trim();
  const hash = crypto.createHash("sha256").update(clean, "utf8").digest("hex");
  // Format as 8 pairs of hex digits: e.g. "9f:34:ab:22:..."
  const pairs: string[] = [];
  for (let i = 0; i < 16; i += 2) {
    pairs.push(hash.slice(i, i + 2));
  }
  return pairs.join(":");
}

/**
 * Safe private key hash for equality comparison without decrypting or exposing the secret.
 */
export function computeSecretHash(secret: string): string {
  if (!secret) return "";
  return crypto.createHash("sha256").update(secret.trim(), "utf8").digest("hex");
}
