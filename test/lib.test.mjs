import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTranscript, seoulYmd } from "../scripts/lib/transcript.mjs";
import { decide, settledForDaily, inWindow } from "../scripts/lib/schedule.mjs";
import { scrub } from "../scripts/lib/scrub.mjs";
import { findWorknotePrefixes, prefixFromName } from "../scripts/lib/mcp-name.mjs";
import { extractJson } from "../scripts/lib/claude.mjs";

const L = (o) => JSON.stringify(o);
const base = { sessionId: "f02c459c-71de-41b4-a780-1b8bf5d1cef9", cwd: "G:\\내 드라이브\\1. Project\\0. inbox_claude", entrypoint: "cli", gitBranch: "main" };

test("parseTranscript: 사람 요청·마지막 응답·바꾼 파일·활동한 날(서울)을 뽑는다", () => {
  const lines = [
    L({ type: "ai-title", aiTitle: "세션 로그 설계", sessionId: base.sessionId }),
    L({ ...base, type: "user", timestamp: "2026-11-11T15:10:00Z", message: { role: "user", content: "수집기 계획 세워줘" } }),
    L({ ...base, type: "assistant", timestamp: "2026-11-11T15:11:00Z", message: { content: [{ type: "text", text: "계획입니다" }, { type: "tool_use", name: "Write", input: { file_path: "C:\\dev\\a\\plan.md" } }] } }),
    L({ ...base, type: "user", timestamp: "2026-11-11T15:12:00Z", message: { content: [{ type: "tool_result", content: "ok" }] } }),
    L({ ...base, type: "user", timestamp: "2026-11-11T15:13:00Z", message: { content: "<local-command-stdout>x</local-command-stdout>" } }),
    L({ ...base, type: "user", isSidechain: true, timestamp: "2026-11-11T15:14:00Z", message: { content: "서브에이전트" } }),
    L({ ...base, type: "user", timestamp: "2026-11-12T01:00:00Z", message: { content: [{ type: "text", text: "진행해" }] } }),
    L({ ...base, type: "assistant", timestamp: "2026-11-12T01:05:00Z", message: { content: [{ type: "text", text: "끝났습니다" }] } }),
    "깨진 줄",
  ];
  const s = parseTranscript(lines);
  assert.equal(s.sessionId, base.sessionId);
  assert.equal(s.workspace, "0. inbox_claude");
  assert.deepEqual(s.prompts, ["수집기 계획 세워줘", "진행해"]);
  assert.equal(s.lastReply, "끝났습니다");
  assert.deepEqual(s.files, ["plan.md"]);
  assert.deepEqual(s.activeDates, ["2026-11-12"], "15:10Z 는 서울 00:10, 다음 날이다");
  assert.equal(s.titleHint, "세션 로그 설계");
  assert.equal(s.startedAt, "2026-11-11T15:10:00Z");
});

test("parseTranscript: /rename 제목이 AI 제목보다 먼저다", () => {
  const s = parseTranscript([
    L({ type: "ai-title", aiTitle: "AI 제목", sessionId: "x" }),
    L({ type: "custom-title", customTitle: "내 제목", sessionId: "x" }),
  ]);
  assert.equal(s.titleHint, "내 제목");
});

