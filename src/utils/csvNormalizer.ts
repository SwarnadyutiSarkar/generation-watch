import Papa from 'papaparse';
import {
  EventClassification,
  EventRecord,
  FieldMappingConfig,
  ImportPreviewReport,
} from '../types/research';
import { resolveCountryIso3 } from '../data/worldBankCatalog';

function findHeader(headers: string[], candidates: string[]): string | undefined {
  const lowerMap = new Map(headers.map((h) => [h.trim().toLowerCase(), h]));
  for (const cand of candidates) {
    const match = lowerMap.get(cand.toLowerCase());
    if (match) return match;
  }
  return undefined;
}

function findMatchingHeaders(headers: string[], prefixPattern: RegExp): string[] {
  return headers.filter((h) => prefixPattern.test(h.trim()));
}

export function detectDatasetPresetAndMapping(headers: string[]): {
  preset: 'mass_mobilization' | 'navco' | 'custom';
  mapping: FieldMappingConfig;
} {
  const lowerSet = new Set(headers.map((h) => h.trim().toLowerCase()));

  // Detect Harvard Mass Mobilization schema
  if (
    lowerSet.has('protesterdemand1') ||
    (lowerSet.has('stateresponse1') && lowerSet.has('protesteridentity'))
  ) {
    return {
      preset: 'mass_mobilization',
      mapping: {
        sourceRecordId: findHeader(headers, ['id']),
        countryName: findHeader(headers, ['country']),
        countryIsoOrCode: findHeader(headers, ['ccode', 'iso3']),
        region: findHeader(headers, ['region']),
        year: findHeader(headers, ['year']),
        startDay: findHeader(headers, ['startday']),
        startMonth: findHeader(headers, ['startmonth']),
        startYear: findHeader(headers, ['startyear']),
        endDay: findHeader(headers, ['endday']),
        endMonth: findHeader(headers, ['endmonth']),
        endYear: findHeader(headers, ['endyear']),
        protestBinaryFlag: findHeader(headers, ['protest']),
        locationName: findHeader(headers, ['location']),
        participants: findHeader(headers, ['participants']),
        participantsCategory: findHeader(headers, ['participants_category']),
        protesterIdentity: findHeader(headers, ['protesteridentity']),
        protesterViolence: findHeader(headers, ['protesterviolence']),
        demandColumns: findMatchingHeaders(headers, /^protesterdemand\d+$/i),
        stateResponseColumns: findMatchingHeaders(headers, /^stateresponse\d+$/i),
        sourceCitation: findHeader(headers, ['sources']),
        sourceNotes: findHeader(headers, ['notes']),
      },
    };
  }

  // Detect Harvard NAVCO (1.3 List or 2.x) schema
  if (lowerSet.has('navcoid') || (lowerSet.has('campaign') && (lowerSet.has('byear') || lowerSet.has('nonviol')))) {
    return {
      preset: 'navco',
      mapping: {
        sourceRecordId: findHeader(headers, ['navcoid', 'id', 'campyearid']),
        eventName: findHeader(headers, ['campaign', 'camp_name']),
        countryName: findHeader(headers, ['location', 'country']),
        year: findHeader(headers, ['byear', 'year', 'cy']),
        startYear: findHeader(headers, ['byear', 'start_year', 'year']),
        endYear: findHeader(headers, ['eyear', 'end_year', 'year']),
        primaryMethod: findHeader(headers, ['nonviol', 'prim_method', 'primary_method']),
        campaignOutcome: findHeader(headers, ['success', 'outcome']),
        campaignGoal: findHeader(headers, ['target', 'camp_goals']),
        participants: findHeader(headers, ['total_part', 'camp_size', 'peakmembership']),
        fatalities: findHeader(headers, ['fatalities', 'fatality_high']),
        demandColumns: findMatchingHeaders(headers, /^(fselfdet|regchange|secession|other)$/i),
        stateResponseColumns: [],
        sourceNotes: findHeader(headers, ['target', 'notes']),
      },
    };
  }

  // Generic / Custom CSV schema auto-suggestion
  return {
    preset: 'custom',
    mapping: {
      sourceRecordId: findHeader(headers, ['id', 'event_id', 'record_id', 'data_id']),
      eventName: findHeader(headers, ['event_name', 'title', 'campaign', 'movement', 'name']),
      countryName: findHeader(headers, ['country', 'country_name', 'location', 'nation']),
      countryIsoOrCode: findHeader(headers, ['iso3', 'iso_code', 'iso', 'country_code', 'ccode']),
      region: findHeader(headers, ['region', 'world_region']),
      eventDate: findHeader(headers, ['event_date', 'date', 'start_date']),
      year: findHeader(headers, ['year', 'start_year', 'byear']),
      startYear: findHeader(headers, ['start_year', 'byear', 'year']),
      endYear: findHeader(headers, ['end_year', 'eyear']),
      locationName: findHeader(headers, ['city', 'locality', 'location_name', 'admin1']),
      latitude: findHeader(headers, ['latitude', 'lat']),
      longitude: findHeader(headers, ['longitude', 'lon', 'lng', 'long']),
      participants: findHeader(headers, ['participants', 'size', 'crowd_size']),
      protesterIdentity: findHeader(headers, ['protesteridentity', 'actors', 'participants_identity', 'group']),
      demandColumns: findMatchingHeaders(headers, /demand|issue|claim|grievance/i),
      stateResponseColumns: findMatchingHeaders(headers, /response|repression/i),
      fatalities: findHeader(headers, ['fatalities', 'deaths', 'killed']),
      injuries: findHeader(headers, ['injuries', 'injured', 'wounded']),
      arrests: findHeader(headers, ['arrests', 'detained', 'arrested']),
      missingPersons: findHeader(headers, ['missing', 'missing_persons', 'disappeared']),
      displacedPersons: findHeader(headers, ['displaced', 'displaced_persons']),
      sourceCitation: findHeader(headers, ['source', 'sources', 'source_url', 'url']),
      sourceNotes: findHeader(headers, ['notes', 'description', 'summary', 'comments']),
    },
  };
}

