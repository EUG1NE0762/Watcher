// GENERATED from packages/scoring/src by scripts/sync-scoring.mjs. Do not edit here.
import { normalizeText, stringSimilarity } from './text.ts';
import type { Area, LngLat } from './types.ts';

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371;

export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** Ray casting on a GeoJSON-ordered ring. */
export function pointInPolygon(point: LatLng, ring: LngLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    const intersects = yi > point.lat !== yj > point.lat && point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/**
 * Area containing the point, else the nearest centroid within maxKm.
 * Runs on-device so the user's location never has to leave the phone.
 */
export function areaAtPoint(point: LatLng, areas: Area[], maxKm = 2.5): Area | null {
  const containing = areas.filter((a) => pointInPolygon(point, a.polygon));
  const pool = containing.length ? containing : areas;
  let best: Area | null = null;
  let bestKm = Infinity;
  for (const a of pool) {
    const km = haversineKm(point, a.centroid);
    if (km < bestKm) {
      best = a;
      bestKm = km;
    }
  }
  if (!containing.length && bestKm > maxKm) return null;
  return best;
}

/** Straight-line samples between two points, roughly every stepKm. */
export function sampleLine(from: LatLng, to: LatLng, stepKm = 0.25): LatLng[] {
  const km = haversineKm(from, to);
  const steps = Math.max(1, Math.ceil(km / stepKm));
  return Array.from({ length: steps + 1 }, (_, i) => ({
    lat: from.lat + ((to.lat - from.lat) * i) / steps,
    lng: from.lng + ((to.lng - from.lng) * i) / steps,
  }));
}

/** Areas the straight-line corridor passes through, in travel order, excluding gaps. */
export function corridorAreas(from: LatLng, to: LatLng, areas: Area[]): Area[] {
  const seen = new Set<string>();
  const out: Area[] = [];
  for (const p of sampleLine(from, to)) {
    const a = areas.find((x) => pointInPolygon(p, x.polygon));
    if (a && !seen.has(a.id)) {
      seen.add(a.id);
      out.push(a);
    }
  }
  return out;
}

/** Aliases fine for search but too generic to identify a place inside free text ("Mongu town"). */
const GENERIC_LABELS = new Set(['town', 'town centre', 'city centre', 'bus station', 'cbd']);

export interface AreaMatch {
  area: Area;
  score: number;
  matched: string;
}

/**
 * Fuzzy area lookup used by both search (partial names) and the ingestion pipeline (free-text locations).
 * Exact/prefix/substring hits beat edit-distance hits.
 */
export function searchAreas(query: string, areas: Area[], limit = 8): AreaMatch[] {
  const q = normalizeText(query);
  if (!q) return [];
  const results: AreaMatch[] = [];
  for (const area of areas) {
    let best = 0;
    let matched = area.name;
    for (const label of [area.name, ...area.aliases]) {
      const n = normalizeText(label);
      let s = 0;
      if (n === q) s = 1;
      else if (n.startsWith(q)) s = 0.95;
      else if (n.split(' ').some((w) => w.startsWith(q))) s = 0.9;
      else if (n.includes(q)) s = 0.85;
      else if (q.length >= 4) s = stringSimilarity(n, q) * 0.85;
      if (s > best) {
        best = s;
        matched = label;
      }
    }
    if (best >= 0.6) results.push({ area, score: best, matched });
  }
  return results.sort((a, b) => b.score - a.score || a.area.name.localeCompare(b.area.name)).slice(0, limit);
}

/**
 * Map a free-text location ("near Soweto market in Lusaka") to an area by scanning n-grams.
 * Returns null when nothing is confidently matched; callers then fall back to geocoding or manual review.
 */
export function matchLocationText(text: string, areas: Area[], city?: string): Area | null {
  const pool = city ? areas.filter((a) => normalizeText(a.city) === normalizeText(city)) : areas;
  const words = normalizeText(text).split(' ').filter(Boolean);
  let best: { area: Area; score: number } | null = null;
  for (let n = Math.min(4, words.length); n >= 1; n--) {
    for (let i = 0; i + n <= words.length; i++) {
      const gram = words.slice(i, i + n).join(' ');
      if (gram.length < 4) continue;
      for (const area of pool) {
        for (const label of [area.name, ...area.aliases]) {
          if (GENERIC_LABELS.has(normalizeText(label))) continue;
          const s = stringSimilarity(gram, label);
          if (s >= 0.84 && (!best || s > best.score)) best = { area, score: s };
        }
      }
    }
  }
  return best?.area ?? null;
}
