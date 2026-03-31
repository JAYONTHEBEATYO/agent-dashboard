import { NextResponse } from "next/server";
import { getCronJobs } from "@/lib/session-reader";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const jobs = await getCronJobs();
    return NextResponse.json(jobs);
  } catch (error) {
    console.error("Error fetching cron jobs:", error);
    return NextResponse.json(
      { error: "Failed to fetch cron jobs" },
      { status: 500 }
    );
  }
}
