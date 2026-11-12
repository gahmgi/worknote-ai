# worknote-ai

Claude Code 로 한 작업을 WorkNote 에 자동으로 남기는 플러그인입니다. 작업 세션 하나가 「AI 세션」 노트 한 장이 되고, 그 작업을 한 날의 데일리 업무 로그에 한 줄이 남습니다. 원문 대화는 보내지 않고 요약만 보냅니다.

## 준비

- Claude Code 에 WorkNote 커넥터가 연결돼 있어야 합니다(WorkNote ··· 메뉴 「AI 연결」).
- Node 가 있어야 합니다. `node -v` 로 확인합니다.

## 설치

```
claude plugin marketplace add gahmgi/worknote-ai
claude plugin install worknote-ai@worknote-ai
```

WorkNote 설정 창의 「복사」로 받은 설치 문장을 Claude Code 에 붙여넣어도 같은 일을 합니다. 설치 뒤 Claude Code 를 다시 열면 그때부터 기록됩니다. 언제 기록할지는 WorkNote ··· 「설정」의 「AI 세션 수집」에서 정합니다.

## 제거

```
claude plugin uninstall worknote-ai@worknote-ai
claude plugin marketplace remove worknote-ai
```

이미 남은 노트는 지워지지 않습니다. 기록 상태 폴더(윈도우 `%LOCALAPPDATA%\worknote-ai`, 맥 `~/Library/Application Support/worknote-ai`)는 직접 지워도 됩니다.

## 미리보기

```
node scripts/collect.mjs --dry-run --limit 3 > preview.json   # 보내지 않고 요약만 본다
node scripts/collect.mjs --trigger manual --records preview.json   # 본 그대로 보낸다
```

## 어떻게 도는가

- 훅: 세션 시작 · 응답 뒤 · 세션 끝. 훅은 바로 끝나고 수집은 뒤에서 돕니다.
- 요약은 이 기기의 Claude 구독으로 작은 모델(haiku)이 합니다. 요약할 때는 도구와 커넥터를 모두 끈 채로 띄웁니다.
- 요약하려고 띄운 실행은 기록을 남기지 않고 훅도 돌지 않아, 다시 수집되지 않습니다.
- 키·비밀번호·토큰 모양의 글자는 보내기 전에 [가림] 으로 바꿉니다. WorkNote 서버도 한 번 더 거릅니다.
- 실패하면 상태 폴더의 `collect.log` 에 남기고, 다음 실행이 이어갑니다.
