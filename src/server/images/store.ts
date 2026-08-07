import sharp from "sharp";
import { prisma } from "@/server/db/prisma";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Accepting, normalising and storing an uploaded image.
 *
 * Bytes live in Postgres (see the `Image` model for why), which makes the size
 * of what gets stored a database problem rather than a disk problem. Everything
 * here exists to keep that number small and predictable.
 */

/** Longest edge after resizing. A staff avatar renders at ~96px; 512 leaves room
 *  for retina and for the photo being reused somewhere larger later. */
const MAX_EDGE = 512;

/** Refused before decoding. A modern phone photo is 3–8 MB, so this accepts a
 *  straight-from-camera upload while refusing something pathological. */
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** What a browser will actually send from `accept="image/*"`. SVG is absent on
 *  purpose: it is a document, it can carry script, and serving one back from our
 *  own origin would be a stored-XSS hole. */
const ACCEPTED = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"]);

export type StoreResult =
  | { ok: true; imageId: string }
  | { ok: false; reason: "too-large" | "unsupported" | "corrupt" };

/**
 * Re-encodes an upload and stores it, returning the new image's id.
 *
 * The output is always WebP regardless of input: one output format means the
 * serving route never has to negotiate, and WebP at quality 78 is roughly a
 * third the size of equivalent JPEG. Re-encoding also strips EXIF, which
 * matters here — phone photos carry GPS coordinates, and a salon's staff photos
 * should not quietly publish where they were taken.
 */
export async function storeImage(
  file: File,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<StoreResult> {
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, reason: "too-large" };
  if (!ACCEPTED.has(file.type)) return { ok: false, reason: "unsupported" };

  const input = Buffer.from(await file.arrayBuffer());

  try {
    // `rotate()` with no argument applies the EXIF orientation before that data
    // is stripped — without it, portrait phone photos store on their side.
    const pipeline = sharp(input)
      .rotate()
      .resize({
        width: MAX_EDGE,
        height: MAX_EDGE,
        fit: "inside",
        // Never upscale: a 200px thumbnail stays 200px rather than being
        // stretched to 512 and stored at several times the size for no gain.
        withoutEnlargement: true,
      })
      .webp({ quality: 78 });

    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });

    const image = await client.image.create({
      data: {
        // sharp hands back a Buffer, whose backing store is typed loosely enough
        // that Prisma's `Bytes` will not accept it. Same bytes, narrower type.
        data: new Uint8Array(data),
        mimeType: "image/webp",
        width: info.width,
        height: info.height,
        byteSize: data.byteLength,
      },
      select: { id: true },
    });

    return { ok: true, imageId: image.id };
  } catch {
    // sharp throws on anything it cannot decode — including a file that merely
    // claims to be an image. The declared MIME type is the browser's word;
    // this is the check that actually means something.
    return { ok: false, reason: "corrupt" };
  }
}

/**
 * Deletes an image row, ignoring one that has already gone.
 *
 * Called when a photo is replaced or removed. Nothing else references these
 * rows, so an orphan is pure waste — but failing a staff save because the old
 * photo could not be deleted would be worse than leaking a row, hence the
 * swallow.
 */
export async function deleteImage(
  imageId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<void> {
  try {
    await client.image.delete({ where: { id: imageId } });
  } catch {
    // Already deleted, or still referenced. Neither is worth failing a save for.
  }
}

/** The public path for an image. The only place this URL shape is constructed. */
export function imageUrl(imageId: string): string {
  return `/api/images/${imageId}`;
}
