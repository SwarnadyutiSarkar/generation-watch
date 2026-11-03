import { openDB, DBSchema, IDBPDatabase } from 'idb';
import {
  CountryIndicatorObservation,
  DatasetMetadata,
  EventRecord,
  MovementProfile,
  NewsArticleLead,
  VerificationStatus,
} from '../types/research';
import { INITIAL_DATASETS_REGISTRY } from '../data/sourceRegistry';
import {
  SEED_DATASET_ID,
  SEED_DATASET_META,
  SEED_VERSION,
  buildSeedEvents,
  buildSeedMovements,
} from '../data/seedData';

export interface RawDatasetArchiveMeta {
  datasetId: string;
  fileName: string;
  delimiter: string;
  headers: string[];
  rawRowCount: number;
  importedAt: string;
  sampleRawRows: Record<string, string>[];
}

export interface VerificationReviewRecord {
  targetId: string;
  targetType: 'event' | 'news' | 'movement';
  verificationStatus: VerificationStatus;
  reviewerNotes: string | null;
  updatedAt: string;
}

interface GenerationWatchDB extends DBSchema {
  datasets: {
    key: string;
    value: DatasetMetadata;
  };
  raw_archives: {
    key: string;
    value: RawDatasetArchiveMeta;
  };
  event_records: {
    key: string;
    value: EventRecord;
    indexes: {
      'by-dataset': string;
      'by-country': string;
    };
  };
  movement_profiles: {
    key: string;
    value: MovementProfile;
  };
  news_leads: {
    key: string;
    value: NewsArticleLead;
  };
  country_indicators: {
    key: string;
    value: CountryIndicatorObservation;
    indexes: {
      'by-country': string;
    };
  };
  verification_reviews: {
    key: string;
    value: VerificationReviewRecord;
  };
}

const DB_NAME = 'generation_watch_research_db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<GenerationWatchDB>> | null = null;

function getDb(): Promise<IDBPDatabase<GenerationWatchDB>> {
  if (!dbPromise) {
    dbPromise = openDB<GenerationWatchDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('datasets')) {
          db.createObjectStore('datasets', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('raw_archives')) {
          db.createObjectStore('raw_archives', { keyPath: 'datasetId' });
        }
        if (!db.objectStoreNames.contains('event_records')) {
          const eventStore = db.createObjectStore('event_records', { keyPath: 'id' });
          eventStore.createIndex('by-dataset', 'datasetId');
          eventStore.createIndex('by-country', 'countryId');
        }
        if (!db.objectStoreNames.contains('movement_profiles')) {
          db.createObjectStore('movement_profiles', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('news_leads')) {
          db.createObjectStore('news_leads', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('country_indicators')) {
          const indStore = db.createObjectStore('country_indicators', { keyPath: 'id' });
          indStore.createIndex('by-country', 'countryId');
        }
        if (!db.objectStoreNames.contains('verification_reviews')) {
          db.createObjectStore('verification_reviews', { keyPath: 'targetId' });
        }
      },
    });
  }
  return dbPromise;
}

/**
 * Clean Data-Access Layer (Repository Pattern)
 * Backed by IndexedDB in v1; structured so PostgreSQL/Supabase adapters can replace store methods cleanly.
 */
