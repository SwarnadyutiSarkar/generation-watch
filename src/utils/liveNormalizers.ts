// Normalisers that turn raw ACLED and UCDP API rows into Generation Watch EventRecords.
// Pure functions: no network access, safe to use on the server or in the browser.
import { EventClassification, EventRecord } from '../types/research';
import { resolveCountryIso3 } from '../data/worldBankCatalog';

export const ACLED_DATASET_ID = 'acled';
export const UCDP_DATASET_ID = 'ucdp_ged';

export interface RawAcledRow {
  event_id_cnty?: string;
  event_date?: string;
  year?: string | number;
  event_type?: string;
  sub_event_type?: string;
  actor1?: string;
  assoc_actor_1?: string;
  actor2?: string;
  country?: string;
  region?: string;
  admin1?: string;
  location?: string;
  latitude?: string | number;
  longitude?: string | number;
  geo_precision?: string | number;
  notes?: string;
  fatalities?: string | number;
  source?: string;
  tags?: string;
}

export interface RawUcdpRow {
  id?: number | string;
  year?: number;
  type_of_violence?: number;
  conflict_name?: string;
  dyad_name?: string;
  side_a?: string;
  side_b?: string;
  country?: string;
  region?: string;
  adm_1?: string;
  where_description?: string;
  latitude?: number | string;
  longitude?: number | string;
  date_start?: string;
  date_end?: string;
  best?: number | string;
  low?: number | string;
  high?: number | string;
  source_article?: string;
  where_prec?: number;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const day = (v?: string | null): string | null => (v ? String(v).slice(0, 10) : null);

function baseRecord(now: string): Omit<
  EventRecord,
  | 'id' | 'sourceRecordId' | 'datasetId' | 'datasetName' | 'sourceName' | 'sourceUrl' | 'licence'
  | 'countryId' | 'countryName' | 'region' | 'eventName' | 'eventDate' | 'startYear' | 'endYear'
  | 'eventType' | 'locationName' | 'locationPrecision' | 'latitude' | 'longitude'
> {
  return {
    publicationDate: null,
    retrievalTimestamp: now,
    participants: null,
    participantsCategory: null,
    protesterIdentity: null,
    demands: [],
    stateResponses: [],
    protesterViolenceReported: null,
    primaryMethod: null,
    campaignOutcome: null,
    campaignGoal: null,
    fatalities: null,
    fatalitiesCertainty: null,
    injuries: null,
    injuriesCertainty: null,
    arrests: null,
    missingPersons: null,
    displacedPersons: null,
    documentedStateArrests: false,
    documentedStateBeatings: false,
    documentedStateShootings: false,
    documentedStateKillings: false,
    propertyDamageNotes: null,
    internetShutdownNotes: null,
    educationalDisruptionNotes: null,
    economicDisruptionNotes: null,
    competingReportsNotes: null,
    sourceNotes: null,
    verificationStatus: 'unverified',
    reviewerNotes: null,
    recordType: 'Historical dataset record',
    rawFields: {},
  };
}

const ACLED_ATTRIBUTION =
  'Armed Conflict Location & Event Data Project (ACLED); acleddata.com. Use is subject to ACLED’s Terms of Use & Attribution Policy.';

export function normalizeAcledRows(rows: RawAcledRow[], now: string): EventRecord[] {
  const out: EventRecord[] = [];
  for (const r of rows) {
    if (!r.event_id_cnty || !r.event_date) continue;
    const sub = r.sub_event_type || '';
    const violent = r.event_type === 'Riots' || sub === 'Violent demonstration' || sub === 'Mob violence';
    const eventType: EventClassification = violent ? 'Violent demonstration' : 'Individual protest event';
    const fat = num(r.fatalities);
    const lat = num(r.latitude);
    const lng = num(r.longitude);
    const force = sub === 'Excessive force against protesters';
    const intervention = sub === 'Protest with intervention' || force;
    const iso3 = resolveCountryIso3(r.country);
    const year = Number(String(r.event_date).slice(0, 4)) || num(r.year);
    const actors = [r.actor1, r.assoc_actor_1].filter(Boolean).join(' · ');

    out.push({
      ...baseRecord(now),
      id: `${ACLED_DATASET_ID}_${r.event_id_cnty}`,
      sourceRecordId: r.event_id_cnty,
      datasetId: ACLED_DATASET_ID,
      datasetName: 'ACLED — Armed Conflict Location & Event Data',
      sourceName: 'ACLED',
      sourceUrl: 'https://acleddata.com/',
      licence: 'ACLED Terms of Use & Attribution Policy',
      countryId: iso3,
      countryName: r.country || iso3,
      region: r.region || 'Unspecified',
      eventName: `${sub || r.event_type || 'Event'} — ${r.location || r.admin1 || r.country || ''}`.trim(),
      eventDate: day(r.event_date),
      startYear: year as number | null,
      endYear: year as number | null,
      eventType,
      locationName: [r.location, r.admin1].filter(Boolean).join(', ') || null,
      locationPrecision: lat !== null && lng !== null ? 'coordinates' : 'country_only',
      latitude: lat,
      longitude: lng,
      protesterIdentity: actors || null,
      stateResponses: intervention ? [force ? 'excessive force' : 'intervention'] : [],
      protesterViolenceReported: violent,
      primaryMethod: violent ? 'Violent' : 'Nonviolent',
      fatalities: fat,
      fatalitiesCertainty: fat === null ? null : 'Reported',
      documentedStateKillings: force && (fat ?? 0) > 0,
      sourceNotes: [r.notes, r.source ? `Source: ${r.source}` : null, ACLED_ATTRIBUTION]
        .filter(Boolean)
        .join('\n'),
      rawFields: Object.fromEntries(
        Object.entries(r).map(([k, v]) => [k, v === null || v === undefined ? '' : String(v)])
      ),
    });
  }
  return out;
}

const UCDP_VIOLENCE_LABEL: Record<number, string> = {
  1: 'State-based conflict',
  2: 'Non-state conflict',
  3: 'One-sided violence',
};

export function normalizeUcdpRows(rows: RawUcdpRow[], now: string, versionLabel: string): EventRecord[] {
  const out: EventRecord[] = [];
  for (const r of rows) {
    if (r.id === undefined || !r.date_start) continue;
    const best = num(r.best);
    const lat = num(r.latitude);
    const lng = num(r.longitude);
    const iso3 = resolveCountryIso3(r.country);
    const label = UCDP_VIOLENCE_LABEL[r.type_of_violence ?? 0] || 'Organised violence';
    const low = num(r.low);
    const high = num(r.high);
    out.push({
      ...baseRecord(now),
      id: `${UCDP_DATASET_ID}_${r.id}`,
      sourceRecordId: String(r.id),
      datasetId: UCDP_DATASET_ID,
      datasetName: `UCDP Georeferenced Event Dataset (${versionLabel})`,
      sourceName: 'Uppsala Conflict Data Program (UCDP)',
      sourceUrl: 'https://ucdp.uu.se/',
      licence: 'CC BY 4.0 (UCDP)',
      countryId: iso3,
      countryName: r.country || iso3,
      region: r.region || 'Unspecified',
      eventName: `${label}: ${r.side_a || 'Actor A'} vs ${r.side_b || 'Actor B'}`,
      eventDate: day(r.date_start),
      startYear: r.year ?? Number(String(r.date_start).slice(0, 4)),
      endYear: r.year ?? Number(String(r.date_end || r.date_start).slice(0, 4)),
      eventType: 'Armed conflict event',
      locationName: [r.where_description, r.adm_1].filter(Boolean).join(', ') || null,
      locationPrecision: lat !== null && lng !== null ? 'coordinates' : 'country_only',
      latitude: lat,
      longitude: lng,
      protesterViolenceReported: null,
      primaryMethod: 'Violent',
      fatalities: best,
      fatalitiesCertainty: best === null ? null : 'Estimated',
      competingReportsNotes:
        low !== null && high !== null ? `UCDP fatality range: low ${low}, best ${best ?? 'n/a'}, high ${high}.` : null,
      sourceNotes: [
        'UCDP records organised armed violence, not protests. It is included as conflict context and is excluded from protest counts by default.',
        r.source_article ? `Source: ${r.source_article}` : null,
        'Cite: Sundberg & Melander (2013); Davies et al., Uppsala Conflict Data Program.',
      ]
        .filter(Boolean)
        .join('\n'),
      rawFields: Object.fromEntries(
        Object.entries(r).map(([k, v]) => [k, v === null || v === undefined ? '' : String(v)])
      ),
    });
  }
  return out;
}