function parseCleanInt(raw: string | undefined): number | null {
  if (raw === undefined || raw === null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed || trimmed === 'NA' || trimmed === 'N/A' || trimmed === '.' || trimmed === 'null') {
    return null;
  }
  const num = Number(trimmed);
  if (!Number.isFinite(num)) return null;
  return Math.trunc(num);
}

function parseNullableMetric(raw: string | undefined): number | null {
  if (raw === undefined || raw === null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed || trimmed === 'NA' || trimmed === 'N/A' || trimmed === '.' || trimmed === '-99' || trimmed === '-999') {
    return null;
  }
  const num = Number(trimmed.replace(/,/g, ''));
  if (!Number.isFinite(num) || num < 0) return null;
  return num;
}

function parseCoordinate(raw: string | undefined, min: number, max: number): number | null {
  if (raw === undefined || raw === null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed || trimmed === 'NA' || trimmed === 'N/A' || trimmed === '.') return null;
  const num = Number(trimmed);
  if (!Number.isFinite(num) || num < min || num > max) return null;
  // Guard against (0,0) null-island placeholder when clearly invalid
  return num;
}

function cleanIdValue(raw: string | undefined, fallbackIdx: number): string {
  if (!raw || !String(raw).trim()) return `row_${fallbackIdx + 1}`;
  const trimmed = String(raw).trim();
  if (/^\d+\.0$/.test(trimmed)) {
    return trimmed.slice(0, -2);
  }
  return trimmed;
}

function formatEventDate(
  explicitDate?: string,
  year?: number | null,
  month?: number | null,
  day?: number | null
): string | null {
  if (explicitDate && explicitDate.trim()) {
    return explicitDate.trim();
  }
  if (!year || year < 1700 || year > 2100) return null;
  if (month && month >= 1 && month <= 12) {
    const mm = String(month).padStart(2, '0');
    if (day && day >= 1 && day <= 31) {
      const dd = String(day).padStart(2, '0');
      return `${year}-${mm}-${dd}`;
    }
    return `${year}-${mm}`;
  }
  return String(year);
}