export const ResearchRepository = {
  /**
   * Loads the bundled starter set (12 curated movements + their event records) on first launch,
   * so the app never opens empty. Runs once per SEED_VERSION; later user edits/deletions are preserved.
   */
  async ensureSeedData(): Promise<void> {
    const flagKey = `gw_seed_v${SEED_VERSION}`;
    try {
      if (localStorage.getItem(flagKey) === 'done') return;
    } catch {
      // localStorage unavailable (private mode / iframe): fall through to the IndexedDB check below
    }
    const db = await getDb();
    const now = new Date().toISOString();
    const events = buildSeedEvents(now);
    const tx = db.transaction(['event_records', 'movement_profiles', 'datasets'], 'readwrite');
    // Events are refreshed on each new seed version; movement dossiers are only added when missing,
    // so researcher edits to existing dossiers are never overwritten.
    for (const ev of events) tx.objectStore('event_records').put(ev);
    for (const m of buildSeedMovements()) {
      const already = await tx.objectStore('movement_profiles').get(m.id);
      if (!already) tx.objectStore('movement_profiles').put(m);
    }
    tx.objectStore('datasets').put({
      ...SEED_DATASET_META,
      loadedRecordCount: events.length,
      lastSuccessfulRetrieval: now,
    });
    await tx.done;
    try {
      localStorage.setItem(flagKey, 'done');
    } catch {
      // ignore
    }
  },

  async getDatasets(): Promise<DatasetMetadata[]> {
    const db = await getDb();
    const stored = await db.getAll('datasets');
    const storedMap = new Map(stored.map((d) => [d.id, d]));

    const merged: DatasetMetadata[] = INITIAL_DATASETS_REGISTRY.map((base) => {
      const existing = storedMap.get(base.id);
      if (!existing) return base;
      return {
        ...base,
        connectionStatus: existing.connectionStatus,
        lastSuccessfulRetrieval: existing.lastSuccessfulRetrieval,
        lastError: existing.lastError,
        loadedRecordCount: existing.loadedRecordCount,
      };
    });

    // Include any custom researcher-imported datasets
    for (const item of stored) {
      if (!INITIAL_DATASETS_REGISTRY.some((b) => b.id === item.id)) {
        merged.push(item);
      }
    }
    return merged;
  },

  async saveDatasetMetadata(meta: DatasetMetadata): Promise<void> {
    const db = await getDb();
    await db.put('datasets', meta);
  },

  async getRawArchiveMeta(datasetId: string): Promise<RawDatasetArchiveMeta | undefined> {
    const db = await getDb();
    return db.get('raw_archives', datasetId);
  },

  async getAllRawArchiveMetas(): Promise<RawDatasetArchiveMeta[]> {
    const db = await getDb();
    return db.getAll('raw_archives');
  },

  async saveImportedDatasetRecords(params: {
    datasetMeta: DatasetMetadata;
    rawArchive: RawDatasetArchiveMeta;
    records: EventRecord[];
    replaceExisting: boolean;
  }): Promise<void> {
    const db = await getDb();
    const { datasetMeta, rawArchive, records, replaceExisting } = params;

    if (replaceExisting) {
      const existingKeys = await db.getAllKeysFromIndex(
        'event_records',
        'by-dataset',
        datasetMeta.id
      );
      if (existingKeys.length > 0) {
        const txClear = db.transaction('event_records', 'readwrite');
        for (const k of existingKeys) {
          txClear.store.delete(k);
        }
        await txClear.done;
      }
    }

    // Batch write in chunks of 2,500 to keep IndexedDB transactions snappy for 17k+ Mass Mobilization rows
    const CHUNK_SIZE = 2500;
    for (let i = 0; i < records.length; i += CHUNK_SIZE) {
      const chunk = records.slice(i, i + CHUNK_SIZE);
      const tx = db.transaction('event_records', 'readwrite');
      for (const rec of chunk) {
        tx.store.put(rec);
      }
      await tx.done;
    }

    await db.put('raw_archives', rawArchive);
    await db.put('datasets', datasetMeta);
  },

  async deleteDatasetRecords(datasetId: string): Promise<void> {
    const db = await getDb();
    const existingKeys = await db.getAllKeysFromIndex('event_records', 'by-dataset', datasetId);
    const tx = db.transaction(['event_records', 'raw_archives', 'datasets'], 'readwrite');
    for (const k of existingKeys) {
      tx.objectStore('event_records').delete(k);
    }
    tx.objectStore('raw_archives').delete(datasetId);
    const base = INITIAL_DATASETS_REGISTRY.find((d) => d.id === datasetId);
    if (base) {
      tx.objectStore('datasets').put({
        ...base,
        loadedRecordCount: 0,
        lastSuccessfulRetrieval: null,
      });
    } else {
      tx.objectStore('datasets').delete(datasetId);
    }
    await tx.done;
  },

  async getAllEvents(): Promise<EventRecord[]> {
    const db = await getDb();
    const [events, reviews] = await Promise.all([
      db.getAll('event_records'),
      db.getAll('verification_reviews'),
    ]);
    const reviewMap = new Map(
      reviews.filter((r) => r.targetType === 'event').map((r) => [r.targetId, r])
    );
    return events.map((ev) => {
      const rev = reviewMap.get(ev.id);
      if (!rev) return ev;
      return {
        ...ev,
        verificationStatus: rev.verificationStatus,
        reviewerNotes: rev.reviewerNotes,
        recordType:
          rev.verificationStatus === 'corroborated'
            ? 'Independently verified research record'
            : ev.recordType,
      };
    });
  },

  async getMovementProfiles(): Promise<MovementProfile[]> {
    const db = await getDb();
    const list = await db.getAll('movement_profiles');
    return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  async saveMovementProfile(profile: MovementProfile): Promise<void> {
    const db = await getDb();
    await db.put('movement_profiles', profile);
  },

  async deleteMovementProfile(id: string): Promise<void> {
    const db = await getDb();
    await db.delete('movement_profiles', id);
  },

  async saveNewsLeads(leads: NewsArticleLead[]): Promise<void> {
    const db = await getDb();
    const existingReviews = await db.getAll('verification_reviews');
    const reviewMap = new Map(
      existingReviews.filter((r) => r.targetType === 'news').map((r) => [r.targetId, r])
    );
    const tx = db.transaction('news_leads', 'readwrite');
    for (const lead of leads) {
      const rev = reviewMap.get(lead.id);
      tx.store.put(
        rev
          ? {
              ...lead,
              verificationStatus: rev.verificationStatus,
              reviewerNotes: rev.reviewerNotes,
            }
          : lead
      );
    }
    await tx.done;
  },

  async getCachedNewsLeads(): Promise<NewsArticleLead[]> {
    const db = await getDb();
    const [leads, reviews] = await Promise.all([
      db.getAll('news_leads'),
      db.getAll('verification_reviews'),
    ]);
    const reviewMap = new Map(
      reviews.filter((r) => r.targetType === 'news').map((r) => [r.targetId, r])
    );
    return leads
      .map((l) => {
        const rev = reviewMap.get(l.id);
        return rev
          ? { ...l, verificationStatus: rev.verificationStatus, reviewerNotes: rev.reviewerNotes }
          : l;
      })
      .sort((a, b) => b.publicationDate.localeCompare(a.publicationDate));
  },

  async saveCountryIndicators(observations: CountryIndicatorObservation[]): Promise<void> {
    const db = await getDb();
    const tx = db.transaction('country_indicators', 'readwrite');
    for (const obs of observations) {
      tx.store.put(obs);
    }
    await tx.done;
  },

  async getCountryIndicators(countryId?: string): Promise<CountryIndicatorObservation[]> {
    const db = await getDb();
    if (countryId) {
      return db.getAllFromIndex('country_indicators', 'by-country', countryId);
    }
    return db.getAll('country_indicators');
  },

  async updateVerificationStatus(
    targetId: string,
    targetType: 'event' | 'news' | 'movement',
    verificationStatus: VerificationStatus,
    reviewerNotes: string | null
  ): Promise<void> {
    const db = await getDb();
    await db.put('verification_reviews', {
      targetId,
      targetType,
      verificationStatus,
      reviewerNotes,
      updatedAt: new Date().toISOString(),
    });

    if (targetType === 'movement') {
      const existing = await db.get('movement_profiles', targetId);
      if (existing) {
        await db.put('movement_profiles', {
          ...existing,
          verificationStatus,
          recordType:
            verificationStatus === 'corroborated'
              ? 'Independently verified research record'
              : existing.recordType,
          updatedAt: new Date().toISOString(),
        });
      }
    }
  },
};
