export type DataProvenanceLabel =
  | 'Historical dataset record'
  | 'News-derived event lead'
  | 'Independently verified research record'
  | 'Reported statistic'
  | 'Estimated statistic'
  | 'Modelled indicator'
  | 'Statistical projection';

export type VerificationStatus =
  | 'unverified'
  | 'reviewed'
  | 'corroborated'
  | 'conflicting';

export type EventClassification =
  | 'Individual protest event'
  | 'Organised protest campaign'
  | 'Youth-led movement'
  | 'Student movement'
  | 'Labour movement'
  | 'General public demonstration'
  | 'Violent demonstration'
  | 'Civil resistance campaign'
  | 'Armed conflict event';

export type PageRoute =
  | 'overview'
  | 'map'
  | 'movements'
  | 'countries'
  | 'impact'
  | 'archive'
  | 'outlook'
  | 'sources';

export interface CountryRecord {
  id: string; // ISO3 code e.g. IND, USA, FRA, KEN
  iso2Code: string;
  countryName: string;
  region: string;
  incomeLevel: string;
  capitalCity: string;
  // Country-level reference centroid from World Bank metadata (NEVER used as fabricated city/event coordinates)
  referenceLat: number | null;
  referenceLng: number | null;
}

export interface DatasetMetadata {
  id: string;
  datasetName: string;
  provider: string;
  sourceUrl: string;
  downloadUrl: string;
  dataverseFileId?: number;
  doi?: string;
  citation: string;
  licence: string;
  coverageStart: string;
  coverageEnd: string;
  dataType: string;
  unitOfObservation: string;
  retrievalMethod: string;
  updateFrequency: string;
  knownLimitations: string[];
  connectionStatus: 'connected' | 'local_import_ready' | 'rate_limited' | 'error' | 'planned_registry';
  lastSuccessfulRetrieval: string | null;
  lastError: string | null;
  loadedRecordCount: number;
  isFutureRegistryOnly?: boolean;
}

export interface HumanImpactReportItem {
  id: string;
  category:
    | 'Fatalities'
    | 'Injuries'
    | 'Arrests'
    | 'Missing persons'
    | 'Displacement'
    | 'Property damage'
    | 'Internet shutdowns'
    | 'Educational disruption'
    | 'Economic disruption';
  figureText: string;
  numericValue: number | null;
  certainty: 'Confirmed' | 'Reported' | 'Estimated';
  sourceName: string;
  sourceUrl: string;
  reportingDate: string;
  sourceDefinition: string;
  competingAccountNote?: string;
}

export interface EventRecord {
  id: string;
  sourceRecordId: string;
  datasetId: string;
  datasetName: string;
  sourceName: string;
  sourceUrl: string;
  licence: string;
  countryId: string; // ISO3 when matched, or normalized country slug
  countryName: string;
  region: string;
  eventName: string;
  eventDate: string | null; // YYYY-MM-DD or YYYY-MM or YYYY
  startYear: number | null;
  endYear: number | null;
  publicationDate: string | null;
  retrievalTimestamp: string;
  eventType: EventClassification;
  isBaselineZeroProtestRow?: boolean; // Preserves Mass Mobilization protest=0 baseline rows without counting them as events
  locationName: string | null;
  locationPrecision: 'coordinates' | 'locality_text_only' | 'country_only';
  latitude: number | null;
  longitude: number | null;
  participants: string | null;
  participantsCategory: string | null;
  protesterIdentity: string | null;
  demands: string[];
  stateResponses: string[];
  protesterViolenceReported: boolean | null;
  // Campaign-specific fields (e.g. NAVCO)
  primaryMethod: 'Nonviolent' | 'Violent' | 'Mixed / Unspecified' | null;
  campaignOutcome: string | null;
  campaignGoal: string | null;
  // Quantitative human impact (strictly null when not reported — never 0 by default)
  fatalities: number | null;
  fatalitiesCertainty: 'Confirmed' | 'Reported' | 'Estimated' | null;
  injuries: number | null;
  injuriesCertainty: 'Confirmed' | 'Reported' | 'Estimated' | null;
  arrests: number | null;
  missingPersons: number | null;
  displacedPersons: number | null;
  // Qualitative / categorical impact indicators from source coding
  documentedStateArrests: boolean;
  documentedStateBeatings: boolean;
  documentedStateShootings: boolean;
  documentedStateKillings: boolean;
  propertyDamageNotes: string | null;
  internetShutdownNotes: string | null;
  educationalDisruptionNotes: string | null;
  economicDisruptionNotes: string | null;
  competingReportsNotes: string | null;
  sourceNotes: string | null;
  verificationStatus: VerificationStatus;
  reviewerNotes: string | null;
  recordType: DataProvenanceLabel;
  rawFields: Record<string, string>;
}

