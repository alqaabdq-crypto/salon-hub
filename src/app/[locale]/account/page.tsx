import { auth } from "@/server/auth/config";
import { DashboardShell } from "@/components/dashboard-shell";

export default async function AccountPage() {
  const session = await auth();

  return (
    <DashboardShell
      name={session!.user.name ?? session!.user.email ?? ""}
      role={session!.user.role}
    />
  );
}
