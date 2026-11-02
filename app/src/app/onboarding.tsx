import Ionicons from '@expo/vector-icons/Ionicons';
import type { Language, Role } from '@watcher/scoring';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { Body, Button, Card, Chip, H1, Screen, styles } from '../components/ui';
import { LANGUAGES } from '../i18n';
import { RADIUS, SPACE, TAP, usePalette } from '../lib/theme';
import { useSettings } from '../state/settings';

const ROLES: { role: Role; icon: 'airplane' | 'car' | 'home' }[] = [
  { role: 'visitor', icon: 'airplane' },
  { role: 'driver', icon: 'car' },
  { role: 'resident', icon: 'home' },
];

export default function Onboarding() {
  const { t, i18n } = useTranslation();
  const c = usePalette();
  const router = useRouter();
  const settings = useSettings();
  const [step, setStep] = useState(0);

  const finish = () => {
    settings.set({ onboarded: true });
    router.replace('/');
  };

  const requestLocation = async () => {
    try {
      await Location.requestForegroundPermissionsAsync();
    } finally {
      finish();
    }
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={[styles.row, { gap: 6 }]} accessibilityLabel={`Step ${step + 1} of 4`}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= step ? c.primary : c.border }} />
        ))}
      </View>

      {step === 0 ? (
        <>
          <Ionicons name="eye" size={48} color={c.primary} />
          <H1>{t('onboarding.welcomeTitle')}</H1>
          <Body>{t('onboarding.welcomeBody')}</Body>
          <Body muted>{t('onboarding.chooseLanguage')}</Body>
          <View style={[styles.row, { flexWrap: 'wrap' }]}>
            {LANGUAGES.map((l) => (
              <Chip
                key={l.code}
                label={l.label}
                selected={settings.language === l.code}
                onPress={() => {
                  settings.set({ language: l.code as Language });
                  void i18n.changeLanguage(l.code);
                }}
              />
            ))}
          </View>
          <Button label={t('common.next')} icon="arrow-forward" onPress={() => setStep(1)} />
        </>
      ) : null}

      {step === 1 ? (
        <>
          <H1>{t('onboarding.chooseRole')}</H1>
          {ROLES.map(({ role, icon }) => {
            const selected = settings.role === role;
            return (
              <Pressable
                key={role}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                onPress={() => settings.set({ role })}
                style={{
                  minHeight: TAP + 16,
                  borderRadius: RADIUS,
                  borderWidth: 2,
                  borderColor: selected ? c.primary : c.border,
                  backgroundColor: c.card,
                  padding: SPACE.lg,
                  flexDirection: 'row',
                  gap: SPACE.md,
                  alignItems: 'center',
                }}
              >
                <Ionicons name={icon} size={28} color={selected ? c.primary : c.muted} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontWeight: '700', fontSize: 17 }}>{t(`onboarding.roles.${role}`)}</Text>
                  <Text style={{ color: c.muted }}>{t(`onboarding.roles.${role}Desc`)}</Text>
                </View>
                {selected ? <Ionicons name="checkmark-circle" size={24} color={c.primary} /> : null}
              </Pressable>
            );
          })}
          <Button label={t('common.next')} icon="arrow-forward" onPress={() => setStep(2)} />
          <Button label={t('common.back')} variant="secondary" onPress={() => setStep(0)} />
        </>
      ) : null}

      {step === 2 ? (
        <>
          <H1>{t('onboarding.policyTitle')}</H1>
          <Card>
            {(['policy1', 'policy2', 'policy3', 'policy4', 'policy5'] as const).map((k, i) => (
              <View key={k} style={[styles.row, { alignItems: 'flex-start' }]}>
                <Ionicons name={['shield-checkmark', 'people', 'chatbubbles', 'flask', 'information-circle'][i] as 'people'} size={20} color={c.primary} />
                <Body style={{ flex: 1 }}>{t(`onboarding.${k}`)}</Body>
              </View>
            ))}
          </Card>
          <Button label={t('onboarding.accept')} icon="checkmark" onPress={() => setStep(3)} />
          <Button label={t('common.back')} variant="secondary" onPress={() => setStep(1)} />
        </>
      ) : null}

      {step === 3 ? (
        <>
          <Ionicons name="location" size={48} color={c.primary} />
          <H1>{t('onboarding.locationTitle')}</H1>
          <Body>{t('onboarding.locationBody')}</Body>
          <Button label={t('onboarding.allowLocation')} icon="navigate" onPress={() => void requestLocation()} />
          <Button label={t('onboarding.notNow')} variant="secondary" onPress={finish} />
        </>
      ) : null}
    </Screen>
  );
}