export interface MovementTimelineItem {
  date: string;
  milestone: string;
  sourceUrl?: string;
}

export interface MovementSourceItem {
  title: string;
  url: string;
  publisher?: string;
  accessDate?: string;
}

export interface MovementProfile {
  id: string;
  name: string;
  countryId: string;
  countryName: string;
  region: string;
  startDate: string;
  endDate: string;
  classification: EventClassification;
  overview: string;
  background: string;
  immediateTrigger: string;
  underlyingCauses: string;
  demands: string[];
  participantsAndLeadership: string;
  youthInvolvementEvidence: string;
  youthLeadershipClassification:
    | 'Demonstrably youth-led'
    | 'Substantial youth/student coalition'
    | 'Broad cross-generational participation'
    | 'Insufficient evidence';
  governmentResponse: string;
  humanImpactSummary: string;
  humanImpactReports: HumanImpactReportItem[];
  timeline: MovementTimelineItem[];
  outcomes: string;
  longTermConsequences: string;
  relatedMovementIds: string[];
  sources: MovementSourceItem[];
  publicationStatus: 'Published Research Record' | 'Working Draft';
  verificationStatus: VerificationStatus;
  recordType: DataProvenanceLabel;
  createdAt: string;
  updatedAt: string;
}

export interface NewsArticleLead {
  id: string;
  title: string;
  publisher: string;
  articleUrl: string;
  publicationDate: string;
  retrievalDate: string;
  searchQuery: string;
  country: string | null;
  language: string | null;
  associatedEventId: string | null;
  verificationStatus: VerificationStatus;
  reviewerNotes: string | null;
  recordType: 'News-derived event lead';
  clusterId: string;
  duplicateCount: number;
  corroboratingArticles: Array<{
    title: string;
    publisher: string;
    articleUrl: string;
    publicationDate: string;
  }>;
}

export interface CountryIndicatorObservation {
  id: string;
  countryId: string; // ISO3
  countryName: string;
  indicatorCode: string;
  indicatorName: string;
  unit: string;
  year: number;
  value: number | null;
  sourceName: string;
  sourceUrl: string;
  retrievalDate: string;
  lastUpdatedBySource: string | null;
  dataLabel: 'Reported statistic' | 'Modelled indicator';
}

export interface FieldMappingConfig {
  sourceRecordId?: string;
  countryName?: string;
  countryIsoOrCode?: string;
  region?: string;
  year?: string;
  startDay?: string;
  startMonth?: string;
  startYear?: string;
  endDay?: string;
  endMonth?: string;
  endYear?: string;
  eventDate?: string;
  protestBinaryFlag?: string;
  eventName?: string;
  locationName?: string;
  latitude?: string;
  longitude?: string;
  participants?: string;
  participantsCategory?: string;
  protesterIdentity?: string;
  demandColumns: string[];
  stateResponseColumns: string[];
  protesterViolence?: string;
  primaryMethod?: string; // e.g. NAVCO prim_method / nonviol / viol
  campaignOutcome?: string; // e.g. NAVCO success / limited / failure
  campaignGoal?: string;
  fatalities?: string;
  injuries?: string;
  arrests?: string;
  missingPersons?: string;
  displacedPersons?: string;
  sourceCitation?: string;
  sourceNotes?: string;
}

export interface ImportPreviewReport {
  datasetPreset: 'mass_mobilization' | 'navco' | 'custom';
  fileName: string;
  delimiter: string;
  totalRows: number;
  headers: string[];
  sampleRows: Record<string, string>[];
  suggestedMapping: FieldMappingConfig;
  validationSummary: {
    missingCountryCount: number;
    missingDateOrYearCount: number;
    duplicateRecordIdCount: number;
    duplicateSampleIds: string[];
    zeroProtestBaselineRowsCount: number;
    rowsWithCoordinatesCount: number;
    yearMin: number | null;
    yearMax: number | null;
    typeWarnings: string[];
  };
}
