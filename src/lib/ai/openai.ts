import OpenAI from "openai";

const DEFAULT_MODEL = "gpt-4.1-mini";

let client: OpenAI | null = null;

function getApiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing. Add it to your .env file.");
  }

  return apiKey;
}

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: getApiKey() });
  }

  return client;
}

export function getOpenAIModel(): string {
  return process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;
}

export async function generateJsonObject(args: {
  systemPrompt: string;
  userPrompt: string;
}): Promise<{ parsed: unknown; raw: string; model: string }> {
  const model = getOpenAIModel();

  const completion = await getClient().chat.completions.create({
    model,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: args.systemPrompt
      },
      {
        role: "user",
        content: args.userPrompt
      }
    ]
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("OpenAI returned an empty response.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("OpenAI did not return valid JSON.");
  }

  return { parsed, raw, model };
}
