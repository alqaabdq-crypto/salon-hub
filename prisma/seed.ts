import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import type { DayOfWeek, GenderFocus } from "../src/generated/prisma/enums";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const WEEK: DayOfWeek[] = ["SAT", "SUN", "MON", "TUE", "WED", "THU"];

// These defaults are printed in the README, so anyone who can reach a seeded
// deployment knows them — including the ADMIN account, which can approve and
// suspend salons. Fine on a laptop, an open door anywhere else.
const DEFAULT_ADMIN_PASSWORD = "admin1234";
const DEFAULT_OWNER_PASSWORD = "owner1234";

const adminPassword = process.env.SEED_ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;
const ownerPassword = process.env.SEED_OWNER_PASSWORD || DEFAULT_OWNER_PASSWORD;

/**
 * Refuses to seed a remote database with the published passwords.
 *
 * The check is the database host rather than NODE_ENV, because `prisma db seed`
 * is usually run by hand or from a deploy step where NODE_ENV says nothing
 * useful. A connection leaving this machine is the thing that makes a documented
 * password dangerous.
 */
function assertSafeCredentials() {
  const url = process.env.DATABASE_URL ?? "";
  const isLocal = /@(localhost|127\.0\.0\.1|host\.docker\.internal|postgres)[:/]/.test(url);

  if (isLocal) return;

  const usingDefaults =
    adminPassword === DEFAULT_ADMIN_PASSWORD || ownerPassword === DEFAULT_OWNER_PASSWORD;

  if (usingDefaults) {
    throw new Error(
      "Refusing to seed a non-local database with the passwords published in the README.\n" +
        "Set SEED_ADMIN_PASSWORD and SEED_OWNER_PASSWORD to something private first.",
    );
  }
}

type ServiceSeed = {
  slug: string;
  nameEn: string;
  nameAr: string;
  category: string;
  durationMinutes: number;
  price: string;
};

type SalonSeed = {
  slug: string;
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  genderFocus: GenderFocus;
  city: string;
  address: string;
  /** Map pin, roughly matching the written address above. */
  lat: number;
  lng: number;
  phone: string;
  ownerEmail: string;
  ownerName: string;
  staff: { name: string; bioEn: string; bioAr: string }[];
  services: ServiceSeed[];
};

const categories = [
  { slug: "hair", nameEn: "Hair", nameAr: "الشعر", icon: "✂️" },
  { slug: "nails", nameEn: "Nails", nameAr: "الأظافر", icon: "💅" },
  { slug: "skincare", nameEn: "Skincare", nameAr: "العناية بالبشرة", icon: "🧖" },
  { slug: "barbering", nameEn: "Barbering", nameAr: "حلاقة", icon: "💈" },
  { slug: "makeup", nameEn: "Makeup", nameAr: "المكياج", icon: "💄" },
];

