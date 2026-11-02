import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RatingResult, TimeBand } from '@watcher/scoring';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { supabase } from '../lib/supabase';

export interface SavedPlace {
  areaId: string;
  savedAt: string;
  lastRating: RatingResult | null;
}

export interface HistoryEntry {
  id: string;
  kind: 'area' | 'trip';
  areaId?: string;
  pickupId?: string;
  dropoffId?: string;
  band: TimeBand;
  rating: RatingResult;
  at: string;
}

export interface LocalReport {
  id: string;
  area_id: string;
  type: string;
  note: string;
  created_at: string;
  status: 'pending';
}

interface PlacesState {
  saved: SavedPlace[];
  history: HistoryEntry[];
  /** Offline-demo-mode reports. They stay on this phone, pending, and never touch any rating. */
  localReports: LocalReport[];
  toggleSaved: (areaId: string, rating: RatingResult | null) => void;
  addHistory: (entry: Omit<HistoryEntry, 'id' | 'at'>) => void;
  addLocalReport: (r: Omit<LocalReport, 'id' | 'created_at' | 'status'>) => void;
  clearAll: () => void;
}

/** Best-effort mirror to Supabase (RLS scopes rows to this user) so the server can send alerts. */
function syncSaved(areaId: string, saved: boolean, rating: RatingResult | null) {
  if (!supabase) return;
  void (async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    if (saved) {
      await supabase.from('saved_places').upsert({ user_id: data.user.id, area_id: areaId, last_rating: rating }, { onConflict: 'user_id,area_id' });
    } else {
      await supabase.from('saved_places').delete().eq('area_id', areaId);
    }
  })().catch(() => undefined);
}

function syncHistory(entry: HistoryEntry) {
  if (!supabase) return;
  void (async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    await supabase.from('trips_checked').insert({
      user_id: data.user.id,
      kind: entry.kind,
      area_id: entry.areaId ?? null,
      pickup_area_id: entry.pickupId ?? null,
      dropoff_area_id: entry.dropoffId ?? null,
      time_band: entry.band,
      rating: entry.rating,
    });
  })().catch(() => undefined);
}

const id = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export const usePlaces = create<PlacesState>()(
  persist(
    (set, get) => ({
      saved: [],
      history: [],
      localReports: [],
      toggleSaved: (areaId, rating) => {
        const exists = get().saved.some((s) => s.areaId === areaId);
        set({
          saved: exists
            ? get().saved.filter((s) => s.areaId !== areaId)
            : [{ areaId, savedAt: new Date().toISOString(), lastRating: rating }, ...get().saved],
        });
        syncSaved(areaId, !exists, rating);
      },
      addHistory: (entry) => {
        const full = { ...entry, id: id(), at: new Date().toISOString() };
        // Collapse repeat checks of the same thing within 10 minutes.
        const recent = get().history[0];
        const same =
          recent &&
          recent.kind === full.kind &&
          recent.areaId === full.areaId &&
          recent.pickupId === full.pickupId &&
          recent.dropoffId === full.dropoffId &&
          Date.now() - new Date(recent.at).getTime() < 10 * 60 * 1000;
        set({ history: [full, ...(same ? get().history.slice(1) : get().history)].slice(0, 50) });
        if (!same) syncHistory(full);
      },
      addLocalReport: (r) =>
        set({ localReports: [{ ...r, id: id(), created_at: new Date().toISOString(), status: 'pending' as const }, ...get().localReports].slice(0, 50) }),
      clearAll: () => set({ saved: [], history: [], localReports: [] }),
    }),
    { name: 'watcher-places', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
