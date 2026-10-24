import { expect, test } from "@playwright/test";
import { signUpNewOwner } from "./helpers";

test("an owner adds a tenant with a contact, then finds them in the list", async ({
  page,
}) => {
  await signUpNewOwner(page);
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Tenants" })
    .click();
  await expect(page.getByText(/No tenants yet/)).toBeVisible();
  // The empty state carries its first action (UX rule 8).
  await expect(
    page
      .getByText(/No tenants yet/)
      .locator("..")
      .getByRole("link", { name: "Add tenant" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Add tenant" }).click();
  await page.getByLabel("Tenant name").fill("Acme Software Pvt Ltd");
  await page.getByLabel("Billing address").fill("101, Andheri East, Mumbai");
  await page.getByLabel("Contact name").fill("Priya Shah");
  await page.getByLabel("Contact phone (optional)").fill("98200 12345");
  await page.getByLabel("Contact's phone is on WhatsApp").selectOption("yes");

  // TDS on CAM at 2% while rent stays at 10%.
  await page.getByText("More options").click();
  await page
    .getByLabel("TDS rate on maintenance (CAM) (%) (optional)")
    .fill("2");
  // No state chosen: refused, since it decides CGST + SGST or IGST.
  await page.getByRole("button", { name: "Add tenant" }).click();
  await expect(
    page.getByText("Choose the state of their billing address."),
  ).toBeVisible();
  await page.getByLabel("State").selectOption("27");
  await page.getByRole("button", { name: "Add tenant" }).click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Acme Software Pvt Ltd",
  );
  await expect(
    page.getByText(
      "10% on rent. 2% on maintenance (CAM). 10% on parking. 10% on other charges.",
    ),
  ).toBeVisible();
  await expect(page.getByText("+919820012345 (WhatsApp)")).toBeVisible();
  // Priya has a phone but no email, so nobody receives invoices yet.
  await expect(
    page.getByText("Receives invoices", { exact: true }),
  ).toHaveCount(0);

  const visible = (label: string) =>
    page.getByLabel(label, { exact: true }).filter({ visible: true });
  // "Add a contact" is folded behind a secondary button.
  await page.getByText("Add a contact", { exact: true }).click();
  await visible("Contact name").fill("Rahul Accounts");
  await visible("Role").selectOption("billing");
  await visible("Email (optional)").fill("accounts@acme.in");
  await page.getByRole("button", { name: "Add contact" }).click();
  await expect(page.getByText("Added Rahul Accounts.")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Contacts (2)" }),
  ).toBeVisible();
  await expect(
    page.getByText("Receives invoices", { exact: true }),
  ).toHaveCount(1);

  // Making Rahul Legal would leave invoices with no email: refused.
  await page.getByRole("link", { name: "Edit Rahul Accounts" }).click();
  await expect(page).toHaveURL(/\/contacts\/[0-9a-f-]{36}$/);
  await visible("Role").selectOption("legal");
  await page.getByRole("button", { name: "Save contact" }).click();
  await expect(
    page.getByText(/Invoices would have no email to go to/),
  ).toBeVisible();

  // Removing Priya, the main contact, is fine: Rahul still gets invoices.
  await page.getByRole("link", { name: /^← Acme Software/ }).click();
  await page.getByRole("link", { name: "Edit Priya Shah" }).click();
  await expect(page).toHaveURL(/\/contacts\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "Remove Priya Shah" }).click();
  await expect(
    page.getByText(/^Remove Priya Shah from Acme Software/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Remove Priya Shah" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Acme Software Pvt Ltd",
  );
  await expect(
    page.getByRole("heading", { name: "Contacts (1)" }),
  ).toBeVisible();

  // A tenant's document: over 25 MB is refused before it's sent; a PDF is kept.
  await page.getByText("Upload a document", { exact: true }).click();
  const file = page
    .getByLabel("File", { exact: true })
    .filter({ visible: true });
  await file.setInputFiles({
    name: "huge scan.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.alloc(26 * 1024 * 1024, 0x25),
  });
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(
    page.getByText("That file is 26 MB; the most is 25 MB.", { exact: false }),
  ).toBeVisible();
  await file.setInputFiles({
    name: "PAN card.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n% e2e PAN\n%%EOF\n"),
  });
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(page.getByText("Uploaded PAN card.pdf.")).toBeVisible();
  await expect(
    page.getByRole("link", { name: /^PAN card\.pdf \(opens in a new tab\)/ }),
  ).toBeVisible();

  await page.goto("/tenants");
  // Rahul became the main contact when Priya was removed.
  await page.getByLabel("Search tenants").fill("accounts@acme.in");
  await expect(
    page.getByText("Acme Software Pvt Ltd").filter({ visible: true }),
  ).toBeVisible();
  await page.getByLabel("Search tenants").fill("nobody");
  await expect(page.getByText(/No tenants match “nobody”/)).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(page.getByLabel("Search tenants")).toHaveValue("");
  await expect(
    page.getByText("Acme Software Pvt Ltd").filter({ visible: true }),
  ).toBeVisible();
});
