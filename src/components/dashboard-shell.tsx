import { getTranslations } from "next-intl/server";
import { LogoutButton } from "@/components/logout-button";

type Props = {
  name: string;
  role: string;
};

export async function DashboardShell({ name, role }: Props) {
  const t = await getTranslations("Dashboard");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-bold">{t("welcome", { name })}</h1>
      <p className="text-gray-600 dark:text-gray-300">{t("role", { role })}</p>
      <LogoutButton />
    </main>
  );
}
