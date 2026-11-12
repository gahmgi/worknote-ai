// Claude Code 대화 기록(jsonl) → 세션 사실. 순수 함수 — 파일을 읽지 않고 줄 배열만 받는다.
//
// 기록 위치(2026-11-12 실측, Windows·macOS 공통): ~/.claude/projects/<폴더>/<세션UUID>.jsonl
// CLI 와 데스크톱 앱의 Code 세션이 같은 곳에 남고 `entrypoint` 로 구분된다(cli · claude-desktop · sdk-cli).
// 폴더 이름은 한글이 '-' 로 깨지므로 작업 폴더는 줄 안의 `cwd` 에서 읽는다.
// 하위 폴더(<UUID>/…)는 서브에이전트 기록이라 읽지 않는다 — 호출하는 쪽이 최상위 jsonl 만 넘긴다.
//
// 뽑는 것: 세션 ID · 작업 폴더 · 브랜치 · 시작/마지막 시각 · 활동한 날(서울) · 제목 후보 · 내 요청들 ·
// 마지막 응답 · 바꾼 파일. 원문 대화는 요약 입력으로만 쓰고 밖으로 보내지 않는다.

const MAX_PROMPTS = 15;
const PROMPT_CHARS = 400;
const REPLY_CHARS = 1500;
const MAX_FILES = 20;

const pad = (n) => String(n).padStart(2, "0");
export function seoulYmd(iso) {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return null;
  const k = new Date(t.getTime() + 9 * 3600_000);
  return `${k.getUTCFullYear()}-${pad(k.getUTCMonth() + 1)}-${pad(k.getUTCDate())}`;
}

// 사람이 친 요청인가. 도구 결과·명령 출력·시스템 주입은 뺀다.
function promptText(rec) {
  if (rec.type !== "user" || rec.isSidechain || rec.isMeta) return null;
  const c = rec.message?.content;
  let text = "";
  if (typeof c === "string") text = c;
  else if (Array.isArray(c)) {
    if (c.some((b) => b?.type === "tool_result")) return null;
    text = c.filter((b) => b?.type === "text").map((b) => b.text).join("\n");
  }
  text = text.trim();
  if (!text) return null;
  if (/^<(local-command|command-|system-reminder|task-notification|bash-)/.test(text)) return null;
  if (text.startsWith("Caveat:")) return null;
  return text;
}

function replyText(rec) {
  if (rec.type !== "assistant" || rec.isSidechain) return null;
  const c = rec.message?.content;
  if (!Array.isArray(c)) return null;
  const t = c.filter((b) => b?.type === "text").map((b) => b.text).join("\n").trim();
  return t || null;
}

function editedFiles(rec) {
  if (rec.type !== "assistant") return [];
  const c = rec.message?.content;
  if (!Array.isArray(c)) return [];
  return c.filter((b) => b?.type === "tool_use" && ["Write", "Edit", "MultiEdit", "NotebookEdit"].includes(b.name))
    .map((b) => b.input?.file_path || b.input?.notebook_path).filter(Boolean);
}

const basename = (p) => String(p).split(/[\\/]/).filter(Boolean).pop() || String(p);

export function parseTranscript(lines) {
  const s = {
    sessionId: null, cwd: null, branch: null, entrypoint: null,
    startedAt: null, lastActiveAt: null, dates: new Set(),
    aiTitle: null, customTitle: null, prompts: [], lastReply: null, files: new Set(),
  };
  for (const line of lines) {
    if (!line || line[0] !== "{") continue;
    let rec;
    try { rec = JSON.parse(line); } catch { continue; }
    if (rec.sessionId && !s.sessionId) s.sessionId = rec.sessionId;
    if (rec.type === "ai-title" && rec.aiTitle) s.aiTitle = String(rec.aiTitle);
    if (rec.type === "custom-title" && rec.customTitle) s.customTitle = String(rec.customTitle);
    if (rec.isSidechain) continue;
    if ((rec.type === "user" || rec.type === "assistant") && rec.timestamp) {
      if (!s.startedAt || rec.timestamp < s.startedAt) s.startedAt = rec.timestamp;
      if (!s.lastActiveAt || rec.timestamp > s.lastActiveAt) s.lastActiveAt = rec.timestamp;
      const d = seoulYmd(rec.timestamp);
      if (d) s.dates.add(d);
      if (rec.cwd) s.cwd = rec.cwd;
      if (rec.gitBranch) s.branch = rec.gitBranch;
      if (rec.entrypoint && !s.entrypoint) s.entrypoint = rec.entrypoint;
    }
    const p = promptText(rec);
    if (p) s.prompts.push(p.length > PROMPT_CHARS ? p.slice(0, PROMPT_CHARS) + "…" : p);
    const r = replyText(rec);
    if (r) s.lastReply = r;
    for (const f of editedFiles(rec)) s.files.add(f);
  }
  // 요청이 많으면 처음 몇 개와 마지막 몇 개만(무엇으로 시작해 어디서 끝났는지가 요약에 필요하다).
  const prompts = s.prompts.length > MAX_PROMPTS
    ? [...s.prompts.slice(0, 5), `(… 중간 요청 ${s.prompts.length - MAX_PROMPTS}개 생략 …)`, ...s.prompts.slice(-(MAX_PROMPTS - 5))]
    : s.prompts;
  return {
    sessionId: s.sessionId,
    cwd: s.cwd,
    workspace: s.cwd ? basename(s.cwd) : null,
    branch: s.branch,
    entrypoint: s.entrypoint,
    startedAt: s.startedAt,
    lastActiveAt: s.lastActiveAt,
    activeDates: [...s.dates].sort(),
    titleHint: s.customTitle || s.aiTitle || (s.prompts[0] || "").slice(0, 60) || null,
    promptCount: s.prompts.length,
    prompts,
    lastReply: s.lastReply ? (s.lastReply.length > REPLY_CHARS ? "…" + s.lastReply.slice(-REPLY_CHARS) : s.lastReply) : null,
    files: [...s.files].slice(-MAX_FILES).map(basename),
  };
}
