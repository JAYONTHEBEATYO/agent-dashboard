import { NextResponse } from "next/server";
import { getFlowEvents } from "@/lib/session-reader";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const events = await getFlowEvents(100);
    return NextResponse.json(events);
  } catch (error) {
    console.error("Error fetching messages:", error);
    return NextResponse.json(
      { error: "Failed to fetch messages" },
      { status: 500 }
    );
  }
}
