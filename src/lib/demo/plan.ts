// The demo organization, "Sharma Estates" (pnpm db:seed:demo, ROADMAP M5a):
// everything the seed creates, worked out from today's date and nothing else,
// so running it again gives the same buildings, tenants and leases, and the
// history always ends last month. Pure: no database, no clock.

import {
  addDays,
  addMonths,
  addMonthsToMonth,
  compareDates,
  financialYear,
  fyQuarter,
  monthOf,
  startOfMonth,
  type PlainDate,
  type YearMonth,
} from "@/lib/billing/dates";
import { makeGstin } from "@/lib/india/identifiers";
import { certificateDue } from "@/lib/tds/tracker";

export const DEMO_ORG_NAME = "Sharma Estates";
export const DEMO_EMAIL = "demo@sharma-estates.example";
const ORG_PAN = "AAKCS4821M";

export type BuildingKey = "tower" | "arcade";
type TenantKind = "company" | "llp" | "person";

export const DEMO_ENTITIES = {
  tower: {
    legalName: "Sharma Estates Private Limited",
    stateCode: "06",
    gstin: makeGstin("06", ORG_PAN),
    address:
      "12th Floor, Sharma Corporate Tower, Golf Course Road, Sector 43, Gurugram, Haryana 122002",
    bankName: "HDFC Bank",
    bankAccountName: "Sharma Estates Pvt Ltd",
    bankAccountNumber: "50200048214821",
    ifsc: "HDFC0001098",
    upiId: "sharmaestates@hdfcbank",
  },
  arcade: {
    legalName: "Sharma Estates Private Limited (Karnataka)",
    stateCode: "29",
    gstin: makeGstin("29", ORG_PAN),
    address:
      "3rd Floor, Sharma Arcade, 100 Feet Road, Indiranagar, Bengaluru, Karnataka 560038",
    bankName: "ICICI Bank",
    bankAccountName: "Sharma Estates Pvt Ltd",
    bankAccountNumber: "054205003307",
    ifsc: "ICIC0000542",
    upiId: "sharmaestates.blr@icici",
  },
} as const;

export const DEMO_ORG = {
  name: DEMO_ORG_NAME,
  legalName: "Sharma Estates Private Limited",
  pan: ORG_PAN,
};

export type DemoUnit = {
  code: string;
  /** Hundredths of a sq ft. */
  carpetArea: number;
  chargeableArea: number;
  status: "vacant" | "fit_out";
};

export type DemoBuilding = {
  key: BuildingKey;
  name: string;
  address: string;
  city: string;
  stateCode: string;
  invoicePrefix: string;
  creditNotePrefix: string;
  settings: Record<string, unknown>;
  floors: { label: string; units: DemoUnit[] }[];
};

/** Chargeable (super built-up) area is about 35% more than carpet. */
const unit = (
  code: string,
  carpetSqft: number,
  status: DemoUnit["status"] = "vacant",
): DemoUnit => ({
  code,
  carpetArea: carpetSqft * 100,
  chargeableArea: Math.round(carpetSqft * 1.35) * 100,
  status,
});

/**
 * An 8-floor office block in Gurugram (4 offices a floor) and a building
 * with shopfronts on the ground floor and offices above in Bengaluru.
 */
export const DEMO_BUILDINGS: DemoBuilding[] = [
  {
    key: "tower",
    name: "Sharma Corporate Tower",
    address: "Golf Course Road, Sector 43",
    city: "Gurugram",
    stateCode: "06",
    invoicePrefix: "SCT",
    creditNotePrefix: "SCTCN",
    settings: {},
    floors: ["Ground", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th"].map(
      (label, f) => ({
        label,
        units: [1, 2, 3, 4].map((n) =>
          unit(
            `${f === 0 ? "G" : f}0${n}`,
            1400 + (((f * 4 + n) * 613) % 3200),
            f === 7 && n === 4 ? "fit_out" : "vacant",
          ),
        ),
      }),
    ),
  },
  {
    key: "arcade",
    name: "Sharma Arcade",
    address: "100 Feet Road, Indiranagar",
    city: "Bengaluru",
    stateCode: "29",
    invoicePrefix: "SA",
    creditNotePrefix: "SACN",
    // Shops here are given 10 days to pay; the tower uses the default 7.
    settings: { "invoice.dueDays": 10 },
    floors: [
      {
        label: "Ground",
        units: [1, 2, 3, 4, 5, 6, 7].map((n) =>
          unit(`G${n}`, 450 + ((n * 317) % 950)),
        ),
      },
      ...["1st", "2nd", "3rd"].map((label, f) => ({
        label,
        units: [1, 2, 3, 4].map((n) =>
          unit(`${f + 1}0${n}`, 1100 + (((f * 4 + n) * 421) % 1600)),
        ),
      })),
    ],
  },
];

