import { BAND_HOURS, LUSAKA_UTC_OFFSET_HOURS } from './config.ts';
import { TIME_BANDS, type TimeBand } from './types.ts';

/** Hour of day in Africa/Lusaka. Fixed offset because Zambia has no DST and Hermes may lack tz data. */
export function lusakaHour(date: Date): number {
  return (date.getUTCHours() + LUSAKA_UTC_OFFSET_HOURS) % 24;
}

export function bandForHour(hour: number): TimeBand {
  for (const band of TIME_BANDS) {
    const [start, end] = BAND_HOURS[band];
    const inBand = start < end ? hour >= start && hour < end : hour >= start || hour < end;
    if (inBand) return band;
  }
  return 'night';
}

export function bandForDate(date: Date): TimeBand {
  return bandForHour(lusakaHour(date));
}

export function currentBand(now: Date = new Date()): TimeBand {
  return bandForDate(now);
}
