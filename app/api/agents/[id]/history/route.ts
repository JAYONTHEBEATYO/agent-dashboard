import { NextResponse } from "next/server";
import { getAgentHistory, AGENT_INFO } from "@/lib/session-reader";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const agentId = params.id;

  if (!AGENT_INFO[agentId]) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  try {
    const history = await getAgentHistory(agentId, 20);
    return NextResponse.json(history);
  } catch (error) {
    console.error(`Error fetching history for ${agentId}:`, error);
    return NextResponse.json(
      { error: "Failed to fetch agent history" },
      { status: 500 }
    );
  }
}