type TenantSpec = {
  name: string;
  kind: TenantKind;
  /** GST state of the tenant's registration (or address, without a GSTIN). */
  stateCode: string;
  building: BuildingKey;
  contact: string;
  gstin?: false;
};

// 30 offices in the tower, then 6 shops and 9 offices in the arcade.
const TENANTS: TenantSpec[] = [
  {
    name: "Kalinga Infotech Pvt Ltd",
    kind: "company",
    stateCode: "06",
    building: "tower",
    contact: "Rohit Mohanty",
  },
  {
    name: "Saraswati EdTech Pvt Ltd",
    kind: "company",
    stateCode: "06",
    building: "tower",
    contact: "Neha Agarwal",
  },
  {
    name: "Arya Wealth Advisors LLP",
    kind: "llp",
    stateCode: "06",
    building: "tower",
    contact: "Vikram Arya",
  },
  {
    name: "Trikuta Analytics Pvt Ltd",
    kind: "company",
    stateCode: "06",
    building: "tower",
    contact: "Sameer Raina",
  },
  {
    name: "Nandi Hills Consulting Pvt Ltd",
    kind: "company",
    stateCode: "06",
    building: "tower",
    contact: "Kavya Reddy",
  },
  {
    name: "Shivalik Healthcare Services Pvt Ltd",
    kind: "company",
    stateCode: "06",
    building: "tower",
    contact: "Dr. Anil Thakur",
  },
  {
    name: "Mehra & Bhatia Associates LLP",
    kind: "llp",
    stateCode: "06",
    building: "tower",
    contact: "Pooja Mehra",
  },
  {
    name: "Aravalli Fintech Pvt Ltd",
    kind: "company",
    stateCode: "06",
    building: "tower",
    contact: "Karan Yadav",
  },
  {
    name: "Indraprastha Legal LLP",
    kind: "llp",
    stateCode: "07",
    building: "tower",
    contact: "Ritu Khanna",
  },
  {
    name: "Chandigarh Freight Forwarders Pvt Ltd",
    kind: "company",
    stateCode: "06",
    building: "tower",
    contact: "Harpreet Gill",
  },
  {
    name: "Pushpak Aviation Services Pvt Ltd",
    kind: "company",
    stateCode: "27",
    building: "tower",
    contact: "Sunil Kulkarni",
  },
  {
    name: "Rangoli Media Labs Pvt Ltd",
    kind: "company",
    stateCode: "06",
    building: "tower",
    contact: "Ishaan Kapoor",
  },
  {
    name: "Kaveri Cloud Systems Pvt Ltd",
    kind: "company",
    stateCode: "06",
    building: "tower",
    contact: "Deepa Iyer",
  },
  {
    name: "Banyan Tree Capital Pvt Ltd",
    kind: "company",
    stateCode: "07",
    building: "tower",
    contact: "Amit Bansal",
  },
  {
    name: "Sapphire HR Solutions Pvt Ltd",
    kind: "company",
    stateCode: "06",
    building: "tower",
    contact: "Meenal Joshi",
  },
  {
    name: "Gulmohar Interiors Pvt Ltd",
    kind: "company",
    stateCode: "06",
    building: "tower",
    contact: "Farhan Qureshi",
  },
  {
    name: "Neelgagan Travels Pvt Ltd",
    kind: "company",
    stateCode: "06",
    building: "tower",
    contact: "Sanjay Chauhan",
  },
  {
    name: "Prakriti Agritech Pvt Ltd",
    kind: "company",
    stateCode: "06",
    building: "tower",
    contact: "Anjali Saini",
  },
  {
    name: "Vistaar Data Services Pvt Ltd",
    kind: "company",
    stateCode: "06",
    building: "tower",
    contact: "Manish Goyal",
  },
  {
    name: "Suryoday Solar Pvt Ltd",
    kind: "company",
    stateCode: "06",
    building: "tower",
    contact: "Rajesh Dahiya",
  },
  {
    name: "Anantam Insurance Brokers Pvt Ltd",
    kind: "company",
    stateCode: "06",
    building: "tower",
    contact: "Swati Malhotra",
  },
  {
    name: "Kshitij Architects LLP",
    kind: "llp",
    stateCode: "06",
    building: "tower",
    contact: "Aditya Sehgal",
  },
  {
    name: "Dhanvantari Diagnostics Pvt Ltd",
    kind: "company",
    stateCode: "06",
    building: "tower",
    contact: "Dr. Shalini Rao",
  },
  {
    name: "Parivahan Logistics Pvt Ltd",
    kind: "company",
    stateCode: "06",
    building: "tower",
    contact: "Gurmeet Singh",
  },
  {
    name: "Tarang Telecom Pvt Ltd",
    kind: "company",
    stateCode: "06",
    building: "tower",
    contact: "Nitin Bhardwaj",
  },
  {
    name: "Samarth Engineering Pvt Ltd",
    kind: "company",
    stateCode: "06",
    building: "tower",
    contact: "Prakash Jain",
  },
  {
    name: "Ekam Software Pvt Ltd",
    kind: "company",
    stateCode: "06",
    building: "tower",
    contact: "Simran Kaur",
  },
  {
    name: "Sanjeevani Pharma Distributors Pvt Ltd",
    kind: "company",
    stateCode: "06",
    building: "tower",
    contact: "Vivek Garg",
  },
  {
    name: "Haveli Hospitality Pvt Ltd",
    kind: "company",
    stateCode: "06",
    building: "tower",
    contact: "Rakesh Rathore",
  },
  {
    name: "Ojas Wellness Pvt Ltd",
    kind: "company",
    stateCode: "06",
    building: "tower",
    contact: "Tanvi Arora",
  },
  // Shops on the arcade's ground floor: a few proprietors who don't deduct TDS.
  {
    name: "Malnad Coffee House",
    kind: "person",
    stateCode: "29",
    building: "arcade",
    contact: "Suresh Gowda",
  },
  {
    name: "Udupi Sagar Restaurant",
    kind: "person",
    stateCode: "29",
    building: "arcade",
    contact: "Ganesh Shetty",
  },
  {
    name: "Mysore Silk Emporium Pvt Ltd",
    kind: "company",
    stateCode: "29",
    building: "arcade",
    contact: "Lakshmi Narayan",
  },
  {
    name: "Namma Pharmacy",
    kind: "person",
    stateCode: "29",
    building: "arcade",
    contact: "Mohammed Irfan",
  },
  {
    name: "Bluebell Footwear Pvt Ltd",
    kind: "company",
    stateCode: "29",
    building: "arcade",
    contact: "Arjun Menon",
  },
  {
    name: "Kumar Tailors",
    kind: "person",
    stateCode: "29",
    building: "arcade",
    contact: "Ramesh Kumar",
    gstin: false,
  },
  {
    name: "Hoysala Software Labs Pvt Ltd",
    kind: "company",
    stateCode: "29",
    building: "arcade",
    contact: "Pradeep Hegde",
  },
  {
    name: "Tungabhadra Robotics Pvt Ltd",
    kind: "company",
    stateCode: "29",
    building: "arcade",
    contact: "Nikhil Patil",
  },
  {
    name: "Kodagu Spices Exports Pvt Ltd",
    kind: "company",
    stateCode: "29",
    building: "arcade",
    contact: "Bopanna Cariappa",
  },
  {
    name: "Sahyadri Design Studio LLP",
    kind: "llp",
    stateCode: "29",
    building: "arcade",
    contact: "Ananya Bhat",
  },
  {
    name: "Vijayanagara Fintech Pvt Ltd",
    kind: "company",
    stateCode: "29",
    building: "arcade",
    contact: "Rahul Desai",
  },
  {
    name: "Garuda Drone Systems Pvt Ltd",
    kind: "company",
    stateCode: "36",
    building: "arcade",
    contact: "Srikanth Rao",
  },
  {
    name: "Mallige Fashion Pvt Ltd",
    kind: "company",
    stateCode: "29",
    building: "arcade",
    contact: "Divya Prakash",
  },
  {
    name: "Brindavan Realty Advisors LLP",
    kind: "llp",
    stateCode: "29",
    building: "arcade",
    contact: "Kiran Murthy",
  },
  {
    name: "Kanva Health Tech Pvt Ltd",
    kind: "company",
    stateCode: "29",
    building: "arcade",
    contact: "Shruti Kulkarni",
  },
];