function classifyEventCarefully(params: {
  preset: 'mass_mobilization' | 'navco' | 'custom';
  identity: string | null;
  demands: string[];
  primaryMethod: 'Nonviolent' | 'Violent' | 'Mixed / Unspecified' | null;
  violenceFlag: boolean | null;
  rawRow: Record<string, string>;
}): EventClassification {
  const { preset, identity, demands, primaryMethod, rawRow } = params;

  if (preset === 'navco') {
    if (primaryMethod === 'Nonviolent') {
      return 'Civil resistance campaign';
    }
    return 'Organised protest campaign';
  }

  const identityLower = (identity || '').toLowerCase();
  const demandText = demands.join(' ').toLowerCase();

  // Strictly evidence-based classification: never default protests to youth movements
  if (/\b(student|students|university|campus|pupils|high school)\b/.test(identityLower)) {
    return 'Student movement';
  }
  if (/\b(youth|youths|young people|younger generation)\b/.test(identityLower)) {
    return 'Youth-led movement';
  }
  if (
    /\b(worker|workers|union|unions|labor|labour|striker|strikers|miners|employees|civil servants|farmers|teachers|drivers)\b/.test(
      identityLower
    ) ||
    /\b(labor wage dispute)\b/.test(demandText)
  ) {
    return 'Labour movement';
  }

  const explicitType = (rawRow['event_type'] || rawRow['sub_event_type'] || '').toLowerCase();
  if (/\b(riot|mob violence)\b/.test(explicitType)) {
    return 'Violent demonstration';
  }
  if (/\b(civil resistance)\b/.test(explicitType)) {
    return 'Civil resistance campaign';
  }
  if (/\b(campaign)\b/.test(explicitType)) {
    return 'Organised protest campaign';
  }

  if (identityLower && identityLower !== 'unspecified') {
    return 'General public demonstration';
  }

  return 'Individual protest event';
}

export function parseCsvOrTsvText(rawText: string): {
  headers: string[];
  rows: Record<string, string>[];
  delimiter: string;
  parseErrors: string[];
} {
  const result = Papa.parse<Record<string, string>>(rawText, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });

  const headers = (result.meta.fields || []).map((f) => f.trim()).filter(Boolean);
  const parseErrors = result.errors
    .slice(0, 15)
    .map((e) => `Row ${e.row !== undefined ? e.row + 1 : '?'}: ${e.message}`);

  return {
    headers,
    rows: result.data || [],
    delimiter: result.meta.delimiter || ',',
    parseErrors,
  };
}

