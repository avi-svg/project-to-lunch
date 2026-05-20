import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth";
import { VerifyAppointmentClient } from "@/components/verify-appointment-client";

export default async function VerifyPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/");
  }

  return <VerifyAppointmentClient />;
}
