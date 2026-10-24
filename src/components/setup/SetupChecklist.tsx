import Link from "next/link";
import { Check } from "lucide-react";
import { Card } from "@/components/ui/field";
import type { setupChecklist } from "@/lib/setup/checklist";
import { markSetupStepAction } from "@/server/actions/setup";
import { MarkDoneForm } from "./MarkDoneForm";

/** "Set up LeaseDesk": shown on Today until every step is done. */
export function SetupChecklist({
  list,
}: {
  list: ReturnType<typeof setupChecklist>;
}) {
  return (
    <section aria-labelledby="setup-heading" className="max-w-2xl">
      <Card className="flex flex-col gap-3">
        <div>
          <h2 id="setup-heading" className="font-medium">
            Set up LeaseDesk
          </h2>
          <p className="text-sm text-muted-foreground">
            {list.doneCount} of {list.steps.length} done. This goes away when
            every step is done.
          </p>
        </div>
        <ol className="flex flex-col divide-y">
          {list.steps.map((step, i) => (
            <li key={step.key} className="flex gap-3 py-3">
              <span
                aria-hidden
                className={
                  step.done
                    ? "flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground text-background"
                    : "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs"
                }
              >
                {step.done ? <Check className="size-4" /> : i + 1}
              </span>
              <div className="flex min-w-0 flex-col gap-2">
                <p className="text-sm">
                  <span className="font-medium">{step.title}</span>
                  <span className="sr-only">
                    {step.done ? " (done)" : " (to do)"}
                  </span>
                  {!step.done && (
                    <span className="block text-muted-foreground">
                      {step.detail}
                    </span>
                  )}
                </p>
                {!step.done && (
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={step.href}
                      className="inline-flex min-h-11 items-center text-sm underline md:min-h-0"
                    >
                      {step.action}
                    </Link>
                    {step.canMark && step.markLabel && (
                      <MarkDoneForm
                        step={step.key}
                        label={step.markLabel}
                        action={markSetupStepAction}
                      />
                    )}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      </Card>
    </section>
  );
}
