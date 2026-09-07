import { notFound } from "next/navigation";

import { ClientDashboard } from "@/app/page";
import { getClientById, getClients } from "@/lib/clients";

export function generateStaticParams() {
  return getClients().map(({ id }) => ({ clientId: id }));
}

export default async function ClientPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const client = getClientById(clientId);
  if (!client) notFound();
  return <ClientDashboard client={client} />;
}
