// Live-source routes: ACLED (OAuth) and UCDP (access token). Credentials stay server-side in environment variables.
import type { Express, Request, Response } from 'express';
import {
  ACLED_DATASET_ID,
  UCDP_DATASET_ID,
  RawAcledRow,
  RawUcdpRow,
  normalizeAcledRows,
  normalizeUcdpRows,
} from '../utils/liveNormalizers';

const ACLED_BASE = process.env.ACLED_BASE_URL || 'https://acleddata.com';
const UCDP_BASE = process.env.UCDP_BASE_URL || 'https://ucdpapi.pcr.uu.se/api';
const CACHE_TTL_MS = Number(process.env.LIVE_CACHE_TTL_MS) || 30 * 60 * 1000;

const acledConfigured = () => !!(process.env.ACLED_EMAIL && process.env.ACLED_PASSWORD);
const ucdpConfigured = () => !!process.env.UCDP_ACCESS_TOKEN;

let acledToken: { value: string; expiresAt: number } | null = null;
const responseCache = new Map<string, { at: number; body: unknown }>();

async function getAcledToken(): Promise<string> {
  if (acledToken && acledToken.expiresAt > Date.now() + 60_000) return acledToken.value;
  const body = new URLSearchParams({
    username: process.env.ACLED_EMAIL || '',
    password: process.env.ACLED_PASSWORD || '',
    grant_type: 'password',
    client_id: 'acled',
    scope: 'authenticated',
  });
  const resp = await fetch(`${ACLED_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!resp.ok) throw new Error(`ACLED login failed (HTTP ${resp.status}). Check ACLED_EMAIL and ACLED_PASSWORD.`);
  const json: any = await resp.json();
  if (!json.access_token) throw new Error('ACLED login returned no access token.');
  acledToken = { value: json.access_token, expiresAt: Date.now() + (Number(json.expires_in) || 86400) * 1000 };
  return acledToken.value;
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

async function fetchAcled(params: { country?: string; days: number; limit: number }): Promise<RawAcledRow[]> {
  const token = await getAcledToken();
  const to = new Date();
  const from = new Date(Date.now() - params.days * 86_400_000);
  const rows: RawAcledRow[] = [];
  // ACLED filters are exact-match per request, so Protests and Riots are fetched separately.
  for (const eventType of ['Protests', 'Riots']) {
    const qs = new URLSearchParams({
      _format: 'json',
      event_type: eventType,
      event_date: `${isoDay(from)}|${isoDay(to)}`,
      event_date_where: 'BETWEEN',
      limit: String(params.limit),
    });
    if (params.country) qs.set('country', params.country);
    const resp = await fetch(`${ACLED_BASE}/api/acled/read?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (resp.status === 401 || resp.status === 403) {
      acledToken = null;
      throw new Error(`ACLED refused the request (HTTP ${resp.status}). Your account may not have API access for this data.`);
    }
    if (!resp.ok) throw new Error(`ACLED API error (HTTP ${resp.status}).`);
    const json: any = await resp.json();
    if (Array.isArray(json?.data)) rows.push(...json.data);
  }
  return rows;
}

async function fetchUcdp(params: { country?: string; days: number; version: string; maxPages: number }): Promise<RawUcdpRow[]> {
  const from = isoDay(new Date(Date.now() - params.days * 86_400_000));
  const rows: RawUcdpRow[] = [];
  let totalPages = 1;
  for (let page = 0; page < Math.min(totalPages, params.maxPages); page++) {
    const qs = new URLSearchParams({ pagesize: '1000', page: String(page), StartDate: from });
    if (params.country) qs.set('Country', params.country);
    const resp = await fetch(`${UCDP_BASE}/gedevents/${encodeURIComponent(params.version)}?${qs.toString()}`, {
      headers: { 'x-ucdp-access-token': process.env.UCDP_ACCESS_TOKEN || '', Accept: 'application/json' },
    });
    if (resp.status === 401 || resp.status === 403) {
      throw new Error('UCDP refused the access token. Check UCDP_ACCESS_TOKEN.');
    }
    if (!resp.ok) throw new Error(`UCDP API error (HTTP ${resp.status}) on version ${params.version}.`);
    const json: any = await resp.json();
    totalPages = Number(json?.TotalPages) || 1;
    if (Array.isArray(json?.Result)) rows.push(...json.Result);
  }
  return rows;
}

export function registerLiveRoutes(app: Express) {
  app.get('/api/live/status', (_req: Request, res: Response) => {
    res.json({
      acled: { configured: acledConfigured() },
      ucdp: { configured: ucdpConfigured(), version: process.env.UCDP_GED_VERSION || '26.0.9' },
    });
  });

  app.get('/api/acled/events', async (req: Request, res: Response) => {
    if (!acledConfigured()) {
      return res.status(503).json({
        connectionStatus: 'not_configured',
        error: 'ACLED is not configured. Set ACLED_EMAIL and ACLED_PASSWORD on the server.',
      });
    }
    const days = Math.min(Math.max(Number(req.query.days) || 90, 1), 365);
    const limit = Math.min(Math.max(Number(req.query.limit) || 5000, 1), 5000);
    const country = String(req.query.country || '').trim() || undefined;
    const key = `acled:${country || ''}:${days}:${limit}`;
    const hit = responseCache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return res.json(hit.body);
    try {
      const raw = await fetchAcled({ country, days, limit });
      const now = new Date().toISOString();
      const body = {
        connectionStatus: 'connected',
        datasetId: ACLED_DATASET_ID,
        retrievalTimestamp: now,
        rawCount: raw.length,
        records: normalizeAcledRows(raw, now),
      };
      responseCache.set(key, { at: Date.now(), body });
      res.json(body);
    } catch (err: any) {
      res.status(502).json({ connectionStatus: 'error', error: err?.message || 'ACLED request failed.' });
    }
  });

  app.get('/api/ucdp/events', async (req: Request, res: Response) => {
    if (!ucdpConfigured()) {
      return res.status(503).json({
        connectionStatus: 'not_configured',
        error: 'UCDP is not configured. Set UCDP_ACCESS_TOKEN on the server.',
      });
    }
    const days = Math.min(Math.max(Number(req.query.days) || 180, 1), 730);
    const country = String(req.query.country || '').trim() || undefined;
    const version = String(req.query.version || process.env.UCDP_GED_VERSION || '26.0.9');
    const key = `ucdp:${country || ''}:${days}:${version}`;
    const hit = responseCache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return res.json(hit.body);
    try {
      const raw = await fetchUcdp({ country, days, version, maxPages: 5 });
      const now = new Date().toISOString();
      const body = {
        connectionStatus: 'connected',
        datasetId: UCDP_DATASET_ID,
        retrievalTimestamp: now,
        version,
        rawCount: raw.length,
        records: normalizeUcdpRows(raw, now, version),
      };
      responseCache.set(key, { at: Date.now(), body });
      res.json(body);
    } catch (err: any) {
      res.status(502).json({ connectionStatus: 'error', error: err?.message || 'UCDP request failed.' });
    }
  });
}
