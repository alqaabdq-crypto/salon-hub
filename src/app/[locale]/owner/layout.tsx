import { requireRole } from "@/server/auth/rbac";

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function OwnerLayout({ children, params }: Props) {
  const { locale } = await params;
  await requireRole(["SALON_OWNER"], locale);
  return children;
}