const salons: SalonSeed[] = [
  {
    slug: "rose-beauty-lounge",
    nameEn: "Rose Beauty Lounge",
    nameAr: "صالون الورد للتجميل",
    descriptionEn:
      "A calm women-only lounge in north Riyadh offering hair, nails and skincare by an all-female team.",
    descriptionAr:
      "صالون نسائي هادئ في شمال الرياض يقدم خدمات الشعر والأظافر والعناية بالبشرة على يد فريق نسائي بالكامل.",
    genderFocus: "WOMEN",
    city: "Riyadh",
    address: "King Fahd Road, Al Olaya",
    lat: 24.6913,
    lng: 46.6852,
    phone: "+966511000001",
    ownerEmail: "owner.rose@salonhub.sa",
    ownerName: "Hessa Al-Otaibi",
    staff: [
      { name: "Layla", bioEn: "Senior stylist, 8 years", bioAr: "مصففة أولى، ٨ سنوات" },
      { name: "Noura", bioEn: "Colour specialist", bioAr: "أخصائية صبغة" },
    ],
    services: [
      { slug: "cut", nameEn: "Haircut & style", nameAr: "قص وتصفيف", category: "hair", durationMinutes: 45, price: "150.00" },
      { slug: "colour", nameEn: "Full colour", nameAr: "صبغة كاملة", category: "hair", durationMinutes: 120, price: "420.00" },
      { slug: "mani", nameEn: "Manicure", nameAr: "مانيكير", category: "nails", durationMinutes: 40, price: "90.00" },
      { slug: "facial", nameEn: "Hydrating facial", nameAr: "تنظيف بشرة مرطب", category: "skincare", durationMinutes: 60, price: "260.00" },
    ],
  },
  {
    slug: "al-fursan-barbers",
    nameEn: "Al Fursan Barbers",
    nameAr: "حلاقة الفرسان",
    descriptionEn:
      "Classic men's barbershop in Jeddah. Hot-towel shaves, beard sculpting and skin fades.",
    descriptionAr:
      "صالون حلاقة رجالي كلاسيكي في جدة. حلاقة بالمنشفة الساخنة وتشكيل اللحية وقصات متدرجة.",
    genderFocus: "MEN",
    city: "Jeddah",
    address: "Prince Sultan Street, Al Rawdah",
    lat: 21.5810,
    lng: 39.1580,
    phone: "+966511000002",
    ownerEmail: "owner.fursan@salonhub.sa",
    ownerName: "Faisal Al-Harbi",
    staff: [
      { name: "Omar", bioEn: "Master barber", bioAr: "حلاق محترف" },
      { name: "Yousef", bioEn: "Beard specialist", bioAr: "أخصائي لحية" },
    ],
    services: [
      { slug: "fade", nameEn: "Skin fade", nameAr: "قصة متدرجة", category: "barbering", durationMinutes: 40, price: "80.00" },
      { slug: "shave", nameEn: "Hot-towel shave", nameAr: "حلاقة بالمنشفة الساخنة", category: "barbering", durationMinutes: 30, price: "60.00" },
      { slug: "beard", nameEn: "Beard sculpt", nameAr: "تشكيل اللحية", category: "barbering", durationMinutes: 25, price: "55.00" },
    ],
  },
  {
    slug: "glow-studio",
    nameEn: "Glow Studio",
    nameAr: "استوديو جلو",
    descriptionEn:
      "Unisex studio in Dammam focused on skincare and makeup, with private rooms available on request.",
    descriptionAr:
      "استوديو مختلط في الدمام متخصص في العناية بالبشرة والمكياج، مع توفر غرف خاصة عند الطلب.",
    genderFocus: "UNISEX",
    city: "Dammam",
    address: "Al Khobar Corniche Road",
    lat: 26.2854,
    lng: 50.2083,
    phone: "+966511000003",
    ownerEmail: "owner.glow@salonhub.sa",
    ownerName: "Sara Al-Qahtani",
    staff: [
      { name: "Reem", bioEn: "Makeup artist", bioAr: "خبيرة مكياج" },
      { name: "Dana", bioEn: "Aesthetician", bioAr: "أخصائية تجميل" },
    ],
    services: [
      { slug: "glam", nameEn: "Evening makeup", nameAr: "مكياج سهرة", category: "makeup", durationMinutes: 75, price: "350.00" },
      { slug: "deep-clean", nameEn: "Deep cleansing facial", nameAr: "تنظيف عميق للبشرة", category: "skincare", durationMinutes: 90, price: "300.00" },
      { slug: "trim", nameEn: "Trim & blow-dry", nameAr: "تهذيب وتجفيف", category: "hair", durationMinutes: 45, price: "140.00" },
    ],
  },
];

