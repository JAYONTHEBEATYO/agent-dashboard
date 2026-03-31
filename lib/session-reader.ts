import fs from "fs";
import path from "path";
import readline from "readline";

const AGENTS_BASE = "/home/thefool/.openclaw/agents";
const WORKING_THRESHOLD_MS = 60 * 60 * 1000; // 60 minutes

export const AGENT_INFO: Record<
  string,
  { name: string; role: string; emoji: string }
> = {
  "yun-biseo": { name: "윤비서", role: "총괄 코디네이터", emoji: "📋" },
  "yun-siljang": { name: "윤실장", role: "비즈니스 실무", emoji: "💼" },
  "yun-parksa": { name: "윤박사", role: "기술/리서치", emoji: "🔬" },
  "main-admin": { name: "메인관리자", role: "시스템 총괄", emoji: "🧭" },
};

export const ALL_AGENT_IDS = ["yun-biseo", "yun-siljang", "yun-parksa", "main-admin"];

export interface AgentSession {
  agentId: string;
  name: string;
  role: string;
  emoji: string;
  status: "working" | "idle" | "error";
  lastActivityAt: number | null;
  lastMessage: string | null;
  sessionId: string | null;
}

export interface HistoryEntry {
  role: "user" | "assistant";
  text: string;
  timestamp: number;
  sessionId: string;
}

export interface FlowEvent {
  id: string;
  sourceAgentId: string;
  sourceAgentName: string;
  sourceAgentEmoji: string;
  targetAgentId: string;
  targetAgentName: string;
  targetAgentEmoji: string;
  message: string;
  timestamp: number;
  sourceSessionKey: string;
}

export interface CronJob {
  name: string;
  sessionKey: string;
  agentId: string;
  agentName: string;
  agentEmoji: string;
  lastRunAt: number | null;
  status: "running" | "done" | "error";
  nextExpectedRun: number | null;
}

export interface ActivitySummary {
  sessionCount: number;
  messagesSent: number;
  messagesReceived: number;
  toolsCalled: number;
}

interface SessionRecord {
  sessionId?: string;
  updatedAt?: number;
  abortedLastRun?: boolean;
  sessionFile?: string;
}

interface SessionsJson {
  [key: string]: SessionRecord;
}

interface MessageContent {
  type: string;
  text?: string;
  thinking?: string;
  toolCallId?: string;
  toolName?: string;
  id?: string;
  name?: string;
  input?: unknown;
  content?: unknown;
}

interface MessageProvenance {
  kind: string;
  sourceSessionKey?: string;
  sourceTool?: string;
  sourceChannel?: string;
}

interface JsonlEntry {
  type: string;
  id?: string;
  timestamp?: string;
  message?: {
    role: string;
    content: MessageContent[];
    timestamp?: number;
    provenance?: MessageProvenance;
  };
}

function getSessionsJsonPath(agentId: string): string {
  return path.join(AGENTS_BASE, agentId, "sessions", "sessions.json");
}

function readSessionsJson(agentId: string): SessionsJson | null {
  const filePath = getSessionsJsonPath(agentId);
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as SessionsJson;
  } catch {
    return null;
  }
}

function getValidSessions(
  sessions: SessionsJson
): Array<{ key: string; record: SessionRecord }> {
  return Object.entries(sessions)
    .filter(([, record]) => {
      if (!record.sessionFile) return false;
      if (!fs.existsSync(record.sessionFile)) return false;
      return true;
    })
    .map(([key, record]) => ({ key, record }))
    .sort((a, b) => (b.record.updatedAt ?? 0) - (a.record.updatedAt ?? 0));
}

async function readLastNLines(
  filePath: string,
  n: number
): Promise<string[]> {
  return new Promise((resolve) => {
    try {
      if (!fs.existsSync(filePath)) {
        resolve([]);
        return;
      }
      const lines: string[] = [];
      const rl = readline.createInterface({
        input: fs.createReadStream(filePath, { encoding: "utf-8" }),
        crlfDelay: Infinity,
      });
      rl.on("line", (line) => {
        if (line.trim()) {
          lines.push(line);
          if (lines.length > n) lines.shift();
        }
      });
      rl.on("close", () => resolve(lines));
      rl.on("error", () => resolve(lines));
    } catch {
      resolve([]);
    }
  });
}

