"use client";

import { createContext, use, useState, type ComponentProps } from "react";
import { RunBillingForm } from "@/components/invoices/RunBillingForm";
import { SendAllForm } from "@/components/invoices/SendForms";
import { FormMessage } from "@/components/ui/field";
import type { FormState } from "@/lib/auth/forms";

// An item on the Today list goes away once it is dealt with, and the
// message its form showed would go with it ("Sent 3 invoices. 1 tenant has
// no email address…"). Successful results are shown here instead, above
// the list, which stays put. Refusals stay on the item, which stays too.

type Action = (state: FormState, form: FormData) => Promise<FormState>;

const Notify = createContext<(state: FormState) => void>(() => {});

export function NoticeArea({ children }: { children: React.ReactNode }) {
  const [notice, setNotice] = useState<FormState>();
  return (
    <Notify value={setNotice}>
      {notice?.message && (
        <div className="flex flex-col gap-2">
          <FormMessage message={notice.message} tone="success" />
          {notice.problems && notice.problems.length > 0 && (
            <ul role="alert" className="list-disc pl-5 text-sm">
              {notice.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {children}
    </Notify>
  );
}

/** `action`, reporting a successful result to the notice area. */
export function useNotifying(action: Action): Action {
  const notify = use(Notify);
  return async (state, form) => {
    const result = await action(state, form);
    if (result.tone === "success") notify(result);
    return result;
  };
}

export function TodaySendAllForm(props: ComponentProps<typeof SendAllForm>) {
  return <SendAllForm {...props} action={useNotifying(props.action)} />;
}

export function TodayRunBillingForm(
  props: ComponentProps<typeof RunBillingForm>,
) {
  return <RunBillingForm {...props} action={useNotifying(props.action)} />;
}
