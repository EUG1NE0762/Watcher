import {
  DEFAULT_SEVERITY,
  extractionResponseSchema,
  normalizeText,
  type Category,
  type ExtractedIncident,
  type Substance,
} from '@watcher/scoring';
import { fetchWithTimeout, type Env } from './http.ts';

export interface Article {
  title: string;
  text: string;
  published_at: string;
  source_name: string;
}

/**
 * The ingestion step's model. Swap implementations with LLM_PROVIDER:
 *  - openai_compatible: any OpenAI-style endpoint (OpenRouter, Ollama, vLLM, Groq) serving an open-weight model such as Gemma or Llama
 *  - gemini: Gemma via the Gemini API
 *  - heuristic: keyword rules, no model (tests, or when no endpoint is configured)
 */
export interface LLMProvider {
  readonly name: string;
  extractIncidents(article: Article): Promise<ExtractedIncident[]>;
}

export const EXTRACTION_PROMPT = `You extract crime and drug-related incidents from Zambian news or police/DEC press releases.
Return ONLY JSON: {"incidents":[{"is_incident":bool,"category":"theft|robbery|assault|burglary|vehicle_crime|sexual_offence|drug_offence|other","substance":"cannabis|alcohol|methaqualone|heroin|cocaine|synthetic|other"|null,"location_text":string|null,"city":string|null,"occurred_at":"YYYY-MM-DD"|null,"severity":1-5,"summary":string}]}
Rules:
- Only incidents that the text explicitly reports as having happened in Zambia. Ignore opinion, court procedure without an incident, and events outside Zambia.
- location_text: the most specific place named (township, market, road, landmark). null if none.
- severity: 1 minor/no victim, 2 petty theft, 3 burglary/vehicle crime, 4 robbery/assault, 5 serious violence or sexual offence.
- summary: one neutral sentence in your own words, max 250 characters. NO names, ages or identifying details of any person (suspects, victims or officers). Use non-stigmatising language ("people who use drugs", not "junkies").
- If there is no qualifying incident return {"incidents":[]}.`;

function articlePrompt(a: Article): string {
  return `${EXTRACTION_PROMPT}\n\nSource: ${a.source_name}\nPublished: ${a.published_at}\nTitle: ${a.title}\nText: ${a.text.slice(0, 4000)}`;
}

/** Pull the first JSON object out of a model reply (models sometimes wrap it in prose or fences). */
export function parseModelJson(text: string): ExtractedIncident[] {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return [];
  try {
    const parsed = extractionResponseSchema.safeParse(JSON.parse(text.slice(start, end + 1)));
    return parsed.success ? parsed.data.incidents.filter((i) => i.is_incident) : [];
  } catch {
    return [];
  }
}

export class OpenAICompatibleProvider implements LLMProvider {
  readonly name: string;
  private f: typeof fetch;
  private baseUrl: string;
  private model: string;
  private apiKey?: string;

  constructor(f: typeof fetch, baseUrl: string, model: string, apiKey?: string) {
    this.f = f;
    this.baseUrl = baseUrl;
    this.model = model;
    this.apiKey = apiKey;
    this.name = `openai_compatible:${model}`;
  }

  async extractIncidents(article: Article): Promise<ExtractedIncident[]> {
    const res = await fetchWithTimeout(this.f, `${this.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: articlePrompt(article) }],
      }),
    }, 45000);
    if (!res.ok) throw new Error(`llm_http_${res.status}`);
    const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return parseModelJson(body.choices?.[0]?.message?.content ?? '');
  }
}

export class GeminiProvider implements LLMProvider {
  readonly name: string;
  private f: typeof fetch;
  private apiKey: string;
  private model: string;

  constructor(f: typeof fetch, apiKey: string, model: string) {
    this.f = f;
    this.apiKey = apiKey;
    this.model = model;
    this.name = `gemini:${model}`;
  }

  async extractIncidents(article: Article): Promise<ExtractedIncident[]> {
    const res = await fetchWithTimeout(
      this.f,
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`,
      {
        method: 'POST',
        // Key in a header, not the URL, so it never appears in request logs.
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: articlePrompt(article) }] }],
          generationConfig: { temperature: 0 },
        }),
      },
      45000,
    );
    if (!res.ok) throw new Error(`gemini_http_${res.status}`);
    const body = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    return parseModelJson(body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '');
  }
}

const CATEGORY_KEYWORDS: Array<[Category, RegExp]> = [
  ['sexual_offence', /\b(defile|defiled|defilement|rape|raped|indecent assault|sexual)\b/],
  ['robbery', /\b(robbery|robbed|aggravated|armed|mugged|mugging)\b/],
  ['burglary', /\b(burglary|break[- ]in|broke into|house ?breaking|store ?breaking)\b/],
  ['vehicle_crime', /\b(car theft|motor vehicle|carjack|vehicle (was )?stolen|stole a vehicle)\b/],
  ['assault', /\b(assault|assaulted|stabbed|stabbing|attacked|beaten|murder|killed)\b/],
  ['drug_offence', /\b(dec|drug enforcement|trafficking|narcotic|drugs?|cannabis|dagga|heroin|cocaine|mandrax|methaqualone)\b/],
  ['theft', /\b(theft|stole|stolen|thief|thieves|snatch|pickpocket)\b/],
];
const SUBSTANCE_KEYWORDS: Array<[Substance, RegExp]> = [
  ['cannabis', /\b(cannabis|dagga|marijuana|weed|ganja)\b/],
  ['methaqualone', /\b(mandrax|methaqualone)\b/],
  ['heroin', /\bheroin\b/],
  ['cocaine', /\b(cocaine|crack)\b/],
  ['synthetic', /\b(crystal meth|methamphetamine|synthetic)\b/],
  ['alcohol', /\b(alcohol|drunk|beer|kachasu|tujilijili|intoxicated)\b/],
];

/** Keyword extractor. Deterministic and offline; used in tests and when no model endpoint is set. */
export class HeuristicProvider implements LLMProvider {
  readonly name = 'heuristic';

  async extractIncidents(article: Article): Promise<ExtractedIncident[]> {
    const text = normalizeText(`${article.title} ${article.text}`);
    const category = CATEGORY_KEYWORDS.find(([, re]) => re.test(text))?.[0];
    if (!category) return [];
    const substance = SUBSTANCE_KEYWORDS.find(([, re]) => re.test(text))?.[0] ?? null;
    const summary = article.title.replace(/\s+/g, ' ').trim().slice(0, 250);
    if (summary.length < 10) return [];
    return [
      {
        is_incident: true,
        category,
        substance,
        location_text: `${article.title} ${article.text}`.slice(0, 200),
        city: null,
        occurred_at: null,
        severity: DEFAULT_SEVERITY[category],
        summary,
      },
    ];
  }
}

export function createProvider(env: Env, f: typeof fetch): LLMProvider {
  const kind = (env.LLM_PROVIDER || '').toLowerCase();
  if (kind === 'gemini' && env.GEMINI_API_KEY) {
    return new GeminiProvider(f, env.GEMINI_API_KEY, env.LLM_MODEL || 'gemma-3-27b-it');
  }
  if ((kind === 'openai_compatible' || (!kind && env.LLM_BASE_URL)) && env.LLM_BASE_URL) {
    return new OpenAICompatibleProvider(f, env.LLM_BASE_URL, env.LLM_MODEL || 'google/gemma-3-27b-it', env.LLM_API_KEY);
  }
  return new HeuristicProvider();
}
