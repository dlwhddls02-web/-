import { chromium } from "playwright-core";

const BASE = "http://localhost:3000";
const SCRATCH =
  "/tmp/claude-0/-home-user--/f85629b1-2fd3-5f96-8265-eabdf6b7aabb/scratchpad";
const PDF_PASSWORD = process.env.PDF_PASSWORD;
const email = `hotpli.e2e.${Date.now()}@example.com`;
const password = "ClaudeTest1234!";

const log = (m) => console.log(`[e2e] ${m}`);

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
});
const page = await context.newPage();
page.setDefaultTimeout(30000);

try {
  // 1) 회원가입
  log(`가입 시도: ${email}`);
  await page.goto(`${BASE}/signup`, { waitUntil: "networkidle" });
  await page.getByLabel("이름").fill("클로드 테스트");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page.getByLabel("비밀번호 확인").fill(password);
  await page.getByRole("button", { name: "가입하기" }).click();

  const signupResult = await Promise.race([
    page.waitForURL("**/analyses", { timeout: 20000 }).then(() => "ok"),
    page
      .getByText("확인 메일을 보냈어요")
      .waitFor({ timeout: 20000 })
      .then(() => "confirm_email"),
    page
      .locator("p.text-warn")
      .first()
      .waitFor({ timeout: 20000 })
      .then(async () => `error: ${await page.locator("p.text-warn").first().textContent()}`),
  ]);
  if (signupResult !== "ok") {
    log(`가입 중단: ${signupResult}`);
    await page.screenshot({ path: `${SCRATCH}/e2e/signup-blocked.png` });
    process.exit(2);
  }
  log("가입 + 자동 로그인 성공 → /analyses");

  // 2) 업로드 (3개 슬롯 + 비밀번호)
  await page.goto(`${BASE}/analyze/new`, { waitUntil: "networkidle" });
  const fileInputs = page.locator('input[type="file"]');
  await fileInputs.nth(0).setInputFiles(`${SCRATCH}/hira/f1.pdf`);
  await fileInputs.nth(1).setInputFiles(`${SCRATCH}/hira/f2.pdf`);
  await fileInputs.nth(2).setInputFiles(`${SCRATCH}/hira/f3.pdf`);
  log("파일 3개 선택 완료");

  const pwInput = page.locator('input[placeholder="문서 열람 비밀번호"]');
  await pwInput.waitFor({ timeout: 15000 });
  log("암호화 감지 → 비밀번호 입력란 표시됨 ✓");
  await pwInput.fill(PDF_PASSWORD);
  await page.getByLabel("고객 이름").fill("테스트 고객");
  await page.screenshot({ path: `${SCRATCH}/e2e/1-upload.png` });

  await page.getByRole("button", { name: "분석 시작하기" }).click();
  log("업로드 시작 (해제 + 저장, 최대 120초 대기)…");
  await page.waitForURL("**/progress", { timeout: 120000 });
  log("업로드 성공 → 진행 화면");

  // 3) 자동 판정 대기
  const done = await Promise.race([
    page
      .getByRole("button", { name: "판정 결과 확인·수정하기" })
      .waitFor({ timeout: 240000 })
      .then(() => "done"),
    page
      .locator("p.text-warn")
      .first()
      .waitFor({ timeout: 240000 })
      .then(async () => `warn: ${await page.locator("p.text-warn").first().textContent()}`),
  ]);
  await page.screenshot({ path: `${SCRATCH}/e2e/2-progress.png` });
  if (done !== "done") {
    log(`판정 중단: ${done}`);
    process.exit(3);
  }
  const parsedText = await page
    .getByText(/건 인식/)
    .first()
    .textContent()
    .catch(() => "?");
  log(`판정 완료 ✓ (${parsedText?.trim()})`);

  // 4) 확인·수정 → 확정
  await page.getByRole("button", { name: "판정 결과 확인·수정하기" }).click();
  await page.waitForURL("**/review", { timeout: 20000 });
  await page.getByText("확인·수정").first().waitFor();
  // 판정 카드 로드 대기
  await page.getByRole("button", { name: "이대로 확정하기" }).waitFor({ timeout: 30000 });
  await page.screenshot({ path: `${SCRATCH}/e2e/3-review.png`, fullPage: true });
  const verdicts = await page.$$eval("span", (els) =>
    els
      .filter((e) =>
        ["해당", "비해당", "확인 필요"].includes(e.textContent?.trim() ?? ""),
      )
      .map((e) => e.textContent?.trim()),
  );
  log(`판정 배지: ${JSON.stringify(verdicts)}`);

  await page.getByRole("button", { name: "이대로 확정하기" }).click();
  await page.waitForURL("**/report", { timeout: 30000 });
  log("확정 완료 → 리포트");

  // 5) 리포트 확인
  await page.getByText("고지사항 리포트").waitFor();
  await page.screenshot({ path: `${SCRATCH}/e2e/4-report.png`, fullPage: true });
  const summary = await page.$$eval(".font-display", (els) =>
    els.slice(0, 4).map((e) => e.textContent?.trim()),
  );
  log(`리포트 요약 숫자: ${JSON.stringify(summary)}`);

  // 6) 이력 화면
  await page.goto(`${BASE}/analyses`, { waitUntil: "networkidle" });
  await page.getByText("확정됨").first().waitFor({ timeout: 15000 });
  await page.screenshot({ path: `${SCRATCH}/e2e/5-history.png` });
  log("이력 화면에 '확정됨' 표시 ✓");

  log("E2E 전체 통과 🎉");
  process.exit(0);
} catch (e) {
  log(`실패: ${e.message}`);
  await page.screenshot({ path: `${SCRATCH}/e2e/failure.png`, fullPage: true }).catch(() => {});
  process.exit(1);
} finally {
  await browser.close();
}
