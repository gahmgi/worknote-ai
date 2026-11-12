// 비밀값 거르기 — 요약 모델에 보내기 전 한 번, 워크노트로 보내기 전 한 번 더.
// 워크노트 창구(ai-sessions.js scrubSecrets)도 같은 그물을 한 번 더 친다. 흔한 모양을 막는 그물이지 완벽한 탐지기가 아니다.
const PATTERNS = [
  /\bsk-(?:ant-)?[A-Za-z0-9_-]{16,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bAIza[0-9A-Za-z_-]{30,}/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
  /\bsbp_[A-Za-z0-9]{20,}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  /(\bBearer\s+)[A-Za-z0-9._~+/-]{16,}=*/g,
  /(\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:)[^\s@/]+(?=@)/gi,
  /((?:password|passwd|pwd|secret|token|api[_-]?key|비밀번호)\s*[:=]\s*)["']?[^\s"',;]{4,}/gi,
];
export function scrub(text, max = 20_000) {
  let s = String(text ?? "").slice(0, max);
  for (const re of PATTERNS) {
    s = s.replace(re, (m, prefix) => (typeof prefix === "string" && m.startsWith(prefix) ? `${prefix}[가림]` : "[가림]"));
  }
  return s;
}
