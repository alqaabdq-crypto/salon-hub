import { requireRole } from "@/server/auth/rbac";

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function AdminLayout({ children, params }: Props) {
  const { locale } = await params;
  await requireRole(["ADMIN"], locale);
  return children;
}
