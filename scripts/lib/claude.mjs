// `claude -p` 호출. 요약과 기록은 이 기기의 Claude 구독으로 한다(별도 API 키 없음).
//
// 왜 셸을 거치지 않는가: 윈도우의 `claude` 는 claude.cmd 라서 셸로 부르면 빈 인자("")·따옴표가 깨진다.
// 그래서 실제 실행 파일을 찾아 직접 부른다. npm 설치는 claude.cmd 옆 node_modules/…/bin/claude.exe,
// 기본 설치는 claude.exe(윈도우) · claude(맥) 하나다. WORKNOTE_AI_CLAUDE 로 직접 지정할 수도 있다.
//
// 자기 자신 제외(설계 문서 B): 이 호출이 다시 수집되면 끝없이 돈다. 세 겹으로 막는다.
//   ① --no-session-persistence  기록 파일을 남기지 않는다
//   ② --settings {disableAllHooks} 이 호출 안에서 우리 훅(과 다른 훅)이 돌지 않는다
//   ③ 수집기는 작업 폴더가 상태 폴더인 세션과 entrypoint=sdk-cli 세션을 읽지 않는다(collect.mjs)
// ⚠️ --bare 는 쓰지 않는다 — 구독 로그인(OAuth)을 읽지 않아 API 키 없이는 돌지 않는다(2026-11-12 실측).

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, delimiter } from "node:path";

let cached = null;
export function resolveClaude(env = process.env) {
  if (cached) return cached;
  if (env.WORKNOTE_AI_CLAUDE) return (cached = env.WORKNOTE_AI_CLAUDE);
  if (process.platform !== "win32") return (cached = "claude");
  for (const dir of String(env.PATH || env.Path || "").split(delimiter).filter(Boolean)) {
    const exe = join(dir, "claude.exe");
    if (existsSync(exe)) return (cached = exe);
    const npmExe = join(dir, "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe");
    if (existsSync(join(dir, "claude.cmd")) && existsSync(npmExe)) return (cached = npmExe);
  }
  const local = join(env.USERPROFILE || "", ".local", "bin", "claude.exe");
  if (existsSync(local)) return (cached = local);
  return (cached = "claude.exe");
}

function run(args, { input, cwd, timeoutMs = 240_000 } = {}) {
  const r = spawnSync(resolveClaude(), args, {
    input, cwd, encoding: "utf8", timeout: timeoutMs, windowsHide: true, maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, WORKNOTE_AI_COLLECTOR: "1" },
  });
  if (r.error) return { error: r.error.message };
  if (r.status !== 0) return { error: `claude 종료 코드 ${r.status}: ${(r.stderr || r.stdout || "").slice(0, 300)}` };
  return { stdout: r.stdout };
}

// 모델 한 번 부르기. 결과 문자열(result)을 돌려준다.
//   noTools: 내장 도구도 MCP 도 없이(요약용). 요약 모델이 아무것도 건드릴 수 없다.
//   allowedTools: 이 도구만 허용(기록용). 그 밖의 도구는 print 모드에서 승인을 못 받아 거절된다.
export function ask(prompt, { settingsPath, cwd, noTools = false, allowedTools = [], model = "haiku" } = {}) {
  const args = ["-p", "--model", model, "--no-session-persistence", "--output-format", "json"];
  if (settingsPath) args.push("--settings", settingsPath);
  if (noTools) args.push("--tools", "", "--strict-mcp-config");
  if (allowedTools.length) args.push("--allowedTools", allowedTools.join(","));
  const r = run(args, { input: prompt, cwd });
  if (r.error) return r;
  try {
    const j = JSON.parse(r.stdout);
    if (j.is_error) return { error: String(j.result || "모델 오류").slice(0, 300) };
    return { result: String(j.result ?? "") };
  } catch {
    return { error: "claude 출력이 JSON 이 아닙니다" };
  }
}

export function mcpList({ cwd } = {}) {
  const r = run(["mcp", "list"], { cwd, timeoutMs: 120_000 });
  return r.error ? r : { text: r.stdout };
}

// 모델 답에서 첫 JSON 덩어리를 꺼낸다(앞뒤 설명·코드펜스를 허용).
export function extractJson(text) {
  const s = String(text || "");
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(s);
  const body = fence ? fence[1] : s;
  const start = body.search(/[[{]/);
  if (start < 0) return null;
  for (let end = body.length; end > start; end--) {
    const ch = body[end - 1];
    if (ch !== "}" && ch !== "]") continue;
    try { return JSON.parse(body.slice(start, end)); } catch { /* 더 짧게 */ }
  }
  return null;
}
