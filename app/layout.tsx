import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import SideNav from "./components/SideNav";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "에이전트 현황판",
  description: "OpenClaw 에이전트 실시간 현황 모니터링",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className="dark">
      <body className={`${inter.className} bg-gray-950 text-gray-100 min-h-screen`}>
        <div className="flex min-h-screen">
          <SideNav />
          <div className="flex-1 min-w-0">
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
