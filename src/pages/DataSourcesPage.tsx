import React, { useState, useRef } from 'react';
import {
  Upload,
  ExternalLink,
  Check,
  AlertTriangle,
  Database,
  Trash2,
  RefreshCw,
  FileSpreadsheet,
} from 'lucide-react';
import { useResearch } from '../context/ResearchContext';
import {
  DatasetMetadata,
  FieldMappingConfig,
  ImportPreviewReport,
} from '../types/research';
import { ResearchRepository } from '../services/researchStorage';
import {
  buildImportPreview,
  normalizeRowsToEventRecords,
} from '../utils/csvNormalizer';

const MAPPABLE_SINGLE_FIELDS: Array<{ key: keyof FieldMappingConfig; label: string }> = [
  { key: 'sourceRecordId', label: 'Original Record ID' },
  { key: 'eventName', label: 'Event / Campaign Name' },
  { key: 'countryName', label: 'Country Name' },
  { key: 'countryIsoOrCode', label: 'Country ISO / Numeric Code' },
  { key: 'region', label: 'World Region' },
  { key: 'eventDate', label: 'Full Event Date (if single column)' },
  { key: 'startYear', label: 'Start Year / Year' },
  { key: 'startMonth', label: 'Start Month' },
  { key: 'startDay', label: 'Start Day' },
  { key: 'endYear', label: 'End Year' },
  { key: 'protestBinaryFlag', label: 'Active Protest Flag (e.g. protest=1/0)' },
  { key: 'locationName', label: 'Sub-national Locality Name' },
  { key: 'latitude', label: 'Latitude (Decimal Degrees)' },
  { key: 'longitude', label: 'Longitude (Decimal Degrees)' },
  { key: 'participants', label: 'Participant Count / Scale' },
  { key: 'participantsCategory', label: 'Participant Scale Category' },
  { key: 'protesterIdentity', label: 'Participant / Group Identity' },
  { key: 'protesterViolence', label: 'Participant Violence Indicator' },
  { key: 'primaryMethod', label: 'Primary Campaign Method (NAVCO)' },
  { key: 'campaignOutcome', label: 'Campaign Outcome Column' },
  { key: 'fatalities', label: 'Reported Fatalities (Numeric)' },
  { key: 'injuries', label: 'Reported Injuries (Numeric)' },
  { key: 'arrests', label: 'Reported Arrests (Numeric)' },
  { key: 'missingPersons', label: 'Missing Persons (Numeric)' },
  { key: 'displacedPersons', label: 'Displaced Persons (Numeric)' },
  { key: 'sourceCitation', label: 'Primary Source Citation Column' },
  { key: 'sourceNotes', label: 'Notes / Narrative Column' },
];