export function buildImportPreview(
  rawText: string,
  fileName: string,
  overridePreset?: 'mass_mobilization' | 'navco' | 'custom',
  overrideMapping?: FieldMappingConfig
): ImportPreviewReport {
  const { headers, rows, delimiter, parseErrors } = parseCsvOrTsvText(rawText);
  const detected = detectDatasetPresetAndMapping(headers);
  const preset = overridePreset || detected.preset;
  const mapping = overrideMapping || detected.mapping;

  let missingCountryCount = 0;
  let missingDateOrYearCount = 0;
  let duplicateRecordIdCount = 0;
  let zeroProtestBaselineRowsCount = 0;
  let rowsWithCoordinatesCount = 0;
  let yearMin: number | null = null;
  let yearMax: number | null = null;

  const seenIds = new Set<string>();
  const duplicateSampleIds: string[] = [];

  rows.forEach((row, idx) => {
    const countryVal = mapping.countryName ? (row[mapping.countryName] || '').trim() : '';
    if (!countryVal) missingCountryCount++;

    const yr =
      parseCleanInt(mapping.startYear ? row[mapping.startYear] : undefined) ??
      parseCleanInt(mapping.year ? row[mapping.year] : undefined);
    const dt = mapping.eventDate ? (row[mapping.eventDate] || '').trim() : '';

    if (yr === null && !dt) {
      missingDateOrYearCount++;
    } else if (yr !== null && yr >= 1700 && yr <= 2100) {
      if (yearMin === null || yr < yearMin) yearMin = yr;
      if (yearMax === null || yr > yearMax) yearMax = yr;
    }

    if (mapping.sourceRecordId) {
      const recId = cleanIdValue(row[mapping.sourceRecordId], idx);
      if (seenIds.has(recId)) {
        duplicateRecordIdCount++;
        if (duplicateSampleIds.length < 5) duplicateSampleIds.push(recId);
      } else {
        seenIds.add(recId);
      }
    }

    if (mapping.protestBinaryFlag) {
      const pFlag = parseCleanInt(row[mapping.protestBinaryFlag]);
      if (pFlag === 0) zeroProtestBaselineRowsCount++;
    }

    const lat = parseCoordinate(mapping.latitude ? row[mapping.latitude] : undefined, -90, 90);
    const lng = parseCoordinate(mapping.longitude ? row[mapping.longitude] : undefined, -180, 180);
    if (lat !== null && lng !== null && !(lat === 0 && lng === 0)) {
      rowsWithCoordinatesCount++;
    }
  });

  const typeWarnings = [...parseErrors];
  if (preset === 'mass_mobilization' && yearMax && yearMax > 2020) {
    typeWarnings.push(
      `Unexpected year > 2020 (${yearMax}) detected: official Harvard Mass Mobilization coverage ends in March 2020.`
    );
  }
  if (rowsWithCoordinatesCount === 0) {
    typeWarnings.push(
      'Source file contains no point latitude/longitude columns. Events will be honest about geographic precision (country-level or locality-text) rather than fabricating city coordinates.'
    );
  }
  if (zeroProtestBaselineRowsCount > 0) {
    typeWarnings.push(
      `${zeroProtestBaselineRowsCount.toLocaleString()} country-year baseline observations (protest = 0) detected. These will be preserved in raw storage and excluded from active protest-event counts.`
    );
  }

  return {
    datasetPreset: preset,
    fileName,
    delimiter: delimiter === '\t' ? 'TAB (\\t)' : delimiter,
    totalRows: rows.length,
    headers,
    sampleRows: rows.slice(0, 8),
    suggestedMapping: mapping,
    validationSummary: {
      missingCountryCount,
      missingDateOrYearCount,
      duplicateRecordIdCount,
      duplicateSampleIds,
      zeroProtestBaselineRowsCount,
      rowsWithCoordinatesCount,
      yearMin,
      yearMax,
      typeWarnings,
    },
  };
}

