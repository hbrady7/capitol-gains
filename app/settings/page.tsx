import { getConfig } from "@/lib/settings";
import { SettingsForm } from "@/components/SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const config = await getConfig();
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-zinc-500">
          One source of truth. These persist to the DB and override <code className="text-zinc-400">strategy.config.ts</code>{" "}
          defaults. Claude Code reads the same resolved config when it executes.
        </p>
      </div>
      <SettingsForm initial={config} />
    </div>
  );
}
