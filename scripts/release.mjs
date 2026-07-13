#!/usr/bin/env node
/**
 * collector-core 發版小工具 —— 讓 git tag 與 package.json version 永遠同步,
 * 並把消費端(sv-bot/clip)bump 的踩坑寫成提醒,避免每次重跳那套舞步。
 *
 * 用法:
 *   1. 先在 package.json 把 version 改成新版(例 0.1.4)。
 *   2. `npm run release`        → 驗證 tree 乾淨 + build + test 過 → 打 annotated tag v<version>
 *                                 並 push 當前分支 + tag。
 *   3. 消費端 sv-bot/clip 把 dep 改 `#v<version>`,**用 surgical lock 編輯**(見下),npm ci 驗。
 *
 * 為何不自動化消費端:它們的 package-lock pin 的是 commit hash,且**在 macOS 重生 lock 會掉
 * `@rollup/rollup-linux-x64-gnu` optional dep(npm/cli#4828)→ linux CI 啟動失敗**。正解是
 * 還原 origin/main 全平台 lock、只 sed 換 collector-core 的 git ref + version,別 rm 重生。
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const sh = (cmd) => execSync(cmd, { stdio: "pipe" }).toString().trim();
const run = (cmd) => execSync(cmd, { stdio: "inherit" });

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const tag = `v${version}`;

// 1. tree 必須乾淨(version 改完要先 commit)
if (sh("git status --porcelain")) {
  console.error("✗ 工作區有未提交變更。請先把 version bump commit 掉再 release。");
  process.exit(1);
}

// 2. HEAD 必須 == origin/main(先 fetch 再比):否則可能從過期本地分支 / 沒 pull 的舊 main
//    打 tag —— tag 指到的內容跟主線不符,消費端 bump 進來的 dist 就是舊碼。
console.log("→ fetch origin,驗 HEAD == origin/main…");
run("git fetch origin main");
const head = sh("git rev-parse HEAD");
const originMain = sh("git rev-parse origin/main");
if (head !== originMain) {
  console.error(
    `✗ HEAD(${head.slice(0, 7)})≠ origin/main(${originMain.slice(0, 7)})。` +
      `請先 'git checkout main && git pull origin main' 再 release(別從過期分支打 tag)。`,
  );
  process.exit(1);
}

// 3. tag 不可已存在(避免覆蓋;要重發先手動刪 tag)
const existing = sh("git tag --list " + tag);
if (existing) {
  console.error(`✗ tag ${tag} 已存在。重發請先 'git tag -d ${tag} && git push origin :refs/tags/${tag}'。`);
  process.exit(1);
}

// 4. build + test 當門檻(dist 是 git dep 靠 prepare 重建,但這裡先在本機驗一次)
console.log("→ build + test…");
run("npm run build");
run("npm test");

// 5. 打 tag + push 當前分支 + tag
const branch = sh("git rev-parse --abbrev-ref HEAD");
run(`git tag -a ${tag} -m "release ${tag}"`);
run(`git push origin ${branch}`);
run(`git push origin ${tag}`);

console.log(`\n✓ 已發 ${tag}(commit ${sh("git rev-parse --short HEAD")}, 分支 ${branch})`);
console.log("提醒:");
console.log(`  • squash-merge 後 tag 仍指向 merge 前 commit(內容相同,dep 解析 OK);下次改 core 從 main HEAD 重發新版,別接舊 tag commit 長。`);
console.log(`  • 消費端 bump:改 dep 為 '#${tag}',然後 surgical 編輯 package-lock(只換 collector-core 的 git ref+version),別在 macOS rm 重生 lock(會掉 rollup linux optional dep → linux CI 掛)。`);
