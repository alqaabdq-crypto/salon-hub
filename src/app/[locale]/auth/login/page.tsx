"use client";

import { useState, type FormEvent } from "react";
import { signIn, getSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const dashboardPathByRole: Record<string, string> = {
  CUSTOMER: "/account",
  SALON_OWNER: "/owner",
  ADMIN: "/admin",
};

export default function LoginPage() {
  const t = useTranslations("Auth.Login");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(false);
    setIsSubmitting(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (!result || result.error) {
      setError(true);
      setIsSubmitting(false);
      return;
    }

    const session = await getSession();
    const role = session?.user?.role ?? "CUSTOMER";
    router.push(dashboardPathByRole[role] ?? "/account");
  }

  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <Card>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <h1 className="text-2xl font-bold text-center">{t("title")}</h1>

          <Input
            id="email"
            label={t("email")}
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <Input
            id="password"
            label={t("password")}
            type="password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />

          {error && <p className="text-sm text-red-600">{t("error")}</p>}

          <Button type="submit" disabled={isSubmitting}>
            {t("submit")}
          </Button>

          <p className="text-sm text-center text-gray-600 dark:text-gray-300">
            {t("noAccount")}{" "}
            <Link href="/auth/register" className="underline">
              {t("registerLink")}
            </Link>
          </p>
        </form>
      </Card>
    </main>
  );
}
