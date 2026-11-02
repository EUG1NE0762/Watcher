import { fetchWithTimeout, type Env } from './http.ts';

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

export const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-5-5';

/** Minimal Anthropic Messages API client (fetch only, so it runs unchanged in Deno and Node tests). */
export async function callClaude(
  f: typeof fetch,
  env: Env,
  system: string,
  messages: ClaudeMessage[],
  maxTokens = 500,
): Promise<string> {
  const res = await fetchWithTimeout(
    f,
    'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: env.ANTHROPIC_MODEL || DEFAULT_CLAUDE_MODEL,
        max_tokens: maxTokens,
        temperature: 0.2,
        system,
        messages,
      }),
    },
    25000,
  );
  if (!res.ok) throw new Error(`claude_http_${res.status}`);
  const body = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const text = (body.content ?? [])
    .filter((c) => c.type === 'text')
    .map((c) => c.text ?? '')
    .join('')
    .trim();
  if (!text) throw new Error('claude_empty');
  return text;
}
