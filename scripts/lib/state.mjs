// 상태 파일 · 잠금 · 로그. 저장소 밖, 사용자 폴더에만 둔다.
//   윈도우  %LOCALAPPDATA%\worknote-ai\      맥  ~/Library/Application Support/worknote-ai/
// 토큰·비밀번호는 여기 없다 — 워크노트 인증은 Claude Code 가 들고 있는 커넥터(OAuth)를 그대로 쓴다.

import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync, statSync, appendFileSync, openSync, closeSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export function stateDir(env = process.env) {
  if (env.WORKNOTE_AI_HOME) return env.WORKNOTE_AI_HOME;
  if (process.platform === "win32") return join(env.LOCALAPPDATA || join(homedir(), "AppData", "Local"), "worknote-ai");
  if (process.platform === "darwin") return join(homedir(), "Library", "Application Support", "worknote-ai");
  return join(env.XDG_STATE_HOME || join(homedir(), ".local", "state"), "worknote-ai");
}

export function ensureDir(dir = stateDir()) {
  mkdirSync(dir, { recursive: true });
  // 요약·기록 호출(claude -p)이 쓸 설정: 이 호출 안에서는 어떤 훅도 돌지 않는다(자기 자신 제외 ②).
  const settings = join(dir, "claude-settings.json");
  if (!existsSync(settings)) writeFileSync(settings, JSON.stringify({ disableAllHooks: true }, null, 2));
  return { dir, settings };
}

export function loadState(dir = stateDir()) {
  try { return JSON.parse(readFileSync(join(dir, "state.json"), "utf8")); } catch { return { files: {}, ended: {} }; }
}

// 쓰다 끊겨도 반쯤 쓴 파일이 남지 않게 임시 파일에 쓰고 바꿔 끼운다.
export function saveState(state, dir = stateDir()) {
  const p = join(dir, "state.json");
  writeFileSync(p + ".tmp", JSON.stringify(state, null, 2));
  renameSync(p + ".tmp", p);
}

// 수집은 한 번에 하나만. 15분 넘은 잠금은 죽은 실행으로 보고 치운다.
const LOCK_STALE_MS = 15 * 60_000;
export function acquireLock(dir = stateDir()) {
  const p = join(dir, "collect.lock");
  try {
    if (existsSync(p) && Date.now() - statSync(p).mtimeMs > LOCK_STALE_MS) unlinkSync(p);
    closeSync(openSync(p, "wx"));
    return () => { try { unlinkSync(p); } catch { /* 이미 없음 */ } };
  } catch {
    return null;
  }
}

const LOG_MAX = 1_000_000;
export function log(msg, dir = stateDir()) {
  const p = join(dir, "collect.log");
  try {
    if (existsSync(p) && statSync(p).size > LOG_MAX) renameSync(p, p + ".1");
    appendFileSync(p, `${new Date().toISOString()} ${msg}\n`);
  } catch { /* 로그 실패로 수집을 멈추지 않는다 */ }
}

// 끝난 세션 표시 — 훅(SessionEnd)이 쓰고 수집기가 읽는다. 수집기의 state.json 과 파일을 나눈 이유:
// 수집기가 돌던 중에 훅이 같은 파일에 쓰면, 수집기가 끝에서 저장하며 그 표시를 덮어 지운다.
export function loadEnded(dir = stateDir()) {
  try { return JSON.parse(readFileSync(join(dir, "ended.json"), "utf8")); } catch { return {}; }
}
export function markEnded(sessionId, dir = stateDir(), now = Date.now()) {
  const ended = loadEnded(dir);
  ended[sessionId] = new Date(now).toISOString();
  for (const [id, at] of Object.entries(ended)) if (now - new Date(at).getTime() > 7 * 86_400_000) delete ended[id];
  const p = join(dir, "ended.json");
  writeFileSync(p + ".tmp", JSON.stringify(ended));
  renameSync(p + ".tmp", p);
}
