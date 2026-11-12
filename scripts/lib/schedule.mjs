// 지금 수집해도 되는가 — 순수 함수. 설정은 워크노트의 「AI 세션 수집」 창(설정 노트)에서 온다.
//
// 트리거: "start"(세션 시작) · "interval"(응답 뒤, 간격 확인) · "end"(세션 끝) · "manual"(손으로 실행)
// 「지금 실행」(run_now_at)은 시간대·횟수·간격을 넘어 한 번 돈다. 꺼짐(enabled=false)만은 넘지 않는다.

const pad = (n) => String(n).padStart(2, "0");
export function seoulClock(now = new Date()) {
  const k = new Date(now.getTime() + 9 * 3600_000);
  return {
    ymd: `${k.getUTCFullYear()}-${pad(k.getUTCMonth() + 1)}-${pad(k.getUTCDate())}`,
    hhmm: `${pad(k.getUTCHours())}:${pad(k.getUTCMinutes())}`,
    dow: k.getUTCDay(),
  };
}

// 시간대 [start, end). end 가 start 보다 이르면 자정을 넘는 시간대다(예: 22:00~02:00).
export function inWindow(hhmm, start, end) {
  if (start === end) return false;
  if (start < end) return hhmm >= start && hhmm < end;
  return hhmm >= start || hhmm < end;
}

export function decide({ settings, state = {}, trigger, now = new Date() }) {
  if (!settings) return { run: false, why: "설정을 읽지 못함" };
  if (!settings.enabled) return { run: false, why: "꺼짐" };
  const runNow = settings.run_now_at && (!state.runNowSeen || settings.run_now_at > state.runNowSeen);
  if (runNow || trigger === "manual") return { run: true, why: runNow ? "지금 실행 요청" : "손으로 실행", runNow: !!runNow };

  const c = seoulClock(now);
  if (!settings.days.includes(c.dow)) return { run: false, why: "실행 요일 아님" };
  if (!inWindow(c.hhmm, settings.window_start, settings.window_end)) return { run: false, why: "실행 시간대 밖" };
  const today = state.runs?.date === c.ymd ? state.runs.count : 0;
  if (settings.daily_max > 0 && today >= settings.daily_max) return { run: false, why: "오늘 최대 횟수에 닿음" };
  if (trigger === "interval") {
    if (settings.trigger !== "end_and_interval") return { run: false, why: "대화 중 수집 꺼짐" };
    const last = state.lastRunAt ? new Date(state.lastRunAt).getTime() : 0;
    if (now.getTime() - last < settings.interval_min * 60_000) return { run: false, why: "간격이 아직" };
  }
  return { run: true, why: trigger };
}

// 데일리에 줄을 써도 되는가. 데일리 줄은 처음 쓴 내용으로 굳으므로 세션이 자리를 잡은 뒤에만 쓴다.
export function settledForDaily({ ended, lastActiveAt, idleMin, now = new Date() }) {
  if (ended) return true;
  const last = new Date(lastActiveAt).getTime();
  if (now.getTime() - last >= idleMin * 60_000) return true;
  return seoulClock(new Date(last)).ymd < seoulClock(now).ymd; // 마지막 활동이 어제 이전이면 그 날은 끝났다
}