async function readAllLines(filePath: string): Promise<string[]> {
  return new Promise((resolve) => {
    try {
      if (!fs.existsSync(filePath)) {
        resolve([]);
        return;
      }
      const lines: string[] = [];
      const rl = readline.createInterface({
        input: fs.createReadStream(filePath, { encoding: "utf-8" }),
        crlfDelay: Infinity,
      });
      rl.on("line", (line) => {
        if (line.trim()) lines.push(line);
      });
      rl.on("close", () => resolve(lines));
      rl.on("error", () => resolve(lines));
    } catch {
      resolve([]);
    }
  });
}

function parseJsonlLine(line: string): JsonlEntry | null {
  try {
    return JSON.parse(line) as JsonlEntry;
  } catch {
    return null;
  }
}

function extractTextFromContent(content: MessageContent[]): string | null {
  for (const item of content) {
    if (item.type === "text" && item.text) {
      return item.text;
    }
  }
  return null;
}

function determineStatus(
  abortedLastRun: boolean | undefined,
  updatedAt: number | undefined
): "working" | "idle" | "error" {
  if (abortedLastRun === true) return "error";
  if (!updatedAt) return "idle";
  const now = Date.now();
  if (now - updatedAt <= WORKING_THRESHOLD_MS) return "working";
  return "idle";
}

function extractAgentIdFromSessionKey(sessionKey: string): string | null {
  const match = sessionKey.match(/^agent:([^:]+):/);
  return match ? match[1] : null;
}

export async function getAgentStatus(agentId: string): Promise<AgentSession> {
  const info = AGENT_INFO[agentId] ?? {
    name: agentId,
    role: "알 수 없음",
    emoji: "❓",
  };

  const defaultResult: AgentSession = {
    agentId,
    name: info.name,
    role: info.role,
    emoji: info.emoji,
    status: "idle",
    lastActivityAt: null,
    lastMessage: null,
    sessionId: null,
  };

  const sessions = readSessionsJson(agentId);
  if (!sessions) return defaultResult;

  const validSessions = getValidSessions(sessions);
  if (validSessions.length === 0) return defaultResult;

  const { record } = validSessions[0];

  const status = determineStatus(record.abortedLastRun, record.updatedAt);

  let lastMessage: string | null = null;
  if (record.sessionFile) {
    const lines = await readLastNLines(record.sessionFile, 200);
    for (let i = lines.length - 1; i >= 0; i--) {
      const entry = parseJsonlLine(lines[i]);
      if (
        entry?.type === "message" &&
        entry.message?.role === "assistant" &&
        Array.isArray(entry.message.content)
      ) {
        const text = extractTextFromContent(entry.message.content);
        if (text) {
          lastMessage = text;
          break;
        }
      }
    }
  }

  return {
    agentId,
    name: info.name,
    role: info.role,
    emoji: info.emoji,
    status,
    lastActivityAt: record.updatedAt ?? null,
    lastMessage,
    sessionId: record.sessionId ?? null,
  };
}

export async function getAgentHistory(
  agentId: string,
  limit = 20
): Promise<HistoryEntry[]> {
  const sessions = readSessionsJson(agentId);
  if (!sessions) return [];

  const validSessions = getValidSessions(sessions);
  const entries: HistoryEntry[] = [];

  for (const { record } of validSessions) {
    if (entries.length >= limit * 2) break;
    if (!record.sessionFile) continue;

    const lines = await readAllLines(record.sessionFile);
    const sessionEntries: HistoryEntry[] = [];

    for (const line of lines) {
      const entry = parseJsonlLine(line);
      if (
        entry?.type === "message" &&
        entry.message &&
        (entry.message.role === "user" || entry.message.role === "assistant") &&
        Array.isArray(entry.message.content)
      ) {
        const text = extractTextFromContent(entry.message.content);
        if (!text) continue;

        const ts =
          entry.message.timestamp ??
          (entry.timestamp ? new Date(entry.timestamp).getTime() : Date.now());

        sessionEntries.push({
          role: entry.message.role as "user" | "assistant",
          text,
          timestamp: ts,
          sessionId: record.sessionId ?? "unknown",
        });
      }
    }

    entries.push(...sessionEntries);
    if (entries.length >= limit) break;
  }

  entries.sort((a, b) => b.timestamp - a.timestamp);
  return entries.slice(0, limit);
}

