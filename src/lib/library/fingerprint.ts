import { createHash } from "node:crypto";
import { open } from "node:fs/promises";

const SAMPLE_BYTES = 64 * 1024;

/**
 * A quick identity for a media file: its size plus its first and last 64 KB,
 * hashed. Reading the whole file would take seconds for a long video, and
 * two different files matching on all three is not a real-world concern.
 */
export async function fileFingerprint(filePath: string): Promise<string> {
  const handle = await open(filePath, "r");
  try {
    const { size } = await handle.stat();
    const hash = createHash("sha1").update(String(size));
    const head = Buffer.alloc(Math.min(SAMPLE_BYTES, size));
    await handle.read(head, 0, head.length, 0);
    hash.update(head);
    if (size > SAMPLE_BYTES) {
      const tail = Buffer.alloc(Math.min(SAMPLE_BYTES, size - SAMPLE_BYTES));
      await handle.read(tail, 0, tail.length, size - tail.length);
      hash.update(tail);
    }
    return hash.digest("hex");
  } finally {
    await handle.close();
  }
}
