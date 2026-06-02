import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth";
import { DashboardClient } from "@/components/dashboard-client";
import { StaffDashboardPanel } from "@/components/staff-dashboard-panel";
import { fetchStaffDashboardForUser } from "@/lib/server-shifts";
import type { StaffDashboardSummary } from "@/lib/shifts";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/");
  }

  const isStaff = session.user.role === "staff" || session.user.role === "admin";
  let staffData: StaffDashboardSummary | null = null;

  if (isStaff) {
    try {
      staffData = await fetchStaffDashboardForUser(session.user.id);
    } catch {
      // panel renders its own error state
    }
  }

  return (
    <DashboardClient
      userName={session.user.name ?? "Signed-in user"}
      userRole={session.user.role ?? "user"}
      staffPanel={isStaff ? <StaffDashboardPanel data={staffData} /> : null}
    />
  );
}
