import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Language, Role } from '@watcher/scoring';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ThemePreference = 'system' | 'light' | 'dark';

export interface SettingsState {
  onboarded: boolean;
  theme: ThemePreference;
  /** City the home map focuses on, or 'all' for the whole country. */
  city: string;
  role: Role;
  language: Language;
  /** Location is used on-device only; this flag allows attaching it to a community report. */
  shareLocationWithReports: boolean;
  notifyRatingChanges: boolean;
  notifyIncidents: boolean;
  set: (patch: Partial<Omit<SettingsState, 'set' | 'reset'>>) => void;
  reset: () => void;
}

const defaults = {
  onboarded: false,
  theme: 'system' as ThemePreference,
  city: 'Lusaka',
  role: 'visitor' as Role,
  language: 'en' as Language,
  shareLocationWithReports: false,
  notifyRatingChanges: true,
  notifyIncidents: true,
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaults,
      set: (patch) => set(patch),
      reset: () => set(defaults),
    }),
    { name: 'watcher-settings', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