async function main() {
  assertSafeCredentials();

  const passwordHash = await bcrypt.hash(adminPassword, 10);

  await prisma.user.upsert({
    where: { email: "admin@salonhub.sa" },
    update: {},
    create: {
      email: "admin@salonhub.sa",
      passwordHash,
      name: "Salon Hub Admin",
      role: "ADMIN",
    },
  });

  // Subscription has nothing to point at without these.
  await prisma.plan.upsert({
    where: { tier: "FREE" },
    update: {},
    create: {
      tier: "FREE",
      nameEn: "Free",
      nameAr: "مجاني",
      price: "0.00",
      billingInterval: "MONTHLY",
    },
  });

  await prisma.plan.upsert({
    where: { tier: "PREMIUM" },
    update: {},
    create: {
      tier: "PREMIUM",
      nameEn: "Premium",
      nameAr: "بريميوم",
      price: "199.00",
      billingInterval: "MONTHLY",
      // Premium buys a reduced commission; null elsewhere means platform default.
      commissionRate: "0.1000",
    },
  });

  const categoryBySlug = new Map<string, string>();
  for (const category of categories) {
    const row = await prisma.category.upsert({
      where: { slug: category.slug },
      update: {},
      create: category,
    });
    categoryBySlug.set(category.slug, row.id);
  }

  const ownerPasswordHash = await bcrypt.hash(ownerPassword, 10);

  for (const seed of salons) {
    const owner = await prisma.user.upsert({
      where: { email: seed.ownerEmail },
      update: {},
      create: {
        email: seed.ownerEmail,
        passwordHash: ownerPasswordHash,
        name: seed.ownerName,
        role: "SALON_OWNER",
      },
    });

    const salon = await prisma.salon.upsert({
      where: { slug: seed.slug },
      // Coordinates are backfilled on re-seed. They arrived after these salons
      // did, so an existing database would otherwise keep three salons that can
      // never appear in a "near me" search. Everything else is still left alone.
      update: { lat: seed.lat, lng: seed.lng },
      create: {
        ownerId: owner.id,
        slug: seed.slug,
        nameEn: seed.nameEn,
        nameAr: seed.nameAr,
        descriptionEn: seed.descriptionEn,
        descriptionAr: seed.descriptionAr,
        genderFocus: seed.genderFocus,
        // Seeded salons are already through verification so the marketplace has
        // something to list; real signups start at PENDING_VERIFICATION.
        status: "APPROVED",
        address: seed.address,
        city: seed.city,
        lat: seed.lat,
        lng: seed.lng,
        phone: seed.phone,
      },
    });

    // Idempotency: services and staff have no natural unique key scoped to a
    // salon, so skip a salon that has already been populated.
    const existingServices = await prisma.service.count({ where: { salonId: salon.id } });
    if (existingServices > 0) continue;

    for (const service of seed.services) {
      const categoryId = categoryBySlug.get(service.category);
      if (!categoryId) throw new Error(`Unknown category: ${service.category}`);

      await prisma.service.create({
        data: {
          salonId: salon.id,
          categoryId,
          nameEn: service.nameEn,
          nameAr: service.nameAr,
          durationMinutes: service.durationMinutes,
          price: service.price,
        },
      });
    }

    const services = await prisma.service.findMany({ where: { salonId: salon.id } });

    for (const member of seed.staff) {
      const staff = await prisma.staff.create({
        data: {
          salonId: salon.id,
          name: member.name,
          bioEn: member.bioEn,
          bioAr: member.bioAr,
        },
      });

      // Everyone can perform everything the salon offers, for now.
      await prisma.staffService.createMany({
        data: services.map((service) => ({ staffId: staff.id, serviceId: service.id })),
      });

      // Saturday–Thursday, 10:00–22:00. Friday is the regional rest day.
      await prisma.workingHour.createMany({
        data: WEEK.map((dayOfWeek) => ({
          staffId: staff.id,
          dayOfWeek,
          startTime: "10:00",
          endTime: "22:00",
        })),
      });
    }
  }

  const counts = {
    plans: await prisma.plan.count(),
    categories: await prisma.category.count(),
    salons: await prisma.salon.count(),
    services: await prisma.service.count(),
    staff: await prisma.staff.count(),
  };
  console.log("seeded:", counts);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
