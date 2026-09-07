import { notFound } from "next/navigation";

import { ClientDashboard } from "@/app/page";
import {
  listAuthorizedWorkspaceSummaries,
  requireAuthenticatedPageUser,
  resolveWorkspaceMembership,
} from "@/lib/workspace-access";

export default async function ClientPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const user = await requireAuthenticatedPageUser();
  const [client, workspaceOptions] = await Promise.all([
    resolveWorkspaceMembership(user.id, clientId),
    listAuthorizedWorkspaceSummaries(user.id),
  ]);
  if (!client) notFound();
  return <ClientDashboard client={client} workspaceOptions={workspaceOptions} />;
}
