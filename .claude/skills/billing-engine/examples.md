# Worked billing examples

Hand calculations to copy into tests. All amounts in rupees here; tests use paise.

## Compounding escalation with rupee rounding

Base ₹1,00,000/month, 5% every 12 months, compounding, lease 1 Apr 2026 – 31 Mar 2031.

| Period | Calculation | Monthly rent |
| --- | --- | --- |
| Apr 2026 – Mar 2027 | base | ₹1,00,000 |
| Apr 2027 – Mar 2028 | 1,00,000 × 1.05 | ₹1,05,000 |
| Apr 2028 – Mar 2029 | 1,05,000 × 1.05 | ₹1,10,250 |
| Apr 2029 – Mar 2030 | 1,10,250 × 1.05 = 1,15,762.50 → rounded | ₹1,15,763 |
| Apr 2030 – Mar 2031 | 1,15,763 × 1.05 = 1,21,551.15 → rounded | ₹1,21,551 |

Note year 5 is computed from the rounded year-4 figure.

## Mid-month escalation split

Rent ₹80,000 → ₹84,000 effective 15 March (31 days).

- 1–14 March: 14 days × 80,000 / 31 = ₹36,129.03
- 15–31 March: 17 days × 84,000 / 31 = ₹46,064.52
- March total taxable: ₹82,193.55

## Rent-free with CAM from day one

Lease 1 Jan 2027, rent-free 3 months, rent ₹2,00,000, CAM ₹25,000 (`waivedDuringRentFree = false`).

- Jan, Feb, Mar 2027 invoices: CAM ₹25,000 only
- Apr 2027 onward: rent ₹2,00,000 + CAM ₹25,000

## GST with paise and round-off (same state)

Taxable ₹1,06,917.75

- CGST 9% = 9,622.5975 → ₹9,622.60
- SGST 9% = ₹9,622.60
- Subtotal = ₹1,26,162.95
- Round off = +₹0.05
- Grand total = ₹1,26,163.00

## Payment with TDS

Invoice: taxable ₹1,00,000, GST ₹18,000, total ₹1,18,000. Tenant TDS 10% on taxable = ₹10,000.

- Received ₹1,08,000; TDS ₹10,000; settled ₹1,18,000 → status paid with TDS
- TDS record: ₹10,000, quarter of the payment date, certificate pending
