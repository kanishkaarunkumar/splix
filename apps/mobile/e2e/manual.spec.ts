import { test, expect } from "@playwright/test";

test("mobile manual journey, offline retry, correction, report and closeout", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const suffix = String(Date.now());
  const member = await request.post(
    "http://127.0.0.1:8000/api/v1/auth/register",
    {
      data: {
        email: `member-${suffix}@example.com`,
        password: "password1",
        displayName: "Sam",
      },
    },
  );
  expect(member.ok()).toBeTruthy();
  const memberData = await member.json();
  await page.goto("/");
  await page
    .getByRole("radio", { name: "Account: Create account", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Your name", exact: true })
    .fill("Alex");
  await page
    .getByRole("textbox", { name: "Email", exact: true })
    .fill(`alex-${suffix}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill("password1");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByText("Hello, Alex.", { exact: true })).toBeVisible();
  await page.screenshot({
    path: "test-results/home-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Create your first group" }).click();
  await page
    .getByRole("textbox", { name: "Group name", exact: true })
    .fill("Coast weekend");
  await page.getByRole("button", { name: "Create group", exact: true }).click();
  await expect(
    page.getByText("Where you stand", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "People & invites" }).click();
  await page.getByRole("button", { name: "Create join code" }).click();
  const code = await page.getByText(/^[a-f0-9]{16}$/).textContent();
  const groups = await request.get("http://127.0.0.1:8000/api/v1/groups", {
    headers: { Authorization: `Bearer ${memberData.sessionToken}` },
  });
  expect(await groups.json()).toEqual([]);
  const join = await request.post("http://127.0.0.1:8000/api/v1/groups/join", {
    headers: { Authorization: `Bearer ${memberData.sessionToken}` },
    data: { code },
  });
  expect(join.ok()).toBeTruthy();
  await page.getByRole("link", { name: /, back$/ }).click();
  await page.getByRole("button", { name: "People & invites" }).click();
  await page.getByRole("button", { name: "Approve Sam" }).click();
  await expect(
    page.getByText("Everyone’s accounted for.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: /, back$/ }).click();
  await page
    .getByRole("button", { name: "+ Add expense", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "What was it for?", exact: true })
    .fill("Seaside dinner");
  await page
    .getByRole("textbox", { name: "Amount (₹)", exact: true })
    .fill("100.01");
  await page.getByRole("button", { name: "Review split" }).click();
  await expect(page.getByText("₹100.01", { exact: true })).toBeVisible();
  await page.screenshot({
    path: "test-results/expense-review-mobile.png",
    fullPage: true,
  });
  // The native shell is bundled. In the web preview, keep route chunks reachable
  // while simulating loss of the API connection.
  await page.route('http://127.0.0.1:8000/api/v1/**', route => route.abort('internetdisconnected'));
  await page
    .getByRole("button", { name: "Confirm shared expense", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /1 pending · balances exclude/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /1 pending · balances exclude/ })
    .click();
  await expect(page.getByText("Pending", { exact: true })).toBeVisible();
  await page.unroute('http://127.0.0.1:8000/api/v1/**');
  await page
    .getByRole("button", { name: "Retry pending writes", exact: true })
    .click();
  await expect(page.getByText("Committed", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: /, back$/ }).click();
  await expect(
    page.getByText("Seaside dinner", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/group-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Correct Seaside dinner", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Amount (₹)", exact: true })
    .fill("120.00");
  await page
    .getByRole("radio", { name: "How are we splitting?: Equally", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Correction reason", exact: true })
    .fill("Included the drinks");
  await page.getByRole("button", { name: "Review split" }).click();
  await page
    .getByRole("button", { name: "Confirm correction", exact: true })
    .click();
  await expect(
    page
      .getByText("Corrected original", { exact: true })
      .filter({ visible: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Monthly report", exact: true })
    .click();
  await expect(
    page
      .getByText("₹120.00", { exact: true })
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Share / download CSV", exact: true })
    .click();
  await page.getByRole("link", { name: /, back$/ }).click();
  await page
    .getByRole("button", { name: "Record payment", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Sam → Alex · ₹60.00", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Review payment", exact: true })
    .click();
  await page
    .getByRole("checkbox", {
      name: "This payment was already made outside Splix",
    })
    .click();
  await page
    .getByRole("button", { name: "Confirm recorded payment", exact: true })
    .click();
  await expect(
    page.getByText("Payment recorded", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close out", exact: true }).click();
  await expect(
    page.getByText("Everyone is square", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", {
      name: "I’ve checked this device and confirmed the group is ready to close",
    })
    .click();
  await page
    .getByRole("button", { name: "Archive group", exact: true })
    .click();
  await expect(page.getByText("Archived", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
