import { getTranslations, setRequestLocale } from "next-intl/server";
import { localized } from "@/i18n/content";
import { NeedsSalon } from "@/components/needs-salon";
import { auth } from "@/server/auth/config";
import { prisma } from "@/server/db/prisma";
import { getOwnedSalon } from "@/server/salon/owner";
import { saveStaff, setStaffActive } from "@/server/salon/actions";
import type { DayOfWeek } from "@/generated/prisma/enums";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ saved?: string; error?: string; edit?: string }>;
};

// Saturday-first, as elsewhere: the working week here runs Sunday–Thursday.
const WEEK: DayOfWeek[] = ["SAT", "SUN", "MON", "TUE", "WED", "THU", "FRI"];

const field =
  "rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent";

export default async function OwnerStaffPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { saved, error, edit } = await searchParams;
  const session = (await auth())!;
  const t = await getTranslations("Owner");
  const tDay = await getTranslations("Day");

  const salon = await getOwnedSalon(session.user.id);
  if (!salon) return <NeedsSalon />;

  const [staff, services] = await Promise.all([
    prisma.staff.findMany({
      where: { salonId: salon.id },
      include: { workingHours: true, staffServices: { select: { serviceId: true } } },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    }),
    prisma.service.findMany({
      where: { salonId: salon.id, isActive: true },
      orderBy: { price: "asc" },
    }),
  ]);

  const editing = edit ? staff.find((member) => member.id === edit) : undefined;

  const hoursFor = (day: DayOfWeek) =>
    editing?.workingHours.find((hour) => hour.dayOfWeek === day);

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

      <h2 className="text-lg font-semibold">{t("navStaff")}</h2>

      {staff.length === 0 ? (
        <p className="mt-3 text-gray-600 dark:text-gray-300">{t("noStaff")}</p>
      ) : (
        <ul className="mt-4 divide-y divide-gray-200 dark:divide-gray-800">
          {staff.map((member) => (
            <li key={member.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className={`font-medium ${member.isActive ? "" : "text-gray-500 line-through"}`}>
                  {member.name}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  {t("worksDays", { count: member.workingHours.length })} ·{" "}
                  {t("performsServices", { count: member.staffServices.length })}
                </p>
              </div>

              <div className="flex items-center gap-4">
                <a href={`?edit=${member.id}`} className="text-sm underline">
                  {t("edit")}
                </a>
                <form action={setStaffActive}>
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="id" value={member.id} />
                  <input type="hidden" name="active" value={member.isActive ? "false" : "true"} />
                  <button type="submit" className="text-sm underline">
                    {member.isActive ? t("deactivate") : t("restore")}
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <h3 className="mt-10 text-lg font-semibold">
        {editing ? t("editStaff") : t("addStaff")}
      </h3>

      {services.length === 0 && (
        <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">{t("addServicesFirst")}</p>
      )}

      {/* Identity, skills and shifts save together: a member with no services or
          no hours is invisible to the availability engine, so a partial save
          would silently produce someone who can never be booked. */}
      <form action={saveStaff} className="mt-4 flex flex-col gap-6">
        <input type="hidden" name="locale" value={locale} />
        {editing && <input type="hidden" name="staffId" value={editing.id} />}

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{t("staffName")}</span>
            <input name="name" required defaultValue={editing?.name ?? ""} className={field} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{t("bioEn")}</span>
            <input name="bioEn" defaultValue={editing?.bioEn ?? ""} className={field} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{t("bioAr")}</span>
            <input name="bioAr" dir="rtl" defaultValue={editing?.bioAr ?? ""} className={field} />
          </label>
        </div>

        <fieldset>
          <legend className="text-sm font-medium">{t("performs")}</legend>
          <ul className="mt-2 flex flex-wrap gap-3">
            {services.map((service) => {
              const checked =
                !editing ||
                editing.staffServices.some((link) => link.serviceId === service.id);

              return (
                <li key={service.id}>
                  <label className="flex items-center gap-2 rounded-full border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-700">
                    <input
                      type="checkbox"
                      name="services"
                      value={service.id}
                      defaultChecked={checked}
                    />
                    {localized(service, "name", locale)}
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-medium">{t("shifts")}</legend>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{t("shiftsHint")}</p>

          <ul className="mt-3 flex flex-col gap-2">
            {WEEK.map((day) => {
              const hours = hoursFor(day);
              // A new member defaults to the common Saturday–Thursday day, so
              // the usual case is one click rather than fourteen fields.
              const defaultStart = editing ? (hours?.startTime ?? "") : day === "FRI" ? "" : "10:00";
              const defaultEnd = editing ? (hours?.endTime ?? "") : day === "FRI" ? "" : "22:00";

              return (
                <li key={day} className="flex flex-wrap items-center gap-3">
                  <span className="w-24 text-sm">{tDay(day)}</span>
                  <input
                    type="time"
                    name={`start-${day}`}
                    defaultValue={defaultStart}
                    className={`${field} py-1.5`}
                    aria-label={`${tDay(day)} ${t("from")}`}
                  />
                  <span className="text-sm text-gray-500">–</span>
                  <input
                    type="time"
                    name={`end-${day}`}
                    defaultValue={defaultEnd}
                    className={`${field} py-1.5`}
                    aria-label={`${tDay(day)} ${t("to")}`}
                  />
                </li>
              );
            })}
          </ul>
        </fieldset>

        <div>
          <button type="submit" className="rounded-full bg-foreground px-5 py-2.5 font-medium text-background">
            {editing ? t("save") : t("addStaff")}
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
