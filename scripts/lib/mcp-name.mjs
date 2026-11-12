// 워크노트 MCP 도구 이름 찾기. 연결 방식마다 이름이 다르다(2026-11-12 실측):
//   claude mcp add 로 붙인 것   →  "worknote: https://…/mcp (HTTP)"      → mcp__worknote__<도구>
//   claude.ai 커넥터로 붙인 것   →  "claude.ai WokrNote: https://…/mcp"   → mcp__claude_ai_WokrNote__<도구>
// 이름은 사람이 마음대로 붙이므로 **주소의 호스트**로 찾는다.
// claude.ai 이름의 변환 규칙: 공백 → _, 그 밖의 영숫자·_·- 아닌 글자는 빠진다(「GA대시보드」 → mcp__claude_ai_GA__, 실측).

export const WORKNOTE_HOSTS = ["magical-elf-49e5b5.netlify.app"];

export function prefixFromName(name) {
  const clean = (s) => s.trim().replace(/\s+/g, "_").replace(/[^A-Za-z0-9_-]/g, "");
  if (name.startsWith("claude.ai ")) return `mcp__claude_ai_${clean(name.slice(10))}__`;
  if (name.startsWith("plugin:")) return `mcp__plugin_${clean(name.slice(7).replace(/:/g, "_"))}__`;
  return `mcp__${clean(name)}__`;
}

// `claude mcp list` 출력 → 워크노트 도구 접두어 후보(연결된 것 먼저). 없으면 [].
export function findWorknotePrefixes(listText, hosts = WORKNOTE_HOSTS) {
  const out = [];
  for (const line of String(listText || "").split(/\r?\n/)) {
    const m = /^(.+?):\s+(https?:\/\/\S+)/.exec(line.trim());
    if (!m) continue;
    let host = "";
    try { host = new URL(m[2]).host; } catch { continue; }
    if (!hosts.includes(host)) continue;
    out.push({ prefix: prefixFromName(m[1]), connected: /Connected/.test(line) });
  }
  return out.sort((a, b) => Number(b.connected) - Number(a.connected)).map((x) => x.prefix);
}