/** The leases the demo is built to show (ROADMAP M5a). */
export const SPOTLIGHT = {
  /** Started two months ago with three months rent-free; the one lease in lock-in. */
  rentFreeNow: "Ekam Software Pvt Ltd",
  /** Had two months rent-free when it started, four years ago. */
  rentFreePast: "Hoysala Software Labs Pvt Ltd",
  /** Ends 60 days from today. */
  expiringSoon: "Ojas Wellness Pvt Ltd",
  /** Unpaid invoices: the last three months, the last two, and last month. */
  unpaid: {
    "Rangoli Media Labs Pvt Ltd": 3,
    "Gulmohar Interiors Pvt Ltd": 2,
    "Mysore Silk Emporium Pvt Ltd": 1,
  } as Record<string, number>,
  /** Paid with TDS, but their certificate for a quarter that's past due isn't in. */
  missingCertificates: [
    "Tarang Telecom Pvt Ltd",
    "Sapphire HR Solutions Pvt Ltd",
    "Kodagu Spices Exports Pvt Ltd",
  ],
};

export type DemoTenant = {
  name: string;
  building: BuildingKey;
  stateCode: string;
  pan: string;
  gstin: string | null;
  billingAddress: string;
  deductsTds: boolean;
  contact: { name: string; email: string; phone: string };
};

