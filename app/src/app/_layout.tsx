import '../i18n';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { onlineManager, QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CACHE_MAX_AGE_MS } from '../lib/config';
import { ensureSession, supabase } from '../lib/supabase';
import { usePalette, useScheme } from '../lib/theme';
import { useSettings } from '../state/settings';

onlineManager.setEventListener((setOnline) => NetInfo.addEventListener((s) => setOnline(s.isConnected !== false)));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { gcTime: CACHE_MAX_AGE_MS, retry: 1, networkMode: 'offlineFirst' },
  },
});

/** Last-viewed areas, scores and nearby help are written to disk so the app works on poor connectivity. */
const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: 'watcher-query-cache', throttleTime: 2000 });

function useHydrated() {
  const [hydrated, setHydrated] = useState(useSettings.persist.hasHydrated());
  useEffect(() => useSettings.persist.onFinishHydration(() => setHydrated(true)), []);
  return hydrated;
}

function OnboardingGate() {
  const onboarded = useSettings((s) => s.onboarded);
  const segments = useSegments();
  const router = useRouter();
  useEffect(() => {
    const inOnboarding = segments[0] === 'onboarding';
    if (!onboarded && !inOnboarding) router.replace('/onboarding');
  }, [onboarded, segments, router]);
  return null;
}

export default function RootLayout() {
  const hydrated = useHydrated();
  const { i18n } = useTranslation();
  const language = useSettings((s) => s.language);
  const role = useSettings((s) => s.role);
  const onboarded = useSettings((s) => s.onboarded);
  const c = usePalette();
  const scheme = useScheme();

  useEffect(() => {
    if (hydrated && i18n.language !== language) void i18n.changeLanguage(language);
  }, [hydrated, language, i18n]);

  // Anonymous session + profile sync when a backend is configured.
  useEffect(() => {
    if (!hydrated || !onboarded || !supabase) return;
    void ensureSession()
      .then(async (uid) => {
        if (uid) await supabase!.from('profiles').update({ role, language }).eq('id', uid);
      })
      .catch(() => undefined);
  }, [hydrated, onboarded, role, language]);

  if (!hydrated) return null;

  return (
    <SafeAreaProvider>
      <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: CACHE_MAX_AGE_MS, buster: 'v1' }}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <OnboardingGate />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: c.card },
            headerTintColor: c.text,
            contentStyle: { backgroundColor: c.bg },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false, gestureEnabled: false }} />
          <Stack.Screen name="area/[id]" options={{ title: '' }} />
          <Stack.Screen name="ask/[id]" options={{ title: 'Ask Watcher' }} />
          <Stack.Screen name="report" options={{ title: 'Community report' }} />
          <Stack.Screen name="admin" options={{ title: 'Moderator tools' }} />
        </Stack>
      </PersistQueryClientProvider>
    </SafeAreaProvider>
  );
}
