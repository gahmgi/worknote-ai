#!/usr/bin/env node
// Claude Code 훅 입구 — node hook.mjs start|stop|end
//
// ⚠️ 여기서는 **아무것도 기다리지 않는다.** 훅이 늦으면 Claude Code 가 느려진다. 할 일은 셋뿐이다.
//   ① 끝난 세션이면 표시를 남긴다(데일리에 줄을 써도 되는 때를 알려고)
//   ② 지금 수집할 만한지 손에 든 정보(지난 실행 시각·기억해 둔 설정)로만 가늠한다 — 네트워크 없음
//   ③ 그럴 만하면 수집기를 **뒤에서** 띄우고 바로 끝낸다. 정확한 판단은 수집기가 최신 설정으로 다시 한다.
// 표준 출력에 아무것도 쓰지 않는다 — SessionStart 훅의 출력은 대화 맥락에 그대로 들어간다.

import { spawn } from "node:child_process";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { stateDir, loadState, markEnded, ensureDir } from "./lib/state.mjs";

const START_GAP_MS = 10 * 60_000; // 세션을 연달아 열 때마다 수집하지 않는다

function readStdin(timeoutMs = 800) {
  return new Promise((done) => {
    let buf = "";
    const t = setTimeout(() => done(buf), timeoutMs);
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => { buf += c; });
    process.stdin.on("end", () => { clearTimeout(t); done(buf); });
    process.stdin.on("error", () => { clearTimeout(t); done(buf); });
  });
}

async function main() {
  if (process.env.WORKNOTE_AI_COLLECTOR) return;            // 수집기가 띄운 claude 안이다
  const event = process.argv[2];
  let data = {};
  try { data = JSON.parse(await readStdin()); } catch { data = {}; }
  const dir = stateDir();
  if (data.cwd && resolve(data.cwd).toLowerCase().startsWith(resolve(dir).toLowerCase())) return;
  ensureDir(dir);

  if (event === "end" && data.session_id) markEnded(data.session_id, dir);

  const state = loadState(dir);
  const last = state.lastRunAt ? new Date(state.lastRunAt).getTime() : 0;
  const cached = state.settingsCache?.settings;
  let trigger = null;
  if (event === "end") trigger = "end";
  else if (event === "start") trigger = Date.now() - last >= START_GAP_MS ? "start" : null;
  else if (event === "stop") {
    // 기억해 둔 설정으로 미리 거른다. 설정을 아직 모르면 수집기에게 맡긴다.
    if (!cached) trigger = "interval";
    else if (cached.enabled && cached.trigger === "end_and_interval"
      && Date.now() - last >= cached.interval_min * 60_000) trigger = "interval";
    // 「지금 실행」은 설정 캐시(15분)가 만료된 뒤에야 보인다 — 수집기가 설정을 다시 읽을 때 잡는다.
    else if (cached.enabled && state.settingsCache && Date.now() - state.settingsCache.at > 15 * 60_000) trigger = "interval";
  }
  if (!trigger) return;
  if (cached && !cached.enabled && trigger !== "end") return;

  const here = dirname(fileURLToPath(import.meta.url));
  const child = spawn(process.execPath, [join(here, "collect.mjs"), "--trigger", trigger], {
    detached: true, stdio: "ignore", windowsHide: true, cwd: dir,
  });
  child.unref();
}

main().catch(() => { /* 훅은 실패해도 조용히 끝난다 — 대화를 막지 않는다. 수집 오류는 collect.log 에 남는다 */ });