const letter = (n: number) => String.fromCharCode(65 + (n % 26));

/** PAN: 3 letters, the holder type (C company, F firm or LLP, P person), the name's initial, 4 digits, 1 letter. */
function panFor(spec: TenantSpec, i: number): string {
  const type = spec.kind === "company" ? "C" : spec.kind === "llp" ? "F" : "P";
  const initial =
    spec.kind === "person"
      ? spec.contact.split(" ").at(-1)![0]!
      : spec.name[0]!;
  return `A${letter(i * 7 + 1)}${letter(i * 3 + 4)}${type}${initial.toUpperCase()}${String(1000 + ((i * 7919) % 9000)).padStart(4, "0")}${letter(i * 11 + 2)}`;
}

const ADDRESSES: Record<string, string> = {
  "06": "Golf Course Road, Sector 43, Gurugram, Haryana 122002",
  "07": "Barakhamba Road, Connaught Place, New Delhi 110001",
  "27": "Andheri Kurla Road, Andheri East, Mumbai 400059",
  "29": "100 Feet Road, Indiranagar, Bengaluru 560038",
  "36": "HITEC City, Madhapur, Hyderabad 500081",
};

export const DEMO_TENANTS: DemoTenant[] = TENANTS.map((spec, i) => {
  const pan = panFor(spec, i);
  const slug = spec.name
    .toLowerCase()
    .replace(/\b(pvt|ltd|llp)\b/g, "")
    .replace(/[^a-z]+/g, "");
  // Tenants outside the building's state give the address their GSTIN is
  // registered at; the rest give the building.
  const inBuilding =
    spec.stateCode === (spec.building === "tower" ? "06" : "29");
  return {
    name: spec.name,
    building: spec.building,
    stateCode: spec.stateCode,
    pan,
    gstin: spec.gstin === false ? null : makeGstin(spec.stateCode, pan),
    billingAddress: inBuilding
      ? `${spec.building === "tower" ? "Sharma Corporate Tower" : "Sharma Arcade"}, ${ADDRESSES[spec.stateCode]}`
      : `${100 + i * 3}, ${ADDRESSES[spec.stateCode]}`,
    // Proprietors here don't deduct TDS; companies and LLPs do (10% on rent).
    deductsTds: spec.kind !== "person",
    contact: {
      name: spec.contact,
      email: `accounts@${slug}.example`,
      phone: `+91 98${String(10000000 + ((i * 7654321 + 3141592) % 89999999)).padStart(8, "0")}`,
    },
  };
});

export type DemoLease = {
  tenant: string;
  building: BuildingKey;
  /** Index of the unit in the building's units, floor by floor. */
  unitIndex: number;
  areaBasis: "carpet" | "chargeable";
  startDate: PlainDate;
  endDate: PlainDate;
  lockInEndDate: PlainDate;
  rentFreeMonths: number;
  /** Paise per sq ft a month, at the start of the lease. */
  rentRate: number;
  camRate: number;
  parkingSlots: number;
  /** Paise per slot a month. */
  parkingRate: number;
  escalation: { percentBp: number; everyMonths: number };
  /** Six months' starting rent. */
  depositMonths: number;
};

