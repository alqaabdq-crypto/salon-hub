import { requireRole } from "@/server/auth/rbac";

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function AccountLayout({ children, params }: Props) {
  const { locale } = await params;
  await requireRole(["CUSTOMER"], locale);
  return children;
}
