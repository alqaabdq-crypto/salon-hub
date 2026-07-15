import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/server/db/prisma";

const registerSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
  name: z.string().min(1),
  phone: z.string().optional(),
  role: z.enum(["CUSTOMER", "SALON_OWNER"]),
});

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = registerSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { email, password, name, phone, role } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "An account with this email already exists" },
      { status: 409 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: { email, passwordHash, name, phone, role },
  });

  return NextResponse.json(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    { status: 201 }
  );
}