/**
 * One lease per tenant. Apart from the spotlight leases, every lease started
 * between three and eight years ago (so its 36-month lock-in is over) and
 * ends at least eleven months from now.
 */
export function demoLeases(today: PlainDate): DemoLease[] {
  const thisMonth = startOfMonth(monthOf(today));
  let towerUnit = 0;
  let shopUnit = 0;
  let arcadeOffice = 7; // the arcade's upper floors start after 7 shops
  return DEMO_TENANTS.map((t, i) => {
    // The arcade's first six tenants have its shops; the rest, its offices.
    const shop = t.building === "arcade" && i < 36;
    const unitIndex =
      t.building === "tower" ? towerUnit++ : shop ? shopUnit++ : arcadeOffice++;
    const termMonths = shop ? 72 : 108;
    let startDate = addMonths(
      thisMonth,
      -(shop ? 38 + ((i * 5) % 24) : 38 + ((i * 7) % 60)),
      "roll_forward",
    );
    // Two leases started mid-month.
    if (i === 4 || i === 41) startDate = addDays(startDate, 14);
    let endDate = addDays(addMonths(startDate, termMonths, "roll_forward"), -1);
    let rentFreeMonths = 0;
    if (t.name === SPOTLIGHT.rentFreeNow) {
      startDate = addMonths(thisMonth, -2, "roll_forward");
      endDate = addDays(addMonths(startDate, termMonths, "roll_forward"), -1);
      rentFreeMonths = 3;
    } else if (t.name === SPOTLIGHT.rentFreePast) {
      startDate = addMonths(thisMonth, -50, "roll_forward");
      endDate = addDays(addMonths(startDate, termMonths, "roll_forward"), -1);
      rentFreeMonths = 2;
    } else if (t.name === SPOTLIGHT.expiringSoon) {
      endDate = addDays(today, 60);
      startDate = addMonths(addDays(endDate, 1), -60, "roll_forward");
    }
    const rentRate = shop
      ? 22000 + ((i * 1300) % 9000)
      : t.building === "arcade"
        ? 7500 + ((i * 400) % 2500)
        : 9000 + ((i * 350) % 3500);
    return {
      tenant: t.name,
      building: t.building,
      unitIndex,
      // Shops are let on carpet area; offices on chargeable area.
      areaBasis: shop ? "carpet" : "chargeable",
      startDate,
      endDate,
      lockInEndDate: addDays(addMonths(startDate, 36, "roll_forward"), -1),
      rentFreeMonths,
      rentRate,
      camRate: t.building === "tower" ? 1800 : 1200,
      parkingSlots: t.building === "tower" && i % 3 === 0 ? 1 + (i % 4) : 0,
      parkingRate: 400000,
      // A third of leases: 15% every three years; the rest 5% a year.
      escalation:
        i % 3 === 1
          ? { percentBp: 1500, everyMonths: 36 }
          : { percentBp: 500, everyMonths: 12 },
      depositMonths: 6,
    };
  });
}

/**
 * The months with invoices and payments: the last three months, reaching
 * back further if needed so they include the latest quarter whose TDS
 * certificates are already due (for the missing certificates to show).
 */
export function historyMonths(today: PlainDate): YearMonth[] {
  const current = monthOf(today);
  let first = addMonthsToMonth(current, -3);
  // The latest quarter, before this one, whose certificate due date has passed.
  for (let back = 1; back <= 4; back++) {
    const q = fyQuarter(startOfMonth(addMonthsToMonth(current, -3 * back)));
    const fy = financialYear(q.start).label;
    if (compareDates(certificateDue(fy, q.quarter), today) < 0) {
      const lastMonth = monthOf(q.end);
      if (lastMonth < first) first = lastMonth;
      break;
    }
  }
  const months: YearMonth[] = [];
  for (let m = first; m < current; m = addMonthsToMonth(m, 1)) months.push(m);
  return months;
}

/** The day a tenant pays a month's invoice: a few days after it's dated, never after today. */
export function paymentDate(
  invoiceDate: PlainDate,
  tenantIndex: number,
  today: PlainDate,
): PlainDate {
  const day = addDays(invoiceDate, 3 + ((tenantIndex * 3) % 9));
  return compareDates(day, today) > 0 ? today : day;
}

const MODES = ["neft", "neft", "rtgs", "neft", "cheque", "imps"] as const;

export function paymentMode(tenantIndex: number) {
  return MODES[tenantIndex % MODES.length]!;
}
