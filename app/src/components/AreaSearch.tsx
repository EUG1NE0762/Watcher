import Ionicons from '@expo/vector-icons/Ionicons';
import { searchAreas, type Area, type TimeBand } from '@watcher/scoring';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import type { AreaSummary } from '../data/types';
import { SEARCH_DEBOUNCE_MS } from '../lib/config';
import { PILL, RADIUS, SPACE, TAP, usePalette } from '../lib/theme';
import { ScoreBadge } from './rating';

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export function AreaSearch({
  areas,
  band,
  onSelect,
  placeholder,
  initialQuery = '',
  testID,
  onLocate,
  locating,
}: {
  areas: AreaSummary[];
  band: TimeBand;
  onSelect: (area: Area) => void;
  placeholder?: string;
  initialQuery?: string;
  testID?: string;
  /** Shows a "use my location" button inside the field. */
  onLocate?: () => void;
  locating?: boolean;
}) {
  const { t } = useTranslation();
  const c = usePalette();
  const [query, setQuery] = useState(initialQuery);
  const [focused, setFocused] = useState(false);
  const debounced = useDebounced(query, SEARCH_DEBOUNCE_MS);
  const results = useMemo(() => searchAreas(debounced, areas.map((a) => a.area), 6), [debounced, areas]);
  const byId = useMemo(() => new Map(areas.map((a) => [a.area.id, a])), [areas]);

  return (
    <View style={{ gap: SPACE.sm }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: SPACE.sm,
          borderWidth: 1.5,
          borderColor: focused ? c.primary : 'transparent',
          backgroundColor: c.raised,
          borderRadius: PILL,
          paddingLeft: SPACE.md,
          paddingRight: onLocate ? 6 : SPACE.md,
          minHeight: TAP + 8,
        }}
      >
        <Ionicons name="search" size={20} color={focused ? c.primary : c.muted} />
        <TextInput
          testID={testID}
          value={query}
          onChangeText={setQuery}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder ?? t('home.searchPlaceholder')}
          placeholderTextColor={c.subtle}
          accessibilityLabel={placeholder ?? t('home.searchA11y')}
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={() => results[0] && onSelect(results[0].area)}
          style={{ flex: 1, color: c.text, fontSize: 16, paddingVertical: SPACE.sm, outlineStyle: 'none' } as object}
        />
        {query ? (
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={() => setQuery('')} hitSlop={12}>
            <Ionicons name="close-circle" size={20} color={c.subtle} />
          </Pressable>
        ) : null}
        {onLocate ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('home.useMyLocation')}
            onPress={onLocate}
            style={({ pressed }) => ({
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: c.card,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.7 : 1,
            })}
          >
            {locating ? <ActivityIndicator color={c.primary} /> : <Ionicons name="navigate" size={20} color={c.primary} />}
          </Pressable>
        ) : null}
      </View>

      {debounced.trim() && results.length === 0 ? (
        <Text style={{ color: c.muted, paddingHorizontal: SPACE.xs }}>{t('home.noResults', { q: debounced.trim() })}</Text>
      ) : null}
      {results.length ? (
        <View style={{ backgroundColor: c.card, borderRadius: RADIUS, borderWidth: 1, borderColor: c.border, overflow: 'hidden', boxShadow: `0 4px 12px ${c.shadow}` }}>
          {results.map((r, i) => {
            const score = byId.get(r.area.id)?.scores[band];
            return (
              <Pressable
                key={r.area.id}
                accessibilityRole="button"
                accessibilityLabel={`${r.area.name}, ${r.area.city}`}
                onPress={() => {
                  setQuery('');
                  onSelect(r.area);
                }}
                style={({ pressed }) => ({
                  minHeight: TAP + 8,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: SPACE.md,
                  paddingHorizontal: SPACE.md,
                  paddingVertical: SPACE.sm,
                  backgroundColor: pressed ? c.raised : c.card,
                  borderTopWidth: i ? 1 : 0,
                  borderTopColor: c.border,
                })}
              >
                <Ionicons name="location-outline" size={20} color={c.muted} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontWeight: '700', fontSize: 16 }}>{r.area.name}</Text>
                  <Text style={{ color: c.muted, fontSize: 13 }}>
                    {r.matched !== r.area.name ? `${r.matched} · ` : ''}
                    {r.area.city}
                  </Text>
                </View>
                <ScoreBadge rating={score?.rating ?? 'insufficient_data'} score={score?.score} />
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
