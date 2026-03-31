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

function FlowEventCard({ event }: { event: FlowEvent }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors">
      {/* Agent flow arrow */}
      <div className="flex items-center gap-3 mb-3">
        <Link
          href={`/agents/${event.sourceAgentId}`}
          className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 rounded-lg px-3 py-1.5 transition-colors"
        >
          <span className="text-lg">{event.sourceAgentEmoji}</span>
          <span className="text-sm font-medium text-gray-200">
            {event.sourceAgentName}
          </span>
        </Link>

        <div className="flex-1 flex items-center gap-1 min-w-0">
          <div className="h-px flex-1 bg-gradient-to-r from-blue-600 to-purple-600" />
          <svg
            className="w-4 h-4 text-purple-400 flex-shrink-0"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z" />
          </svg>
        </div>

        <Link
          href={`/agents/${event.targetAgentId}`}
          className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 rounded-lg px-3 py-1.5 transition-colors"
        >
          <span className="text-lg">{event.targetAgentEmoji}</span>
          <span className="text-sm font-medium text-gray-200">
            {event.targetAgentName}
          </span>
        </Link>
      </div>

      {/* Message */}
      <p className="text-sm text-gray-400 leading-relaxed line-clamp-3 mb-3">
        {event.message}
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-gray-600">
        <span>{formatTimestamp(event.timestamp)}</span>
        <span className="text-gray-700">{timeAgo(event.timestamp)}</span>
      </div>
    </div>
  );
}

function FlowSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-9 w-28 bg-gray-800 rounded-lg" />
            <div className="flex-1 h-px bg-gray-800" />
            <div className="h-9 w-28 bg-gray-800 rounded-lg" />
          </div>
          <div className="space-y-2">
            <div className="h-4 bg-gray-800 rounded w-full" />
            <div className="h-4 bg-gray-800 rounded w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function FlowPage() {
  const [events, setEvents] = useState<FlowEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchEvents = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch("/api/flow", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setEvents(data);
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Failed to fetch flow events:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
    const interval = setInterval(() => fetchEvents(), 30000);
    return () => clearInterval(interval);
  }, [fetchEvents]);

  // Group events by day
  const groupedByDay = events.reduce<Record<string, FlowEvent[]>>((acc, event) => {
    const day = new Date(event.timestamp).toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    if (!acc[day]) acc[day] = [];
    acc[day].push(event);
    return acc;
  }, {});

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
              <span className="text-gray-700">/</span>
              <h1 className="text-sm font-semibold text-gray-200">위임 흐름</h1>
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
        <div className="mb-6">
          <h2 className="text-lg font-bold text-white">에이전트 간 위임 흐름</h2>
          <p className="text-sm text-gray-500 mt-1">
            에이전트들이 서로 주고받은 메시지 및 위임 내역
          </p>
        </div>

        {loading ? (
          <FlowSkeleton />
        ) : events.length === 0 ? (
          <div className="text-center py-20 text-gray-600">
            <div className="text-5xl mb-4">🔄</div>
            <p className="text-sm font-medium text-gray-500 mb-1">위임 이력 없음</p>
            <p className="text-xs text-gray-600">
              에이전트 간 메시지가 없거나 아직 기록이 없습니다
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedByDay).map(([day, dayEvents]) => (
              <div key={day}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-px flex-1 bg-gray-800" />
                  <span className="text-xs text-gray-600 font-medium px-2">{day}</span>
                  <div className="h-px flex-1 bg-gray-800" />
                </div>
                <div className="space-y-3">
                  {dayEvents.map((event) => (
                    <FlowEventCard key={event.id} event={event} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 text-center text-xs text-gray-700">
          30초마다 자동으로 새로고침됩니다 · 최근 50개 이벤트 표시
        </div>
      </main>
    </div>
  );
}
