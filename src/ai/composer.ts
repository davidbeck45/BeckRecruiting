// AI email composer: writes a short, personalized recruiting email from an
// athlete to a specific coach, using Claude with a JSON-schema structured
// output so the result is machine-safe. Falls back to a plain template when
// ANTHROPIC_API_KEY is unset so the pipeline runs end-to-end in dev.
import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";

export interface AthleteProfile {
  first_name: string;
  last_name: string;
  grad_year: number | null;
  position: string | null;
  height_in: number | null;
  weight_lb: number | null;
  measurables: string | null; // JSON string
  gpa: number | null;
  sat: number | null;
  act: number | null;
  high_school: string | null;
  city: string | null;
  state: string | null;
  film_url: string | null;
  email: string | null;
  phone: string | null;
  twitter: string | null;
  /** Coach-certified measurables (laser-timed etc.) — preferred over self-reported ones. */
  verified_measurables?: Array<{ metric: string; value: number; method: string | null; verified_by: string }>;
}

export interface CoachTarget {
  first_name: string;
  last_name: string;
  title: string | null;
  school_name: string;
  conference: string | null;
  division: string | null;
  school_state: string | null;
}

export interface ComposedEmail {
  subject: string;
  body: string; // plain text; FILM_LINK placeholder marks where the tracked film link goes
}

const EMAIL_SCHEMA = {
  type: "object" as const,
  properties: {
    subject: { type: "string", description: "Email subject line, under 70 characters" },
    body: {
      type: "string",
      description:
        "Plain-text email body. Use the literal placeholder FILM_LINK exactly once where the film hyperlink belongs.",
    },
  },
  required: ["subject", "body"],
  additionalProperties: false,
};

const SYSTEM = `You write recruiting emails from a high school football athlete to a college coach.

Rules:
- Written in the athlete's first-person voice; sincere, direct, zero hype-words.
- 120 words max. Coaches read on phones between practices.
- First sentence: who the athlete is (name, position, grad year, school, city/state).
- Second: the 2-3 stats that matter most for this coach's position group and this school's level. Never invent numbers - use only what is provided.
- When verified_measurables are present, cite those values over self-reported ones and note they are staff-certified (e.g. "laser-timed 4.62 forty, certified by our staff"). Coaches distrust inflated stopwatch times; certification is the credibility signal.
- Include the placeholder FILM_LINK exactly once, early, on its own line, like: "Film: FILM_LINK".
- Mention academics (GPA/test scores) when they are strong or when the school's division suggests academics matter (iii, Ivy-type).
- Reference the coach by name and the program specifically (one concrete detail: conference, state proximity, their role).
- Close with contact info that was provided and a simple ask (evaluate my film / where I fit in your class).
- Subject line: position, grad year, one standout number. No clickbait, no emojis, no ALL CAPS.`;

function heightFmt(inches: number | null): string | null {
  if (!inches) return null;
  return `${Math.floor(inches / 12)}'${Math.round(inches % 12)}"`;
}

/** Deterministic fallback template used when no Anthropic API key is configured. */
export function templateEmail(athlete: AthleteProfile, coach: CoachTarget): ComposedEmail {
  const h = heightFmt(athlete.height_in);
  const statBits = [
    h && athlete.weight_lb ? `${h}, ${athlete.weight_lb} lbs` : null,
    athlete.gpa ? `${athlete.gpa} GPA` : null,
  ].filter(Boolean);
  return {
    subject: `${athlete.position ?? "Athlete"} | Class of ${athlete.grad_year ?? "?"} | ${athlete.first_name} ${athlete.last_name}`,
    body: [
      `Coach ${coach.last_name},`,
      ``,
      `My name is ${athlete.first_name} ${athlete.last_name}, a ${athlete.grad_year ?? ""} ${athlete.position ?? "player"} at ${athlete.high_school ?? "my high school"}${athlete.city ? ` in ${athlete.city}, ${athlete.state ?? ""}` : ""}.${statBits.length ? ` ${statBits.join(", ")}.` : ""}`,
      ``,
      `Film: FILM_LINK`,
      ``,
      `I'd be grateful if you could take a look and let me know where I might fit in your ${coach.school_name} recruiting class.`,
      ``,
      `Thank you for your time,`,
      `${athlete.first_name} ${athlete.last_name}`,
      athlete.email ?? "",
      athlete.phone ?? "",
    ].join("\n"),
  };
}

export async function composeEmail(athlete: AthleteProfile, coach: CoachTarget): Promise<ComposedEmail> {
  if (!config.anthropicApiKey) {
    return templateEmail(athlete, coach);
  }

  const client = new Anthropic({ apiKey: config.anthropicApiKey });
  const response = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: SYSTEM,
    output_config: { format: { type: "json_schema", schema: EMAIL_SCHEMA } },
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          athlete: {
            ...athlete,
            height: heightFmt(athlete.height_in),
            measurables: athlete.measurables ? JSON.parse(athlete.measurables) : null,
          },
          coach,
        }),
      },
    ],
  });

  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") {
    throw new Error(`Composer returned no text block (stop_reason=${response.stop_reason})`);
  }
  return JSON.parse(text.text) as ComposedEmail;
}
