import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { localized } from "@/i18n/content";
import { NeedsSalon } from "@/components/needs-salon";
import { auth } from "@/server/auth/config";
import { prisma } from "@/server/db/prisma";
import { getOwnedSalon } from "@/server/salon/owner";
import { saveService, setServiceActive } from "@/server/salon/actions";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ saved?: string; error?: string; edit?: string }>;
};

const field =
  "rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent";

export default async function OwnerServicesPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { saved, error, edit } = await searchParams;
  const session = (await auth())!;
  const t = await getTranslations("Owner");
  const format = await getFormatter();

  const salon = await getOwnedSalon(session.user.id);
  if (!salon) return <NeedsSalon />;

  const [services, categories] = await Promise.all([
    prisma.service.findMany({
      where: { salonId: salon.id },
      include: { category: true },
      orderBy: [{ isActive: "desc" }, { price: "asc" }],
    }),
    prisma.category.findMany({ orderBy: { nameEn: "asc" } }),
  ]);

  // `edit` is a query param, so it can name anything — resolve it against this
  // salon's own rows and fall back to the blank "add" form.
  const editing = edit ? services.find((service) => service.id === edit) : undefined;

  return (
    <div className="mt-8">
      {saved && (
        <p role="status" className="mb-4 rounded-lg border border-green-500 bg-green-50 px-4 py-3 text-sm text-green-900 dark:border-green-700 dark:bg-green-950 dark:text-green-100">
          {t("saved")}
        </p>
      )}
      {error && (
        <p role="alert" className="mb-4 rounded-lg border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          {t("errorInvalid")}
        </p>
      )}

      <h2 className="text-lg font-semibold">{t("navServices")}</h2>

      {services.length === 0 ? (
        <p className="mt-3 text-gray-600 dark:text-gray-300">{t("noServices")}</p>
      ) : (
        <ul className="mt-4 divide-y divide-gray-200 dark:divide-gray-800">
          {services.map((service) => (
            <li key={service.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className={`font-medium ${service.isActive ? "" : "text-gray-500 line-through"}`}>
                  {localized(service, "name", locale)}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  {localized(service.category, "name", locale)} ·{" "}
                  {t("minutes", { count: service.durationMinutes })} ·{" "}
                  {format.number(Number(service.price), {
                    style: "currency",
                    currency: "SAR",
                    maximumFractionDigits: 0,
                  })}
                </p>
              </div>

              <div className="flex items-center gap-4">
                <a href={`?edit=${service.id}`} className="text-sm underline">
                  {t("edit")}
                </a>
                <form action={setServiceActive}>
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="id" value={service.id} />
                  <input type="hidden" name="active" value={service.isActive ? "false" : "true"} />
                  <button type="submit" className="text-sm underline">
                    {service.isActive ? t("retire") : t("restore")}
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <h3 className="mt-10 text-lg font-semibold">
        {editing ? t("editService") : t("addService")}
      </h3>

      <form action={saveService} className="mt-4 flex flex-col gap-4">
        <input type="hidden" name="locale" value={locale} />
        {editing && <input type="hidden" name="serviceId" value={editing.id} />}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{t("nameEn")}</span>
            <input name="nameEn" required defaultValue={editing?.nameEn ?? ""} className={field} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{t("nameAr")}</span>
            <input name="nameAr" required dir="rtl" defaultValue={editing?.nameAr ?? ""} className={field} />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{t("category")}</span>
            <select name="categoryId" defaultValue={editing?.categoryId ?? ""} className={field}>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {localized(category, "name", locale)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{t("duration")}</span>
            <input
              name="durationMinutes"
              type="number"
              min={5}
              max={600}
              step={5}
              required
              defaultValue={editing?.durationMinutes ?? 30}
              className={field}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{t("price")}</span>
            <input
              name="price"
              // Text, not number: a browser number input localises the decimal
              // separator, and the action wants a plain "150.00".
              inputMode="decimal"
              pattern="\d{1,8}(\.\d{1,2})?"
              required
              defaultValue={editing ? Number(editing.price).toFixed(2) : ""}
              placeholder="150.00"
              className={field}
            />
          </label>
        </div>

        <div>
          <button type="submit" className="rounded-full bg-foreground px-5 py-2.5 font-medium text-background">
            {editing ? t("save") : t("addService")}
          </button>
          {editing && (
            <a href="?" className="ms-4 text-sm underline">
              {t("cancelEdit")}
            </a>
          )}
        </div>
      </form>
    </div>
  );
}
