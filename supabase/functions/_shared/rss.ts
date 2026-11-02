import { fetchWithTimeout } from './http.ts';

export const USER_AGENT = 'WatcherBot/0.1 (+https://github.com/watcher-zm/watcher; area-safety research)';

export interface FeedItem {
  title: string;
  link: string;
  published_at: string;
  description: string;
}

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decode(m[1]!) : '';
}

/** Small RSS 2.0 / Atom parser. Only titles, links, dates and the short description are kept. */
export function parseFeed(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  for (const block of blocks) {
    const atomLink = block.match(/<link[^>]*href="([^"]+)"/i)?.[1];
    const link = tag(block, 'link') || atomLink || '';
    const date = tag(block, 'pubDate') || tag(block, 'published') || tag(block, 'updated') || tag(block, 'dc:date');
    const parsedDate = new Date(date);
    if (!link || !Number.isFinite(parsedDate.getTime())) continue;
    items.push({
      title: tag(block, 'title'),
      link,
      published_at: parsedDate.toISOString(),
      description: (tag(block, 'description') || tag(block, 'summary')).slice(0, 1500),
    });
  }
  return items;
}

/** Disallow rules for "*" and our bot, from a robots.txt body. */
export function robotsDisallows(robots: string, path: string, agent = 'watcherbot'): boolean {
  let applies = false;
  let inGroupHeader = false;
  const rules: string[] = [];
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const [k, ...rest] = line.split(':');
    const key = k?.trim().toLowerCase();
    const value = rest.join(':').trim();
    if (key === 'user-agent') {
      const ua = value.toLowerCase();
      if (!inGroupHeader) applies = false;
      inGroupHeader = true;
      if (ua === '*' || agent.startsWith(ua)) applies = true;
    } else if (key) {
      inGroupHeader = false;
      if (applies && key === 'disallow' && value) rules.push(value);
    }
  }
  return rules.some((r) => path.startsWith(r));
}

export class PoliteFetcher {
  private robots = new Map<string, string>();
  private lastHit = new Map<string, number>();
  private f: typeof fetch;
  private minIntervalMs: number;
  private sleep: (ms: number) => Promise<void>;

  constructor(f: typeof fetch, minIntervalMs = 1500, sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))) {
    this.f = f;
    this.minIntervalMs = minIntervalMs;
    this.sleep = sleep;
  }

  private async allowed(url: URL): Promise<boolean> {
    if (!this.robots.has(url.origin)) {
      try {
        const res = await fetchWithTimeout(this.f, `${url.origin}/robots.txt`, { headers: { 'User-Agent': USER_AGENT } }, 10000);
        this.robots.set(url.origin, res.ok ? await res.text() : '');
      } catch {
        this.robots.set(url.origin, '');
      }
    }
    return !robotsDisallows(this.robots.get(url.origin)!, url.pathname + url.search);
  }

  /** GET with robots.txt check and a per-host delay. Returns null when disallowed or failed. */
  async get(raw: string): Promise<string | null> {
    const url = new URL(raw);
    if (!(await this.allowed(url))) return null;
    const wait = (this.lastHit.get(url.host) ?? 0) + this.minIntervalMs - Date.now();
    if (wait > 0) await this.sleep(wait);
    this.lastHit.set(url.host, Date.now());
    try {
      const res = await fetchWithTimeout(this.f, raw, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, application/xml, text/xml' } }, 20000);
      return res.ok ? await res.text() : null;
    } catch {
      return null;
    }
  }
}
