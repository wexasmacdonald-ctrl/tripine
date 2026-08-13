import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/infrastructure/env";

function key() {
  if (!env.CREDENTIAL_ENCRYPTION_KEY) throw new Error("CREDENTIAL_ENCRYPTION_KEY is not configured");
  const decoded = Buffer.from(env.CREDENTIAL_ENCRYPTION_KEY, "base64");
  if (decoded.length !== 32) throw new Error("CREDENTIAL_ENCRYPTION_KEY must be exactly 32 bytes encoded as base64");
  return decoded;
}

export function encryptCredential(value: unknown) {
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return { ciphertext: ciphertext.toString("base64"), iv: iv.toString("base64"), auth_tag: cipher.getAuthTag().toString("base64"), key_version: 1 };
}

export function decryptCredential<T>(record: { ciphertext: string; iv: string; auth_tag: string }): T {
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(record.iv, "base64"));
  decipher.setAuthTag(Buffer.from(record.auth_tag, "base64"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(record.ciphertext, "base64")), decipher.final()]).toString("utf8")) as T;
}
