import { readFile } from "node:fs/promises";
import { acceptReviewItem, createAnalyzedProject, e2eSourceText, expect, reviewRow, test } from "./fixtures";

test("creates a project, imports source, reviews suggestions, and exports confirmed-only markdown", async ({ cleanPage: page }, testInfo) => {
  await createAnalyzedProject(page, testInfo, "E2E 전력설비 앱");

  await acceptReviewItem(page, "화면", "대시보드");

  const loadRow = reviewRow(page, "앱이 저장할 정보", "부하");
  await loadRow.getByRole("button", { name: /수정$/ }).click();
  await loadRow.getByLabel("쉬운 이름").fill("부하 검증 완료");
  await loadRow.getByRole("button", { name: /저장$/ }).click();
  await expect(loadRow.getByText("수정 확정")).toBeVisible();

  const rejectedIssue = reviewRow(page, "빠진 것", "알람 발생 조건");
  await rejectedIssue.getByRole("button", { name: /제외$/ }).click();
  await expect(rejectedIssue.locator(".badge.rejected")).toHaveText("제외");

  await page.getByRole("link", { name: "내보내기" }).click();
  const exportPanel = page.locator("#export");
  await expect(exportPanel.getByRole("heading", { name: "확정 데이터 기반 export" })).toBeVisible();
  await expect(exportPanel.locator("pre.preview")).toContainText("Export mode: confirmedOnly");
  await expect(exportPanel.locator("pre.preview")).toContainText("대시보드");
  await expect(exportPanel.locator("pre.preview")).toContainText("부하 검증 완료 / Load");
  await expect(exportPanel.locator("pre.preview")).not.toContainText("부하 목록");
  await expect(exportPanel.locator("pre.preview")).not.toContainText("관리자");
  await expect(exportPanel.locator("pre.preview")).not.toContainText("알람 발생 조건이 빠져 있음");

  const downloadPromise = page.waitForEvent("download");
  await exportPanel.getByRole("button", { name: "다운로드" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("app-xray-e2e-전력설비-앱.md");
  const markdownPath = testInfo.outputPath("confirmed-only-export.md");
  await download.saveAs(markdownPath);
  const markdown = await readFile(markdownPath, "utf8");
  expect(markdown).toContain("# E2E 전력설비 앱");
  expect(markdown).toContain("부하 검증 완료 / Load");
  expect(markdown).not.toContain("부하 목록");
  expect(markdown).not.toContain("관리자");
  expect(markdown).not.toContain("알람 발생 조건이 빠져 있음");
});

test("persists projects across reload and supports project switching", async ({ cleanPage: page }) => {
  await page.getByLabel("프로젝트 이름").fill("첫 번째 로컬 프로젝트");
  await page.getByLabel("아이디어 / PRD").fill(e2eSourceText);
  await page.getByRole("button", { name: "프로젝트 저장" }).click();
  await expect(page.getByRole("heading", { name: "첫 번째 로컬 프로젝트" })).toBeVisible();

  await page.getByRole("link", { name: "새 프로젝트" }).click();
  await page.getByLabel("프로젝트 이름").fill("두 번째 로컬 프로젝트");
  await page.getByLabel("아이디어 / PRD").fill(`${e2eSourceText}\n두 번째 프로젝트입니다.`);
  await page.getByRole("button", { name: "프로젝트 저장" }).click();
  await expect(page.getByRole("heading", { name: "두 번째 로컬 프로젝트" })).toBeVisible();

  await page.getByLabel("로컬 프로젝트 목록").getByRole("button", { name: "첫 번째 로컬 프로젝트", exact: true }).click();
  await expect(page.getByRole("heading", { name: "첫 번째 로컬 프로젝트" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "첫 번째 로컬 프로젝트" })).toBeVisible();
  await expect(page.getByLabel("로컬 프로젝트 목록").getByRole("button", { name: "두 번째 로컬 프로젝트", exact: true })).toBeVisible();

  await page.getByLabel("로컬 프로젝트 목록").getByRole("button", { name: "두 번째 로컬 프로젝트", exact: true }).click();
  await expect(page.getByRole("heading", { name: "두 번째 로컬 프로젝트" })).toBeVisible();
});

test("blocks export download when confirmed relations reference unconfirmed data objects", async ({ cleanPage: page }, testInfo) => {
  await createAnalyzedProject(page, testInfo, "E2E 검증 차단 앱");
  await acceptReviewItem(page, "정보 연결", /rel_rel_area_loads/);

  await page.getByRole("link", { name: "내보내기" }).click();
  const exportPanel = page.locator("#export");
  await expect(exportPanel.getByText("연결이 끊긴 정보 구조 관계가 있습니다.").first()).toBeVisible();
  await expect(exportPanel.getByRole("button", { name: "다운로드" })).toBeDisabled();
});

test("downloads a workspace backup and imports it into the current workspace", async ({ cleanPage: page }, testInfo) => {
  await createAnalyzedProject(page, testInfo, "E2E 백업 원본");
  await acceptReviewItem(page, "화면", "대시보드");

  await page.getByRole("link", { name: "백업" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#backup").getByRole("button", { name: "workspace JSON 저장" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("app-xray-workspace-E2E-백업-원본.json");
  const backupPath = testInfo.outputPath("workspace-backup.json");
  await download.saveAs(backupPath);

  await page.getByRole("link", { name: "새 프로젝트" }).click();
  await page.getByLabel("프로젝트 이름").fill("E2E 백업 가져오기 대상");
  await page.getByLabel("아이디어 / PRD").fill("가져오기 대상 프로젝트입니다.");
  await page.getByRole("button", { name: "프로젝트 저장" }).click();
  await expect(page.getByRole("heading", { name: "E2E 백업 가져오기 대상" })).toBeVisible();
  await page.getByRole("button", { name: "Mock 재분석" }).click();
  await expect(page.getByRole("heading", { name: "AI 제안 초안" })).toBeVisible();
  await acceptReviewItem(page, "앱이 저장할 정보", "부하");
  const targetLoadRow = reviewRow(page, "앱이 저장할 정보", "부하");
  await targetLoadRow.getByRole("button", { name: /수정$/ }).click();
  await targetLoadRow.getByLabel("쉬운 이름").fill("대상 프로젝트 보존 부하");
  await targetLoadRow.getByRole("button", { name: /저장$/ }).click();
  await expect(reviewRow(page, "앱이 저장할 정보", "대상 프로젝트 보존 부하")).toBeVisible();

  await page.getByRole("link", { name: "백업" }).click();
  await page.locator("#backup input[type='file']").setInputFiles(backupPath);
  await expect(page.getByText("workspace 백업을 불러왔습니다.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "E2E 백업 가져오기 대상" })).toBeVisible();
  await expect(reviewRow(page, "앱이 저장할 정보", "대상 프로젝트 보존 부하").locator(".badge.edited")).toHaveText("수정 확정");
  await expect(reviewRow(page, "화면", "대시보드").locator(".badge.accepted")).toHaveText("확정");
});