export async function getFlowEvents(limit = 50): Promise<FlowEvent[]> {
  const allEvents: FlowEvent[] = [];

  for (const agentId of ALL_AGENT_IDS) {
    const sessions = readSessionsJson(agentId);
    if (!sessions) continue;

    const validSessions = getValidSessions(sessions);

    for (const { record } of validSessions) {
      if (!record.sessionFile) continue;

      const lines = await readAllLines(record.sessionFile);

      for (const line of lines) {
        const entry = parseJsonlLine(line);
        if (
          entry?.type !== "message" ||
          !entry.message ||
          entry.message.role !== "user"
        )
          continue;

        const provenance = entry.message.provenance;
        if (!provenance || provenance.kind !== "inter_session") continue;

        const sourceSessionKey = provenance.sourceSessionKey ?? "";
        const sourceAgentId = extractAgentIdFromSessionKey(sourceSessionKey);
        if (!sourceAgentId) continue;

        const sourceInfo = AGENT_INFO[sourceAgentId] ?? {
          name: sourceAgentId,
          emoji: "❓",
        };
        const targetInfo = AGENT_INFO[agentId] ?? {
          name: agentId,
          emoji: "❓",
        };

        const text = extractTextFromContent(entry.message.content);
        if (!text) continue;

        const ts =
          entry.message.timestamp ??
          (entry.timestamp ? new Date(entry.timestamp).getTime() : Date.now());

        allEvents.push({
          id: entry.id ?? `${ts}-${sourceAgentId}-${agentId}`,
          sourceAgentId,
          sourceAgentName: sourceInfo.name,
          sourceAgentEmoji: sourceInfo.emoji,
          targetAgentId: agentId,
          targetAgentName: targetInfo.name,
          targetAgentEmoji: targetInfo.emoji,
          message: text,
          timestamp: ts,
          sourceSessionKey,
        });
      }
    }
  }

  allEvents.sort((a, b) => b.timestamp - a.timestamp);
  return allEvents.slice(0, limit);
}

export async function getCronJobs(): Promise<CronJob[]> {
  const jobs: CronJob[] = [];

  for (const agentId of ALL_AGENT_IDS) {
    const sessions = readSessionsJson(agentId);
    if (!sessions) continue;

    const info = AGENT_INFO[agentId] ?? { name: agentId, emoji: "❓", role: "" };

    for (const [key, record] of Object.entries(sessions)) {
      if (!key.toLowerCase().includes("cron")) continue;

      const lastRunAt = record.updatedAt ?? null;
      let status: "running" | "done" | "error" = "done";
      if (record.abortedLastRun) {
        status = "error";
      } else if (lastRunAt && Date.now() - lastRunAt < 5 * 60 * 1000) {
        status = "running";
      }

      jobs.push({
        name: key,
        sessionKey: key,
        agentId,
        agentName: info.name,
        agentEmoji: info.emoji,
        lastRunAt,
        status,
        nextExpectedRun: null,
      });
    }
  }

  jobs.sort((a, b) => (b.lastRunAt ?? 0) - (a.lastRunAt ?? 0));
  return jobs;
}

export async function getAgentActivitySummary(
  agentId: string
): Promise<ActivitySummary> {
  const sessions = readSessionsJson(agentId);
  if (!sessions) {
    return { sessionCount: 0, messagesSent: 0, messagesReceived: 0, toolsCalled: 0 };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();

  const validSessions = getValidSessions(sessions);
  const todaySessions = validSessions.filter(
    ({ record }) => (record.updatedAt ?? 0) >= todayMs
  );

  let messagesSent = 0;
  let messagesReceived = 0;
  let toolsCalled = 0;

  for (const { record } of todaySessions) {
    if (!record.sessionFile) continue;
    const lines = await readAllLines(record.sessionFile);

    for (const line of lines) {
      const entry = parseJsonlLine(line);
      if (!entry || entry.type !== "message" || !entry.message) continue;

      if (!Array.isArray(entry.message.content)) continue;

      if (entry.message.role === "assistant") {
        const hasText = entry.message.content.some(
          (c) => c.type === "text" && c.text
        );
        if (hasText) messagesSent++;
        toolsCalled += entry.message.content.filter(
          (c) => c.type === "tool_use"
        ).length;
      } else if (entry.message.role === "user") {
        const hasText = entry.message.content.some(
          (c) => c.type === "text" && c.text
        );
        if (hasText) messagesReceived++;
      }
    }
  }

  return {
    sessionCount: todaySessions.length,
    messagesSent,
    messagesReceived,
    toolsCalled,
  };
}
