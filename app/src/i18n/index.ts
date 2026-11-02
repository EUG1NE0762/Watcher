import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en';
import ny from './ny';

/**
 * Bemba starter set. Like Nyanja, it needs native-speaker review; everything else falls back to English.
 */
const bem = {
  common: { disclaimer: 'Ifipimo fya kukwafwa fye, te kusuminisha. Mwilaba ukulangulukila.', demoBadge: 'Ifya kumwenako' },
  rating: { low: 'Panono', moderate: 'Pakati', high: 'Sana', insufficient_data: 'Tapali ifyakwanisha' },
  bands: { now: 'Nomba', morning: 'Ulucelo', afternoon: 'Akasuba', evening: 'Icungulo', night: 'Ubushiku' },
  tabs: { check: 'Pima', driver: 'Kafwaya', saved: 'Ifyasungwa', help: 'Ubwafwilisho', settings: 'Imipangilo' },
  onboarding: { welcomeTitle: 'Ishibeni ilyo tamulaya', chooseLanguage: 'Saleni ululimi', accept: 'Nauumfwa', start: 'Tendekeni' },
};

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'ny', label: 'Nyanja' },
  { code: 'bem', label: 'Bemba' },
] as const;

const deviceLang = getLocales()[0]?.languageCode ?? 'en';

// eslint-disable-next-line import/no-named-as-default-member -- i18next's documented setup call
void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ny: { translation: ny }, bem: { translation: bem } },
  lng: ['en', 'ny', 'bem'].includes(deviceLang) ? deviceLang : 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
