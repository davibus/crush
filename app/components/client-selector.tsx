"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ClientOption = {
  id: string;
  name: string;
  status: "active" | "configuration_required";
};

export default function ClientSelector({
  activeClientId,
  clients,
}: {
  activeClientId: string;
  clients: readonly ClientOption[];
}) {
  const router = useRouter();
  const [isNavigating, setIsNavigating] = useState(false);

  return (
    <label className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-300">
      <span className="sr-only sm:not-sr-only">Workspace</span>
      <select
        aria-label="Active client workspace"
        className="max-w-52 bg-slate-900 font-semibold text-white outline-none disabled:opacity-60"
        disabled={isNavigating}
        onChange={(event) => {
          setIsNavigating(true);
          router.push(`/clients/${encodeURIComponent(event.target.value)}`);
        }}
        value={activeClientId}
      >
        {clients.map((client) => (
          <option key={client.id} value={client.id}>
            {client.name}{client.status === "configuration_required" ? " (setup needed)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