test("decide: 꺼짐·요일·시간대·하루 최대·간격을 지키고, 「지금 실행」은 그것들을 넘는다", () => {
  const settings = { enabled: true, trigger: "end_and_interval", interval_min: 60, daily_max: 2,
    window_start: "09:00", window_end: "19:00", days: [1, 2, 3, 4, 5], run_now_at: null };
  const thuNoon = new Date("2026-11-12T03:00:00Z");   // 목 12:00 서울
  const sat = new Date("2026-11-14T03:00:00Z");
  const night = new Date("2026-11-12T13:00:00Z");      // 목 22:00
  assert.equal(decide({ settings, trigger: "end", now: thuNoon }).run, true);
  assert.equal(decide({ settings: { ...settings, enabled: false }, trigger: "end", now: thuNoon }).run, false);
  assert.equal(decide({ settings, trigger: "end", now: sat }).why, "실행 요일 아님");
  assert.equal(decide({ settings, trigger: "end", now: night }).why, "실행 시간대 밖");
  assert.equal(decide({ settings, trigger: "end", now: thuNoon, state: { runs: { date: "2026-11-12", count: 2 } } }).run, false);
  assert.equal(decide({ settings, trigger: "interval", now: thuNoon, state: { lastRunAt: "2026-11-12T02:30:00Z" } }).why, "간격이 아직");
  assert.equal(decide({ settings: { ...settings, trigger: "end" }, trigger: "interval", now: thuNoon }).run, false);
  const runNow = { ...settings, run_now_at: "2026-11-12T12:59:00Z" };
  assert.equal(decide({ settings: runNow, trigger: "interval", now: night }).run, true);
  assert.equal(decide({ settings: runNow, trigger: "interval", now: night, state: { runNowSeen: runNow.run_now_at } }).run, false, "한 번만");
  assert.equal(decide({ settings: { ...runNow, enabled: false }, trigger: "manual", now: night }).run, false, "꺼짐은 넘지 않는다");
});

test("inWindow: 자정을 넘는 시간대와 24:00 끝", () => {
  assert.equal(inWindow("23:30", "22:00", "02:00"), true);
  assert.equal(inWindow("03:00", "22:00", "02:00"), false);
  assert.equal(inWindow("23:59", "00:00", "24:00"), true);
});

test("settledForDaily: 끝났거나, 조용했거나, 날이 지났을 때만", () => {
  const now = new Date("2026-11-12T05:00:00Z");
  assert.equal(settledForDaily({ ended: true, lastActiveAt: "2026-11-12T04:59:00Z", idleMin: 30, now }), true);
  assert.equal(settledForDaily({ ended: false, lastActiveAt: "2026-11-12T04:50:00Z", idleMin: 30, now }), false);
  assert.equal(settledForDaily({ ended: false, lastActiveAt: "2026-11-12T04:20:00Z", idleMin: 30, now }), true);
  assert.equal(settledForDaily({ ended: false, lastActiveAt: "2026-11-11T14:50:00Z", idleMin: 600, now }), true, "어제 활동");
});

test("scrub: 흔한 비밀값을 가린다", () => {
  const s = scrub("key sk-ant-api03-abcdefghijklmnop1234 · 비밀번호: hunter2!! · postgres://u:pw1234@h/db · Bearer abcdefghijklmnopqrstu");
  assert.ok(!/sk-ant|hunter2|pw1234|abcdefghijklmnopqrstu/.test(s), s);
});

test("도구 이름: 연결 주소의 호스트로 찾고, 연결된 것을 먼저", () => {
  const list = [
    "claude.ai Notion: https://mcp.notion.com/mcp - ✔ Connected",
    "claude.ai Wokr Note: https://magical-elf-49e5b5.netlify.app/mcp - ! Needs authentication",
    "worknote: https://magical-elf-49e5b5.netlify.app/mcp (HTTP) - ✔ Connected",
  ].join("\n");
  assert.deepEqual(findWorknotePrefixes(list), ["mcp__worknote__", "mcp__claude_ai_Wokr_Note__"]);
  assert.equal(prefixFromName("claude.ai GA대시보드"), "mcp__claude_ai_GA__");
  assert.deepEqual(findWorknotePrefixes("claude.ai Notion: https://mcp.notion.com/mcp"), []);
});

test("extractJson: 설명·코드펜스가 섞여도 JSON 을 꺼낸다", () => {
  assert.deepEqual(extractJson('결과입니다\n```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('[{"session_id":"x","status":"created"}] 끝'), [{ session_id: "x", status: "created" }]);
  assert.equal(extractJson("없음"), null);
});

test("seoulYmd", () => {
  assert.equal(seoulYmd("2026-11-11T15:00:00Z"), "2026-11-12");
});
