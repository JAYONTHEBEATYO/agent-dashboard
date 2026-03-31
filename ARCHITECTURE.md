# Agent Dashboard MVP - Architecture

## Overview
OpenClaw 에이전트 활동 대시보드. 실시간 세션/크론/활동 모니터링.

## Tech Stack
- **Backend**: Node.js + Express (port 3001)
- **Frontend**: Single HTML + vanilla JS (no framework, MVP 속도)
- **Data Source**: `openclaw` CLI 호출 + JSONL 세션 파일 직접 읽기

## Data Sources

### 1. Sessions (에이전트 목록 + 상태)
CLI: `openclaw session list --json --limit 30`
Returns: key, status, model, totalTokens, estimatedCostUsd, startedAt, endedAt, runtimeMs, childSessions

### 2. Cron Jobs
CLI: `openclaw cron list --json`
Returns: id, name, schedule, next, last, status, target, agentId, model

### 3. Session History (대화 로그)
JSONL files at: `/home/thefool/.openclaw/agents/{agentId}/sessions/{sessionId}.jsonl`
Each line is a JSON message object with role, content, timestamp, provenance

### 4. Agent List
Directory: `/home/thefool/.openclaw/agents/`
Agents: main, main-admin, okl-observer, voice, yun-biseo, yun-coder, yun-coding-teamjang, yun-cogada, yun-parksa, yun-siljang

## API Endpoints

### GET /api/agents
에이전트 목록 + 현재 상태 (sessions_list 기반)

### GET /api/sessions
활성 세션 목록 (최근 24시간)

### GET /api/sessions/:sessionKey/history
세션 대화 내역 (JSONL 파싱)

### GET /api/cron
크론잡 상태 테이블

### GET /api/timeline
최근 inter-session 메시지 (sessions_send 로그) 타임라인
- JSONL 파일에서 provenance.kind === "inter_session" 필터

### GET /api/activity/:agentId
에이전트별 오늘 활동 요약

## Frontend Pages (SPA with tabs)

### 1. 에이전트 목록 (기본 화면)
- 카드형 그리드: 에이전트 이름, 모델, 상태(running/done/error), 토큰, 비용
- 상태별 컬러: running=green, done=gray, error=red

### 2. 대화 타임라인
- sessions_send 로그 시간순 표시
- 발신 에이전트 → 수신 에이전트 화살표
- 최근 50건

### 3. 크론잡 상태
- 테이블: 이름, 스케줄, 다음 실행, 마지막 실행, 상태, 담당 에이전트
- 상태 뱃지: ok=green, error=red, idle=gray

### 4. 활동 요약
- 에이전트별 오늘 세션 수, 총 토큰, 비용, 마지막 활동 시간

## Design
- 다크 테마 (#0a0a1a 배경)
- 사이드바 네비게이션
- 10초 간격 자동 폴링
- 반응형 (모바일 대응)
- 한국어 UI

## File Structure
```
/home/thefool/agent-dashboard/
├── server.js          # Express 서버
├── package.json       # 의존성
├── public/
│   ├── index.html     # SPA 메인
│   ├── style.css      # 스타일
│   └── app.js         # 프론트엔드 로직
└── ARCHITECTURE.md    # 이 파일
```
