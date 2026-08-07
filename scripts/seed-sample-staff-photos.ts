// Demo-only: gives every staff member a generated placeholder avatar so the team
// sections show the photo feature working without anyone having to upload first.
// Idempotent — it only fills members who have no photo, and `--clear` removes
// exactly what it made. Safe to delete; not part of the product.
//
//   npx tsx scripts/seed-sample-staff-photos.ts
//   npx tsx scripts/seed-sample-staff-photos.ts --clear
//
// These are deliberately abstract gradient discs with an initial, not stock
// portraits of people who do not exist. They read as placeholder art, which is
// what they are — nobody should mistake one for a real stylist.
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

async function main() {
  const clearing = process.argv.includes("--clear");

  const staff = await prisma.staff.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, photoId: true },
  });

  if (clearing) {
    const withPhotos = staff.filter((member) => member.photoId !== null);

    // Unlink before deleting: the foreign key is ON DELETE SET NULL, but doing
    // it in this order means there is never a moment where a row points at an
    // image that is on its way out.
    await prisma.staff.updateMany({
      where: { id: { in: withPhotos.map((member) => member.id) } },
      data: { photoId: null },
    });
    await prisma.image.deleteMany({
      where: { id: { in: withPhotos.map((member) => member.photoId!) } },
    });

    console.log(`Cleared ${withPhotos.length} staff photo(s).`);
    return;
  }

  let created = 0;

  for (const [index, member] of staff.entries()) {
    // Never overwrite a real upload — this fills empty slots only.
    if (member.photoId) continue;

    const initial = Array.from(member.name.trim())[0] ?? "?";
    const svg = avatarSvg(initial, PAIRS[index % PAIRS.length]);

    // Same output shape the upload path produces, so what is stored here is
    // indistinguishable from a genuine upload.
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

    await prisma.staff.update({
      where: { id: member.id },
      data: { photoId: image.id },
    });

    console.log(`${member.name}: ${(data.byteLength / 1024).toFixed(1)} KB`);
    created += 1;
  }

  console.log(
    created === 0
      ? "Every staff member already has a photo; nothing to do."
      : `Added ${created} placeholder avatar(s).`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
