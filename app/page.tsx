"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

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

function timeAgo(ms: number | null): string {
  if (!ms) return "알 수 없음";
  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}

function AgentCardSkeleton() {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 animate-pulse">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-gray-800" />
          <div>
            <div className="h-5 w-20 bg-gray-800 rounded mb-2" />
            <div className="h-4 w-28 bg-gray-800 rounded" />
          </div>
        </div>
        <div className="h-5 w-16 bg-gray-800 rounded-full" />
      </div>
      <div className="space-y-2">
        <div className="h-4 w-24 bg-gray-800 rounded" />
        <div className="h-4 w-full bg-gray-800 rounded" />
        <div className="h-4 w-3/4 bg-gray-800 rounded" />
      </div>
    </div>
  );
}

function AgentCard({ agent }: { agent: AgentSession }) {
  const borderColorMap = {
    working: "border-green-800 hover:border-green-600",
    idle: "border-gray-800 hover:border-gray-600",
    error: "border-red-900 hover:border-red-700",
  };

  return (
    <Link href={`/agents/${agent.agentId}`}>
      <div
        className={`bg-gray-900 border ${borderColorMap[agent.status]} rounded-xl p-5 cursor-pointer transition-all duration-200 hover:bg-gray-800 hover:shadow-lg hover:shadow-black/30 group h-full`}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="text-3xl leading-none select-none">{agent.emoji}</div>
            <div>
              <h2 className="text-base font-bold text-gray-100 group-hover:text-white transition-colors">
                {agent.name}
              </h2>
              <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">
                {agent.role}
              </span>
            </div>
          </div>
          <StatusDot status={agent.status} />
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>마지막 활동: {timeAgo(agent.lastActivityAt)}</span>
          </div>

          {agent.lastMessage ? (
            <p className="text-sm text-gray-400 line-clamp-2 leading-relaxed">
              {agent.lastMessage}
            </p>
          ) : (
            <p className="text-sm text-gray-600 italic">최근 메시지 없음</p>
          )}
        </div>

        <div className="mt-4 flex items-center text-xs text-gray-600 group-hover:text-gray-400 transition-colors">
          <span>상세 보기</span>
          <svg
            className="w-3.5 h-3.5 ml-1 group-hover:translate-x-0.5 transition-transform"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </div>
      </div>
    </Link>
  );
}

export default function HomePage() {
  const [agents, setAgents] = useState<AgentSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAgents = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch("/api/agents", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setAgents(data);
      setLastUpdated(new Date());
    } catch (err) {
      console.error("Failed to fetch agents:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
    const interval = setInterval(() => fetchAgents(), 30000);
    return () => clearInterval(interval);
  }, [fetchAgents]);

  const workingCount = agents.filter((a) => a.status === "working").length;
  const errorCount = agents.filter((a) => a.status === "error").length;

  return (
    <div className="min-h-screen bg-gray-950">
      <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-white">대시보드</h1>
              <p className="text-xs text-gray-500 mt-0.5">
                에이전트 실시간 현황
              </p>
            </div>
            <div className="flex items-center gap-3">
              {lastUpdated && (
                <span className="text-xs text-gray-600 hidden sm:block">
                  {lastUpdated.toLocaleTimeString("ko-KR")}
                </span>
              )}
              <button
                onClick={() => fetchAgents(true)}
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
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0f01-15.357-2m15.357 2H15"
                  />
                </svg>
                새로고침
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {!loading && agents.length > 0 && (
          <div className="flex items-center gap-4 mb-6 text-sm text-gray-500">
            <span>
              전체{" "}
              <span className="text-gray-300 font-medium">{agents.length}</span>
              개 에이전트
            </span>
            {workingCount > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-green-400 font-medium">
                  {workingCount}
                </span>
                개 작업중
              </span>
            )}
            {errorCount > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-red-400 font-medium">{errorCount}</span>개
                에러
              </span>
            )}
            {lastUpdated && (
              <span className="ml-auto text-xs text-gray-600">
                업데이트: {lastUpdated.toLocaleTimeString("ko-KR")}
              </span>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {loading ? (
            <>
              <AgentCardSkeleton />
              <AgentCardSkeleton />
              <AgentCardSkeleton />
              <AgentCardSkeleton />
            </>
          ) : agents.length === 0 ? (
            <div className="col-span-4 text-center py-16 text-gray-600">
              <div className="text-4xl mb-4">🔍</div>
              <p>에이전트 데이터를 불러올 수 없습니다</p>
            </div>
          ) : (
            agents.map((agent) => <AgentCard key={agent.agentId} agent={agent} />)
          )}
        </div>

        <div className="mt-8 text-center text-xs text-gray-700">
          30초마다 자동으로 새로고침됩니다
        </div>
      </main>
    </div>
  );
}
