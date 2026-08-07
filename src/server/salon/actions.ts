"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { auth } from "@/server/auth/config";
import { prisma } from "@/server/db/prisma";
import { setBookingStatus } from "@/server/booking/status";
import { refundIfPaid } from "@/server/payments/service";
import { requireOwnedSalon, uniqueSlug } from "@/server/salon/owner";
import { deleteImage, storeImage } from "@/server/images/store";
import { parseClock } from "@/server/booking/time";
import type { DayOfWeek } from "@/generated/prisma/enums";

const localeSchema = z.enum(routing.locales);

const DAYS: DayOfWeek[] = ["SAT", "SUN", "MON", "TUE", "WED", "THU", "FRI"];

/** Two decimal places, matching DECIMAL(10,2). Rejects "12.345" rather than rounding it. */
const money = z
  .string()
  .regex(/^\d{1,8}(\.\d{1,2})?$/, "Not an amount")
  .refine((value) => Number(value) > 0, "Must be more than zero");

const bilingual = {
  nameEn: z.string().trim().min(1).max(120),
  nameAr: z.string().trim().min(1).max(120),
};

function ownerPath(path: string, error?: string): string {
  return error ? `${path}?error=${error}` : `${path}?saved=1`;
}

/**
 * Resolves the acting owner and the salon they may touch, or redirects. Every
 * exported action below starts here — a Server Action is a public POST endpoint,
 * and the page that rendered the form proves nothing about who is posting.
 */
async function guard(
  locale: (typeof routing.locales)[number],
): Promise<{ ownerId: string; salonId: string }> {
  const owned = await requireOwnedSalon();

  // `return redirect(...)` rather than a bare call: next-intl's redirect is
  // typed `never`, but it is destructured from createNavigation, and TypeScript
  // only narrows control flow on a never-returning call through a name with an
  // explicit type annotation. Returning it narrows regardless.
  if (!owned.ok) {
    return redirect({ href: owned.reason === "auth" ? "/auth/login" : "/owner", locale });
  }

  return { ownerId: owned.ownerId, salonId: owned.salonId };
}

// ---------------------------------------------------------------- salon ----

/**
 * An optional map coordinate. Blank is a real answer — the column is nullable
 * and the picker offers a "clear" — so an empty field becomes null rather than
 * a validation error. Out-of-range values are rejected outright.
 */
const coordinate = (limit: number) =>
  z
    .union([z.string(), z.number()])
    .optional()
    .transform((value) =>
      value === undefined || String(value).trim() === "" ? null : Number(value),
    )
    .refine(
      (value) => value === null || (Number.isFinite(value) && Math.abs(value) <= limit),
      "Coordinate out of range",
    );

const salonSchema = z.object({
  ...bilingual,
  descriptionEn: z.string().trim().min(1).max(2000),
  descriptionAr: z.string().trim().min(1).max(2000),
  genderFocus: z.enum(["MEN", "WOMEN", "UNISEX"]),
  city: z.string().trim().min(1).max(80),
  address: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(6).max(20),
  lat: coordinate(90),
  lng: coordinate(180),
});

