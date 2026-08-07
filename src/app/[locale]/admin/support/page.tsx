import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { prisma } from "@/server/db/prisma";
import { replyToTicket, setTicketStatus } from "@/server/support/actions";
import type { SupportStatus } from "@/generated/prisma/enums";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ saved?: string; error?: string; status?: string }>;
};

const FILTERS: Array<SupportStatus | "ALL"> = ["OPEN", "ANSWERED", "RESOLVED", "ALL"];

const field =
  "w-full rounded-lg border border-hairline bg-surface/60 px-3 py-2 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/30";

function isStatus(value: string | undefined): value is SupportStatus {
  return value === "OPEN" || value === "ANSWERED" || value === "RESOLVED";
}

export default async function AdminSupportPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { saved, error, status } = await searchParams;
  const t = await getTranslations("Support");
  const tAdmin = await getTranslations("Admin");
  const format = await getFormatter();

  // Default to the queue that needs work rather than everything ever raised.
  const filter = isStatus(status) ? status : status === "ALL" ? undefined : "OPEN";

  const [tickets, counts] = await Promise.all([
    prisma.supportTicket.findMany({
      where: filter ? { status: filter } : {},
      include: {
        customer: { select: { name: true, email: true } },
        booking: {
          select: {
            id: true,
            startTime: true,
            salon: { select: { nameEn: true, nameAr: true, slug: true } },
          },
        },
      },
      // Oldest first within the open queue: the person waiting longest is the
      // one most likely to give up on you.
      orderBy: { createdAt: filter === "OPEN" ? "asc" : "desc" },
      take: 100,
    }),
    prisma.supportTicket.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const countFor = (value: SupportStatus) =>
    counts.find((row) => row.status === value)?._count._all ?? 0;

  return (
    <div className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{t("adminTitle")}</h2>
        {/* A bare "Admin" reads as a heading, not a way back. */}
        <Link href="/admin" className="text-sm font-medium text-brand hover:underline">
          <span aria-hidden>←</span> {tAdmin("title")}
        </Link>
      </div>

      {saved && (
        <p role="status" className="mt-4 rounded-lg border border-green-600 bg-green-950/40 px-4 py-3 text-sm text-green-100">
          {t("replySent")}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 rounded-lg border border-amber-500 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
          {t("errorInvalid")}
        </p>
      )}

      {/* Plain links, not a JS filter: the queue stays shareable and the back
          button behaves. */}
      <nav className="mt-5 flex flex-wrap gap-2">
        {FILTERS.map((value) => {
          const active = value === "ALL" ? filter === undefined : filter === value;
          return (
            <Link
              key={value}
              href={`/admin/support?status=${value}`}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                active
                  ? "border-brand/40 bg-brand/10 text-brand"
                  : "border-hairline text-muted hover:border-brand/30"
              }`}
            >
              {value === "ALL"
                ? t("filterAll")
                : `${t(`status${value}`)} (${countFor(value)})`}
            </Link>
          );
        })}
      </nav>

      {tickets.length === 0 ? (
        <p className="mt-8 text-muted">{t("queueEmpty")}</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-4">
          {tickets.map((ticket) => (
            <li key={ticket.id} className="card-surface rounded-2xl p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">{ticket.subject}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {ticket.name} · {ticket.email}
                    {/* A ticket from someone with no account is the common case
                        for "I cannot sign in", so it is worth flagging. */}
                    {ticket.customerId === null && ` · ${t("guest")}`}
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-hairline px-2.5 py-0.5 text-xs font-medium text-muted">
                  {t(`status${ticket.status}`)}
                </span>
              </div>

              <p className="mt-2 text-xs text-muted">
                {t(`topic${ticket.topic}`)} ·{" "}
                {format.dateTime(ticket.createdAt, { dateStyle: "medium", timeStyle: "short" })}
              </p>

              {ticket.booking && (
                <p className="mt-2 text-xs">
                  <Link
                    href={`/salons/${ticket.booking.salon.slug}`}
                    className="text-brand hover:underline"
                  >
                    {locale === "ar"
                      ? ticket.booking.salon.nameAr
                      : ticket.booking.salon.nameEn}
                  </Link>{" "}
                  <span className="text-muted">
                    · {format.dateTime(ticket.booking.startTime, { dateStyle: "medium", timeStyle: "short" })}
                  </span>
                </p>
              )}

              <p className="mt-3 whitespace-pre-wrap text-sm text-muted">{ticket.message}</p>

              {ticket.adminReply && (
                <div className="mt-4 rounded-xl border border-brand/20 bg-brand/5 p-4">
                  <p className="text-xs font-semibold text-brand">
                    {t("replySentAt", {
                      when: ticket.answeredAt
                        ? format.dateTime(ticket.answeredAt, { dateStyle: "medium" })
                        : "",
                    })}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{ticket.adminReply}</p>
                </div>
              )}

              {ticket.status !== "RESOLVED" && (
                <form action={replyToTicket} className="mt-4 flex flex-col gap-3">
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="ticketId" value={ticket.id} />

                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium">
                      {ticket.adminReply ? t("replyAgain") : t("reply")}
                    </span>
                    <textarea
                      name="reply"
                      required
                      rows={4}
                      maxLength={4000}
                      defaultValue={ticket.adminReply ?? ""}
                      className={field}
                    />
                  </label>

                  <div className="flex flex-wrap items-center gap-4">
                    <button type="submit" className="btn-brand rounded-full px-5 py-2 text-sm font-medium">
                      {t("sendReply")}
                    </button>
                    <label className="flex items-center gap-2 text-sm text-muted">
                      <input type="checkbox" name="resolve" />
                      {t("alsoResolve")}
                    </label>
                  </div>
                </form>
              )}

              {/* Status moves that need no reply: closing something handled by
                  phone, or reopening one that was closed too early. */}
              <form action={setTicketStatus} className="mt-3">
                <input type="hidden" name="locale" value={locale} />
                <input type="hidden" name="ticketId" value={ticket.id} />
                <input
                  type="hidden"
                  name="status"
                  value={ticket.status === "RESOLVED" ? "OPEN" : "RESOLVED"}
                />
                <button type="submit" className="text-sm text-muted underline hover:text-brand">
                  {ticket.status === "RESOLVED" ? t("reopen") : t("markResolved")}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
