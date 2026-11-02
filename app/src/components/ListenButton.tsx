import type { Language, Role, TimeBand } from '@watcher/scoring';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as Speech from 'expo-speech';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { api } from '../data/api';
import type { AreaDetail } from '../data/types';
import { usePalette } from '../lib/theme';
import { Button } from './ui';

const TTS_LANG: Record<Language, string> = { en: 'en-GB', ny: 'ny', bem: 'en-GB' };

/**
 * Plays the ~30 s ElevenLabs briefing (cached server-side). Ducks other audio, keeps playing in the
 * background, and falls back to on-device text-to-speech when offline or when the API is unavailable.
 */
export function ListenButton({ detail, band, role, language }: { detail: AreaDetail; band: TimeBand; role: Role; language: Language }) {
  const { t } = useTranslation();
  const c = usePalette();
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const [state, setState] = useState<'idle' | 'loading' | 'playing' | 'speaking'>('idle');
  const [usingTts, setUsingTts] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    void setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'duckOthers' }).catch(() => undefined);
    return () => {
      mounted.current = false;
      void Speech.stop();
    };
  }, []);

  const speak = (text: string) => {
    setUsingTts(true);
    setState('speaking');
    Speech.speak(text, {
      language: TTS_LANG[language],
      rate: 0.95,
      onDone: () => {
        if (mounted.current) setState('idle');
      },
      onStopped: () => {
        if (mounted.current) setState('idle');
      },
      onError: () => {
        if (mounted.current) setState('idle');
      },
    });
  };

  const start = async () => {
    setState('loading');
    setUsingTts(false);
    const briefing = await api.briefing(detail, band, role, language);
    if (!mounted.current) return;
    if (briefing.audio_url) {
      try {
        player.replace({ uri: briefing.audio_url });
        player.play();
        setState('playing');
        return;
      } catch {
        // fall through to on-device voice
      }
    }
    speak(briefing.text);
  };

  const stop = () => {
    if (state === 'speaking') void Speech.stop();
    else player.pause();
    setState('idle');
  };

  // Remote audio counts as active until the player reports it has stopped after loading.
  const active = state === 'speaking' || (state === 'playing' && (status.playing || status.isBuffering || !status.isLoaded));
  return (
    <View style={{ gap: 4, flex: 1 }}>
      <Button
        label={state === 'loading' ? t('area.loadingBriefing') : active ? t('area.stop') : t('area.listen')}
        icon={active ? 'stop' : 'volume-high'}
        loading={state === 'loading'}
        variant="secondary"
        onPress={active ? stop : () => void start()}
      />
      {usingTts && active ? <Text style={{ color: c.muted, fontSize: 12, textAlign: 'center' }}>{t('area.ttsFallback')}</Text> : null}
    </View>
  );
}
