import { test, expect } from "@playwright/test";

const API_URL = process.env.SPLIX_E2E_API_URL || "http://127.0.0.1:8000";

test("clear navigation and optional details keep forms and confirmations intact", async ({
  page,
  request,
}) => {
  const suffix = Date.now();
  const registered = await request.post(`${API_URL}/api/v1/auth/register`, {
    data: {
      displayName: "Alex",
      email: `simple-${suffix}@example.com`,
      password: "password1",
    },
  });
  expect(registered.ok()).toBeTruthy();
  const user = await registered.json();
  const created = await request.post(`${API_URL}/api/v1/groups`, {
    headers: { Authorization: `Bearer ${user.sessionToken}` },
    data: { name: "Weekend" },
  });
  expect(created.ok()).toBeTruthy();
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "Email", exact: true })
    .fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill("password1");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page
    .getByRole("button", { name: "Payment reminders", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Payment reminders", exact: true }),
  ).toBeVisible();
  const privacy = page.getByRole("button", {
    name: "Privacy & how it works",
    exact: true,
  });
  await expect(privacy).toHaveAttribute("aria-expanded", "false");
  await privacy.focus();
  await page.keyboard.press("Enter");
  await expect(privacy).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByText(/Selected notifications are processed on this phone/),
  ).toBeVisible();
  await privacy.click();
  await expect(
    page.getByText(/Selected notifications are processed on this phone/),
  ).not.toBeVisible();
  await page.screenshot({
    path: "test-results/simple-reminders.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Back to your groups", exact: true })
    .click();
  await page.getByRole("tab", { name: "You", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your account", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Delete account", exact: true }),
  ).not.toBeVisible();
  await page
    .getByRole("button", { name: "Account deletion", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Delete account", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText(/Existing group financial history is retained/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Account deletion", exact: true })
    .click();
  await page.screenshot({
    path: "test-results/simple-account.png",
    fullPage: true,
  });
  await page.getByRole("tab", { name: "Groups", exact: true }).click();
  await page.getByRole("button", { name: "Open Weekend", exact: true }).click();
  await page
    .getByRole("button", { name: "+ Add expense", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "What was it for?", exact: true })
    .fill("Dinner");
  await page
    .getByRole("textbox", { name: "Amount (₹)", exact: true })
    .fill("88.88");
  await expect(
    page.getByRole("textbox", { name: "Date", exact: true }),
  ).not.toBeVisible();
  await page
    .getByRole("button", { name: "Date & category", exact: true })
    .click();
  await page
    .getByRole("radio", { name: "Category: Home", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Date", exact: true })
    .fill("2026-10-24");
  await page
    .getByRole("button", { name: "Date & category", exact: true })
    .click();
  await page.getByRole("button", { name: "Add a note", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Note (optional)", exact: true })
    .fill("Keep this note after collapsing");
  await page.getByRole("button", { name: "Add a note", exact: true }).click();
  await page.getByRole("button", { name: "Add a note", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Note (optional)", exact: true }),
  ).toHaveValue("Keep this note after collapsing");
  await page.getByRole("button", { name: "Review split", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Review expense", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("₹88.88", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Dinner · Home", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Keep this note after collapsing", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm shared expense", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/simple-expense-review.png",
    fullPage: true,
  });
});
