import React, { useMemo, useState } from 'react';
import {
  Search,
  Scale,
  X,
  Database,
  Info,
} from 'lucide-react';
import { useResearch } from '../context/ResearchContext';
import { EventClassification } from '../types/research';
import { ResearchChart } from '../components/ResearchChart';

interface ArchiveEntry {
  uid: string;
  title: string;
  countryId: string;
  countryName: string;
  datasetLabel: string;
  unitOfObservation: string;
  startYear: number | null;
  endYear: number | null;
  periodDisplay: string;
  durationDisplay: string;
  campaignOrEventType: EventClassification;
  primaryMethod: string;
  demandsDisplay: string;
  participationDisplay: string;
  outcomeDisplay: string;
  contextDisplay: string;
  originKind: 'event' | 'movement';
  originId: string;
}

const EVENT_TYPES: EventClassification[] = [
  'Civil resistance campaign',
  'Organised protest campaign',
  'Youth-led movement',
  'Student movement',
  'Labour movement',
  'General public demonstration',
  'Individual protest event',
  'Violent demonstration',
  'Armed conflict event',
];

export const HistoricalArchivePage: React.FC = () => {
  const {
    activeEvents,
    movements,
    setInspectedEvent,
    setSelectedMovementId,
    setActivePage,
  } = useResearch();

  const [countryQuery, setCountryQuery] = useState<string>('');
  const [nameQuery, setNameQuery] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [yearMinFilter, setYearMinFilter] = useState<string>('1900');
  const [yearMaxFilter, setYearMaxFilter] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const PAGE_SIZE = 40;

  const [comparedUids, setComparedUids] = useState<string[]>([]);

  // Unify NAVCO, Mass Mobilization, and Researcher Profiles with explicit unit-of-observation tags (never inferring missing fields)
  const archiveEntries = useMemo<ArchiveEntry[]>(() => {
    const list: ArchiveEntry[] = [];

    for (const m of movements) {
      const syMatch = /^(\d{4})/.exec(m.startDate || '');
      const eyMatch = /^(\d{4})/.exec(m.endDate || '');
      const sy = syMatch ? Number(syMatch[1]) : null;
      const ey = eyMatch ? Number(eyMatch[1]) : sy;

      list.push({
        uid: `mov_${m.id}`,
        title: m.name,
        countryId: m.countryId,
        countryName: m.countryName,
        datasetLabel: 'Researcher-Authored Movement Profile',
        unitOfObservation: 'Multi-source qualitative movement synthesis',
        startYear: sy,
        endYear: ey,
        periodDisplay: `${m.startDate || 'Unspecified'}${
          m.endDate && m.endDate !== m.startDate ? ` – ${m.endDate}` : ''
        }`,
        durationDisplay:
          sy !== null && ey !== null
            ? ey === sy
              ? '< 1 year / Same calendar year'
              : `${ey - sy + 1} calendar years (${sy}–${ey})`
            : 'Not reported in available fields',
        campaignOrEventType: m.classification,
        primaryMethod: 'See dossier narrative',
        demandsDisplay:
          m.demands.length > 0 ? m.demands.join('; ') : 'Not reported in the available sources',
        participationDisplay:
          m.participantsAndLeadership || 'Not reported in the available sources',
        outcomeDisplay: m.outcomes || 'Not reported in the available sources',
        contextDisplay: m.background || m.overview || 'Not reported in the available sources',
        originKind: 'movement',
        originId: m.id,
      });
    }

    for (const ev of activeEvents) {
      const isNavco = ev.datasetId === 'navco';
      const sy = ev.startYear;
      const ey = ev.endYear ?? ev.startYear;

      list.push({
        uid: `ev_${ev.id}`,
        title: ev.eventName,
        countryId: ev.countryId,
        countryName: ev.countryName,
        datasetLabel: ev.datasetName,
        unitOfObservation: isNavco
          ? 'Maximalist resistance campaign (NAVCO)'
          : ev.datasetId === 'mass_mobilization'
            ? 'Anti-government protest observation (Mass Mobilization)'
            : 'Historical dataset observation',
        startYear: sy,
        endYear: ey,
        periodDisplay:
          ev.eventDate ||
          (sy !== null ? (ey && ey !== sy ? `${sy}–${ey}` : String(sy)) : 'Unspecified'),
        durationDisplay:
          sy !== null && ey !== null
            ? ey > sy
              ? `${ey - sy + 1} campaign years (${sy}–${ey})`
              : 'Single year / episodic event'
            : 'Not reported in the available sources',
        campaignOrEventType: ev.eventType,
        primaryMethod: ev.primaryMethod || 'Not coded at campaign level',
        demandsDisplay:
          ev.demands.length > 0 ? ev.demands.join('; ') : 'Not reported in the available sources',
        participationDisplay:
          [ev.participants, ev.protesterIdentity].filter(Boolean).join(' · ') ||
          'Not reported in the available sources',
        outcomeDisplay:
          ev.campaignOutcome ||
          (ev.stateResponses.length > 0
            ? `State response coded: ${ev.stateResponses.join(', ')} (long-term outcome not coded)`
            : 'Not reported in the available sources'),
        contextDisplay: ev.sourceNotes || ev.campaignGoal || 'Not reported in the available sources',
        originKind: 'event',
        originId: ev.id,
      });
    }

    return list.sort((a, b) => (b.startYear || 0) - (a.startYear || 0));
  }, [activeEvents, movements]);

  const filteredEntries = useMemo(() => {
    const cq = countryQuery.trim().toLowerCase();
    const nq = nameQuery.trim().toLowerCase();
    const minY = yearMinFilter ? Number(yearMinFilter) : null;
    const maxY = yearMaxFilter ? Number(yearMaxFilter) : null;

    return archiveEntries.filter((item) => {
      if (sourceFilter !== 'all') {
        if (sourceFilter === 'movements' && item.originKind !== 'movement') return false;
        if (
          sourceFilter === 'navco' &&
          !item.datasetLabel.toLowerCase().includes('navco')
        )
          return false;
        if (
          sourceFilter === 'mass_mobilization' &&
          !item.datasetLabel.toLowerCase().includes('mass mobilization')
        )
          return false;
      }
      if (typeFilter !== 'all' && item.campaignOrEventType !== typeFilter) return false;
      if (minY !== null && (item.startYear === null || item.startYear < minY)) return false;
      if (maxY !== null && (item.startYear === null || item.startYear > maxY)) return false;
      if (
        cq &&
        !item.countryName.toLowerCase().includes(cq) &&
        !item.countryId.toLowerCase().includes(cq)
      ) {
        return false;
      }
      if (
        nq &&
        !item.title.toLowerCase().includes(nq) &&
        !item.demandsDisplay.toLowerCase().includes(nq)
      ) {
        return false;
      }
      return true;
    });
  }, [archiveEntries, countryQuery, nameQuery, typeFilter, sourceFilter, yearMinFilter, yearMaxFilter]);

  // Historical Timeline Chart (1900 onward, separated by source series so units are never conflated!)
  const archiveTimelineOption = useMemo(() => {
    if (filteredEntries.length === 0) return null;
    const navcoByYear = new Map<number, number>();
    const mmByYear = new Map<number, number>();
    const otherByYear = new Map<number, number>();
    const allYears = new Set<number>();

    for (const item of filteredEntries) {
      if (item.startYear === null || item.startYear < 1900) continue;
      allYears.add(item.startYear);
      if (item.datasetLabel.toLowerCase().includes('navco')) {
        navcoByYear.set(item.startYear, (navcoByYear.get(item.startYear) || 0) + 1);
      } else if (item.datasetLabel.toLowerCase().includes('mass mobilization')) {
        mmByYear.set(item.startYear, (mmByYear.get(item.startYear) || 0) + 1);
      } else {
        otherByYear.set(item.startYear, (otherByYear.get(item.startYear) || 0) + 1);
      }
    }

    const sortedYears = Array.from(allYears).sort((a, b) => a - b);
    if (sortedYears.length === 0) return null;

    const series: any[] = [];
    if (navcoByYear.size > 0) {
      series.push({
        name: 'NAVCO Campaigns Initiated',
        type: 'bar',
        data: sortedYears.map((y) => navcoByYear.get(y) || 0),
        itemStyle: { color: '#9E2A2B' },
      });
    }
    if (mmByYear.size > 0) {
      series.push({
        name: 'Mass Mobilization Protest Events',
        type: 'bar',
        data: sortedYears.map((y) => mmByYear.get(y) || 0),
        itemStyle: { color: '#0F1E36' },
      });
    }
    if (otherByYear.size > 0) {
      series.push({
        name: 'Researcher / Custom Records',
        type: 'bar',
        data: sortedYears.map((y) => otherByYear.get(y) || 0),
        itemStyle: { color: '#2B5B6C' },
      });
    }

    return {
      tooltip: { trigger: 'axis' },
      legend: { top: 0, textStyle: { fontSize: 11, color: '#525866' } },
      grid: { left: 48, right: 20, top: 34, bottom: 32 },
      xAxis: {
        type: 'category',
        data: sortedYears.map(String),
        axisLabel: { fontFamily: 'IBM Plex Mono', fontSize: 11, color: '#525866' },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: '#E4E2DC' } },
        axisLabel: { fontFamily: 'IBM Plex Mono', fontSize: 11, color: '#525866' },
      },
      series,
    };
  }, [filteredEntries]);

  const comparedItems = useMemo(
    () =>
      comparedUids
        .map((uid) => archiveEntries.find((e) => e.uid === uid))
        .filter(Boolean) as ArchiveEntry[],
    [comparedUids, archiveEntries]
  );

  const toggleCompare = (uid: string) => {
    setComparedUids((prev) => {
      if (prev.includes(uid)) return prev.filter((id) => id !== uid);
      if (prev.length >= 4) return [...prev.slice(1), uid];
      return [...prev, uid];
    });
  };

  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / PAGE_SIZE));
  const currentSlice = filteredEntries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="border-b border-[#E4E2DC] pb-6">
        <div className="text-xs text-[#525866] mb-1">
          Comparative Historical Catalogue (1900–Present) · Distinct Units of Observation Preserved
        </div>
        <h1 className="text-3xl lg:text-4xl font-semibold text-[#0F1E36]">
          Historical Archive &amp; Comparative Matrix
        </h1>
        <p className="text-sm text-[#525866] mt-2 max-w-3xl leading-relaxed">
          Search and compare global resistance campaigns (Harvard NAVCO, 1900–2021), anti-government
          protest events (Harvard Mass Mobilization, 1990–March 2020), and researcher-authored
          movement dossiers. Missing fields are never inferred from movement names.
        </p>
      </header>

      {/* Unit-of-Observation Methodological Explanation */}
      <div className="bg-white border border-[#E4E2DC] p-4 flex items-start gap-3 text-xs text-[#525866]">
        <Info className="w-4 h-4 text-[#0F1E36] shrink-0 mt-0.5" />
        <div>
          <strong className="text-[#0F1E36]">Different Units of Observation:</strong> Harvard NAVCO
          records multi-year maximalist resistance campaigns (&ge;1,000 participants pursuing regime
          change, anti-occupation, or secession), whereas Harvard Mass Mobilization records discrete
          protest events (&ge;50 participants) targeting state policy between 1990 and March 2020.
          Each series is plotted as a separate legend category and retains its distinct analytical
          definition.
        </div>
      </div>

      {/* Search & Filter Controls */}
      <section className="bg-white border border-[#E4E2DC] p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
        <div>
          <label className="block text-[11px] font-medium text-[#525866] mb-1">
            Dataset / Archive Source
          </label>
          <select
            value={sourceFilter}
            onChange={(e) => {
              setSourceFilter(e.target.value);
              setPage(1);
            }}
            className="w-full border border-[#CFCBC2] bg-white px-2.5 py-1.5 text-xs"
          >
            <option value="all">All Loaded Archival Sources</option>
            <option value="navco">Harvard NAVCO (1900–2021)</option>
            <option value="mass_mobilization">Mass Mobilization (1990–2020)</option>
            <option value="movements">Researcher Movement Profiles</option>
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-[#525866] mb-1">
            Search Country
          </label>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#767D8C] absolute left-2.5 top-2.5" />
            <input
              type="text"
              value={countryQuery}
              onChange={(e) => {
                setCountryQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Country or ISO3..."
              className="w-full border border-[#CFCBC2] pl-8 pr-2.5 py-1.5 text-xs"
            />
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-[#525866] mb-1">
            Movement / Event Name
          </label>
          <input
            type="text"
            value={nameQuery}
            onChange={(e) => {
              setNameQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Campaign or demand..."
            className="w-full border border-[#CFCBC2] px-2.5 py-1.5 text-xs"
          />
        </div>

        <div>
          <label className="block text-[11px] font-medium text-[#525866] mb-1">Campaign Type</label>
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
            className="w-full border border-[#CFCBC2] bg-white px-2.5 py-1.5 text-xs"
          >
            <option value="all">All Types</option>
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-[#525866] mb-1">From Year</label>
          <input
            type="number"
            value={yearMinFilter}
            onChange={(e) => {
              setYearMinFilter(e.target.value);
              setPage(1);
            }}
            placeholder="1900"
            className="w-full border border-[#CFCBC2] px-2.5 py-1.5 text-xs font-mono tabular-nums"
          />
        </div>

        <div>
          <label className="block text-[11px] font-medium text-[#525866] mb-1">To Year</label>
          <input
            type="number"
            value={yearMaxFilter}
            onChange={(e) => {
              setYearMaxFilter(e.target.value);
              setPage(1);
            }}
            placeholder="2025"
            className="w-full border border-[#CFCBC2] px-2.5 py-1.5 text-xs font-mono tabular-nums"
          />
        </div>
      </section>

      {/* Historical Timeline Figure */}
      <ResearchChart
        title="Chronological Distribution of Filtered Archival Records (1900 Onward)"
        datasetAttribution="Segregated Series by Source Repository"
        unitExplanation="Separate series for NAVCO campaigns vs. Mass Mobilization protest observations"
        option={archiveTimelineOption}
        height={260}
        onEmptyAction={() => setActivePage('sources')}
        emptyActionLabel="Import NAVCO / Mass Mobilization in Data Sources"
      />

      {/* Side-by-Side Movement Comparison Interface */}
      {comparedItems.length > 0 && (
        <section className="bg-white border border-[#0F1E36] p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-[#E4E2DC] pb-3">
            <div className="flex items-center gap-2">
              <Scale className="w-4 h-4 text-[#9E2A2B]" />
              <h2 className="text-lg font-semibold text-[#0F1E36]">
                Comparative Historical Analysis ({comparedItems.length} Selected — Select 2 to 4
                Records Below)
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setComparedUids([])}
              className="text-xs text-[#525866] hover:text-[#9E2A2B] cursor-pointer"
            >
              Clear Comparison
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#CFCBC2] bg-[#F8F7F4]">
                  <th className="text-left p-3 w-44 font-semibold text-[#0F1E36]">
                    Analytical Dimension
                  </th>
                  {comparedItems.map((item) => (
                    <th key={item.uid} className="text-left p-3 min-w-[220px] font-semibold text-[#0F1E36]">
                      <div className="flex items-start justify-between gap-2">
                        <span>{item.title}</span>
                        <button
                          type="button"
                          onClick={() => toggleCompare(item.uid)}
                          className="text-[#767D8C] hover:text-[#9E2A2B] cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E2DC]">
                {[
                  { label: 'Country', getter: (i: ArchiveEntry) => `${i.countryName} (${i.countryId})` },
                  { label: 'Historical Period', getter: (i: ArchiveEntry) => i.periodDisplay },
                  { label: 'Dataset & Unit', getter: (i: ArchiveEntry) => `${i.datasetLabel} — ${i.unitOfObservation}` },
                  { label: 'Campaign / Event Type', getter: (i: ArchiveEntry) => `${i.campaignOrEventType} (${i.primaryMethod})` },
                  { label: 'Main Demands / Goals', getter: (i: ArchiveEntry) => i.demandsDisplay },
                  { label: 'Documented Duration', getter: (i: ArchiveEntry) => i.durationDisplay },
                  { label: 'Participation', getter: (i: ArchiveEntry) => i.participationDisplay },
                  { label: 'Documented Outcome', getter: (i: ArchiveEntry) => i.outcomeDisplay },
                  { label: 'Historical Context / Notes', getter: (i: ArchiveEntry) => i.contextDisplay },
                ].map((row) => (
                  <tr key={row.label} className="align-top">
                    <td className="p-3 font-semibold text-[#525866] bg-[#F8F7F4]/50">
                      {row.label}
                    </td>
                    {comparedItems.map((item) => (
                      <td key={item.uid} className="p-3 text-[#1C1F26] leading-relaxed">
                        {row.getter(item)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Archive Records Table */}
      {filteredEntries.length > 0 ? (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#525866]">
            <span>
              Showing <strong className="font-mono text-[#0F1E36]">{currentSlice.length}</strong> of{' '}
              <strong className="font-mono text-[#0F1E36]">
                {filteredEntries.length.toLocaleString()}
              </strong>{' '}
              archival records (check &ldquo;Compare&rdquo; to add to side-by-side matrix)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-2.5 py-1 border border-[#CFCBC2] bg-white rounded disabled:opacity-40 cursor-pointer"
              >
                Previous
              </button>
              <span className="font-mono tabular-nums">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-2.5 py-1 border border-[#CFCBC2] bg-white rounded disabled:opacity-40 cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>

          <div className="bg-white border border-[#E4E2DC] overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead className="bg-[#F1EFEA] border-b border-[#CFCBC2]">
                <tr>
                  <th className="text-left px-3 py-2.5 font-semibold text-[#0F1E36]">Compare</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-[#0F1E36]">Period</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-[#0F1E36]">Country</th>
                  <th className="text-left px-3 py-2.5 font-semibold text-[#0F1E36]">
                    Movement / Campaign / Event
                  </th>
                  <th className="text-left px-3 py-2.5 font-semibold text-[#0F1E36]">
                    Classification &amp; Dataset
                  </th>
                  <th className="text-left px-3 py-2.5 font-semibold text-[#0F1E36]">
                    Documented Outcome / Response
                  </th>
                  <th className="text-right px-3 py-2.5 font-semibold text-[#0F1E36]">Record</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E2DC]">
                {currentSlice.map((entry) => {
                  const isCompared = comparedUids.includes(entry.uid);
                  return (
                    <tr key={entry.uid} className="hover:bg-[#F8F7F4] align-top">
                      <td className="px-3 py-3">
                        <input
                          type="checkbox"
                          checked={isCompared}
                          onChange={() => toggleCompare(entry.uid)}
                          className="accent-[#0F1E36] cursor-pointer"
                          aria-label={`Select ${entry.title} for comparison`}
                        />
                      </td>
                      <td className="px-3 py-3 font-mono text-[#1C1F26] whitespace-nowrap tabular-nums">
                        {entry.periodDisplay}
                      </td>
                      <td className="px-3 py-3 font-medium text-[#0F1E36] whitespace-nowrap">
                        {entry.countryName}
                      </td>
                      <td className="px-3 py-3 max-w-xs">
                        <div className="font-semibold text-[#0F1E36]">{entry.title}</div>
                        <div className="text-[11px] text-[#525866] line-clamp-1 mt-0.5">
                          {entry.demandsDisplay}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="text-[#1C1F26]">{entry.campaignOrEventType}</div>
                        <div className="text-[11px] text-[#767D8C]">{entry.datasetLabel}</div>
                      </td>
                      <td className="px-3 py-3 max-w-xs text-[#525866]">{entry.outcomeDisplay}</td>
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            if (entry.originKind === 'movement') {
                              setSelectedMovementId(entry.originId);
                              setActivePage('movements');
                            } else {
                              const ev = activeEvents.find((e) => e.id === entry.originId);
                              if (ev) setInspectedEvent(ev);
                            }
                          }}
                          className="text-[#0F1E36] hover:text-[#9E2A2B] underline font-medium cursor-pointer"
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="bg-white border border-[#E4E2DC] p-10 text-center space-y-4">
          <h2 className="text-lg font-semibold text-[#0F1E36]">Data unavailable</h2>
          <p className="text-xs text-[#525866] max-w-xl mx-auto leading-relaxed">
            No archival campaigns or protest records are currently loaded (or none match your active
            filters). Import Harvard NAVCO (1900–2021) and Harvard Mass Mobilization (1990–March
            2020) in Data Sources to explore and compare historical movements.
          </p>
          <button
            type="button"
            onClick={() => setActivePage('sources')}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#0F1E36] rounded cursor-pointer"
          >
            <Database className="w-3.5 h-3.5" />
            <span>Open Data Sources &amp; Import</span>
          </button>
        </section>
      )}
    </div>
  );
};
