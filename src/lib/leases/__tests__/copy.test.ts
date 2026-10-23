import { describe, expect, it } from "vitest";
import { leaseTemplate } from "../copy";

const charge = {
  timing: "arrears" as const,
  gstRateBp: 1800,
  sacCode: "997212",
  startDate: "2024-04-01",
};

describe("leaseTemplate", () => {
  it("keeps the terms and drops ids, dates and the old area", () => {
    const template = leaseTemplate({
      buildingId: "b1",
      areaBasis: "carpet",
      noticePeriodMonths: 3,
      rentFreeMonths: 2,
      rentFreeDays: 0,
      settings: { "billing.partPeriodMethod": "days_in_period" },
      charges: [
        {
          ...charge,
          id: "c1",
          type: "rent",
          basis: "per_sqft",
          ratePaise: 9000,
          areaHundredths: 125050,
          endDate: "2027-03-31",
          frequency: "quarterly",
        },
        {
          ...charge,
          id: "c2",
          type: "parking",
          basis: "per_slot",
          ratePaise: 300000,
          slots: 2,
        },
      ],
      escalationRules: [
        {
          percentBp: 1500,
          everyMonths: 36,
          anchor: "custom",
          anchorDate: "2024-07-01",
        },
      ],
    });
    expect(template).toEqual({
      buildingId: "b1",
      areaBasis: "carpet",
      noticePeriodMonths: 3,
      rentFreeMonths: 2,
      rentFreeDays: 0,
      settings: { "billing.partPeriodMethod": "days_in_period" },
      charges: [
        {
          ...{ timing: "arrears", gstRateBp: 1800, sacCode: "997212" },
          type: "rent",
          basis: "per_sqft",
          ratePaise: 9000,
          areaHundredths: 0,
          frequency: "quarterly",
        },
        {
          ...{ timing: "arrears", gstRateBp: 1800, sacCode: "997212" },
          type: "parking",
          basis: "per_slot",
          ratePaise: 300000,
          slots: 2,
        },
      ],
      escalationRules: [
        { percentBp: 1500, everyMonths: 36, anchor: "lease_start" },
      ],
    });
  });
});