export function normalizeRowsToEventRecords(params: {
  rawText: string;
  datasetId: string;
  datasetName: string;
  sourceName: string;
  sourceUrl: string;
  licence: string;
  preset: 'mass_mobilization' | 'navco' | 'custom';
  mapping: FieldMappingConfig;
  retrievalTimestamp?: string;
}): EventRecord[] {
  const {
    rawText,
    datasetId,
    datasetName,
    sourceName,
    sourceUrl,
    licence,
    preset,
    mapping,
    retrievalTimestamp = new Date().toISOString(),
  } = params;

  const { rows } = parseCsvOrTsvText(rawText);

  return rows.map((row, idx) => {
    const sourceRecordId = mapping.sourceRecordId
      ? cleanIdValue(row[mapping.sourceRecordId], idx)
      : `${datasetId}_${idx + 1}`;

    const countryNameRaw = mapping.countryName ? (row[mapping.countryName] || '').trim() : '';
    const countryName = countryNameRaw || 'Unspecified Country';
    const rawCode = mapping.countryIsoOrCode ? row[mapping.countryIsoOrCode] : undefined;
    const countryId = resolveCountryIso3(countryNameRaw, rawCode);
    const region = (mapping.region && row[mapping.region] ? row[mapping.region].trim() : '') || 'Unspecified Region';

    const startYear =
      parseCleanInt(mapping.startYear ? row[mapping.startYear] : undefined) ??
      parseCleanInt(mapping.year ? row[mapping.year] : undefined);
    const endYear = parseCleanInt(mapping.endYear ? row[mapping.endYear] : undefined) ?? startYear;
    const startMonth = parseCleanInt(mapping.startMonth ? row[mapping.startMonth] : undefined);
    const startDay = parseCleanInt(mapping.startDay ? row[mapping.startDay] : undefined);

    const eventDate = formatEventDate(
      mapping.eventDate ? row[mapping.eventDate] : undefined,
      startYear,
      startMonth,
      startDay
    );

    const isBaselineZeroProtestRow =
      mapping.protestBinaryFlag !== undefined
        ? parseCleanInt(row[mapping.protestBinaryFlag]) === 0
        : false;

    const rawLoc = mapping.locationName ? (row[mapping.locationName] || '').trim() : '';
    const locationName =
      rawLoc && rawLoc.toLowerCase() !== 'national' && rawLoc !== 'NA' ? rawLoc : null;

    let lat = parseCoordinate(mapping.latitude ? row[mapping.latitude] : undefined, -90, 90);
    let lng = parseCoordinate(mapping.longitude ? row[mapping.longitude] : undefined, -180, 180);
    if (lat === 0 && lng === 0) {
      lat = null;
      lng = null;
    }

    const locationPrecision: EventRecord['locationPrecision'] =
      lat !== null && lng !== null
        ? 'coordinates'
        : locationName
          ? 'locality_text_only'
          : 'country_only';

    // Demands extraction
    const demands: string[] = [];
    if (preset === 'navco') {
      if (parseCleanInt(row['REGCHANGE'] ?? row['regchange']) === 1) demands.push('Regime change');
      if (parseCleanInt(row['FSELFDET'] ?? row['fselfdet']) === 1)
        demands.push('Self-determination / End foreign occupation');
      if (parseCleanInt(row['SECESSION'] ?? row['secession']) === 1) demands.push('Territorial secession');
      if (parseCleanInt(row['OTHER'] ?? row['other']) === 1) demands.push('Other maximalist objective');
    } else {
      for (const col of mapping.demandColumns || []) {
        const val = (row[col] || '').trim();
        if (val && val !== '.' && val !== 'NA') {
          demands.push(val);
        }
      }
    }

    // State responses extraction
    const stateResponses: string[] = [];
    for (const col of mapping.stateResponseColumns || []) {
      const val = (row[col] || '').trim();
      if (val && val !== '.' && val !== 'NA') {
        stateResponses.push(val);
      }
    }

    const lowerResponses = stateResponses.map((s) => s.toLowerCase());
    const documentedStateArrests = lowerResponses.some((s) => s.includes('arrest'));
    const documentedStateBeatings = lowerResponses.some((s) => s.includes('beating'));
    const documentedStateShootings = lowerResponses.some((s) => s.includes('shooting'));
    const documentedStateKillings = lowerResponses.some((s) => s.includes('killing'));

    // NAVCO campaign method & outcome
    let primaryMethod: EventRecord['primaryMethod'] = null;
    let campaignOutcome: string | null = null;
    let campaignGoal: string | null = null;

    if (preset === 'navco') {
      const nonviol = parseCleanInt(row['NONVIOL'] ?? row['nonviol']);
      const viol = parseCleanInt(row['VIOL'] ?? row['viol']);
      if (nonviol === 1) primaryMethod = 'Nonviolent';
      else if (viol === 1) primaryMethod = 'Violent';
      else if (mapping.primaryMethod && row[mapping.primaryMethod]) {
        const pm = row[mapping.primaryMethod].trim().toLowerCase();
        if (pm === '1' || pm.includes('nonviol')) primaryMethod = 'Nonviolent';
        else if (pm === '0' || pm.includes('viol')) primaryMethod = 'Violent';
      }

      if (parseCleanInt(row['SUCCESS'] ?? row['success']) === 1) campaignOutcome = 'Full Success';
      else if (parseCleanInt(row['LIMITED'] ?? row['limited']) === 1)
        campaignOutcome = 'Limited / Partial Concessions';
      else if (parseCleanInt(row['FAILURE'] ?? row['failure']) === 1) campaignOutcome = 'Failure';
      else if (parseCleanInt(row['ONGOING'] ?? row['ongoing']) === 1)
        campaignOutcome = 'Ongoing at Dataset Cutoff';
      else if (mapping.campaignOutcome && row[mapping.campaignOutcome]) {
        campaignOutcome = row[mapping.campaignOutcome].trim() || null;
      }

      const targetVal = (row['TARGET'] ?? row['target'] ?? '').trim();
      campaignGoal = targetVal ? `Target: ${targetVal}` : demands.join('; ') || null;
    }

    const protesterIdentity =
      mapping.protesterIdentity && row[mapping.protesterIdentity]
        ? row[mapping.protesterIdentity].trim() || null
        : null;

    const pViolRaw = mapping.protesterViolence ? parseCleanInt(row[mapping.protesterViolence]) : null;
    const protesterViolenceReported = pViolRaw === 1 ? true : pViolRaw === 0 ? false : null;

    const eventType = classifyEventCarefully({
      preset,
      identity: protesterIdentity,
      demands,
      primaryMethod,
      violenceFlag: protesterViolenceReported,
      rawRow: row,
    });

    const explicitTitle = mapping.eventName && row[mapping.eventName] ? row[mapping.eventName].trim() : '';
    const eventName = isBaselineZeroProtestRow
      ? `${countryName} (${startYear ?? 'Unspecified Year'}) — Zero-Protest Baseline Observation`
      : explicitTitle
        ? explicitTitle
        : demands.length > 0
          ? `${countryName}: ${demands[0].charAt(0).toUpperCase() + demands[0].slice(1)}${locationName ? ` (${locationName})` : ''}`
          : `${countryName} Protest Observation #${sourceRecordId}`;

    const fatalities = parseNullableMetric(mapping.fatalities ? row[mapping.fatalities] : undefined);
    const injuries = parseNullableMetric(mapping.injuries ? row[mapping.injuries] : undefined);
    const arrests = parseNullableMetric(mapping.arrests ? row[mapping.arrests] : undefined);
    const missingPersons = parseNullableMetric(
      mapping.missingPersons ? row[mapping.missingPersons] : undefined
    );
    const displacedPersons = parseNullableMetric(
      mapping.displacedPersons ? row[mapping.displacedPersons] : undefined
    );

    const citationNote = mapping.sourceCitation ? (row[mapping.sourceCitation] || '').trim() : '';
    const extraNote = mapping.sourceNotes ? (row[mapping.sourceNotes] || '').trim() : '';
    const combinedNotes = [extraNote, citationNote ? `Primary sources cited: ${citationNote}` : '']
      .filter(Boolean)
      .join(' | ');

    return {
      id: `${datasetId}:${sourceRecordId}:${idx}`,
      sourceRecordId,
      datasetId,
      datasetName,
      sourceName,
      sourceUrl,
      licence,
      countryId,
      countryName,
      region,
      eventName,
      eventDate,
      startYear,
      endYear,
      publicationDate: null,
      retrievalTimestamp,
      eventType,
      isBaselineZeroProtestRow,
      locationName,
      locationPrecision,
      latitude: lat,
      longitude: lng,
      participants:
        mapping.participants && row[mapping.participants] ? row[mapping.participants].trim() || null : null,
      participantsCategory:
        mapping.participantsCategory && row[mapping.participantsCategory]
          ? row[mapping.participantsCategory].trim() || null
          : null,
      protesterIdentity,
      demands,
      stateResponses,
      protesterViolenceReported,
      primaryMethod,
      campaignOutcome,
      campaignGoal,
      fatalities,
      fatalitiesCertainty: fatalities !== null ? 'Reported' : null,
      injuries,
      injuriesCertainty: injuries !== null ? 'Reported' : null,
      arrests,
      missingPersons,
      displacedPersons,
      documentedStateArrests,
      documentedStateBeatings,
      documentedStateShootings,
      documentedStateKillings,
      propertyDamageNotes: null,
      internetShutdownNotes: null,
      educationalDisruptionNotes: null,
      economicDisruptionNotes: null,
      competingReportsNotes: null,
      sourceNotes: combinedNotes || null,
      verificationStatus: 'unverified',
      reviewerNotes: null,
      recordType: 'Historical dataset record',
      rawFields: row,
    };
  });
}
