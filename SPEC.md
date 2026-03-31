# 에이전트 현황판 웹UI

## 요구사항
1. 3개 에이전트(윤비서/윤실장/윤박사) 현재 상태를 한눈에 (작업중/대기/에러)
2. 한국어, 알아보기 쉽게
3. 모바일+PC 반응형
4. 외부 URL로 접근 가능 (폰에서도)
5. 각 에이전트의 최근 작업/보고 내역 표시
6. 작업 위임 흐름 가시화 (누가 누구에게 뭘 시켰는지)

## 기술 스택
- Next.js 14+ (App Router)
- Tailwind CSS
- TypeScript
- Vercel 배포

## 데이터 소스
OpenClaw 세션 데이터를 API로 읽어오기:
- 세션 목록: /home/thefool/.openclaw/agents/{agent-id}/sessions/sessions.json
- 세션 트랜스크립트: /home/thefool/.openclaw/agents/{agent-id}/sessions/{session-id}.jsonl
- 에이전트 설정: /home/thefool/.openclaw/openclaw.json → agents.list

## 에이전트 정보
| ID | 이름 | 역할 | 이모지 |
|----|------|------|--------|
| yun-biseo | 윤비서 | 총괄 코디네이터 | 📋 |
| yun-siljang | 윤실장 | 비즈니스 실무 | 💼 |
| yun-parksa | 윤박사 | 기술/리서치 | 🔬 |

## 페이지 구조
1. 메인 대시보드 — 에이전트 3개 카드, 각각 상태/최근 작업 표시
2. 에이전트 상세 — 클릭하면 최근 보고/작업 이력 타임라인
3. 위임 흐름 — 에이전트 간 메시지 흐름 시각화 (간단한 화살표/타임라인)

## 디자인
- 다크 모드 기본
- 카드형 레이아웃
- 상태 표시: 🟢작업중 🟡대기 🔴에러
- 각 카드에 에이전트 이름, 이모지, 현재 상태, 마지막 활동 시간, 최근 작업 1줄

## API Routes (Next.js)
- GET /api/agents — 에이전트 목록 + 상태
- GET /api/agents/[id]/history — 최근 작업/보고 이력
- GET /api/flow — 에이전트 간 위임 흐름
