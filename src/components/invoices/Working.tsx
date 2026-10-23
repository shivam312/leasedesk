import type { Explanation } from "@/lib/billing/types";

/** One explanation: the rule in bold, then one sentence per step. */
export function Working({ explanation }: { explanation: Explanation }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="font-medium">{explanation.rule}</p>
      <ul className="flex flex-col gap-0.5 tabular-nums">
        {explanation.steps.map((step, i) => (
          <li key={i} className="break-words">
            {step}
          </li>
        ))}
      </ul>
    </div>
  );
}
