// AI school-fit matcher: scores how realistic each candidate school is for an
// athlete (level, geography, academics) and returns a ranked list with
// rationale. Requires ANTHROPIC_API_KEY.
import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import type { AthleteProfile } from "./composer.js";

export interface SchoolCandidate {
  id: number;
  name: string;
  conference: string | null;
  division: string | null;
  city: string | null;
  state: string | null;
}

export interface FitScore {
  school_id: number;
  score: number; // 0-100, higher = more realistic + attractive target
  rationale: string;
}

const FIT_SCHEMA = {
  type: "object" as const,
  properties: {
    fits: {
      type: "array",
      items: {
        type: "object",
        properties: {
          school_id: { type: "integer" },
          score: { type: "integer", description: "0-100 realistic-fit score" },
          rationale: { type: "string", description: "One sentence: why this score" },
        },
        required: ["school_id", "score", "rationale"],
        additionalProperties: false,
      },
    },
  },
  required: ["fits"],
  additionalProperties: false,
};

const SYSTEM = `You are a college football recruiting analyst. Score each candidate school 0-100 for how realistic AND worthwhile a target it is for this athlete.

Consider:
- Level realism: measurables/production vs typical rosters at that division (fbs > fcs > ii > iii/naia). Be honest - most athletes' realistic ceiling is below FBS.
- Academics: GPA/SAT/ACT vs the division. Strong academics raise iii/high-academic fits sharply; weak academics lower them.
- Geography: same state or within a day's drive scores higher; most non-FBS recruiting is regional.
- Score the athlete's REALISTIC band highest. A school two levels above their level should score low even if prestigious.

Return a score for every school provided.`;

export async function scoreSchoolFits(athlete: AthleteProfile, schools: SchoolCandidate[]): Promise<FitScore[]> {
  if (!config.anthropicApiKey) {
    throw new Error("ANTHROPIC_API_KEY is required for school-fit matching");
  }
  const client = new Anthropic({ apiKey: config.anthropicApiKey });

  const response = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: SYSTEM,
    output_config: { format: { type: "json_schema", schema: FIT_SCHEMA } },
    messages: [{ role: "user", content: JSON.stringify({ athlete, schools }) }],
  });

  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") {
    throw new Error(`Matcher returned no text block (stop_reason=${response.stop_reason})`);
  }
  const parsed = JSON.parse(text.text) as { fits: FitScore[] };
  return parsed.fits.sort((a, b) => b.score - a.score);
}
