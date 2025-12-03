import { NextResponse } from "next/server";
import { tasks } from "@trigger.dev/sdk/v3";
import type { runTournamentTask } from "@/trigger/run-tournament";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    
    const matchesPerScenario = body.matchesPerScenario || 25;
    const totalRounds = body.totalRounds || 10;

    // Trigger the background task
    const handle = await tasks.trigger<typeof runTournamentTask>(
      "run-tournament",
      {
        matchesPerScenario,
        totalRounds,
      }
    );

    return NextResponse.json({
      success: true,
      message: "Tournament started",
      runId: handle.id,
      matchesPerScenario,
      totalRounds,
      totalMatches: matchesPerScenario * 4, // 4 scenarios
    });
  } catch (error) {
    console.error("Failed to start tournament:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: "POST to this endpoint to start a tournament",
    params: {
      matchesPerScenario: "number (default: 25)",
      totalRounds: "number (default: 10)",
    },
  });
}

