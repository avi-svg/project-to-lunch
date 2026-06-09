import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth";
import {
  fetchPermissionsStatus,
  checkMyPermission,
  PERM_VIEW_HOUSING_HISTORY,
  PERM_MANAGE_HOUSING_HISTORY,
  type PermissionsStatusResponse,
} from "@/lib/server-permissions";
import { fetchAllBackendUsers, type BackendDirectoryUser } from "@/lib/server-users";
import { ManagePermissionsClient } from "@/components/manage-permissions-client";

export default async function ManagePermissionsPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id || !session.user.email) {
    redirect("/");
  }

  if (session.user.role !== "staff") {
    redirect("/dashboard");
  }

  const userId = session.user.id;

  let canManage = false;
  let isBootstrapped = false;

  try {
    const check = await checkMyPermission(userId, PERM_MANAGE_HOUSING_HISTORY);
    isBootstrapped = check.isBootstrapped;
    canManage = check.hasPermission;
  } catch {
    redirect("/dashboard");
  }

  if (isBootstrapped && !canManage) {
    redirect("/dashboard");
  }

  let viewPermissions: PermissionsStatusResponse | null = null;
  let managePermissions: PermissionsStatusResponse | null = null;
  let allStaff: BackendDirectoryUser[] = [];

  try {
    [viewPermissions, managePermissions] = await Promise.all([
      fetchPermissionsStatus(userId, PERM_VIEW_HOUSING_HISTORY),
      fetchPermissionsStatus(userId, PERM_MANAGE_HOUSING_HISTORY),
    ]);
  } catch {
    // page still renders with empty state
  }

  try {
    const all = await fetchAllBackendUsers();
    allStaff = all.filter((u) => u.role === "staff" || u.role === "admin");
  } catch {
    // page still renders
  }

  return (
    <main className="min-h-screen bg-stone-100 px-6 py-12 text-stone-900">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <div className="flex flex-wrap gap-3">
          <Link
            href="/dashboard"
            className="inline-flex rounded-2xl border border-stone-300 bg-white px-5 py-3 text-sm font-medium text-stone-900 transition hover:border-stone-900"
          >
            חזרה לדשבורד
          </Link>
        </div>

        <ManagePermissionsClient
          currentUserId={userId}
          isBootstrapped={isBootstrapped}
          initialViewPermissions={viewPermissions?.permissions ?? []}
          initialManagePermissions={managePermissions?.permissions ?? []}
          allStaff={allStaff}
        />
      </div>
    </main>
  );
}
