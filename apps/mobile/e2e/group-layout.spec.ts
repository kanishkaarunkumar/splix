import { test, expect } from "@playwright/test";

const API_URL = process.env.SPLIX_E2E_API_URL || "http://127.0.0.1:8000";
const layouts = [
  { width: 320, height: 568, scale: 1 },
  { width: 360, height: 640, scale: 1 },
  { width: 390, height: 844, scale: 1.6 },
  { width: 430, height: 932, scale: 1 },
  { width: 768, height: 1024, scale: 1 },
  { width: 844, height: 390, scale: 1 },
];

for (const layout of layouts) {
  test(`group balances and actions fit ${layout.width}x${layout.height} text ${layout.scale}`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize(layout);
    const suffix = `${Date.now()}-${layout.width}`;
    const ownerName = "AlexandriaWithAnUnusuallyLongUnbrokenDisplayName";
    const memberName = "ChristopherWithAnotherUnusuallyLongUnbrokenDisplayName";
    const name =
      "SharedAdventuresWithAnUnusuallyLongUnbrokenGroupNameForPhoneLayouts";
    const register = async (displayName: string, email: string) => {
      const response = await request.post(`${API_URL}/api/v1/auth/register`, {
        data: { displayName, email, password: "password1" },
      });
      expect(response.ok()).toBeTruthy();
      return response.json();
    };
    const owner = await register(
      ownerName,
      `layout-owner-${suffix}@example.com`,
    );
    const member = await register(
      memberName,
      `layout-member-${suffix}@example.com`,
    );
    const headers = { Authorization: `Bearer ${owner.sessionToken}` };
    const response = await request.post(`${API_URL}/api/v1/groups`, {
      headers,
      data: { name },
    });
    expect(response.ok()).toBeTruthy();
    const group = await response.json();
    expect(
      (
        await request.post(`${API_URL}/api/v1/groups/${group.id}/members`, {
          headers,
          data: { email: member.email },
        })
      ).ok(),
    ).toBeTruthy();
    expect(
      (
        await request.post(`${API_URL}/api/v1/groups/${group.id}/expenses`, {
          headers: { ...headers, "Idempotency-Key": `layout-${suffix}` },
          data: {
            title: "Shared holiday",
            category: "Food",
            amountPaise: "999999999",
            payerId: owner.id,
            effectiveDate: "2026-10-24",
            splitMethod: "equal",
            participantIds: [owner.id, member.id],
          },
        })
      ).ok(),
    ).toBeTruthy();
    await page.goto("/");
    await page
      .getByRole("textbox", { name: "Email", exact: true })
      .fill(owner.email);
    await page.getByLabel("Password", { exact: true }).fill("password1");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page
      .getByRole("button", { name: `Open ${name}`, exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
    const explain = page.getByRole("button", {
      name: `Explain ${ownerName}'s balance`,
      exact: true,
    });
    await expect(explain).toBeVisible();
    if (layout.scale > 1) {
      // Stress the browser rendering with enlarged text; native fontScale also selects stacked rows.
      await page.evaluate((scale) => {
        const nodes = [
          ...document.querySelectorAll<HTMLElement>('[dir="auto"]'),
        ].map((node) => ({
          node,
          size: parseFloat(getComputedStyle(node).fontSize),
          line: parseFloat(getComputedStyle(node).lineHeight),
        }));
        for (const { node, size, line } of nodes) {
          node.style.fontSize = `${size * scale}px`;
          if (Number.isFinite(line))
            node.style.lineHeight = `${line * scale}px`;
        }
      }, layout.scale);
    }
    for (const label of [
      "+ Add expense",
      "Record payment",
      "People & invites",
      "Monthly report",
      "Close out",
    ]) {
      const button = page.getByRole("button", { name: label, exact: true });
      const box = await button.boundingBox();
      expect(box, label).not.toBeNull();
      expect(box!.x, label).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width, label).toBeLessThanOrEqual(layout.width + 1);
      expect(box!.height, label).toBeGreaterThanOrEqual(44);
    }
    const overflows = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('[dir="auto"]')]
        .filter(
          (node) =>
            node.getBoundingClientRect().width > 0 &&
            node.scrollWidth > node.clientWidth + 2,
        )
        .map((node) => node.textContent),
    );
    expect(overflows).toEqual([]);
    await explain.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `test-results/group-${layout.width}-${layout.height}-${layout.scale}.png`,
      fullPage: true,
    });
    await explain.click();
    await expect(
      page.getByRole("button", { name: "Close explanation", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Close explanation", exact: true })
      .click();
    await page
      .getByRole("button", { name: "People & invites", exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `test-results/group-actions-${layout.width}-${layout.height}-${layout.scale}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "+ Add expense", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Add an expense.", exact: true }),
    ).toBeVisible();
  });
}