export async function saveSalon(formData: FormData): Promise<void> {
  const parsed = salonSchema.safeParse(Object.fromEntries(formData));
  const locale = localeSchema.safeParse(formData.get("locale")).data ?? routing.defaultLocale;

  if (!parsed.success) {
    return redirect({ href: ownerPath("/owner/profile", "invalid"), locale });
  }

  // Half a coordinate is not a location. If either value is missing the pair is
  // dropped, so a partially-filled form cannot store a point on the equator.
  const { lat, lng, ...rest } = parsed.data;
  const located = lat !== null && lng !== null;
  const fields = { ...rest, lat: located ? lat : null, lng: located ? lng : null };

  const session = await auth();
  if (!session?.user || session.user.role !== "SALON_OWNER") {
    return redirect({ href: "/auth/login", locale });
  }

  const existing = await prisma.salon.findFirst({
    where: { ownerId: session.user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (existing) {
    // The slug is deliberately not recomputed on rename: it is the public URL,
    // and silently moving it would break every link a salon has shared.
    await prisma.salon.update({ where: { id: existing.id }, data: fields });
  } else {
    await prisma.salon.create({
      data: {
        ...fields,
        ownerId: session.user.id,
        slug: await uniqueSlug(fields.nameEn),
        // A new salon is invisible to customers until an admin approves it.
        status: "PENDING_VERIFICATION",
      },
    });
  }

  revalidatePath(`/${locale}/owner`);
  return redirect({ href: ownerPath("/owner/profile"), locale });
}

// -------------------------------------------------------------- service ----

const serviceSchema = z.object({
  serviceId: z.string().optional(),
  ...bilingual,
  descriptionEn: z.string().trim().max(2000).optional(),
  descriptionAr: z.string().trim().max(2000).optional(),
  categoryId: z.string().min(1),
  durationMinutes: z.coerce.number().int().min(5).max(600),
  price: money,
});

export async function saveService(formData: FormData): Promise<void> {
  const parsed = serviceSchema.safeParse(Object.fromEntries(formData));
  const locale = localeSchema.safeParse(formData.get("locale")).data ?? routing.defaultLocale;
  const owned = await guard(locale);

  if (!parsed.success) {
    return redirect({ href: ownerPath("/owner/services", "invalid"), locale });
  }

  const { serviceId, ...fields } = parsed.data;

  if (serviceId) {
    // Scoped by salonId: another salon's service id matches nothing.
    const updated = await prisma.service.updateMany({
      where: { id: serviceId, salonId: owned.salonId },
      data: fields,
    });

    if (updated.count === 0) {
      return redirect({ href: ownerPath("/owner/services", "missing"), locale });
    }
  } else {
    const service = await prisma.service.create({
      data: { ...fields, salonId: owned.salonId },
    });

    // A service nobody can perform is unbookable, so every active member picks
    // it up by default. The staff page is where that gets narrowed.
    const staff = await prisma.staff.findMany({
      where: { salonId: owned.salonId, isActive: true },
      select: { id: true },
    });

    await prisma.staffService.createMany({
      data: staff.map((member) => ({ staffId: member.id, serviceId: service.id })),
    });
  }

  revalidatePath(`/${locale}/owner/services`);
  return redirect({ href: ownerPath("/owner/services"), locale });
}

const toggleSchema = z.object({
  id: z.string().min(1),
  active: z.enum(["true", "false"]),
});

export async function setServiceActive(formData: FormData): Promise<void> {
  const parsed = toggleSchema.safeParse(Object.fromEntries(formData));
  const locale = localeSchema.safeParse(formData.get("locale")).data ?? routing.defaultLocale;
  const owned = await guard(locale);

  if (!parsed.success) {
    return redirect({ href: ownerPath("/owner/services", "invalid"), locale });
  }

  // Retiring a service deactivates it rather than deleting it: booking history
  // snapshots the price but still points at the row, and past visits must stay
  // readable. Deactivated services vanish from browse and from availability.
  await prisma.service.updateMany({
    where: { id: parsed.data.id, salonId: owned.salonId },
    data: { isActive: parsed.data.active === "true" },
  });

  revalidatePath(`/${locale}/owner/services`);
  return redirect({ href: ownerPath("/owner/services"), locale });
}

// ---------------------------------------------------------------- staff ----

const staffSchema = z.object({
  staffId: z.string().optional(),
  name: z.string().trim().min(1).max(120),
  bioEn: z.string().trim().max(500).optional(),
  bioAr: z.string().trim().max(500).optional(),
});

export async function saveStaff(formData: FormData): Promise<void> {
  const parsed = staffSchema.safeParse(Object.fromEntries(formData));
  const locale = localeSchema.safeParse(formData.get("locale")).data ?? routing.defaultLocale;
  const owned = await guard(locale);

  if (!parsed.success) {
    return redirect({ href: ownerPath("/owner/staff", "invalid"), locale });
  }

  const { staffId, ...fields } = parsed.data;

  // The photo, if one was posted. Decoded and re-encoded *before* the
  // transaction below: resizing is the slowest thing in this action by an order
  // of magnitude, and holding a write transaction open across it would make
  // every other staff save on this salon wait for someone else's upload.
  const upload = formData.get("photo");
  const removePhoto = formData.get("removePhoto") === "on";

  let uploadedImageId: string | null = null;

  if (upload instanceof File && upload.size > 0) {
    const stored = await storeImage(upload);

    if (!stored.ok) {
      return redirect({ href: ownerPath("/owner/staff", `photo-${stored.reason}`), locale });
    }

    uploadedImageId = stored.imageId;
  }

  // The photo being replaced or cleared, so its row can be dropped afterwards.
  const previousPhotoId = staffId
    ? (
        await prisma.staff.findFirst({
          where: { id: staffId, salonId: owned.salonId },
          select: { photoId: true },
        })
      )?.photoId ?? null
    : null;

  // Absent key means "leave the existing photo alone" — a save that does not
  // touch the file input must not silently delete the member's picture.
  const photoUpdate =
    uploadedImageId !== null
      ? { photoId: uploadedImageId }
      : removePhoto
        ? { photoId: null }
        : {};

  // Services this member performs, and the shifts they work. Both are posted
  // with the member, so one save leaves no half-configured staff behind.
  const serviceIds = formData.getAll("services").map(String).filter(Boolean);

  const shifts = DAYS.flatMap((day) => {
    const start = parseClock(String(formData.get(`start-${day}`) ?? ""));
    const end = parseClock(String(formData.get(`end-${day}`) ?? ""));
    // A day with no times, or with times the wrong way round, is a day off.
    return start === null || end === null || end <= start
      ? []
      : [{ dayOfWeek: day, startTime: formatMinutes(start), endTime: formatMinutes(end) }];
  });

  const owns = await prisma.service.findMany({
    where: { id: { in: serviceIds }, salonId: owned.salonId },
    select: { id: true },
  });
  const ownedServiceIds = owns.map((service) => service.id);

  try {
    await prisma.$transaction(async (tx) => {
      let id = staffId;

      if (id) {
        const updated = await tx.staff.updateMany({
          where: { id, salonId: owned.salonId },
          data: { ...fields, ...photoUpdate },
        });
        if (updated.count === 0) throw new Error("not-owned");
      } else {
        const created = await tx.staff.create({
          data: { ...fields, ...photoUpdate, salonId: owned.salonId },
        });
        id = created.id;
      }

      // Replace rather than diff: the form posts the complete intended set, and
      // these tables carry no data of their own worth preserving.
      await tx.staffService.deleteMany({ where: { staffId: id } });
      await tx.staffService.createMany({
        data: ownedServiceIds.map((serviceId) => ({ staffId: id!, serviceId })),
      });

      await tx.workingHour.deleteMany({ where: { staffId: id } });
      await tx.workingHour.createMany({
        data: shifts.map((shift) => ({ ...shift, staffId: id! })),
      });
    });
  } catch (error) {
    // The upload is stored before the transaction opens, so a rollback would
    // otherwise strand those bytes in the database with nothing referencing them.
    if (uploadedImageId) await deleteImage(uploadedImageId);
    throw error;
  }

  // Only once the row above is safely pointing somewhere else. Deleting first
  // would leave the member with no photo if the transaction then rolled back.
  if (previousPhotoId && previousPhotoId !== uploadedImageId && Object.keys(photoUpdate).length > 0) {
    await deleteImage(previousPhotoId);
  }

  revalidatePath(`/${locale}/owner/staff`);
  return redirect({ href: ownerPath("/owner/staff"), locale });
}

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export async function setStaffActive(formData: FormData): Promise<void> {
  const parsed = toggleSchema.safeParse(Object.fromEntries(formData));
  const locale = localeSchema.safeParse(formData.get("locale")).data ?? routing.defaultLocale;
  const owned = await guard(locale);

  if (!parsed.success) {
    return redirect({ href: ownerPath("/owner/staff", "invalid"), locale });
  }

  // Deactivating hides a member from new availability but leaves their booked
  // visits standing — those items still reserve their slots, which is correct:
  // someone has to perform them or the booking has to be cancelled outright.
  await prisma.staff.updateMany({
    where: { id: parsed.data.id, salonId: owned.salonId },
    data: { isActive: parsed.data.active === "true" },
  });

  revalidatePath(`/${locale}/owner/staff`);
  return redirect({ href: ownerPath("/owner/staff"), locale });
}

// -------------------------------------------------------------- bookings ----

const bookingStatusSchema = z.object({
  bookingId: z.string().min(1),
  status: z.enum(["CONFIRMED", "COMPLETED", "NO_SHOW", "CANCELLED"]),
});

export async function updateBookingStatus(formData: FormData): Promise<void> {
  const parsed = bookingStatusSchema.safeParse(Object.fromEntries(formData));
  const locale = localeSchema.safeParse(formData.get("locale")).data ?? routing.defaultLocale;
  const owned = await guard(locale);

  if (!parsed.success) {
    return redirect({ href: ownerPath("/owner/bookings", "invalid"), locale });
  }

  const booking = await prisma.booking.findFirst({
    where: { id: parsed.data.bookingId, salonId: owned.salonId },
    select: { id: true },
  });

  if (!booking) {
    return redirect({ href: ownerPath("/owner/bookings", "missing"), locale });
  }

  // setBookingStatus owns the transition table and the Booking/BookingItem
  // atomicity — this action only proves who is asking.
  const result = await setBookingStatus(booking.id, parsed.data.status);

  // A salon calling off a paid visit owes the money back. Same order as the
  // customer's own cancellation: release the slot, then refund, and surface a
  // gateway failure rather than hiding it.
  let refundError: string | undefined;
  if (result.ok && parsed.data.status === "CANCELLED") {
    refundError = (await refundIfPaid(booking.id)).error;
  }

  revalidatePath(`/${locale}/owner/bookings`);
  return redirect({
    href: ownerPath(
      "/owner/bookings",
      !result.ok ? "transition" : refundError ? "refund" : undefined,
    ),
    locale,
  });
}
