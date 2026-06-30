import { writeFile } from "node:fs/promises";
import type { Locator, Page, TestInfo } from "playwright/test";
import { expect, test as base } from "playwright/test";

export const e2eSourceText = [
  "현장 전력설비를 관리하는 앱입니다.",
  "담당구역, 공장, 변전실, 부하를 관리해야 합니다.",
  "부하별 점검 이력과 알람을 볼 수 있어야 합니다.",
  "대시보드에서는 단선도와 주요 알람, 일정이 보여야 합니다.",
  "관리자는 설비 정보를 수정할 수 있고 일반 사용자는 조회만 가능해야 합니다.",
].join("\n");

type AppFixtures = {
  cleanPage: Page;
};

export const test = base.extend<AppFixtures>({
  cleanPage: async ({ page }, use) => {
    await page.goto("/");
    await page.evaluate(() => window.localStorage.clear());
    await page.goto("/");
    await use(page);
  },
});

export { expect };

export async function importSourceFixture(page: Page, testInfo: TestInfo): Promise<void> {
  const sourcePath = testInfo.outputPath("field-power-source.txt");
  await writeFile(sourcePath, e2eSourceText, "utf8");
  await page.getByLabel("원문 파일 가져오기").setInputFiles(sourcePath);
  await expect(page.getByText("field-power-source.txt 원문을 불러왔습니다.")).toBeVisible();
}

export async function createAnalyzedProject(page: Page, testInfo: TestInfo, projectName: string): Promise<void> {
  await page.getByLabel("프로젝트 이름").fill(projectName);
  await importSourceFixture(page, testInfo);
  await page.getByRole("button", { name: "저장하고 Mock 분석" }).click();
  await expect(page.getByRole("heading", { name: projectName })).toBeVisible();
  await expect(page.getByRole("heading", { name: "AI 제안 초안" })).toBeVisible();
  await expect(reviewRow(page, "화면", "대시보드")).toBeVisible();
}

export function reviewGroup(page: Page, groupName: string): Locator {
  return page.locator(".review-group").filter({ hasText: groupName }).first();
}

export function reviewRow(page: Page, groupName: string, itemName: string | RegExp): Locator {
  const namePattern = typeof itemName === "string" ? new RegExp(escapeRegExp(itemName)) : itemName;
  return page.getByLabel(new RegExp(`리뷰 항목: ${escapeRegExp(groupName)} - .*${namePattern.source}`)).first();
}

export async function acceptReviewItem(page: Page, groupName: string, itemName: string | RegExp): Promise<void> {
  const row = reviewRow(page, groupName, itemName);
  await row.getByRole("button", { name: /확정$/ }).click();
  await expect(row.locator(".badge.accepted")).toHaveText("확정");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
