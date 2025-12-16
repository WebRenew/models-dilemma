import { NextResponse } from "next/server";
import { tasks } from "@trigger.dev/sdk/v3";
import type { userGameTask } from "@/src/trigger/user-game";
import {
  getClientIP,
  checkRateLimit,
  isValidModelId,
  rateLimitResponse,
  invalidModelResponse,
} from "@/lib/api-security";

type Scenario = "overt" | "sales" | "research" | "creator";

interface StartUserGameRequest {
  agent1Model: string;
  agent2Model: string;
  scenario: Scenario;
  totalRounds?: number;
}

export async function POST(request: Request) {
  // Security: Rate limiting
  const clientIP = getClientIP(request)
  const rateLimit = checkRateLimit(clientIP)
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.resetIn)
  }

  try {
    const body: StartUserGameRequest = await request.json();

    const { agent1Model, agent2Model, scenario, totalRounds = 10 } = body;

    // Validate required fields
    if (!agent1Model || !agent2Model || !scenario) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required fields: agent1Model, agent2Model, scenario",
        },
        { status: 400 }
      );
    }

    // Security: Model allowlist validation
    if (!isValidModelId(agent1Model)) {
      return invalidModelResponse(agent1Model)
    }
    if (!isValidModelId(agent2Model)) {
      return invalidModelResponse(agent2Model)
    }

    // Validate scenario
    const validScenarios: Scenario[] = ["overt", "sales", "research", "creator"];
    if (!validScenarios.includes(scenario)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid scenario. Must be one of: ${validScenarios.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Generate game ID
    const gameId = crypto.randomUUID();

    // Trigger the background task
    const handle = await tasks.trigger<typeof userGameTask>("user-game", {
      gameId,
      agent1Model,
      agent2Model,
      scenario,
      totalRounds,
    });

    console.log("[start-user-game] Triggered task", {
      gameId,
      runId: handle.id,
      agent1Model,
      agent2Model,
      scenario,
    });

    return NextResponse.json({
      success: true,
      gameId,
      runId: handle.id,
      agent1Model,
      agent2Model,
      scenario,
      totalRounds,
    });
  } catch (error) {
    console.error("[start-user-game] Failed to start game:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: "POST to this endpoint to start a user game",
    params: {
      agent1Model: "string (required) - Model ID for agent 1",
      agent2Model: "string (required) - Model ID for agent 2",
      scenario: "string (required) - overt | sales | research | creator",
      totalRounds: "number (default: 10)",
    },
  });
}








