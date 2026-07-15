import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const passwordHash = await bcrypt.hash("admin1234", 10);

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
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
