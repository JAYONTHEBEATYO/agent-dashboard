import { NextResponse } from "next/server";
import { getAgentStatus, ALL_AGENT_IDS } from "@/lib/session-reader";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const results = await Promise.all(
      ALL_AGENT_IDS.map((id) => getAgentStatus(id))
    );
    return NextResponse.json(results);
  } catch (error) {
    console.error("Error fetching agent statuses:", error);
    return NextResponse.json(
      { error: "Failed to fetch agent statuses" },
      { status: 500 }
    );
  }
}
