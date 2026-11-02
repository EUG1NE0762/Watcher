import type { Category, RatingResult, Role, TimeBand } from './types.ts';

export type Language = 'en' | 'ny' | 'bem';

/**
 * Precaution texts. Nyanja (ny) strings are a first draft and need review by a native speaker
 * before production; missing languages fall back to English.
 */
const TEXTS = {
  stay_main_roads: {
    en: 'Keep to busy, well-lit main roads.',
    ny: 'Yendani mu misewu ikuluikulu yomwe ili ndi magetsi komanso anthu ambiri.',
  },
  valuables_hidden: {
    en: 'Keep phones, cash and jewellery out of sight.',
    ny: 'Bisani foni, ndalama ndi zodzikongoletsera.',
  },
  travel_group_night: {
    en: 'After dark, travel with someone or use a registered taxi.',
    ny: 'Usiku, yendani ndi munthu wina kapena gwiritsani ntchito taxi yolembetsedwa.',
  },
  share_location: {
    en: 'Share your trip or live location with someone you trust.',
    ny: 'Uzani munthu amene mumamukhulupirira komwe mukupita.',
  },
  markets_pickpocket: {
    en: 'In crowded markets and bus stations, carry bags in front and zipped.',
    ny: 'Mu misika ndi ma siteshoni a mabasi, nyamulani chikwama patsogolo ndipo chitsekedwe.',
  },
  official_tickets: {
    en: 'Buy tickets only at official counters and ignore touts offering help.',
    ny: 'Gulani matikiti pa malo ovomerezeka okha.',
  },
  lock_home: {
    en: 'Lock doors and windows, including during the day.',
    ny: 'Tsekani zitseko ndi mawindo, ngakhale masana.',
  },
  vehicle_secure: {
    en: 'Park in guarded or well-lit places and leave nothing visible in the car.',
    ny: 'Imikani galimoto pamalo otetezedwa kapena owala, ndipo musasiye zinthu zooneka mgalimoto.',
  },
  avoid_isolated: {
    en: 'Avoid shortcuts through isolated paths and unlit open ground.',
    ny: 'Pewani njira zachidule zopanda anthu kapena zopanda magetsi.',
  },
  emergency_numbers: {
    en: 'Save the emergency numbers in the Resources tab before you go.',
    ny: 'Sungani manambala a chithandizo chadzidzidzi musanapite.',
  },
  normal_caution: {
    en: 'Normal precautions are enough here; stay aware of your surroundings.',
    ny: 'Chenjezo labwinobwino ndilokwanira pano; khalani tcheru.',
  },
  insufficient: {
    en: 'There is too little verified data to rate this area. Use normal caution and ask people you trust locally.',
    ny: 'Palibe zambiri zotsimikizika za dera lino. Samalani ndipo funsani anthu omwe mumawakhulupirira.',
  },
  substance_help: {
    en: 'If someone is in distress from alcohol or drugs, call for medical help rather than stepping in alone.',
    ny: 'Ngati wina ali pa vuto chifukwa cha mowa kapena mankhwala osokoneza bongo, itanani chithandizo cha zachipatala.',
  },
  driver_no_stop_hotspots: {
    en: "Don't stop or wait in hotspots at night; pick up only at a lit, busy spot.",
    ny: 'Musaime kapena kudikira m malo oopsa usiku; tengani anthu pamalo owala okha.',
  },
  driver_doors_locked: {
    en: 'Keep doors locked and windows up while waiting and in slow traffic.',
    ny: 'Tsekani zitseko ndi mawindo pamene mukudikira.',
  },
  driver_share_trip: {
    en: 'Share the trip with someone and keep trip-sharing on.',
    ny: 'Gawanani ulendo wanu ndi munthu wina.',
  },
  driver_main_roads: {
    en: 'Prefer main roads over shortcuts, even if they are longer.',
    ny: 'Sankhani misewu ikuluikulu m malo mwa njira zachidule.',
  },
  driver_cashless: {
    en: 'Avoid handling cash at high-risk drop-offs; prefer in-app or mobile money payment.',
    ny: 'Pewani kulandira ndalama za m manja pamalo oopsa; gwiritsani ntchito mobile money.',
  },
  driver_decline_safely: {
    en: "If a pickup feels wrong, cancel in the app before you arrive. Declining is your right; don't argue at the vehicle.",
    ny: 'Ngati simukukhulupirira ulendo, letsani mu app musanafike. Ndi ufulu wanu.',
  },
  driver_verify_rider: {
    en: "Confirm the rider's name before unlocking the doors.",
    ny: 'Tsimikizirani dzina la wokwera musanatsegule zitseko.',
  },
  visitor_ask_hotel: {
    en: 'Ask your hotel or lodge about the area and use transport they recommend.',
    ny: 'Funsani ku hotelo yanu za dera ndi mayendedwe abwino.',
  },
  visitor_minimal_cash: {
    en: 'Carry a copy of your ID rather than the original, and only the cash you need.',
    ny: 'Nyamulani kope la chiphaso chanu ndi ndalama zochepa.',
  },
  resident_know_post: {
    en: 'Know where your nearest police post is and connect with your neighbourhood watch.',
    ny: 'Dziwani komwe kuli polisi yapafupi ndi gulu loyang anira dera lanu.',
  },
} satisfies Record<string, Partial<Record<Language, string>> & { en: string }>;

export type PrecautionId = keyof typeof TEXTS;

export function precautionText(id: PrecautionId, language: Language = 'en'): string {
  const entry: Partial<Record<Language, string>> & { en: string } = TEXTS[id];
  return entry[language] ?? entry.en;
}

export interface PrecautionInput {
  role: Role;
  band: TimeBand;
  rating: RatingResult;
  topCategories: Category[];
  isDropoff?: boolean;
}

/** Ordered, de-duplicated precaution ids tailored to role, time of day, rating and the dominant crimes. */
export function getPrecautions(input: PrecautionInput, limit = 6): PrecautionId[] {
  const out: PrecautionId[] = [];
  const add = (id: PrecautionId) => {
    if (!out.includes(id)) out.push(id);
  };
  const dark = input.band === 'evening' || input.band === 'night';
  const elevated = input.rating === 'moderate' || input.rating === 'high';
  const cats = new Set(input.topCategories);

  if (input.role === 'driver') {
    if (dark && elevated) add('driver_no_stop_hotspots');
    if (elevated) add('driver_doors_locked');
    if (input.rating === 'high' && input.isDropoff !== false) add('driver_cashless');
    add('driver_share_trip');
    if (elevated) add('driver_main_roads');
    add('driver_verify_rider');
    if (input.rating === 'high') add('driver_decline_safely');
  }

  if (input.rating === 'insufficient_data') add('insufficient');
  if (input.rating === 'low') add('normal_caution');

  if (dark && elevated) add('travel_group_night');
  if (cats.has('theft') || cats.has('robbery')) add('valuables_hidden');
  if (cats.has('theft')) add('markets_pickpocket');
  if (cats.has('robbery') || cats.has('assault') || cats.has('sexual_offence')) {
    add('stay_main_roads');
    add('avoid_isolated');
  }
  if (cats.has('burglary') && input.role === 'resident') add('lock_home');
  if (cats.has('vehicle_crime')) add('vehicle_secure');
  if (cats.has('drug_offence')) add('substance_help');

  if (input.role === 'visitor') {
    add('visitor_ask_hotel');
    if (elevated) add('visitor_minimal_cash');
  }
  if (input.role === 'resident') add('resident_know_post');
  add('share_location');
  add('emergency_numbers');
  return out.slice(0, limit);
}
