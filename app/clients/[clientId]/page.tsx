import { notFound } from "next/navigation";
import Link from "next/link";

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
  return (
    <>
      <div className="fixed bottom-4 right-4 z-50">
        <Link className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-xl transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2" href="/agency">
          <span aria-hidden="true">←</span> Agency portfolio
        </Link>
      </div>
      <ClientDashboard client={client} workspaceOptions={workspaceOptions} />
    </>
  );
}
