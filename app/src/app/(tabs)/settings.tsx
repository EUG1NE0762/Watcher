import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Language, Role, Source } from '@watcher/scoring';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, Platform, Pressable, Switch, Text, View } from 'react-native';
import { Banner, Body, Button, Card, Chip, Screen, SectionTitle, Segmented, styles } from '../../components/ui';
import { DATA_MODE } from '../../data/api';
import { ALL_SOURCES } from '../../data/demoSource';
import { LANGUAGES } from '../../i18n';
import { registerForPush } from '../../lib/device';
import { supabase } from '../../lib/supabase';
import { SPACE, TAP, usePalette } from '../../lib/theme';
import { usePlaces } from '../../state/places';
import { useSettings, type ThemePreference } from '../../state/settings';

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const c = usePalette();
  return (
    <View style={[styles.row, { minHeight: TAP, justifyContent: 'space-between' }]}>
      <Text style={{ color: c.text, flex: 1, fontSize: 15 }}>{label}</Text>
      <Switch accessibilityLabel={label} value={value} onValueChange={onChange} />
    </View>
  );
}

function confirm(message: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(globalThis.confirm?.(message) ?? false);
  return new Promise((resolve) =>
    Alert.alert('', message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
    ]),
  );
}

export default function Settings() {
  const { t, i18n } = useTranslation();
  const c = usePalette();
  const router = useRouter();
  const queryClient = useQueryClient();
  const s = useSettings();
  const clearPlaces = usePlaces((p) => p.clearAll);
  const [message, setMessage] = useState<string | null>(null);

  const account = useQuery({
    queryKey: ['account'],
    enabled: !!supabase,
    queryFn: async () => {
      const { data } = await supabase!.auth.getUser();
      if (!data.user) return null;
      const { data: profile } = await supabase!.from('profiles').select('is_moderator').eq('id', data.user.id).maybeSingle();
      return { id: data.user.id, isModerator: !!profile?.is_moderator };
    },
  });
  const sources = useQuery({
    queryKey: ['sources'],
    queryFn: async (): Promise<Source[]> => {
      if (!supabase) return ALL_SOURCES;
      const { data } = await supabase.from('sources').select('id, name, type, base_url, credibility_weight').order('credibility_weight', { ascending: false });
      return (data as Source[]) ?? ALL_SOURCES;
    },
  });

  const setNotify = async (patch: { notifyRatingChanges?: boolean; notifyIncidents?: boolean }) => {
    s.set(patch);
    const token = await registerForPush({ notifyRatingChanges: patch.notifyRatingChanges ?? s.notifyRatingChanges, notifyIncidents: patch.notifyIncidents ?? s.notifyIncidents });
    setMessage(token ? null : t('settings.pushUnavailable'));
  };

  const deleteAll = async () => {
    if (!(await confirm(t('settings.deleteConfirm')))) return;
    if (supabase) {
      await supabase.rpc('delete_my_account');
      await supabase.auth.signOut();
    }
    clearPlaces();
    queryClient.clear();
    s.reset();
    setMessage(t('settings.deleted'));
    router.replace('/onboarding');
  };

  return (
    <Screen title={t('settings.title')}>
      {message ? <Banner tone="info" icon="information-circle">{message}</Banner> : null}

      <Card>
        <SectionTitle icon="contrast">{t('settings.appearance')}</SectionTitle>
        <Segmented<ThemePreference>
          a11yLabel={t('settings.appearance')}
          value={s.theme}
          onChange={(theme) => s.set({ theme })}
          options={[
            { value: 'system', label: t('settings.themeSystem'), icon: 'phone-portrait-outline' },
            { value: 'light', label: t('settings.themeLight'), icon: 'sunny' },
            { value: 'dark', label: t('settings.themeDark'), icon: 'moon' },
          ]}
        />
      </Card>

      <Card>
        <SectionTitle icon="language">{t('settings.language')}</SectionTitle>
        <View style={[styles.row, { flexWrap: 'wrap' }]}>
          {LANGUAGES.map((l) => (
            <Chip
              key={l.code}
              label={l.label}
              selected={s.language === l.code}
              onPress={() => {
                s.set({ language: l.code as Language });
                void i18n.changeLanguage(l.code);
              }}
            />
          ))}
        </View>
        <SectionTitle icon="person">{t('settings.role')}</SectionTitle>
        <View style={[styles.row, { flexWrap: 'wrap' }]}>
          {(['visitor', 'driver', 'resident'] as Role[]).map((r) => (
            <Chip key={r} label={t(`onboarding.roles.${r}`)} selected={s.role === r} onPress={() => s.set({ role: r })} />
          ))}
        </View>
      </Card>

      <Card>
        <SectionTitle icon="notifications">{t('settings.notifications')}</SectionTitle>
        <Toggle label={t('settings.notifyRating')} value={s.notifyRatingChanges} onChange={(v) => void setNotify({ notifyRatingChanges: v })} />
        <Toggle label={t('settings.notifyIncidents')} value={s.notifyIncidents} onChange={(v) => void setNotify({ notifyIncidents: v })} />
      </Card>

      <Card>
        <SectionTitle icon="lock-closed">{t('settings.privacy')}</SectionTitle>
        <Body>{t('settings.privacyBody')}</Body>
        <Toggle label={t('settings.shareLocation')} value={s.shareLocationWithReports} onChange={(v) => s.set({ shareLocationWithReports: v })} />
        <Button label={t('settings.deleteData')} icon="trash" variant="danger" onPress={() => void deleteAll()} />
      </Card>

      <Card>
        <SectionTitle icon="server">{t('settings.mode')}</SectionTitle>
        <Body>{DATA_MODE === 'live' ? t('settings.modeLive') : t('settings.modeDemo')}</Body>
        {account.data ? (
          <Pressable accessibilityRole="button" onPress={() => void Clipboard.setStringAsync(account.data!.id)}>
            <Body muted>
              {t('settings.accountId')}: {account.data.id}
            </Body>
          </Pressable>
        ) : null}
        {account.data?.isModerator ? <Button label={t('settings.moderator')} icon="shield" onPress={() => router.push('/admin')} /> : null}
      </Card>

      <Card>
        <SectionTitle icon="library">{t('settings.sources')}</SectionTitle>
        {(sources.data ?? []).map((src) => (
          <Pressable key={src.id} accessibilityRole="link" onPress={() => void Linking.openURL(src.base_url)} style={{ minHeight: 40, justifyContent: 'center' }}>
            <Text style={{ color: c.primary }}>
              {src.name} <Text style={{ color: c.muted }}>({src.type})</Text>
            </Text>
          </Pressable>
        ))}
      </Card>

      <Card>
        <SectionTitle icon="information-circle">{t('settings.about')}</SectionTitle>
        <Body>{t('settings.aboutBody')}</Body>
        <Body muted style={{ marginTop: SPACE.sm }}>
          Watcher 0.1.0 · MIT licence
        </Body>
      </Card>
    </Screen>
  );
}
