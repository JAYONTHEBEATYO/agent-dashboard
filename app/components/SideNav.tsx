"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "대시보드", icon: "🏠" },
  { href: "/messages", label: "메시지", icon: "💬" },
  { href: "/crons", label: "Cron잡", icon: "⏰" },
  { href: "/org", label: "조직도", icon: "🗂️" },
];

export default function SideNav() {
  const pathname = usePathname();

  return (
    <aside className="w-48 min-h-screen bg-gray-900 border-r border-gray-800 sticky top-0 h-screen flex flex-col shrink-0">
      <div className="p-4 border-b border-gray-800">
        <div className="text-lg font-bold text-white leading-tight">🧭</div>
        <div className="text-xs font-bold text-gray-200 mt-1 leading-tight">에이전트 현황판</div>
        <div className="text-xs text-gray-600 mt-0.5">OpenClaw 모니터링</div>
      </div>
      <nav className="flex-1 p-2 space-y-0.5">
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 ${
                isActive
                  ? "bg-gray-700 text-white font-medium"
                  : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
              }`}
            >
              <span className="text-base leading-none">{item.icon}</span>
              <span>{item.label}</span>
              {isActive && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-400" />
              )}
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t border-gray-800">
        <p className="text-xs text-gray-700 text-center">30초 자동 갱신</p>
      </div>
    </aside>
  );
}
