import type { RatingResult, TimeBand } from '@watcher/scoring';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { AreaSummary } from '../../data/types';
import { RATING_STYLE, useScheme } from '../../lib/theme';
import type { MapData, MapMarker } from './mapHtml';

export function useMapData(
  areas: AreaSummary[],
  band: TimeBand,
  opts: { selectedId?: string | null; markers?: MapMarker[]; line?: [number, number][] | null; fitKey?: string } = {},
): MapData {
  const { t } = useTranslation();
  const dark = useScheme() === 'dark';
  return useMemo(
    () => ({
      areas: areas.map((s) => {
        const rating: RatingResult = s.scores[band]?.rating ?? 'insufficient_data';
        const style = RATING_STYLE[rating];
        return {
          id: s.area.id,
          name: s.area.name,
          polygon: s.area.polygon,
          color: style.color,
          letter: style.letter,
          label: t(`rating.${rating}`),
        };
      }),
      markers: opts.markers ?? [],
      line: opts.line ?? null,
      selectedId: opts.selectedId ?? null,
      dark,
      fitKey: opts.fitKey ?? '',
    }),
    [areas, band, opts.markers, opts.line, opts.selectedId, opts.fitKey, dark, t],
  );
}
