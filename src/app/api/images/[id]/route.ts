import { prisma } from "@/server/db/prisma";

/**
 * Serves an uploaded image out of the database.
 *
 * Deliberately unauthenticated: these are staff photos on public salon pages,
 * and an id is a cuid, so there is nothing here that guessing a URL exposes that
 * browsing the site would not. If images are ever used for something private,
 * this route needs an owner check — it does not have one.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const image = await prisma.image.findUnique({
    where: { id },
    select: { data: true, mimeType: true, byteSize: true },
  });

  if (!image) {
    return new Response("Not found", { status: 404 });
  }

  // Prisma returns `Bytes` as a Uint8Array; Response takes that directly.
  return new Response(new Uint8Array(image.data), {
    headers: {
      "Content-Type": image.mimeType,
      "Content-Length": String(image.byteSize),
      // Immutable is safe because an id never changes what it points at:
      // replacing a photo creates a new row with a new id and drops the old
      // one, so a cached response can never go stale — it can only 404 later.
      "Cache-Control": "public, max-age=31536000, immutable",
      // These bytes are decoded as an image and nothing else, whatever a
      // browser might otherwise sniff them to be.
      "X-Content-Type-Options": "nosniff",
    },
  });
}
