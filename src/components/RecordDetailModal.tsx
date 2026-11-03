import React, { useState, useEffect } from 'react';
import { X, ExternalLink, FilePlus2, Check } from 'lucide-react';
import { EventRecord, NewsArticleLead, VerificationStatus } from '../types/research';

interface RecordDetailModalProps {
  eventRecord: EventRecord | null;
  newsLead: NewsArticleLead | null;
  onClose: () => void;
  onSaveVerification: (
    targetId: string,
    targetType: 'event' | 'news',
    status: VerificationStatus,
    notes: string | null
  ) => Promise<void>;
  onNavigateCountry: (iso3: string) => void;
  onCreateMovementStub?: (ev: EventRecord) => void;
}

const VERIFICATION_OPTIONS: Array<{ value: VerificationStatus; label: string; description: string }> = [
  {
    value: 'unverified',
    label: 'Unverified',
    description: 'Initial source record or media lead not yet cross-checked by a researcher.',
  },
  {
    value: 'reviewed',
    label: 'Reviewed',
    description: 'Source record inspected for coding completeness and provenance.',
  },
  {
    value: 'corroborated',
    label: 'Corroborated',
    description: 'Independently corroborated across multiple primary or scholarly sources.',
  },
  {
    value: 'conflicting',
    label: 'Conflicting Accounts',
    description: 'Available primary or institutional reports disagree on key facts or figures.',
  },
];

