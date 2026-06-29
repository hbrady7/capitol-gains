import { getRunConfig } from "@/lib/config";
import { ControlPanel } from "@/components/ControlPanel";

export const dynamic = "force-dynamic";

export default async function ControlsPage() {
  const config = await getRunConfig();
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <section>
        <h1 className="text-xl font-semibold tracking-tight">Controls</h1>
        <p className="mt-1 text-sm muted">
          The dials for the autonomous brain. These write straight to the database — no redeploy — and take
          effect on the next run. The kill switch and paper mode are the two that matter most.
        </p>
      </section>
      <ControlPanel initial={config} />
    </div>
  );
}
