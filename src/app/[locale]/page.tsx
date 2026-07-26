import { getTranslations, setRequestLocale } from "next-intl/server";
import { InteractiveHero } from "@/components/interactive-hero";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function LandingPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);

  const th = await getTranslations("Home");

  const features = [
    { icon: "⚡", title: th("feature1Title"), desc: th("feature1Desc") },
    { icon: "🛡️", title: th("feature2Title"), desc: th("feature2Desc") },
    { icon: "🌐", title: th("feature3Title"), desc: th("feature3Desc") },
  ];

  const stats = [
    { value: "2", label: th("stat1Label") },
    { value: "3", label: th("stat2Label") },
    { value: "100%", label: th("stat3Label") },
  ];

  return (
    <main className="flex flex-1 flex-col">
      <InteractiveHero />

      {/* Feature cards — glass panels that float on hover. */}
      <section className="scene mx-auto w-full max-w-6xl px-6 pb-8">
        <div className="grid gap-5 sm:grid-cols-3">
          {features.map((f, i) => (
            <div
              key={f.title}
              className="card-3d glass shadow-depth reveal rounded-3xl p-6"
              style={{ animationDelay: `${i * 90}ms` }}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/10 text-2xl">
                <span aria-hidden>{f.icon}</span>
              </div>
              <h3 className="mt-4 text-lg font-bold">{f.title}</h3>
              <p className="mt-1.5 text-sm text-muted">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Stats strip. */}
      <section className="mx-auto w-full max-w-6xl px-6 pb-20">
        <div className="glass shadow-depth reveal grid grid-cols-3 gap-4 rounded-3xl p-8">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-3xl font-extrabold sm:text-4xl">
                <span className="text-gradient-brand">{s.value}</span>
              </p>
              <p className="mt-1 text-xs font-medium text-muted sm:text-sm">{s.label}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
