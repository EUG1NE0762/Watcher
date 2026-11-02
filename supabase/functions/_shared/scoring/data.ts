// GENERATED from packages/scoring/src by scripts/sync-scoring.mjs. Do not edit here.
import type { Area, AreaType, LngLat } from './types.ts';

/** Shape of the per-city JSON files in supabase/seed/data/areas. Polygons are optional; a radius gives an approximate octagon. */
export interface AreaSeed {
  id: string;
  name: string;
  city: string;
  province: string;
  area_type: AreaType;
  aliases?: string[];
  description: string;
  centroid: { lat: number; lng: number };
  radius_km?: number;
  polygon?: LngLat[];
}

export function approximatePolygon(center: { lat: number; lng: number }, radiusKm: number, sides = 8): LngLat[] {
  const dLat = radiusKm / 110.574;
  const dLng = radiusKm / (111.32 * Math.cos((center.lat * Math.PI) / 180));
  const ring: LngLat[] = [];
  for (let i = 0; i < sides; i++) {
    const t = (2 * Math.PI * i) / sides + Math.PI / sides;
    ring.push([+(center.lng + dLng * Math.cos(t)).toFixed(6), +(center.lat + dLat * Math.sin(t)).toFixed(6)]);
  }
  ring.push(ring[0]!);
  return ring;
}

export function buildAreas(seeds: AreaSeed[]): Area[] {
  return seeds.map((s) => ({
    id: s.id,
    name: s.name,
    city: s.city,
    province: s.province,
    area_type: s.area_type,
    aliases: s.aliases ?? [],
    description: s.description,
    centroid: s.centroid,
    polygon: s.polygon ?? approximatePolygon(s.centroid, s.radius_km ?? 1),
  }));
}
