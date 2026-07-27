import { getFormatter, getTranslations } from "next-intl/server";
import { prisma } from "@/server/db/prisma";
import { createSiteReview } from "@/server/site-review/actions";

const RATINGS = [5, 4, 3, 2, 1];
const inputClass =
  "w-full rounded-lg border border-hairline bg-surface/60 px-3 py-2 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/30";

// Testimonials about Salon Hub, pinned to the bottom of the landing page. The
// form is a plain Server Action post — works with JavaScript disabled, like the
// rest of the site.
export async function SiteReviews({
  locale,
  status,
}: {
  locale: string;
  status?: string;
}) {
  const t = await getTranslations("SiteReviews");
  const format = await getFormatter();

  const reviews = await prisma.siteReview.findMany({
    orderBy: { createdAt: "desc" },
    take: 6,
  });

  return (
    <section id="reviews" className="mx-auto w-full max-w-6xl scroll-mt-24 px-6 pb-24">
      <div className="text-center">
        <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          <span className="text-gradient-brand">{t("title")}</span>
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-muted">{t("subtitle")}</p>
      </div>

      {status === "ok" && (
        <p
          role="status"
          className="mx-auto mt-6 max-w-xl rounded-xl border border-brand/40 bg-brand/10 px-4 py-3 text-center text-sm font-medium text-brand"
        >
          {t("successMsg")}
        </p>
      )}
      {status === "error" && (
        <p
          role="alert"
          className="mx-auto mt-6 max-w-xl rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-center text-sm font-medium text-red-400"
        >
          {t("errorMsg")}
        </p>
      )}

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[1fr_1.25fr]">
        {/* Submit form. */}
        <form
          action={createSiteReview}
          className="glass shadow-depth flex flex-col gap-4 rounded-3xl p-6"
        >
          <input type="hidden" name="locale" value={locale} />

          <div className="flex flex-col gap-1.5">
            <label htmlFor="review-name" className="text-sm font-medium">
              {t("nameLabel")}
            </label>
            <input
              id="review-name"
              name="name"
              required
              maxLength={60}
              placeholder={t("namePlaceholder")}
              className={inputClass}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="review-rating" className="text-sm font-medium">
              {t("ratingLabel")}
            </label>
            <select id="review-rating" name="rating" defaultValue="5" className={inputClass}>
              {RATINGS.map((n) => (
                <option key={n} value={n}>
                  {"★".repeat(n)} {t("stars", { count: n })}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="review-comment" className="text-sm font-medium">
              {t("commentLabel")}
            </label>
            <textarea
              id="review-comment"
              name="comment"
              required
              minLength={3}
              maxLength={500}
              rows={4}
              placeholder={t("commentPlaceholder")}
              className={`${inputClass} resize-y`}
            />
          </div>

          <button type="submit" className="btn-brand rounded-full px-6 py-3">
            {t("submit")}
          </button>
        </form>

        {/* Existing reviews. */}
        {reviews.length === 0 ? (
          <div className="glass shadow-depth flex items-center justify-center rounded-3xl p-8 text-center text-muted">
            {t("empty")}
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {reviews.map((review) => (
              <li
                key={review.id}
                className="card-3d glass shadow-depth flex flex-col rounded-2xl p-5"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{review.name}</p>
                  <p className="text-sm whitespace-nowrap" aria-label={t("stars", { count: review.rating })}>
                    <span className="text-gold">{"★".repeat(review.rating)}</span>
                    <span className="text-muted">{"★".repeat(5 - review.rating)}</span>
                  </p>
                </div>
                <p className="mt-2 flex-1 text-sm text-muted">{review.comment}</p>
                <p className="mt-3 text-xs text-muted">
                  {format.dateTime(review.createdAt, { dateStyle: "medium" })}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