export const DataSourcesPage: React.FC = () => {
  const {
    datasets,
    rawArchives,
    refreshAllLocalData,
    removeImportedDataset,
    liveStatus,
    liveSync,
    syncLiveSource,
    fetchNewsLeads,
    newsStatus,
  } = useResearch();

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [targetDatasetId, setTargetDatasetId] = useState<string>('mass_mobilization');
  const [customDatasetName, setCustomDatasetName] = useState<string>('');
  const [customSourceUrl, setCustomSourceUrl] = useState<string>('');
  const [customLicence, setCustomLicence] = useState<string>('Academic / Attribution');

  const [stagingId, setStagingId] = useState<string | null>(null);
  const [stagedRawText, setStagedRawText] = useState<string | null>(null);
  const [previewReport, setPreviewReport] = useState<ImportPreviewReport | null>(null);
  const [mapping, setMapping] = useState<FieldMappingConfig>({
    demandColumns: [],
    stateResponseColumns: [],
  });

  const [loadingPreview, setLoadingPreview] = useState<boolean>(false);
  const [loadingDataverseId, setLoadingDataverseId] = useState<string | null>(null);
  const [confirmingImport, setConfirmingImport] = useState<boolean>(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccessMessage, setImportSuccessMessage] = useState<string | null>(null);
  const [overwriteConfirmed, setOverwriteConfirmed] = useState<boolean>(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const selectedDatasetMeta = datasets.find((d) => d.id === targetDatasetId);
  const existingRecordCount = selectedDatasetMeta?.loadedRecordCount || 0;

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoadingPreview(true);
    setImportError(null);
    setImportSuccessMessage(null);
    setOverwriteConfirmed(false);

    try {
      const text = await file.text();
      setStagedRawText(text);

      // Run preview via backend API with local fallback for resilience
      try {
        const resp = await fetch('/api/import/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rawText: text,
            fileName: file.name,
          }),
        });
        const data = await resp.json();
        if (resp.ok && data.preview) {
          setStagingId(data.stagingId || null);
          setPreviewReport(data.preview);
          setMapping(data.preview.suggestedMapping);
          if (data.preview.datasetPreset === 'mass_mobilization') {
            setTargetDatasetId('mass_mobilization');
          } else if (data.preview.datasetPreset === 'navco') {
            setTargetDatasetId('navco');
          }
          return;
        }
      } catch {
        // Fallback to local parser if payload exceeds proxy limits
      }

      const localPreview = buildImportPreview(text, file.name);
      setStagingId(null);
      setPreviewReport(localPreview);
      setMapping(localPreview.suggestedMapping);
      if (localPreview.datasetPreset === 'mass_mobilization') {
        setTargetDatasetId('mass_mobilization');
      } else if (localPreview.datasetPreset === 'navco') {
        setTargetDatasetId('navco');
      }
    } catch (err: any) {
      setImportError(err?.message || 'Failed to read or parse the selected CSV/TSV file.');
    } finally {
      setLoadingPreview(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDataverseDirectPreview = async (datasetId: 'mass_mobilization' | 'navco') => {
    setLoadingDataverseId(datasetId);
    setImportError(null);
    setImportSuccessMessage(null);
    setOverwriteConfirmed(false);
    setTargetDatasetId(datasetId);

    try {
      const resp = await fetch('/api/import/dataverse-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datasetId }),
      });
      const data = await resp.json();
      if (!resp.ok || data.error) {
        throw new Error(
          data.error ||
            'Direct Harvard Dataverse download unavailable. Please download the file from the official DOI link and upload it manually below.'
        );
      }
      setStagingId(data.stagingId);
      setStagedRawText(null);
      setPreviewReport(data.preview);
      setMapping(data.preview.suggestedMapping);
    } catch (err: any) {
      setImportError(err?.message || 'Unable to fetch dataset from Harvard Dataverse.');
    } finally {
      setLoadingDataverseId(null);
    }
  };

  const handleSingleMappingChange = (field: keyof FieldMappingConfig, colName: string) => {
    setMapping((prev) => ({
      ...prev,
      [field]: colName || undefined,
    }));
  };

  const toggleMultiColumn = (
    listKey: 'demandColumns' | 'stateResponseColumns',
    colName: string
  ) => {
    setMapping((prev) => {
      const current = prev[listKey] || [];
      const exists = current.includes(colName);
      return {
        ...prev,
        [listKey]: exists ? current.filter((c) => c !== colName) : [...current, colName],
      };
    });
  };

  const handleConfirmImport = async () => {
    if (!previewReport) return;
    if (existingRecordCount > 0 && !overwriteConfirmed) {
      setImportError(
        'This dataset already contains imported records in IndexedDB. Please confirm overwrite below before saving.'
      );
      return;
    }

    setConfirmingImport(true);
    setImportError(null);

    const effectiveId =
      targetDatasetId === 'custom'
        ? `custom_${(customDatasetName || previewReport.fileName)
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '_')
            .slice(0, 24)}`
        : targetDatasetId;

    const baseDs = datasets.find((d) => d.id === effectiveId);
    const datasetName =
      targetDatasetId === 'custom'
        ? customDatasetName.trim() || previewReport.fileName
        : baseDs?.datasetName || effectiveId;
    const sourceName = baseDs?.provider || 'Researcher-Uploaded Public Dataset';
    const sourceUrl =
      targetDatasetId === 'custom' ? customSourceUrl.trim() : baseDs?.sourceUrl || '';
    const licence =
      targetDatasetId === 'custom' ? customLicence.trim() : baseDs?.licence || 'See source';

    try {
      let normalizedRecords = [];
      let retrievalTimestamp = new Date().toISOString();

      if (stagingId) {
        const resp = await fetch('/api/import/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stagingId,
            datasetId: effectiveId,
            datasetName,
            sourceName,
            sourceUrl,
            licence,
            preset: previewReport.datasetPreset,
            mapping,
            replaceExisting: true,
          }),
        });
        const data = await resp.json();
        if (!resp.ok || data.error) {
          throw new Error(data.error || 'Server import confirmation failed.');
        }
        normalizedRecords = data.records;
        retrievalTimestamp = data.retrievalTimestamp;
      } else if (stagedRawText) {
        normalizedRecords = normalizeRowsToEventRecords({
          rawText: stagedRawText,
          datasetId: effectiveId,
          datasetName,
          sourceName,
          sourceUrl,
          licence,
          preset: previewReport.datasetPreset,
          mapping,
          retrievalTimestamp,
        });
      } else {
        throw new Error('Staged data no longer available. Please preview the file again.');
      }

      const activeCount = normalizedRecords.filter(
        (r: any) => !r.isBaselineZeroProtestRow
      ).length;

      const updatedMeta: DatasetMetadata = baseDs
        ? {
            ...baseDs,
            connectionStatus: 'connected',
            lastSuccessfulRetrieval: retrievalTimestamp,
            lastError: null,
            loadedRecordCount: activeCount,
          }
        : {
            id: effectiveId,
            datasetName,
            provider: sourceName,
            sourceUrl,
            downloadUrl: sourceUrl,
            citation: `${datasetName} (${previewReport.fileName})`,
            licence,
            coverageStart: previewReport.validationSummary.yearMin
              ? String(previewReport.validationSummary.yearMin)
              : 'Unspecified',
            coverageEnd: previewReport.validationSummary.yearMax
              ? String(previewReport.validationSummary.yearMax)
              : 'Unspecified',
            dataType: 'Historical dataset record',
            unitOfObservation: 'Researcher-imported CSV/TSV observation',
            retrievalMethod: 'Local CSV/TSV file import to IndexedDB',
            updateFrequency: 'Manual upload',
            knownLimitations: [
              'Custom imported dataset; consult original codebook for sampling criteria.',
            ],
            connectionStatus: 'connected',
            lastSuccessfulRetrieval: retrievalTimestamp,
            lastError: null,
            loadedRecordCount: activeCount,
          };

      await ResearchRepository.saveImportedDatasetRecords({
        datasetMeta: updatedMeta,
        rawArchive: {
          datasetId: effectiveId,
          fileName: previewReport.fileName,
          delimiter: previewReport.delimiter,
          headers: previewReport.headers,
          rawRowCount: previewReport.totalRows,
          importedAt: retrievalTimestamp,
          sampleRawRows: previewReport.sampleRows,
        },
        records: normalizedRecords,
        replaceExisting: true,
      });

      await refreshAllLocalData();

      setImportSuccessMessage(
        `Saved ${normalizedRecords.length.toLocaleString()} total rows (${activeCount.toLocaleString()} active event/campaign records) from "${previewReport.fileName}" into persistent IndexedDB storage.`
      );
      setPreviewReport(null);
      setStagingId(null);
      setStagedRawText(null);
      setOverwriteConfirmed(false);
    } catch (err: any) {
      setImportError(err?.message || 'Failed to save normalized dataset to IndexedDB.');
    } finally {
      setConfirmingImport(false);
    }
  };

  const primarySources = datasets.filter((d) => !d.isFutureRegistryOnly);
  const futureSources = datasets.filter((d) => d.isFutureRegistryOnly);

  return (
    <div className="space-y-12">
      {/* Header */}
      <header className="border-b border-[#E4E2DC] pb-6">
        <div className="text-xs text-[#525866] mb-2">
          <span>Source Registry &amp; Dataset Ingestion</span>
          <span className="mx-2" aria-hidden="true">·</span>
          <span>IndexedDB Persistent Research Storage</span>
        </div>
        <h1 className="text-3xl lg:text-4xl font-semibold text-[#0F1E36] tracking-tight">
          Data Sources &amp; Schema Verification
        </h1>
        <p className="mt-3 text-base text-[#525866] max-w-3xl leading-relaxed">
          Generation Watch relies exclusively on documented academic repositories, international
          statistical agencies, and transparent news-discovery indices. Every imported record
          retains its original fields, citation metadata, and methodological boundaries.
        </p>
      </header>

      {/* Live feeds: ACLED and UCDP */}
      <section className="bg-white border border-[#E4E2DC] p-6 lg:p-8 space-y-5">
        <div className="max-w-3xl">
          <h2 className="text-xl font-semibold text-[#0F1E36]">Live Event Feeds: ACLED &amp; UCDP</h2>
          <p className="text-sm text-[#525866] mt-1.5 leading-relaxed">
            ACLED supplies the latest protest and riot events (last 90 days). UCDP supplies lethal armed-violence
            events as conflict context (last 180 days) and is kept out of protest counts. Both need your own credentials
            set as server environment variables; they are never sent to the browser.
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          {([
            { id: 'acled' as const, name: 'ACLED', configured: liveStatus?.acled.configured, needs: 'ACLED_EMAIL and ACLED_PASSWORD (free myACLED account)' },
            { id: 'ucdp_ged' as const, name: 'UCDP GED / Candidate', configured: liveStatus?.ucdp.configured, needs: 'UCDP_ACCESS_TOKEN (request by email from UCDP)' },
          ]).map((src) => {
            const state = liveSync[src.id];
            const meta = datasets.find((d) => d.id === src.id);
            return (
              <div key={src.id} className="border border-[#E4E2DC] bg-[#F8F7F4] p-4 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <strong className="text-sm text-[#0F1E36]">{src.name}</strong>
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${src.configured ? 'bg-[#E7F5EC] text-[#14532D]' : 'bg-[#F1EFEA] text-[#525866]'}`}>
                    {src.configured ? 'Credentials set' : 'Not configured'}
                  </span>
                </div>
                <div className="text-xs text-[#525866]">
                  {meta?.loadedRecordCount ? `${meta.loadedRecordCount.toLocaleString()} records loaded` : 'No records loaded'}
                  {meta?.lastSuccessfulRetrieval ? ` · last sync ${meta.lastSuccessfulRetrieval.slice(0, 16).replace('T', ' ')} UTC` : ''}
                </div>
                {!src.configured && <div className="text-xs text-[#525866]">Needs {src.needs} on the server.</div>}
                {state.error && <div className="text-xs text-[#7D2021]">{state.error}</div>}
                {state.message && <div className="text-xs text-[#14532D]">{state.message}</div>}
                <button
                  type="button"
                  onClick={() => syncLiveSource(src.id)}
                  disabled={state.loading || !src.configured}
                  className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-white bg-[#0F1E36] hover:bg-[#1E3252] rounded disabled:opacity-40 cursor-pointer"
                >
                  {state.loading ? 'Syncing…' : 'Sync now'}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* CSV / TSV Import & Schema Mapping Studio */}
      <section className="bg-white border border-[#E4E2DC] p-6 lg:p-8 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 border-b border-[#E4E2DC] pb-6">
          <div className="max-w-2xl">
            <h2 className="text-xl font-semibold text-[#0F1E36]">
              Import Historical Research Dataset (CSV / TSV / TAB)
            </h2>
            <p className="text-sm text-[#525866] mt-1.5 leading-relaxed">
              Upload an authentic CSV or tab-delimited (<code>.tab</code> / <code>.tsv</code>) file
              downloaded from Harvard Dataverse or Harvard Ash Center—or load the public repository
              file directly into the schema inspector below to verify headers, missing values, and
              column mappings before saving to IndexedDB.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,.tab,.txt"
              onChange={handleFileSelected}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={loadingPreview || !!loadingDataverseId}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-white bg-[#0F1E36] hover:bg-[#1E3252] rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              <Upload className="w-4 h-4" />
              <span>{loadingPreview ? 'Inspecting File...' : 'Upload Local CSV / TSV File'}</span>
            </button>

            <button
              type="button"
              onClick={() => handleDataverseDirectPreview('navco')}
              disabled={loadingPreview || !!loadingDataverseId}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-[#0F1E36] bg-[#F1EFEA] hover:bg-[#E4E2DC] border border-[#CFCBC2] rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              <Database className="w-4 h-4" />
              <span>
                {loadingDataverseId === 'navco'
                  ? 'Fetching NAVCO 1.3...'
                  : 'Inspect Official NAVCO 1.3 (Harvard Dataverse)'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleDataverseDirectPreview('mass_mobilization')}
              disabled={loadingPreview || !!loadingDataverseId}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-[#0F1E36] bg-[#F1EFEA] hover:bg-[#E4E2DC] border border-[#CFCBC2] rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              <Database className="w-4 h-4" />
              <span>
                {loadingDataverseId === 'mass_mobilization'
                  ? 'Fetching Mass Mobilization (15.6 MB)...'
                  : 'Inspect Official Mass Mobilization (CC0)'}
              </span>
            </button>
          </div>
        </div>

        {importError && (
          <div className="bg-[#FDF2F2] border border-[#9E2A2B]/40 p-4 flex items-start gap-3 text-xs text-[#7D2021]">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <strong className="font-semibold">Import Notice:</strong> {importError}
            </div>
          </div>
        )}

        {importSuccessMessage && (
          <div className="bg-[#F0FDF4] border border-[#166534]/30 p-4 flex items-start gap-3 text-xs text-[#14532D]">
            <Check className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <strong className="font-semibold">Import Complete:</strong> {importSuccessMessage}
            </div>
          </div>
        )}

        {/* Interactive Preview, Validation & Field Mapping Workbench */}
        {previewReport && (
          <div className="space-y-6 pt-2">
            <div className="bg-[#F8F7F4] border border-[#E4E2DC] p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-xs text-[#525866]">
                    <span>Staged File: </span>
                    <strong className="font-mono text-[#0F1E36]">{previewReport.fileName}</strong>
                    <span className="mx-2">·</span>
                    <span>Delimiter: </span>
                    <strong className="font-mono text-[#0F1E36]">{previewReport.delimiter}</strong>
                    <span className="mx-2">·</span>
                    <span>Detected Schema: </span>
                    <strong className="text-[#9E2A2B]">{previewReport.datasetPreset}</strong>
                  </div>
                  <h3 className="text-base font-semibold text-[#0F1E36] mt-1">
                    Pre-Import Schema &amp; Data-Quality Inspection
                  </h3>
                </div>

                <div className="flex items-center gap-3">
                  <label className="text-xs font-medium text-[#525866]">Target Registry Slot:</label>
                  <select
                    value={targetDatasetId}
                    onChange={(e) => setTargetDatasetId(e.target.value)}
                    className="border border-[#CFCBC2] bg-white px-3 py-1.5 text-xs text-[#0F1E36]"
                  >
                    <option value="mass_mobilization">
                      Harvard Mass Mobilization (1990–March 2020)
                    </option>
                    <option value="navco">Harvard NAVCO Resistance Campaigns (1900–2021)</option>
                    <option value="custom">Custom Public Academic Dataset</option>
                  </select>
                </div>
              </div>

              {targetDatasetId === 'custom' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-[#E4E2DC]">
                  <div>
                    <label className="block text-xs text-[#525866] mb-1">Dataset Name</label>
                    <input
                      type="text"
                      value={customDatasetName}
                      onChange={(e) => setCustomDatasetName(e.target.value)}
                      placeholder="e.g. Regional Labour Strikes Archive"
                      className="w-full border border-[#CFCBC2] bg-white px-3 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#525866] mb-1">Official Source URL</label>
                    <input
                      type="url"
                      value={customSourceUrl}
                      onChange={(e) => setCustomSourceUrl(e.target.value)}
                      placeholder="https://..."
                      className="w-full border border-[#CFCBC2] bg-white px-3 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#525866] mb-1">Licence / Terms</label>
                    <input
                      type="text"
                      value={customLicence}
                      onChange={(e) => setCustomLicence(e.target.value)}
                      className="w-full border border-[#CFCBC2] bg-white px-3 py-1.5 text-xs"
                    />
                  </div>
                </div>
              )}

              {/* Validation Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2">
                <div className="bg-white border border-[#E4E2DC] p-3">
                  <div className="text-[11px] text-[#525866]">Total Parsed Rows</div>
                  <div className="text-base font-mono font-semibold text-[#0F1E36] tabular-nums mt-0.5">
                    {previewReport.totalRows.toLocaleString()}
                  </div>
                </div>
                <div className="bg-white border border-[#E4E2DC] p-3">
                  <div className="text-[11px] text-[#525866]">Detected Columns</div>
                  <div className="text-base font-mono font-semibold text-[#0F1E36] tabular-nums mt-0.5">
                    {previewReport.headers.length}
                  </div>
                </div>
                <div className="bg-white border border-[#E4E2DC] p-3">
                  <div className="text-[11px] text-[#525866]">Observed Year Span</div>
                  <div className="text-base font-mono font-semibold text-[#0F1E36] tabular-nums mt-0.5">
                    {previewReport.validationSummary.yearMin &&
                    previewReport.validationSummary.yearMax
                      ? `${previewReport.validationSummary.yearMin}–${previewReport.validationSummary.yearMax}`
                      : 'N/A'}
                  </div>
                </div>
                <div className="bg-white border border-[#E4E2DC] p-3">
                  <div className="text-[11px] text-[#525866]">Missing Country Rows</div>
                  <div className="text-base font-mono font-semibold text-[#0F1E36] tabular-nums mt-0.5">
                    {previewReport.validationSummary.missingCountryCount.toLocaleString()}
                  </div>
                </div>
                <div className="bg-white border border-[#E4E2DC] p-3">
                  <div className="text-[11px] text-[#525866]">Missing Date/Year</div>
                  <div className="text-base font-mono font-semibold text-[#0F1E36] tabular-nums mt-0.5">
                    {previewReport.validationSummary.missingDateOrYearCount.toLocaleString()}
                  </div>
                </div>
                <div className="bg-white border border-[#E4E2DC] p-3">
                  <div className="text-[11px] text-[#525866]">Duplicate Record IDs</div>
                  <div className="text-base font-mono font-semibold text-[#0F1E36] tabular-nums mt-0.5">
                    {previewReport.validationSummary.duplicateRecordIdCount.toLocaleString()}
                  </div>
                </div>
              </div>

              {previewReport.validationSummary.typeWarnings.length > 0 && (
                <div className="space-y-1 pt-2">
                  <div className="text-xs font-semibold text-[#0F1E36]">
                    Methodological &amp; Validation Notes:
                  </div>
                  <ul className="list-disc list-inside text-xs text-[#525866] space-y-1">
                    {previewReport.validationSummary.typeWarnings.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Column Mapping Controls */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-[#0F1E36]">
                Map Source Columns to Internal Research Schema ({previewReport.headers.length}{' '}
                columns inspected)
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {MAPPABLE_SINGLE_FIELDS.map((field) => {
                  const currentVal = (mapping[field.key] as string | undefined) || '';
                  return (
                    <div key={field.key} className="border border-[#E4E2DC] p-2.5 bg-[#F8F7F4]">
                      <label className="block text-[11px] font-medium text-[#525866] mb-1">
                        {field.label}
                      </label>
                      <select
                        value={currentVal}
                        onChange={(e) => handleSingleMappingChange(field.key, e.target.value)}
                        className="w-full border border-[#CFCBC2] bg-white px-2 py-1 text-xs font-mono text-[#1C1F26]"
                      >
                        <option value="">— Not in source —</option>
                        {previewReport.headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>

              {/* Multi-column selectors for demands & state responses */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="border border-[#E4E2DC] p-3.5">
                  <div className="text-xs font-semibold text-[#0F1E36] mb-2">
                    Demand / Objective Columns (Multi-select)
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {previewReport.headers.map((h) => {
                      const checked = mapping.demandColumns.includes(h);
                      return (
                        <button
                          key={h}
                          type="button"
                          onClick={() => toggleMultiColumn('demandColumns', h)}
                          className={`px-2.5 py-1 text-xs font-mono border rounded transition-colors cursor-pointer ${
                            checked
                              ? 'bg-[#0F1E36] text-white border-[#0F1E36]'
                              : 'bg-white text-[#525866] border-[#CFCBC2] hover:border-[#0F1E36]'
                          }`}
                        >
                          {h}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="border border-[#E4E2DC] p-3.5">
                  <div className="text-xs font-semibold text-[#0F1E36] mb-2">
                    State / Institutional Response Columns (Multi-select)
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {previewReport.headers.map((h) => {
                      const checked = mapping.stateResponseColumns.includes(h);
                      return (
                        <button
                          key={h}
                          type="button"
                          onClick={() => toggleMultiColumn('stateResponseColumns', h)}
                          className={`px-2.5 py-1 text-xs font-mono border rounded transition-colors cursor-pointer ${
                            checked
                              ? 'bg-[#0F1E36] text-white border-[#0F1E36]'
                              : 'bg-white text-[#525866] border-[#CFCBC2] hover:border-[#0F1E36]'
                          }`}
                        >
                          {h}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Preview Table */}
            <div>
              <h4 className="text-sm font-semibold text-[#0F1E36] mb-2">
                Source Row Preview (First {previewReport.sampleRows.length} rows — original values
                preserved)
              </h4>
              <div className="border border-[#E4E2DC] overflow-x-auto max-h-72">
                <table className="w-full text-xs border-collapse">
                  <thead className="bg-[#F1EFEA] sticky top-0">
                    <tr>
                      {previewReport.headers.map((h) => (
                        <th
                          key={h}
                          className="text-left px-3 py-2 font-mono font-semibold text-[#0F1E36] border-b border-[#CFCBC2] whitespace-nowrap"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E4E2DC] bg-white">
                    {previewReport.sampleRows.map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-[#F8F7F4]">
                        {previewReport.headers.map((h) => (
                          <td
                            key={h}
                            className="px-3 py-2 font-mono text-[#1C1F26] max-w-[220px] truncate"
                            title={row[h] || ''}
                          >
                            {row[h] !== undefined && row[h] !== '' ? (
                              row[h]
                            ) : (
                              <span className="text-[#767D8C] italic">null</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Overwrite guard & Confirmation */}
            <div className="bg-[#F8F7F4] border border-[#E4E2DC] p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                {existingRecordCount > 0 ? (
                  <label className="inline-flex items-center gap-2 text-xs text-[#9E2A2B] font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={overwriteConfirmed}
                      onChange={(e) => setOverwriteConfirmed(e.target.checked)}
                      className="accent-[#9E2A2B]"
                    />
                    <span>
                      Overwrite confirmation: Replace {existingRecordCount.toLocaleString()}{' '}
                      currently stored records in "{selectedDatasetMeta?.datasetName}"
                    </span>
                  </label>
                ) : (
                  <span className="text-xs text-[#525866]">
                    All {previewReport.totalRows.toLocaleString()} source rows and raw column values
                    will be retained locally in IndexedDB.
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setPreviewReport(null);
                    setStagingId(null);
                    setStagedRawText(null);
                  }}
                  className="px-4 py-2 text-xs font-medium text-[#525866] hover:text-[#0F1E36] cursor-pointer whitespace-nowrap"
                >
                  Cancel Preview
                </button>
                <button
                  type="button"
                  onClick={handleConfirmImport}
                  disabled={confirmingImport}
                  className="px-5 py-2.5 text-xs font-medium text-white bg-[#9E2A2B] hover:bg-[#7D2021] rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50"
                >
                  {confirmingImport
                    ? 'Normalising & Saving to IndexedDB...'
                    : `Confirm & Import ${previewReport.totalRows.toLocaleString()} Rows`}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Primary Data Source Registry Cards */}
      <section className="space-y-6">
        <div className="flex items-baseline justify-between border-b border-[#E4E2DC] pb-3">
          <h2 className="text-2xl font-semibold text-[#0F1E36]">
            01. Primary Authenticated Research Sources
          </h2>
          <span className="text-xs text-[#525866] font-mono tabular-nums">
            {primarySources.length} Core Integrations
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {primarySources.map((ds) => {
            const rawArch = rawArchives.find((a) => a.datasetId === ds.id);
            return (
              <article
                key={ds.id}
                className="bg-white border border-[#E4E2DC] p-6 flex flex-col justify-between space-y-5"
              >
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#525866]">
                    <span>
                      Status:{' '}
                      <strong
                        className={
                          ds.connectionStatus === 'connected'
                            ? 'text-[#14532D]'
                            : ds.connectionStatus === 'rate_limited' ||
                                ds.connectionStatus === 'error'
                              ? 'text-[#9E2A2B]'
                              : 'text-[#0F1E36]'
                        }
                      >
                        {ds.connectionStatus === 'connected'
                          ? 'Connected / Data Loaded'
                          : ds.connectionStatus === 'rate_limited'
                            ? 'Rate Limited Upstream (429)'
                            : ds.connectionStatus === 'error'
                              ? 'Connection Error'
                              : 'Ready for CSV Import / Query'}
                      </strong>
                    </span>
                    <span className="font-mono tabular-nums">
                      Coverage: {ds.coverageStart} – {ds.coverageEnd}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-xl font-semibold text-[#0F1E36]">{ds.datasetName}</h3>
                    <div className="text-xs text-[#525866] mt-0.5">{ds.provider}</div>
                  </div>

                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs border-y border-[#E4E2DC] py-4">
                    <div>
                      <dt className="text-[#525866]">Data Classification</dt>
                      <dd className="font-medium text-[#1C1F26] mt-0.5">{ds.dataType}</dd>
                    </div>
                    <div>
                      <dt className="text-[#525866]">Licence &amp; Terms</dt>
                      <dd className="font-medium text-[#1C1F26] mt-0.5">{ds.licence}</dd>
                    </div>
                    <div>
                      <dt className="text-[#525866]">Retrieval Method</dt>
                      <dd className="text-[#1C1F26] mt-0.5">{ds.retrievalMethod}</dd>
                    </div>
                    <div>
                      <dt className="text-[#525866]">Update Frequency</dt>
                      <dd className="text-[#1C1F26] mt-0.5">{ds.updateFrequency}</dd>
                    </div>
                    <div>
                      <dt className="text-[#525866]">Last Successful Retrieval</dt>
                      <dd className="font-mono text-[#1C1F26] mt-0.5 tabular-nums">
                        {ds.lastSuccessfulRetrieval
                          ? `${ds.lastSuccessfulRetrieval.slice(0, 19).replace('T', ' ')} UTC`
                          : 'No retrieval in current workspace yet'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[#525866]">Loaded Workspace Records</dt>
                      <dd className="font-mono font-semibold text-[#0F1E36] mt-0.5 tabular-nums">
                        {ds.loadedRecordCount > 0
                          ? `${ds.loadedRecordCount.toLocaleString()} records`
                          : '0 loaded'}
                        {rawArch && (
                          <span className="font-normal text-[#525866]">
                            {' '}
                            ({rawArch.fileName})
                          </span>
                        )}
                      </dd>
                    </div>
                  </dl>

                  <div>
                    <div className="text-xs font-semibold text-[#0F1E36] mb-1">
                      Unit of Observation
                    </div>
                    <p className="text-xs text-[#525866] leading-relaxed">{ds.unitOfObservation}</p>
                  </div>

                  <div>
                    <div className="text-xs font-semibold text-[#0F1E36] mb-1">
                      Documented Limitations
                    </div>
                    <ul className="list-disc list-inside text-xs text-[#525866] space-y-1 leading-relaxed">
                      {ds.knownLimitations.map((lim, i) => (
                        <li key={i}>{lim}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="bg-[#F8F7F4] border border-[#E4E2DC] p-3 text-[11px] text-[#525866]">
                    <strong className="text-[#0F1E36]">Citation:</strong> {ds.citation}
                  </div>
                </div>

                <div className="pt-3 border-t border-[#E4E2DC] flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-4">
                    <a
                      href={ds.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-[#0F1E36] hover:text-[#9E2A2B] underline"
                    >
                      <span>Official Project / DOI</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    {ds.downloadUrl && ds.downloadUrl !== ds.sourceUrl && (
                      <a
                        href={ds.downloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-[#525866] hover:text-[#0F1E36] underline"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                        <span>Direct File / API Endpoint</span>
                      </a>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {ds.id === 'gdelt_doc_v2' && (
                      <button
                        type="button"
                        onClick={() => fetchNewsLeads()}
                        disabled={newsStatus.loading}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#F1EFEA] hover:bg-[#E4E2DC] text-[#0F1E36] rounded cursor-pointer whitespace-nowrap"
                      >
                        <RefreshCw
                          className={`w-3.5 h-3.5 ${newsStatus.loading ? 'animate-spin' : ''}`}
                        />
                        <span>Test GDELT Query</span>
                      </button>
                    )}

                    {(ds.id === 'mass_mobilization' || ds.id === 'navco') &&
                      ds.loadedRecordCount > 0 &&
                      (confirmDeleteId === ds.id ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={async () => {
                              await removeImportedDataset(ds.id);
                              setConfirmDeleteId(null);
                            }}
                            className="px-2.5 py-1 text-xs font-medium text-white bg-[#9E2A2B] rounded cursor-pointer"
                          >
                            Confirm Clear
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2 py-1 text-xs text-[#525866] cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(ds.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-[#9E2A2B] hover:underline cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Clear Local Data</span>
                        </button>
                      ))}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* Extensible Future Source Registry */}
      <section className="space-y-4">
        <div className="border-b border-[#E4E2DC] pb-3">
          <h2 className="text-xl font-semibold text-[#0F1E36]">
            02. Extensible Public Research Source Registry
          </h2>
          <p className="text-xs text-[#525866] mt-1">
            Prepared in the internal data architecture for manual CSV panel imports; no unverified
            external REST endpoints are assumed.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {futureSources.map((fs) => (
            <div key={fs.id} className="bg-white border border-[#E4E2DC] p-5 space-y-2">
              <div className="text-xs text-[#525866]">
                <span>{fs.provider}</span>
                <span className="mx-2">·</span>
                <span>Coverage: {fs.coverageStart}–{fs.coverageEnd}</span>
              </div>
              <h3 className="text-base font-semibold text-[#0F1E36]">{fs.datasetName}</h3>
              <p className="text-xs text-[#525866] leading-relaxed">{fs.unitOfObservation}</p>
              <p className="text-xs text-[#525866] leading-relaxed">{fs.knownLimitations[0]}</p>
              <div className="pt-2">
                <a
                  href={fs.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#0F1E36] hover:text-[#9E2A2B] underline"
                >
                  <span>Visit Official Repository</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
