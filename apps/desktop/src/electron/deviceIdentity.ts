import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

interface DeviceIdentityDocument {
  version: 1;
  deviceId: string;
}

export async function readOrCreateDeviceId(filePath: string): Promise<string> {
  try {
    const rawValue = await readFile(filePath, "utf8");
    const document = JSON.parse(rawValue) as Partial<DeviceIdentityDocument>;
    if (
      document.version === 1 &&
      typeof document.deviceId === "string" &&
      /^device-[0-9a-f-]{36}$/.test(document.deviceId)
    ) {
      return document.deviceId;
    }
  } catch {
    // A new identity is written below.
  }

  const deviceId = `device-${randomUUID()}`;
  const temporaryPath = `${filePath}.tmp`;
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(
    temporaryPath,
    JSON.stringify({ version: 1, deviceId } satisfies DeviceIdentityDocument),
    {
      encoding: "utf8",
      mode: 0o600,
    },
  );
  await chmod(temporaryPath, 0o600);
  await rename(temporaryPath, filePath);
  await chmod(filePath, 0o600);
  return deviceId;
}
