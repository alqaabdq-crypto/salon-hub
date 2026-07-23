import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { localized } from "@/i18n/content";
import { auth } from "@/server/auth/config";
import { prisma } from "@/server/db/prisma";
import { createBooking } from "@/server/booking/actions";
import {
  BOOKING_HORIZON_DAYS,
  getDayAvailability,
} from "@/server/booking/schedule";
import {
  addDays,
  isIsoDate,
  riyadhMinutesToInstant,
  riyadhToday,
} from "@/server/booking/time";

type Props = {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{
    services?: string | string[];
    date?: string;
    error?: string;
  }>;
};

const ERROR_KEYS = new Set(["taken", "unavailable", "date"]);

export default async function BookPage({ params, searchParams }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const { services: rawServices, date: rawDate, error } = await searchParams;

  const t = await getTranslations("Booking");
  const format = await getFormatter();

  const salon = await prisma.salon.findFirst({
    where: { slug, status: "APPROVED" },
    include: {
      services: {
        where: { isActive: true },
        include: { category: true },
        orderBy: { price: "asc" },
      },
    },
  });

  if (!salon) {
    notFound();
  }

  const today = riyadhToday(new Date());
  const lastBookable = addDays(today, BOOKING_HORIZON_DAYS);

  // An out-of-range or malformed date falls back to today rather than 404ing —
  // the date comes from a query string, and a stale bookmark is not an error.
  const date =
    rawDate && isIsoDate(rawDate) && rawDate >= today && rawDate <= lastBookable
      ? rawDate
      : today;

  const requested = new Set(
    typeof rawServices === "string" ? [rawServices] : (rawServices ?? []),
  );

  // Canonicalised to the salon's own ordering (cheapest first), so the sequence
  // a visit is performed in does not depend on query-string order, and unknown
  // ids drop out here rather than deeper in.
  const selected = salon.services.filter((service) => requested.has(service.id));

  const availability = selected.length
    ? await getDayAvailability({
        salonId: salon.id,
        serviceIds: selected.map((service) => service.id),
        date,
        now: new Date(),
      })
    : null;

  const totalDuration = selected.reduce(
    (sum, service) => sum + service.durationMinutes,
    0,
  );
  const totalPrice = selected.reduce(
    (sum, service) => sum + Number(service.price),
    0,
  );

  const session = await auth();
  const canBook = session?.user.role === "CUSTOMER";

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <Link href={`/salons/${salon.slug}`} className="text-sm underline">
        {localized(salon, "name", locale)}
      </Link>

      <h1 className="mt-2 text-3xl font-bold">
        {t("title", { salon: localized(salon, "name", locale) })}
      </h1>

      {error && ERROR_KEYS.has(error) && (
        <p
          role="alert"
          className="mt-6 rounded-lg border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
        >
          {t(`error_${error}` as "error_taken", { days: BOOKING_HORIZON_DAYS })}
        </p>
      )}

      {/* Step one is a plain GET form, like the browse filters: the selection
          lives in the URL, so a chosen basket of services survives a reload,
          a language switch and being shared. */}
      <form className="mt-8">
        <fieldset>
          <legend className="text-xl font-semibold">{t("chooseServices")}</legend>

          <ul className="mt-3 divide-y divide-gray-200 dark:divide-gray-800">
            {salon.services.map((service) => (
              <li key={service.id}>
                <label className="flex cursor-pointer items-center justify-between gap-4 py-3">
                  <span className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      name="services"
                      value={service.id}
                      defaultChecked={requested.has(service.id)}
                      className="size-4"
                    />
                    <span>
                      <span className="block font-medium">
                        {localized(service, "name", locale)}
                      </span>
                      <span className="block text-sm text-gray-600 dark:text-gray-300">
                        {localized(service.category, "name", locale)} ·{" "}
                        {t("minutes", { count: service.durationMinutes })}
                      </span>
                    </span>
                  </span>
                  <span className="shrink-0 font-medium">
                    {format.number(Number(service.price), {
                      style: "currency",
                      currency: "SAR",
                      maximumFractionDigits: 0,
                    })}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>

        <div className="mt-6 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="date" className="text-sm font-medium">
              {t("date")}
            </label>
            <input
              id="date"
              name="date"
              type="date"
              defaultValue={date}
              min={today}
              max={lastBookable}
              className="rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
            />
          </div>

          <button
            type="submit"
            className="rounded-full bg-foreground px-5 py-2.5 font-medium text-background"
          >
            {t("showTimes")}
          </button>
        </div>
      </form>

      {selected.length > 0 && (
        <p className="mt-6 text-sm text-gray-600 dark:text-gray-300">
          {t("summary", {
            count: selected.length,
            duration: totalDuration,
            price: format.number(totalPrice, {
              style: "currency",
              currency: "SAR",
              maximumFractionDigits: 0,
            }),
          })}
        </p>
      )}

      <section className="mt-10">
        <h2 className="text-xl font-semibold">{t("times")}</h2>

        {selected.length === 0 ? (
          <p className="mt-3 text-gray-600 dark:text-gray-300">{t("pickServices")}</p>
        ) : !availability || availability.slots.length === 0 ? (
          <p className="mt-3 text-gray-600 dark:text-gray-300">{t("noTimes")}</p>
        ) : (
          <>
            {!canBook && (
              <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
                {session?.user ? t("customersOnly") : t("signInToBook")}
              </p>
            )}

            {/* One form per slot: no client JS, and the whole flow still works
                if it never loads. The action recomputes availability from
                scratch, so these hidden fields are a request, not a promise. */}
            <ul className="mt-4 flex flex-wrap gap-2">
              {availability.slots.map((slot) => (
                <li key={slot.start}>
                  <form action={createBooking}>
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="slug" value={salon.slug} />
                    <input type="hidden" name="date" value={date} />
                    <input type="hidden" name="start" value={slot.start} />
                    {selected.map((service) => (
                      <input
                        key={service.id}
                        type="hidden"
                        name="services"
                        value={service.id}
                      />
                    ))}
                    <button
                      type="submit"
                      className="rounded-full border border-gray-300 px-4 py-2 text-sm hover:border-gray-500 dark:border-gray-700 dark:hover:border-gray-400"
                    >
                      {format.dateTime(riyadhMinutesToInstant(date, slot.start), {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </main>
  );
}
