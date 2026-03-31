"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

interface FlowEvent {
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

const AGENT_COLORS: Record<string, string> = {
  "yun-biseo": "border-l-blue-500 bg-blue-950/20",
  "yun-siljang": "border-l-purple-500 bg-purple-950/20",
  "yun-parksa": "border-l-green-500 bg-green-950/20",
  "main-admin": "border-l-orange-500 bg-orange-950/20",
};

const AGENT_BADGE_COLORS: Record<string, string> = {
  "yun-biseo": "bg-blue-900/50 text-blue-300",
  "yun-siljang": "bg-purple-900/50 text-purple-300",
  "yun-parksa": "bg-green-900/50 text-green-300",
  "main-admin": "bg-orange-900/50 text-orange-300",
};

function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
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

function MessageCard({ event }: { event: FlowEvent }) {
  const colorClass =
    AGENT_COLORS[event.sourceAgentId] ?? "border-l-gray-500 bg-gray-900/20";
  const badgeClass =
    AGENT_BADGE_COLORS[event.sourceAgentId] ?? "bg-gray-800 text-gray-300";
  const targetBadgeClass =
    AGENT_BADGE_COLORS[event.targetAgentId] ?? "bg-gray-800 text-gray-300";

  return (
    <div
      className={`border border-gray-800 border-l-4 ${colorClass} rounded-r-xl rounded-bl-xl p-4 transition-colors hover:border-gray-700`}
    >
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <Link
          href={`/agents/${event.sourceAgentId}`}
          className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${badgeClass} hover:opacity-80 transition-opacity`}
        >
          <span>{event.sourceAgentEmoji}</span>
          <span>{event.sourceAgentName}</span>
        </Link>
        <svg
          className="w-3.5 h-3.5 text-gray-600 shrink-0"
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z" />
        </svg>
        <Link
          href={`/agents/${event.targetAgentId}`}
          className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${targetBadgeClass} hover:opacity-80 transition-opacity`}
        >
          <span>{event.targetAgentEmoji}</span>
          <span>{event.targetAgentName}</span>
        </Link>
        <span className="ml-auto text-xs text-gray-600 shrink-0">
          {timeAgo(event.timestamp)}
        </span>
      </div>

      <p className="text-sm text-gray-300 leading-relaxed line-clamp-4 whitespace-pre-wrap">
        {event.message}
      </p>

      <div className="mt-2 text-xs text-gray-700">
        {formatTimestamp(event.timestamp)}
      </div>
    </div>
  );
}

function MessageSkeleton() {
  return (
    <div className="border border-gray-800 border-l-4 border-l-gray-700 rounded-r-xl rounded-bl-xl p-4 animate-pulse">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-5 w-20 bg-gray-800 rounded-full" />
        <div className="w-3.5 h-3.5 bg-gray-800 rounded" />
        <div className="h-5 w-20 bg-gray-800 rounded-full" />
      </div>
      <div className="space-y-2">
        <div className="h-4 bg-gray-800 rounded w-full" />
        <div className="h-4 bg-gray-800 rounded w-5/6" />
        <div className="h-4 bg-gray-800 rounded w-3/4" />
      </div>
    </div>
  );
}

export default function MessagesPage() {
  const [events, setEvents] = useState<FlowEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filterAgent, setFilterAgent] = useState<string>("all");

  const fetchEvents = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch("/api/messages", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setEvents(data);
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Failed to fetch messages:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
    const interval = setInterval(() => fetchEvents(), 10000);
    return () => clearInterval(interval);
  }, [fetchEvents]);

  const agents = [
    { id: "all", name: "전체", emoji: "📡" },
    { id: "yun-biseo", name: "윤비서", emoji: "📋" },
    { id: "yun-siljang", name: "윤실장", emoji: "💼" },
    { id: "yun-parksa", name: "윤박사", emoji: "🔬" },
    { id: "main-admin", name: "메인관리자", emoji: "🧭" },
  ];

  const filtered =
    filterAgent === "all"
      ? events
      : events.filter(
          (e) =>
            e.sourceAgentId === filterAgent || e.targetAgentId === filterAgent
        );

  return (
    <div className="min-h-screen bg-gray-950">
      <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-white">메시지 타임라인</h1>
              <p className="text-xs text-gray-500 mt-0.5">
                에이전트 간 실시간 메시지
              </p>
            </div>
            <div className="flex items-center gap-3">
              {lastUpdated && (
                <span className="text-xs text-gray-600 hidden sm:block">
                  {lastUpdated.toLocaleTimeString("ko-KR")}
                </span>
              )}
              <button
                onClick={() => fetchEvents(true)}
                disabled={refreshing}
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors px-3 py-1.5 rounded-lg border border-gray-700 hover:border-gray-500 disabled:opacity-50"
              >
                <svg
                  className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                새로고침
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {/* Agent filter tabs */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {agents.map((agent) => (
            <button
              key={agent.id}
              onClick={() => setFilterAgent(agent.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                filterAgent === agent.id
                  ? "bg-gray-200 text-gray-900"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
              }`}
            >
              <span>{agent.emoji}</span>
              <span>{agent.name}</span>
            </button>
          ))}
          {!loading && (
            <span className="ml-auto text-xs text-gray-600 self-center">
              {filtered.length}개 메시지
            </span>
          )}
        </div>

        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <MessageSkeleton key={i} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-gray-600">
            <div className="text-5xl mb-4">💬</div>
            <p className="text-sm font-medium text-gray-500 mb-1">
              메시지 없음
            </p>
            <p className="text-xs text-gray-600">
              에이전트 간 메시지가 없거나 아직 기록이 없습니다
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((event) => (
              <MessageCard key={event.id} event={event} />
            ))}
          </div>
        )}

        <div className="mt-8 text-center text-xs text-gray-700">
          10초마다 자동으로 새로고침됩니다
        </div>
      </main>
    </div>
  );
}
