// An address line with its state, without saying the state twice.

import { GST_STATES } from "./identifiers";

/**
 * "Golf Course Road, Gurugram" in Haryana → "Golf Course Road, Gurugram,
 * Haryana"; an address that already names the state is left as it is.
 */
export function addressWithState(address: string, stateCode: string): string {
  const state = GST_STATES[stateCode] ?? stateCode;
  const words = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  if (` ${words(address)} `.includes(` ${words(state)} `)) return address;
  return address ? `${address}, ${state}` : state;
}
