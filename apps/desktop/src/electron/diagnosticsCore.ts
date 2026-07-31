import { gzipSync } from "node:zlib";

export interface DiagnosticArchiveEntry {
  readonly path: string;
  readonly data: Uint8Array;
  readonly modifiedAt?: Date;
}

const redactedValue = "[REDACTED]";
const sensitiveAssignmentPattern =
  /((?:access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|app[_-]?secret|client[_-]?secret|password|passwd|authorization|cookie|credential)[\s"'[\]]*[:=][\s"']*)([^,\s"'}\]]{3,})/giu;
const sensitiveCodePattern =
  /((?:verification|invite|reset|otp|验证码|邀请码|重置码)[_-]?(?:code)?[\s"'[\]]*[:=][\s"']*)([a-z0-9-]{4,64})/giu;
const emailPattern = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/giu;
const bearerPattern = /\bBearer\s+[a-z0-9._~+/-]{3,}=*/giu;
const jwtPattern = /\beyJ[a-z0-9_-]{4,}\.[a-z0-9_-]{4,}\.[a-z0-9_-]{4,}\b/giu;
const querySecretPattern =
  /([?&](?:token|access_token|refresh_token|api_key|code|password)=)[^&#\s]+/giu;

export function createLocalCrashReporterOptions(releaseChannel: string | undefined) {
  const candidate = releaseChannel?.trim();
  return {
    productName: "Quant Learning Desktop",
    uploadToServer: false as const,
    compress: false,
    globalExtra: {
      releaseChannel: candidate && /^[a-z0-9._-]{1,32}$/iu.test(candidate) ? candidate : "local",
    },
  };
}

export function redactDiagnosticText(value: string): string {
  return value
    .replace(emailPattern, "[REDACTED_EMAIL]")
    .replace(bearerPattern, "Bearer [REDACTED]")
    .replace(jwtPattern, redactedValue)
    .replace(sensitiveAssignmentPattern, `$1${redactedValue}`)
    .replace(sensitiveCodePattern, `$1${redactedValue}`)
    .replace(querySecretPattern, `$1${redactedValue}`);
}

export function containsDiagnosticSecrets(value: Uint8Array): boolean {
  const buffer = Buffer.from(value);
  const candidates = [buffer.toString("latin1"), buffer.toString("utf16le")];
  return candidates.some((candidate) => redactDiagnosticText(candidate) !== candidate);
}

export function createTarGzip(entries: readonly DiagnosticArchiveEntry[]): Buffer {
  const chunks: Buffer[] = [];
  for (const entry of entries) {
    const path = normalizeArchivePath(entry.path);
    const data = Buffer.from(entry.data);
    const header = createTarHeader(path, data.byteLength, entry.modifiedAt ?? new Date());
    chunks.push(header, data);
    const paddingLength = (512 - (data.byteLength % 512)) % 512;
    if (paddingLength > 0) {
      chunks.push(Buffer.alloc(paddingLength));
    }
  }
  chunks.push(Buffer.alloc(1_024));
  return gzipSync(Buffer.concat(chunks), { level: 9 });
}

function normalizeArchivePath(path: string): string {
  const normalized = path.replaceAll("\\", "/").replace(/^\/+/u, "");
  if (
    normalized.length === 0 ||
    Buffer.byteLength(normalized, "utf8") > 100 ||
    normalized.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new TypeError("Diagnostic archive path is invalid.");
  }
  return normalized;
}

function createTarHeader(path: string, size: number, modifiedAt: Date): Buffer {
  const header = Buffer.alloc(512);
  writeString(header, path, 0, 100);
  writeOctal(header, 0o600, 100, 8);
  writeOctal(header, 0, 108, 8);
  writeOctal(header, 0, 116, 8);
  writeOctal(header, size, 124, 12);
  writeOctal(header, Math.floor(modifiedAt.getTime() / 1_000), 136, 12);
  header.fill(0x20, 148, 156);
  header[156] = "0".charCodeAt(0);
  writeString(header, "ustar\0", 257, 6);
  writeString(header, "00", 263, 2);
  writeString(header, "quant-learning", 265, 32);
  writeString(header, "quant-learning", 297, 32);

  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  const encodedChecksum = checksum.toString(8).padStart(6, "0");
  writeString(header, encodedChecksum, 148, 6);
  header[154] = 0;
  header[155] = 0x20;
  return header;
}

function writeString(target: Buffer, value: string, offset: number, length: number) {
  const encoded = Buffer.from(value, "utf8");
  if (encoded.byteLength > length) {
    throw new TypeError("Diagnostic archive header value is too long.");
  }
  encoded.copy(target, offset);
}

function writeOctal(target: Buffer, value: number, offset: number, length: number) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError("Diagnostic archive numeric value is invalid.");
  }
  const encoded = value.toString(8).padStart(length - 1, "0");
  if (encoded.length >= length) {
    throw new TypeError("Diagnostic archive numeric value is too large.");
  }
  writeString(target, `${encoded}\0`, offset, length);
}