export const RecordDetailModal: React.FC<RecordDetailModalProps> = ({
  eventRecord,
  newsLead,
  onClose,
  onSaveVerification,
  onNavigateCountry,
  onCreateMovementStub,
}) => {
  const activeItem = eventRecord || newsLead;
  const [status, setStatus] = useState<VerificationStatus>('unverified');
  const [notes, setNotes] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [savedFeedback, setSavedFeedback] = useState<boolean>(false);
  const [showRawFields, setShowRawFields] = useState<boolean>(false);

  useEffect(() => {
    if (eventRecord) {
      setStatus(eventRecord.verificationStatus);
      setNotes(eventRecord.reviewerNotes || '');
      setSavedFeedback(false);
    } else if (newsLead) {
      setStatus(newsLead.verificationStatus);
      setNotes(newsLead.reviewerNotes || '');
      setSavedFeedback(false);
    }
  }, [eventRecord, newsLead]);

  if (!activeItem) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSaveVerification(
        activeItem.id,
        eventRecord ? 'event' : 'news',
        status,
        notes.trim() || null
      );
      setSavedFeedback(true);
      setTimeout(() => setSavedFeedback(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#0F1E36]/55 flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white border border-[#CFCBC2] w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-xl">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-[#E4E2DC] px-6 py-4 flex items-start justify-between gap-4 z-10">
          <div>
            <div className="text-xs text-[#525866] flex flex-wrap items-center gap-x-2 gap-y-1 mb-1">
              <span className="font-semibold text-[#9E2A2B]">
                {eventRecord ? eventRecord.recordType : newsLead?.recordType}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Verification: <strong className="text-[#1C1F26] capitalize">{status}</strong>
              </span>
              {eventRecord && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{eventRecord.eventType}</span>
                </>
              )}
            </div>
            <h2 className="text-xl font-semibold text-[#0F1E36] leading-snug">
              {eventRecord ? eventRecord.eventName : newsLead?.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-[#525866] hover:text-[#0F1E36] transition-colors cursor-pointer"
            aria-label="Close record inspector"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Event Record View */}
          {eventRecord && (
            <>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm border-b border-[#E4E2DC] pb-6">
                <div>
                  <dt className="text-xs text-[#525866]">Dataset &amp; Source</dt>
                  <dd className="font-medium text-[#1C1F26] mt-0.5">{eventRecord.datasetName}</dd>
                  <dd className="text-xs text-[#525866]">{eventRecord.sourceName}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[#525866]">Original Record Identifier</dt>
                  <dd className="font-mono text-xs text-[#1C1F26] mt-0.5 tabular-nums">
                    {eventRecord.sourceRecordId}
                  </dd>
                  <dd className="text-xs text-[#525866]">Licence: {eventRecord.licence}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[#525866]">Country &amp; Region</dt>
                  <dd className="font-medium text-[#1C1F26] mt-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        onNavigateCountry(eventRecord.countryId);
                        onClose();
                      }}
                      className="underline decoration-[#CFCBC2] hover:decoration-[#0F1E36] text-[#0F1E36] cursor-pointer"
                    >
                      {eventRecord.countryName} ({eventRecord.countryId})
                    </button>{' '}
                    · {eventRecord.region}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-[#525866]">Event Date / Period</dt>
                  <dd className="font-mono text-xs text-[#1C1F26] mt-0.5 tabular-nums">
                    {eventRecord.eventDate ||
                      (eventRecord.startYear
                        ? eventRecord.endYear && eventRecord.endYear !== eventRecord.startYear
                          ? `${eventRecord.startYear}–${eventRecord.endYear}`
                          : String(eventRecord.startYear)
                        : 'Not specified in source')}
                  </dd>
                  <dd className="text-xs text-[#525866]">
                    Retrieved: {eventRecord.retrievalTimestamp.slice(0, 19).replace('T', ' ')} UTC
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-[#525866]">Geographic Location &amp; Precision</dt>
                  <dd className="text-[#1C1F26] mt-0.5">
                    {eventRecord.locationName || 'Country-level attribution only'}
                  </dd>
                  <dd className="text-xs text-[#525866] font-mono tabular-nums">
                    {eventRecord.latitude !== null && eventRecord.longitude !== null
                      ? `Coordinates: ${eventRecord.latitude.toFixed(4)}, ${eventRecord.longitude.toFixed(4)}`
                      : 'Coordinates: Not provided in source (not fabricated)'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-[#525866]">Documented Participants &amp; Identity</dt>
                  <dd className="text-[#1C1F26] mt-0.5">
                    {eventRecord.protesterIdentity || 'Not specified in source'}
                  </dd>
                  <dd className="text-xs text-[#525866]">
                    Scale: {eventRecord.participants || eventRecord.participantsCategory || 'Not reported'}
                  </dd>
                </div>
              </dl>

              {/* Demands, Methods & State Responses */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 border-b border-[#E4E2DC] pb-6 text-sm">
                <div>
                  <h3 className="text-xs font-semibold text-[#0F1E36] mb-2">
                    Documented Demands / Objectives
                  </h3>
                  {eventRecord.demands.length > 0 ? (
                    <ul className="space-y-1 text-[#1C1F26] list-disc list-inside">
                      {eventRecord.demands.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[#525866] text-xs">Not reported in the available sources.</p>
                  )}
                  {eventRecord.campaignGoal && (
                    <p className="text-xs text-[#525866] mt-2">{eventRecord.campaignGoal}</p>
                  )}
                </div>

                <div>
                  <h3 className="text-xs font-semibold text-[#0F1E36] mb-2">
                    Institutional / State Response &amp; Outcome
                  </h3>
                  {eventRecord.stateResponses.length > 0 ? (
                    <ul className="space-y-1 text-[#1C1F26] list-disc list-inside">
                      {eventRecord.stateResponses.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[#525866] text-xs">
                      {eventRecord.campaignOutcome
                        ? `Campaign outcome: ${eventRecord.campaignOutcome}`
                        : 'State response not coded in this dataset.'}
                    </p>
                  )}
                  {eventRecord.primaryMethod && (
                    <p className="text-xs text-[#525866] mt-2">
                      Primary resistance method (source-coded):{' '}
                      <strong className="text-[#1C1F26]">{eventRecord.primaryMethod}</strong>
                    </p>
                  )}
                </div>
              </div>

              {/* Human Consequences (Strictly Disaggregated) */}
              <div className="border-b border-[#E4E2DC] pb-6">
                <h3 className="text-xs font-semibold text-[#0F1E36] mb-3">
                  Human Consequences (Disaggregated; Missing Values Never Converted to Zero)
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                  {[
                    { label: 'Reported Fatalities', val: eventRecord.fatalities },
                    { label: 'Reported Injuries', val: eventRecord.injuries },
                    { label: 'Arrests', val: eventRecord.arrests },
                    { label: 'Missing Persons', val: eventRecord.missingPersons },
                    { label: 'Displaced Persons', val: eventRecord.displacedPersons },
                  ].map((item) => (
                    <div key={item.label} className="bg-[#F8F7F4] border border-[#E4E2DC] p-3">
                      <div className="text-[#525866]">{item.label}</div>
                      <div className="mt-1 font-mono font-semibold text-[#1C1F26] tabular-nums">
                        {item.val !== null ? item.val.toLocaleString() : 'Not reported'}
                      </div>
                    </div>
                  ))}
                </div>
                {(eventRecord.documentedStateArrests ||
                  eventRecord.documentedStateBeatings ||
                  eventRecord.documentedStateShootings ||
                  eventRecord.documentedStateKillings) && (
                  <p className="mt-3 text-xs text-[#525866]">
                    Categorical source coding notes: Source records state response involving{' '}
                    {[
                      eventRecord.documentedStateArrests && 'arrests',
                      eventRecord.documentedStateBeatings && 'beatings',
                      eventRecord.documentedStateShootings && 'shootings',
                      eventRecord.documentedStateKillings && 'lethal force / killings',
                    ]
                      .filter(Boolean)
                      .join(', ')}
                    , without specifying a verified numeric count.
                  </p>
                )}
              </div>

              {/* Source Notes & Citation */}
              {eventRecord.sourceNotes && (
                <div className="border-b border-[#E4E2DC] pb-6">
                  <h3 className="text-xs font-semibold text-[#0F1E36] mb-2">
                    Source Notes &amp; Archival Description
                  </h3>
                  <p className="text-xs text-[#1C1F26] leading-relaxed whitespace-pre-wrap">
                    {eventRecord.sourceNotes}
                  </p>
                </div>
              )}

              {/* Actions & Raw Source Fields */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E4E2DC] pb-6">
                <div className="flex flex-wrap items-center gap-3">
                  {eventRecord.sourceUrl && (
                    <a
                      href={eventRecord.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0F1E36] hover:text-[#9E2A2B] underline"
                    >
                      <span>Open Official Dataset Source</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowRawFields((v) => !v)}
                    className="text-xs font-medium text-[#525866] hover:text-[#0F1E36] underline cursor-pointer"
                  >
                    {showRawFields ? 'Hide Original CSV Columns' : 'Inspect Preserved Raw CSV Fields'}
                  </button>
                </div>

                {onCreateMovementStub && (
                  <button
                    type="button"
                    onClick={() => onCreateMovementStub(eventRecord)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-[#F1EFEA] hover:bg-[#E4E2DC] text-[#0F1E36] rounded transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <FilePlus2 className="w-3.5 h-3.5" />
                    <span>Author Movement Dossier from Record</span>
                  </button>
                )}
              </div>

              {showRawFields && (
                <div className="border border-[#E4E2DC] bg-[#F8F7F4] p-4 overflow-x-auto">
                  <div className="text-xs font-semibold text-[#0F1E36] mb-2">
                    Unmodified Original Dataset Fields
                  </div>
                  <table className="w-full text-xs border-collapse">
                    <tbody>
                      {Object.entries(eventRecord.rawFields).map(([k, v]) => (
                        <tr key={k} className="border-b border-[#E4E2DC] last:border-b-0">
                          <td className="py-1.5 pr-4 font-mono text-[#525866] whitespace-nowrap align-top">
                            {k}
                          </td>
                          <td className="py-1.5 font-mono text-[#1C1F26] break-words">
                            {v !== '' ? v : <span className="text-[#767D8C] italic">(empty)</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* News Lead View */}
          {newsLead && (
            <div className="space-y-5 border-b border-[#E4E2DC] pb-6 text-sm">
              <div className="bg-[#F8F7F4] border border-[#E4E2DC] p-4 text-xs text-[#525866] leading-relaxed">
                <strong className="text-[#0F1E36]">Methodological Notice:</strong> News-derived event
                leads originate from automated GDELT DOC 2.0 media indexing. An article headline is
                not independent proof that a protest occurred, nor does coverage volume measure event
                scale. Cross-check primary accounts before treating as corroborated.
              </div>

              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <dt className="text-[#525866]">Primary Indexed Publisher</dt>
                  <dd className="font-medium text-[#1C1F26] mt-0.5">{newsLead.publisher}</dd>
                </div>
                <div>
                  <dt className="text-[#525866]">Publication Timestamp</dt>
                  <dd className="font-mono text-[#1C1F26] mt-0.5 tabular-nums">
                    {newsLead.publicationDate.slice(0, 19).replace('T', ' ')} UTC
                  </dd>
                </div>
                <div>
                  <dt className="text-[#525866]">Indexed Country / Source Location</dt>
                  <dd className="font-medium text-[#1C1F26] mt-0.5">
                    {newsLead.country || 'Unspecified in GDELT metadata'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[#525866]">Search Query &amp; Retrieval Time</dt>
                  <dd className="font-mono text-[#1C1F26] mt-0.5 break-all">
                    {newsLead.searchQuery}
                  </dd>
                  <dd className="text-[#525866] mt-0.5 font-mono tabular-nums">
                    Retrieved: {newsLead.retrievalDate.slice(0, 19).replace('T', ' ')} UTC
                  </dd>
                </div>
              </dl>

              <div>
                <h3 className="text-xs font-semibold text-[#0F1E36] mb-2">
                  Grouped Coverage Links ({newsLead.corroboratingArticles.length}{' '}
                  {newsLead.corroboratingArticles.length === 1 ? 'article' : 'articles in cluster'})
                </h3>
                <ul className="divide-y divide-[#E4E2DC] border border-[#E4E2DC]">
                  {newsLead.corroboratingArticles.map((art, idx) => (
                    <li key={idx} className="p-3 flex items-start justify-between gap-4 text-xs">
                      <div>
                        <div className="font-medium text-[#1C1F26]">{art.title}</div>
                        <div className="text-[#525866] mt-0.5">
                          {art.publisher} ·{' '}
                          <span className="font-mono tabular-nums">
                            {art.publicationDate.slice(0, 16).replace('T', ' ')} UTC
                          </span>
                        </div>
                      </div>
                      <a
                        href={art.articleUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[#0F1E36] hover:text-[#9E2A2B] underline whitespace-nowrap shrink-0"
                      >
                        <span>Read Source</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Researcher Verification Review Form */}
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-[#0F1E36]">
                Researcher Verification &amp; Provenance Review
              </h3>
              <p className="text-xs text-[#525866] mt-0.5">
                Assign an analytical verification status and document corroborating or conflicting
                sources. Saved locally in your IndexedDB research workspace.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {VERIFICATION_OPTIONS.map((opt) => {
                const active = status === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setStatus(opt.value)}
                    className={`text-left p-3 border transition-colors cursor-pointer ${
                      active
                        ? 'border-[#0F1E36] bg-[#F1EFEA]'
                        : 'border-[#E4E2DC] bg-white hover:border-[#CFCBC2]'
                    }`}
                  >
                    <div className="text-xs font-semibold text-[#0F1E36]">{opt.label}</div>
                    <div className="text-[11px] text-[#525866] mt-0.5 leading-snug">
                      {opt.description}
                    </div>
                  </button>
                );
              })}
            </div>

            <div>
              <label className="block text-xs font-medium text-[#0F1E36] mb-1">
                Reviewer Corroboration / Disagreement Notes
              </label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Document independent primary sources, human-rights monitor reports, or discrepancies between official and activist figures..."
                className="w-full border border-[#CFCBC2] bg-white px-3 py-2 text-xs text-[#1C1F26] focus:outline-none focus:border-[#0F1E36]"
              />
            </div>

            <div className="flex items-center justify-end gap-3">
              {savedFeedback && (
                <span className="inline-flex items-center gap-1 text-xs text-[#14532D] font-medium">
                  <Check className="w-3.5 h-3.5" />
                  <span>Verification status saved</span>
                </span>
              )}
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-[#525866] hover:text-[#0F1E36] cursor-pointer whitespace-nowrap shrink-0"
              >
                Close
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-xs font-medium text-white bg-[#0F1E36] hover:bg-[#1E3252] rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Review Status'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
