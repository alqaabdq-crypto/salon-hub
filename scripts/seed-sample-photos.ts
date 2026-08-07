// Demo-only: generates placeholder images so the photo features are visible
// without anyone having to upload first — an avatar per staff member and a cover
// per salon. Idempotent: it only fills empty slots, never overwrites a real
// upload, and `--clear` removes exactly what it made. Safe to delete.
//
//   npx tsx scripts/seed-sample-photos.ts
//   npx tsx scripts/seed-sample-photos.ts --clear
//
// These are deliberately abstract gradients, not stock photography — no invented
// stylists, no salon interiors that do not exist. They read as placeholder art,
// which is exactly what they are.
import "dotenv/config";
import sharp from "sharp";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const SIZE = 512;

/** Olive-family hues, so the avatars sit inside the site's palette. */
const PAIRS: Array<[string, string]> = [
  ["#b6d94a", "#4d6b12"],
  ["#7fd9a8", "#12633f"],
  ["#d9c04a", "#6b5312"],
  ["#4ac0d9", "#125a6b"],
  ["#d97f4a", "#6b3612"],
  ["#a84ad9", "#4a126b"],
];

function avatarSvg(initial: string, [from, to]: [string, string]): Buffer {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
       <defs>
         <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
           <stop offset="0%" stop-color="${from}"/>
           <stop offset="100%" stop-color="${to}"/>
         </linearGradient>
       </defs>
       <rect width="${SIZE}" height="${SIZE}" fill="url(#g)"/>
       <text x="50%" y="50%" dy="0.35em" text-anchor="middle"
             font-family="Segoe UI, system-ui, sans-serif" font-size="${SIZE * 0.42}"
             font-weight="700" fill="#10130a" fill-opacity="0.72">${initial}</text>
     </svg>`,
  );
}

const COVER_WIDTH = 1280;
const COVER_HEIGHT = 720;

/** A wide banner: diagonal gradient with soft blobs, so it reads as a photo
 *  placeholder rather than a flat swatch. */
function coverSvg(label: string, [from, to]: [string, string]): Buffer {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${COVER_WIDTH}" height="${COVER_HEIGHT}">
       <defs>
         <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
           <stop offset="0%" stop-color="${from}"/>
           <stop offset="100%" stop-color="${to}"/>
         </linearGradient>
       </defs>
       <rect width="${COVER_WIDTH}" height="${COVER_HEIGHT}" fill="url(#g)"/>
       <circle cx="${COVER_WIDTH * 0.78}" cy="${COVER_HEIGHT * 0.28}" r="200"
               fill="#ffffff" fill-opacity="0.10"/>
       <circle cx="${COVER_WIDTH * 0.22}" cy="${COVER_HEIGHT * 0.82}" r="260"
               fill="#000000" fill-opacity="0.12"/>
       <text x="50%" y="50%" dy="0.35em" text-anchor="middle"
             font-family="Segoe UI, system-ui, sans-serif" font-size="64"
             font-weight="700" fill="#10130a" fill-opacity="0.6">${label}</text>
     </svg>`,
  );
}

/** Encodes an SVG the same way the upload path would, and stores it. */
async function storeGenerated(svg: Buffer): Promise<string> {
  const { data, info } = await sharp(svg)
    .webp({ quality: 78 })
    .toBuffer({ resolveWithObject: true });

  const image = await prisma.image.create({
    data: {
      data: new Uint8Array(data),
      mimeType: "image/webp",
      width: info.width,
      height: info.height,
      byteSize: data.byteLength,
    },
    select: { id: true },
  });

  console.log(`  stored ${(data.byteLength / 1024).toFixed(1)} KB`);
  return image.id;
}

async function main() {
  const clearing = process.argv.includes("--clear");

  const staff = await prisma.staff.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, photoId: true },
  });

  const salons = await prisma.salon.findMany({
    orderBy: { nameEn: "asc" },
    select: { id: true, nameEn: true, coverImageId: true },
  });

  if (clearing) {
    const withPhotos = staff.filter((member) => member.photoId !== null);
    const withCovers = salons.filter((salon) => salon.coverImageId !== null);

    // Unlink before deleting: the foreign key is ON DELETE SET NULL, but doing
    // it in this order means there is never a moment where a row points at an
    // image that is on its way out.
    await prisma.staff.updateMany({
      where: { id: { in: withPhotos.map((member) => member.id) } },
      data: { photoId: null },
    });
    await prisma.salon.updateMany({
      where: { id: { in: withCovers.map((salon) => salon.id) } },
      data: { coverImageId: null },
    });

    await prisma.image.deleteMany({
      where: {
        id: {
          in: [
            ...withPhotos.map((member) => member.photoId!),
            ...withCovers.map((salon) => salon.coverImageId!),
          ],
        },
      },
    });

    console.log(
      `Cleared ${withPhotos.length} staff photo(s) and ${withCovers.length} cover(s).`,
    );
    return;
  }

  let created = 0;

  for (const [index, salon] of salons.entries()) {
    if (salon.coverImageId) continue;

    console.log(`${salon.nameEn} (cover):`);
    const imageId = await storeGenerated(
      coverSvg(salon.nameEn, PAIRS[(index + 2) % PAIRS.length]),
    );

    await prisma.salon.update({ where: { id: salon.id }, data: { coverImageId: imageId } });
    created += 1;
  }

  for (const [index, member] of staff.entries()) {
    // Never overwrite a real upload — this fills empty slots only.
    if (member.photoId) continue;

    console.log(`${member.name} (avatar):`);
    const initial = Array.from(member.name.trim())[0] ?? "?";
    const imageId = await storeGenerated(avatarSvg(initial, PAIRS[index % PAIRS.length]));

    await prisma.staff.update({ where: { id: member.id }, data: { photoId: imageId } });
    created += 1;
  }

  console.log(
    created === 0
      ? "Everything already has a picture; nothing to do."
      : `Added ${created} placeholder image(s).`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
