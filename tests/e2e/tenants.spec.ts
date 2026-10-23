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
  await page.getByLabel("Contact WhatsApp on this number").selectOption("yes");

  // TDS on CAM at 2% while rent stays at 10%.
  await page.getByText("More options").click();
  await page
    .getByLabel("TDS rate on maintenance (CAM) (%) (optional)")
    .fill("2");
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
  await expect(
    page.getByText("Receives invoices", { exact: true }),
  ).toBeVisible();

  const visible = (label: string) =>
    page.getByLabel(label, { exact: true }).filter({ visible: true });
  await visible("Contact name").fill("Rahul Admin");
  await visible("Role").selectOption("admin");
  await visible("Email (optional)").fill("admin@acme.in");
  await page.getByRole("button", { name: "Add contact" }).click();
  await expect(page.getByText("Added Rahul Admin.")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Contacts (2)" }),
  ).toBeVisible();

  await page.goto("/tenants");
  await page.getByLabel("Search tenants").fill("9820012345");
  await expect(
    page.getByText("Acme Software Pvt Ltd").filter({ visible: true }),
  ).toBeVisible();
  await page.getByLabel("Search tenants").fill("nobody");
  await expect(page.getByText("No tenants match.")).toBeVisible();
});
