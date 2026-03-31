"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

interface AgentSession {
  agentId: string;
  name: string;
  role: string;
  emoji: string;
  status: "working" | "idle" | "error";
  lastActivityAt: number | null;
  lastMessage: string | null;
  sessionId: string | null;
}

interface HistoryEntry {
  role: "user" | "assistant";
  text: string;
  timestamp: number;
  sessionId: string;
}

function StatusDot({ status }: { status: AgentSession["status"] }) {
  const colorMap = {
    working: "bg-green-500",
    idle: "bg-yellow-500",
    error: "bg-red-500",
  };
  const labelMap = {
    working: "작업중",
    idle: "대기",
    error: "에러",
  };
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={`inline-block w-2.5 h-2.5 rounded-full ${colorMap[status]} ${status === "working" ? "animate-pulse" : ""}`}
      />
      <span
        className={`text-sm font-medium ${
          status === "working"
            ? "text-green-400"
            : status === "error"
              ? "text-red-400"
              : "text-yellow-400"
        }`}
      >
        {labelMap[status]}
      </span>
    </span>
  );
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MessageBubble({ entry }: { entry: HistoryEntry }) {
  const isUser = entry.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3`}>
      <div className={`max-w-[85%] ${isUser ? "items-end" : "items-start"} flex flex-col`}>
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
            isUser
              ? "bg-blue-600 text-white rounded-tr-sm"
              : "bg-gray-800 text-gray-200 rounded-tl-sm border border-gray-700"
          }`}
        >
          <p className="whitespace-pre-wrap break-words">{entry.text}</p>
        </div>
        <span className="text-xs text-gray-600 mt-1 px-1">
          {isUser ? "사용자" : "에이전트"} · {formatTimestamp(entry.timestamp)}
        </span>
      </div>
    </div>
  );
}

function HistorySkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className={`flex ${i % 2 === 0 ? "justify-end" : "justify-start"}`}
        >
          <div
            className={`h-16 rounded-2xl ${i % 2 === 0 ? "bg-blue-900/30 w-2/3" : "bg-gray-800 w-3/4"}`}
          />
        </div>
      ))}
    </div>
  );
}

export default function AgentDetailPage() {
  const params = useParams();
  const agentId = params.id as string;

  const [agent, setAgent] = useState<AgentSession | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [agentsRes, historyRes] = await Promise.all([
        fetch("/api/agents", { cache: "no-store" }),
        fetch(`/api/agents/${agentId}/history`, { cache: "no-store" }),
      ]);

      if (agentsRes.ok) {
        const allAgents: AgentSession[] = await agentsRes.json();
        const found = allAgents.find((a) => a.agentId === agentId);
        if (found) setAgent(found);
      }

      if (historyRes.ok) {
        const data: HistoryEntry[] = await historyRes.json();
        // Sort ascending for chat display
        const sorted = [...data].sort((a, b) => a.timestamp - b.timestamp);
        setHistory(sorted);
      }

      setLastUpdated(new Date());
    } catch (err) {
      console.error("Failed to fetch data:", err);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(), 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link
                href="/"
                className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
                현황판
              </Link>

              {agent && (
                <>
                  <span className="text-gray-700">/</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{agent.emoji}</span>
                    <div>
                      <span className="text-sm font-semibold text-gray-200">
                        {agent.name}
                      </span>
                      <span className="ml-2 text-xs text-gray-500">
                        {agent.role}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>

            {agent && (
              <div className="flex items-center gap-3">
                <StatusDot status={agent.status} />
                {lastUpdated && (
                  <span className="text-xs text-gray-600 hidden sm:block">
                    {lastUpdated.toLocaleTimeString("ko-KR")}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {/* Agent info card */}
        {agent && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
            <div className="flex items-center gap-4">
              <div className="text-5xl">{agent.emoji}</div>
              <div className="flex-1">
                <h1 className="text-xl font-bold text-white">{agent.name}</h1>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">
                    {agent.role}
                  </span>
                  <StatusDot status={agent.status} />
                </div>
                {agent.lastActivityAt && (
                  <p className="text-xs text-gray-500 mt-1.5">
                    마지막 활동: {timeAgo(agent.lastActivityAt)}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* History section */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
              최근 대화 이력
            </h2>
            {history.length > 0 && (
              <span className="text-xs text-gray-600">{history.length}개 메시지</span>
            )}
          </div>

          {loading ? (
            <HistorySkeleton />
          ) : history.length === 0 ? (
            <div className="text-center py-16 text-gray-600">
              <div className="text-4xl mb-4">💬</div>
              <p className="text-sm">대화 이력이 없습니다</p>
            </div>
          ) : (
            <div className="space-y-1">
              {history.map((entry, idx) => (
                <MessageBubble key={`${entry.sessionId}-${idx}`} entry={entry} />
              ))}
            </div>
          )}
        </div>

        <div className="mt-8 text-center text-xs text-gray-700">
          30초마다 자동으로 새로고침됩니다
        </div>
      </main>
    </div>
  );
}
