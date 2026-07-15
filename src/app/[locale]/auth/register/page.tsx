"use client";

import { useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const dashboardPathByRole: Record<string, string> = {
  CUSTOMER: "/account",
  SALON_OWNER: "/owner",
};

export default function RegisterPage() {
  const t = useTranslations("Auth.Register");
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"CUSTOMER" | "SALON_OWNER">("CUSTOMER");
  const [error, setError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(false);
    setIsSubmitting(true);

    const response = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        password,
        phone: phone || undefined,
        role,
      }),
    });

    if (!response.ok) {
      setError(true);
      setIsSubmitting(false);
      return;
    }

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

    router.push(dashboardPathByRole[role]);
  }

  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <Card>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <h1 className="text-2xl font-bold text-center">{t("title")}</h1>

          <Input
            id="name"
            label={t("name")}
            type="text"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
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
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <Input
            id="phone"
            label={t("phone")}
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />

          <div className="flex flex-col gap-1.5 text-start">
            <label htmlFor="role" className="text-sm font-medium">
              {t("role")}
            </label>
            <select
              id="role"
              className="rounded-md border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-transparent"
              value={role}
              onChange={(event) =>
                setRole(event.target.value as "CUSTOMER" | "SALON_OWNER")
              }
            >
              <option value="CUSTOMER">{t("roleCustomer")}</option>
              <option value="SALON_OWNER">{t("roleSalonOwner")}</option>
            </select>
          </div>

          {error && <p className="text-sm text-red-600">{t("error")}</p>}

          <Button type="submit" disabled={isSubmitting}>
            {t("submit")}
          </Button>

          <p className="text-sm text-center text-gray-600 dark:text-gray-300">
            {t("haveAccount")}{" "}
            <Link href="/auth/login" className="underline">
              {t("loginLink")}
            </Link>
          </p>
        </form>
      </Card>
    </main>
  );
}
