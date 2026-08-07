import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/server/auth/config";
import { prisma } from "@/server/db/prisma";
import { createSupportTicket } from "@/server/support/actions";
import type { SupportTopic } from "@/generated/prisma/enums";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ sent?: string; error?: string; booking?: string }>;
};

const TOPICS: SupportTopic[] = ["BOOKING", "PAYMENT", "SALON", "ACCOUNT", "OTHER"];

const field =
  "rounded-lg border border-hairline bg-surface/60 px-3 py-2 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/30";

export default async function HelpPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { sent, error, booking } = await searchParams;
  const t = await getTranslations("Support");
  const format = await getFormatter();

  const session = await auth();

  // Signed-in customers get their own history and can attach a booking. Guests
  // get the form alone — they may be here precisely because they cannot sign in.
  const [tickets, bookings] = session?.user
    ? await Promise.all([
        prisma.supportTicket.findMany({
          where: { customerId: session.user.id },
          orderBy: { createdAt: "desc" },
          take: 20,
        }),
        prisma.booking.findMany({
          where: { customerId: session.user.id },
          include: { salon: { select: { nameEn: true, nameAr: true } } },
          orderBy: { startTime: "desc" },
          take: 20,
        }),
      ])
    : [[], []];

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-6">
      <h1 className="text-3xl font-extrabold tracking-tight">
        <span className="text-gradient-brand">{t("title")}</span>
      </h1>
      <p className="mt-3 text-muted">{t("intro")}</p>

      {sent && (
        <p
          role="status"
          className="mt-6 rounded-lg border border-green-600 bg-green-950/40 px-4 py-3 text-sm text-green-100"
        >
          {t("sent")}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="mt-6 rounded-lg border border-amber-500 bg-amber-950/30 px-4 py-3 text-sm text-amber-100"
        >
          {error === "too-many" ? t("errorTooMany") : t("errorInvalid")}
        </p>
      )}

      {/* No client JS: a plain Server Action form, like the booking flow. */}
      <form action={createSupportTicket} className="mt-8 flex flex-col gap-4">
        <input type="hidden" name="locale" value={locale} />

        {/* Honeypot. Hidden from people, tempting to bots. Not `type="hidden"`,
            which a bot would skip — it has to look fillable to work. */}
        <div className="absolute h-0 w-0 overflow-hidden" aria-hidden>
          <label>
            Website
            <input type="text" name="website" tabIndex={-1} autoComplete="off" />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{t("name")}</span>
            <input
              name="name"
              required
              maxLength={120}
              defaultValue={session?.user?.name ?? ""}
              className={field}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{t("email")}</span>
            <input
              name="email"
              type="email"
              required
              maxLength={200}
              defaultValue={session?.user?.email ?? ""}
              className={field}
            />
          </label>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{t("topic")}</span>
          <select name="topic" defaultValue="BOOKING" className={field}>
            {TOPICS.map((value) => (
              <option key={value} value={value}>
                {t(`topic${value}`)}
              </option>
            ))}
          </select>
        </label>

        {/* Only offered to signed-in customers: the action refuses a booking the
            sender does not own, so there is nothing to gain by showing it. */}
        {bookings.length > 0 && (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{t("booking")}</span>
            <select name="bookingId" defaultValue={booking ?? ""} className={field}>
              <option value="">{t("bookingNone")}</option>
              {bookings.map((row) => (
                <option key={row.id} value={row.id}>
                  {locale === "ar" ? row.salon.nameAr : row.salon.nameEn} —{" "}
                  {format.dateTime(row.startTime, { dateStyle: "medium", timeStyle: "short" })}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{t("subject")}</span>
          <input name="subject" required maxLength={160} className={field} />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{t("message")}</span>
          <textarea
            name="message"
            required
            rows={6}
            minLength={10}
            maxLength={4000}
            className={field}
          />
        </label>

        <div>
          <button type="submit" className="btn-brand rounded-full px-6 py-2.5 font-medium">
            {t("submit")}
          </button>
        </div>

        {!session?.user && <p className="text-sm text-muted">{t("guestNote")}</p>}
      </form>

      {/* The loop closing: a ticket you cannot follow up on is a suggestion box. */}
      {session?.user && (
        <section className="mt-12">
          <h2 className="text-xl font-bold">{t("yourRequests")}</h2>

          {tickets.length === 0 ? (
            <p className="mt-3 text-muted">{t("noRequests")}</p>
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {tickets.map((ticket) => (
                <li key={ticket.id} className="card-surface rounded-2xl p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-semibold">{ticket.subject}</p>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        ticket.status === "RESOLVED"
                          ? "border border-hairline bg-surface text-muted"
                          : ticket.status === "ANSWERED"
                            ? "border border-brand/30 bg-brand/10 text-brand"
                            : "border border-amber-500/40 bg-amber-500/10 text-amber-300"
                      }`}
                    >
                      {t(`status${ticket.status}`)}
                    </span>
                  </div>

                  <p className="mt-1 text-xs text-muted">
                    {t(`topic${ticket.topic}`)} ·{" "}
                    {format.dateTime(ticket.createdAt, { dateStyle: "medium" })}
                  </p>

                  <p className="mt-3 whitespace-pre-wrap text-sm text-muted">{ticket.message}</p>

                  {ticket.adminReply && (
                    <div className="mt-4 rounded-xl border border-brand/20 bg-brand/5 p-4">
                      <p className="text-xs font-semibold text-brand">{t("replyFrom")}</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm">{ticket.adminReply}</p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}
