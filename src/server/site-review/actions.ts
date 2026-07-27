"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { prisma } from "@/server/db/prisma";

const localeSchema = z.enum(routing.locales);

// Testimonials about the platform. Open submission (no login) — the trade-off is
// spam exposure, mitigated only by length caps here; gate behind auth() if that
// becomes a problem.
const siteReviewSchema = z.object({
  locale: localeSchema,
  name: z.string().trim().min(1).max(60),
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().min(3).max(500),
});

export async function createSiteReview(formData: FormData): Promise<void> {
  const raw = {
    locale: formData.get("locale"),
    name: formData.get("name"),
    rating: formData.get("rating"),
    comment: formData.get("comment"),
  };

  const locale = localeSchema.safeParse(raw.locale).data ?? routing.defaultLocale;

  const parsed = siteReviewSchema.safeParse(raw);
  if (!parsed.success) {
    // Back to the section with an error flag; the form keeps working without JS.
    return redirect({ href: "/?review=error#reviews", locale });
  }

  const { name, rating, comment } = parsed.data;
  await prisma.siteReview.create({ data: { name, rating, comment } });

  revalidatePath(`/${locale}`);
  return redirect({ href: "/?review=ok#reviews", locale });
}
