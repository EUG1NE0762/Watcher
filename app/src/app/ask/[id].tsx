import Ionicons from '@expo/vector-icons/Ionicons';
import { TIME_BANDS, type TimeBand } from '@watcher/scoring';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RatingPill } from '../../components/rating';
import { Banner, Chip, DemoBadge, Disclaimer, ErrorState, Skeleton, styles } from '../../components/ui';
import { api, scoreFor } from '../../data/api';
import { useAreaDetail } from '../../data/queries';
import type { AssistantAnswer } from '../../data/types';
import { RADIUS, SPACE, TAP, usePalette } from '../../lib/theme';
import { useSettings } from '../../state/settings';

type Message = { role: 'user'; content: string } | { role: 'assistant'; content: string; answer: AssistantAnswer };

export default function Ask() {
  const params = useLocalSearchParams<{ id: string; band?: string }>();
  const { t } = useTranslation();
  const c = usePalette();
  const { role, language } = useSettings();
  const band: TimeBand = TIME_BANDS.includes(params.band as TimeBand) ? (params.band as TimeBand) : 'night';
  const q = useAreaDetail(params.id);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);

  if (q.isLoading) return <Skeleton height={200} />;
  if (!q.data) return <ErrorState onRetry={() => void q.refetch()} />;
  const detail = q.data;
  const score = scoreFor(detail, band);

  const send = async (question: string) => {
    const text = question.trim();
    if (!text || busy) return;
    setError(null);
    setInput('');
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((m) => [...m, { role: 'user', content: text }]);
    setBusy(true);
    try {
      const answer = await api.ask({ areaId: detail.area.id, question: text, band, role, language, history }, detail);
      setMessages((m) => [...m, { role: 'assistant', content: answer.answer, answer }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['bottom']}>
      <Stack.Screen options={{ title: `${t('ask.title')} · ${detail.area.name}` }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView ref={scroll} contentContainerStyle={{ padding: SPACE.lg, gap: SPACE.md }}>
          <View style={[styles.row, { flexWrap: 'wrap' }]}>
            <RatingPill rating={score.rating} score={score.score} />
            <Text style={{ color: c.muted }}>{t(`bands.${band}`)}</Text>
            {score.breakdown.usesDemoData ? <DemoBadge /> : null}
          </View>
          <Banner tone="info" icon="shield-checkmark">{t('ask.intro', { area: detail.area.name })}</Banner>

          {messages.length === 0 ? (
            <View style={{ gap: SPACE.sm }}>
              {(['s1', 's2', 's3'] as const).map((k) => (
                <Chip key={k} label={t(`ask.${k}`)} icon="help-circle" onPress={() => void send(t(`ask.${k}`))} />
              ))}
            </View>
          ) : null}

          {messages.map((m, i) => (
            <View
              key={i}
              accessibilityLabel={m.role === 'user' ? `You: ${m.content}` : `Watcher: ${m.content}`}
              style={{
                alignSelf: m.role === 'user' ? 'flex-end' : 'stretch',
                maxWidth: m.role === 'user' ? '85%' : '100%',
                backgroundColor: m.role === 'user' ? c.primary : c.card,
                borderColor: c.border,
                borderWidth: m.role === 'user' ? 0 : 1,
                borderRadius: RADIUS,
                padding: SPACE.md,
                gap: SPACE.sm,
              }}
            >
              <Text style={{ color: m.role === 'user' ? c.primaryText : c.text, fontSize: 16, lineHeight: 23 }}>{m.content}</Text>
              {m.role === 'assistant' && m.answer.citations.length ? (
                <View style={{ gap: 4 }}>
                  <Text style={{ color: c.muted, fontWeight: '700' }}>{t('ask.sources')}</Text>
                  {m.answer.citations.map((cit) => (
                    <Pressable key={cit.n} accessibilityRole="link" onPress={() => void Linking.openURL(cit.url)} style={{ minHeight: 32, justifyContent: 'center' }}>
                      <Text style={{ color: c.primary, textDecorationLine: 'underline' }}>
                        [{cit.n}] {cit.source} · {cit.published_at} · {t(`confidence.${cit.confidence}`)}
                        {cit.is_demo ? ` · ${t('common.demoBadge')}` : ''}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              {m.role === 'assistant' && (m.answer.mode === 'offline' || m.answer.mode === 'fallback') ? (
                <Text style={{ color: c.muted, fontSize: 12 }}>{m.answer.mode === 'offline' ? t('ask.modeOffline') : t('ask.modeFallback')}</Text>
              ) : null}
            </View>
          ))}
          {busy ? <Text style={{ color: c.muted }}>{t('ask.thinking')}</Text> : null}
          {error ? <Banner tone="danger" icon="alert-circle">{error}</Banner> : null}
          <Disclaimer />
        </ScrollView>

        <View style={[styles.row, { padding: SPACE.md, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.card }]}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={t('ask.placeholder')}
            placeholderTextColor={c.muted}
            accessibilityLabel={t('ask.placeholder')}
            maxLength={500}
            multiline
            style={{ flex: 1, color: c.text, fontSize: 16, minHeight: TAP, maxHeight: 120, paddingHorizontal: SPACE.sm }}
            onSubmitEditing={() => void send(input)}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('ask.send')}
            disabled={busy || !input.trim()}
            onPress={() => void send(input)}
            style={{ width: TAP, height: TAP, borderRadius: TAP / 2, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', opacity: busy || !input.trim() ? 0.5 : 1 }}
          >
            <Ionicons name="send" size={20} color={c.primaryText} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
