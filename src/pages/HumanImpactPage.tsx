import React, { useMemo, useState } from 'react';
import { ExternalLink, AlertTriangle, Database } from 'lucide-react';
import { useResearch } from '../context/ResearchContext';
import { HumanImpactReportItem } from '../types/research';

const IMPACT_TYPES: Array<HumanImpactReportItem['category'] | 'all'> = [
  'all',
  'Fatalities',
  'Injuries',
  'Arrests',
  'Missing persons',
  'Displacement',
  'Property damage',
  'Internet shutdowns',
  'Educational disruption',
  'Economic disruption',
];

interface UnifiedImpactRow {
  id: string;
  countryId: string;
  countryName: string;
  movementOrEventName: string;
  year: number | null;
  category: HumanImpactReportItem['category'];
  figureDisplay: string;
  certainty: 'Confirmed' | 'Reported' | 'Estimated' | 'Categorical Source Coding';
  sourceName: string;
  sourceUrl: string;
  reportingDate: string;
  sourceDefinition: string;
  competingAccountNote: string | null;
  originType: 'movement_dossier' | 'historical_event';
  originId: string;
}

export const HumanImpactPage: React.FC = () => {
  const {
    activeEvents,
    movements,
    setInspectedEvent,
    setSelectedMovementId,
    setActivePage,
  } = useResearch();

  const [countryFilter, setCountryFilter] = useState<string>('all');
  const [movementFilter, setMovementFilter] = useState<string>('all');
  const [yearFilter, setYearFilter] = useState<string>('');
  const [impactTypeFilter, setImpactTypeFilter] = useState<string>('all');
  const [sourceSearch, setSourceSearch] = useState<string>('');

  // Build strictly disaggregated human-impact records from both Researcher Dossiers and Imported Event Datasets
  const allImpactRows = useMemo<UnifiedImpactRow[]>(() => {
    const rows: UnifiedImpactRow[] = [];

    // 1. Structured source-attributed figures from Researcher-Authored Movement Profiles
    for (const mov of movements) {
      const yrMatch = /^(\d{4})/.exec(mov.startDate || '');
      const yr = yrMatch ? Number(yrMatch[1]) : null;
      for (const rep of mov.humanImpactReports) {
        rows.push({
          id: `mov_imp_${mov.id}_${rep.id}`,
          countryId: mov.countryId,
          countryName: mov.countryName,
          movementOrEventName: mov.name,
          year: yr,
          category: rep.category,
          figureDisplay: rep.figureText,
          certainty: rep.certainty,
          sourceName: rep.sourceName,
          sourceUrl: rep.sourceUrl,
          reportingDate: rep.reportingDate,
          sourceDefinition: rep.sourceDefinition,
          competingAccountNote: rep.competingAccountNote || null,
          originType: 'movement_dossier',
          originId: mov.id,
        });
      }
    }

    // 2. Numeric & categorical human consequences from Imported Historical Datasets (never inventing counts!)
    for (const ev of activeEvents) {
      if (ev.fatalities !== null) {
        rows.push({
          id: `${ev.id}_fat`,
          countryId: ev.countryId,
          countryName: ev.countryName,
          movementOrEventName: ev.eventName,
          year: ev.startYear,
          category: 'Fatalities',
          figureDisplay: `${ev.fatalities.toLocaleString()} fatalities`,
          certainty: ev.fatalitiesCertainty || 'Reported',
          sourceName: `${ev.datasetName} (${ev.sourceName})`,
          sourceUrl: ev.sourceUrl,
          reportingDate: ev.eventDate || String(ev.startYear || 'Dataset release'),
          sourceDefinition: `Numeric fatality column recorded in ${ev.datasetName} (ID: ${ev.sourceRecordId})`,
          competingAccountNote: ev.competingReportsNotes,
          originType: 'historical_event',
          originId: ev.id,
        });
      } else if (ev.documentedStateKillings) {
        rows.push({
          id: `${ev.id}_state_kill`,
          countryId: ev.countryId,
          countryName: ev.countryName,
          movementOrEventName: ev.eventName,
          year: ev.startYear,
          category: 'Fatalities',
          figureDisplay: 'Lethal state response documented (exact count not reported in source)',
          certainty: 'Categorical Source Coding',
          sourceName: `${ev.datasetName} (${ev.sourceName})`,
          sourceUrl: ev.sourceUrl,
          reportingDate: ev.eventDate || String(ev.startYear || 'Dataset release'),
          sourceDefinition:
            'Mass Mobilization stateresponse = "killings" (indicates lethal force without specifying a verified fatality total)',
          competingAccountNote: null,
          originType: 'historical_event',
          originId: ev.id,
        });
      }

      if (ev.injuries !== null) {
        rows.push({
          id: `${ev.id}_inj`,
          countryId: ev.countryId,
          countryName: ev.countryName,
          movementOrEventName: ev.eventName,
          year: ev.startYear,
          category: 'Injuries',
          figureDisplay: `${ev.injuries.toLocaleString()} injuries`,
          certainty: ev.injuriesCertainty || 'Reported',
          sourceName: `${ev.datasetName} (${ev.sourceName})`,
          sourceUrl: ev.sourceUrl,
          reportingDate: ev.eventDate || String(ev.startYear || 'Dataset release'),
          sourceDefinition: `Numeric injury column recorded in ${ev.datasetName}`,
          competingAccountNote: ev.competingReportsNotes,
          originType: 'historical_event',
          originId: ev.id,
        });
      } else if (ev.documentedStateBeatings || ev.documentedStateShootings) {
        rows.push({
          id: `${ev.id}_state_inj`,
          countryId: ev.countryId,
          countryName: ev.countryName,
          movementOrEventName: ev.eventName,
          year: ev.startYear,
          category: 'Injuries',
          figureDisplay: `Physical force documented (${[
            ev.documentedStateBeatings && 'beatings',
            ev.documentedStateShootings && 'shootings',
          ]
            .filter(Boolean)
            .join(' / ')}; numeric injury count not reported)`,
          certainty: 'Categorical Source Coding',
          sourceName: `${ev.datasetName} (${ev.sourceName})`,
          sourceUrl: ev.sourceUrl,
          reportingDate: ev.eventDate || String(ev.startYear || 'Dataset release'),
          sourceDefinition:
            'Source dataset codes physical state coercion categorically without providing a casualty count',
          competingAccountNote: null,
          originType: 'historical_event',
          originId: ev.id,
        });
      }

      if (ev.arrests !== null) {
        rows.push({
          id: `${ev.id}_arr`,
          countryId: ev.countryId,
          countryName: ev.countryName,
          movementOrEventName: ev.eventName,
          year: ev.startYear,
          category: 'Arrests',
          figureDisplay: `${ev.arrests.toLocaleString()} arrests`,
          certainty: 'Reported',
          sourceName: `${ev.datasetName} (${ev.sourceName})`,
          sourceUrl: ev.sourceUrl,
          reportingDate: ev.eventDate || String(ev.startYear || 'Dataset release'),
          sourceDefinition: `Numeric arrest column recorded in ${ev.datasetName}`,
          competingAccountNote: null,
          originType: 'historical_event',
          originId: ev.id,
        });
      } else if (ev.documentedStateArrests) {
        rows.push({
          id: `${ev.id}_state_arr`,
          countryId: ev.countryId,
          countryName: ev.countryName,
          movementOrEventName: ev.eventName,
          year: ev.startYear,
          category: 'Arrests',
          figureDisplay: 'State arrests documented (exact detainee total not reported in source)',
          certainty: 'Categorical Source Coding',
          sourceName: `${ev.datasetName} (${ev.sourceName})`,
          sourceUrl: ev.sourceUrl,
          reportingDate: ev.eventDate || String(ev.startYear || 'Dataset release'),
          sourceDefinition:
            'Source dataset codes stateresponse = "arrests" categorically without specifying numeric count',
          competingAccountNote: null,
          originType: 'historical_event',
          originId: ev.id,
        });
      }

      if (ev.missingPersons !== null) {
        rows.push({
          id: `${ev.id}_mis`,
          countryId: ev.countryId,
          countryName: ev.countryName,
          movementOrEventName: ev.eventName,
          year: ev.startYear,
          category: 'Missing persons',
          figureDisplay: `${ev.missingPersons.toLocaleString()} missing persons`,
          certainty: 'Reported',
          sourceName: `${ev.datasetName} (${ev.sourceName})`,
          sourceUrl: ev.sourceUrl,
          reportingDate: ev.eventDate || String(ev.startYear || 'Dataset release'),
          sourceDefinition: `Numeric missing-persons column recorded in ${ev.datasetName}`,
          competingAccountNote: null,
          originType: 'historical_event',
          originId: ev.id,
        });
      }

      if (ev.displacedPersons !== null) {
        rows.push({
          id: `${ev.id}_disp`,
          countryId: ev.countryId,
          countryName: ev.countryName,
          movementOrEventName: ev.eventName,
          year: ev.startYear,
          category: 'Displacement',
          figureDisplay: `${ev.displacedPersons.toLocaleString()} displaced persons`,
          certainty: 'Reported',
          sourceName: `${ev.datasetName} (${ev.sourceName})`,
          sourceUrl: ev.sourceUrl,
          reportingDate: ev.eventDate || String(ev.startYear || 'Dataset release'),
          sourceDefinition: `Numeric displacement column recorded in ${ev.datasetName}`,
          competingAccountNote: null,
          originType: 'historical_event',
          originId: ev.id,
        });
      }
    }

    return rows.sort((a, b) => (b.year || 0) - (a.year || 0));
  }, [activeEvents, movements]);

  const filteredRows = useMemo(() => {
    const yr = yearFilter.trim() ? Number(yearFilter.trim()) : null;
    const srcQ = sourceSearch.trim().toLowerCase();

    return allImpactRows.filter((r) => {
      if (countryFilter !== 'all' && r.countryId !== countryFilter) return false;
      if (movementFilter !== 'all' && r.movementOrEventName !== movementFilter) return false;
      if (yr !== null && r.year !== yr) return false;
      if (impactTypeFilter !== 'all' && r.category !== impactTypeFilter) return false;
      if (
        srcQ &&
        !r.sourceName.toLowerCase().includes(srcQ) &&
        !r.movementOrEventName.toLowerCase().includes(srcQ)
      ) {
        return false;
      }
      return true;
    });
  }, [allImpactRows, countryFilter, movementFilter, yearFilter, impactTypeFilter, sourceSearch]);

  // Coverage Matrix across all 9 Human-Impact Categories (counts of documented reports — NEVER summing conflicting numbers!)
  const categoryReportCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const cat of IMPACT_TYPES) {
      if (cat !== 'all') map.set(cat, 0);
    }
    for (const r of filteredRows) {
      map.set(r.category, (map.get(r.category) || 0) + 1);
    }
    return map;
  }, [filteredRows]);

  const distinctCountries = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of allImpactRows) {
      m.set(r.countryId, r.countryName);
    }
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [allImpactRows]);

  const distinctMovements = useMemo(() => {
    const s = new Set<string>();
    for (const m of movements) s.add(m.name);
    return Array.from(s).sort();
  }, [movements]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="border-b border-[#E4E2DC] pb-6">
        <div className="text-xs text-[#525866] mb-1">
          Disaggregated Human-Consequences Ledger · Competing Reports Preserved Without Silent Aggregation
        </div>
        <h1 className="text-3xl lg:text-4xl font-semibold text-[#0F1E36]">
          Human Impact &amp; Civic Disruption Research
        </h1>
        <p className="text-sm text-[#525866] mt-2 max-w-3xl leading-relaxed">
          Fatalities, injuries, arrests, missing persons, displacement, property damage, internet
          shutdowns, educational disruption, and economic disruption are tracked as separate
          categories with explicit source attribution, reporting dates, certainty classifications,
          and source definitions. Conflicting reports are never summed into synthetic totals.
        </p>
      </header>

      {/* Methodological Safeguard Notice */}
      <div className="bg-white border border-[#E4E2DC] p-4 flex items-start gap-3 text-xs text-[#525866]">
        <AlertTriangle className="w-4 h-4 text-[#9E2A2B] shrink-0 mt-0.5" />
        <div>
          <strong className="text-[#0F1E36]">Casualty &amp; Disruption Accounting Rules:</strong>{' '}
          Cards below count the number of <em>documented source reports</em> per category—never an
          unverified sum across conflicting reports. Where reliable figures do not exist in loaded
          datasets, Generation Watch explicitly records{' '}
          <em>&ldquo;Not reported in the available sources.&rdquo;</em>
        </div>
      </div>

      {/* 9-Category Report Coverage Grid */}
      <section className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-9 gap-3">
        {IMPACT_TYPES.filter((t) => t !== 'all').map((cat) => {
          const count = categoryReportCounts.get(cat) || 0;
          const active = impactTypeFilter === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setImpactTypeFilter(active ? 'all' : cat)}
              className={`text-left p-3.5 border transition-colors cursor-pointer ${
                active
                  ? 'border-[#0F1E36] bg-[#F1EFEA]'
                  : 'border-[#E4E2DC] bg-white hover:border-[#CFCBC2]'
              }`}
            >
              <div className="text-[11px] font-medium text-[#525866] leading-tight">{cat}</div>
              <div className="mt-2 text-lg font-mono font-semibold text-[#0F1E36] tabular-nums">
                {count.toLocaleString()}
              </div>
              <div className="text-[10px] text-[#767D8C] mt-0.5">
                {count > 0 ? 'documented entries' : 'Not reported'}
              </div>
            </button>
          );
        })}
      </section>

      {/* Filter Controls */}
      <section className="bg-white border border-[#E4E2DC] p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div>
          <label className="block text-[11px] font-medium text-[#525866] mb-1">Country</label>
          <select
            value={countryFilter}
            onChange={(e) => setCountryFilter(e.target.value)}
            className="w-full border border-[#CFCBC2] bg-white px-2.5 py-1.5 text-xs"
          >
            <option value="all">All Countries ({distinctCountries.length})</option>
            {distinctCountries.map(([id, name]) => (
              <option key={id} value={id}>
                {name} ({id})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-[#525866] mb-1">
            Authored Movement
          </label>
          <select
            value={movementFilter}
            onChange={(e) => setMovementFilter(e.target.value)}
            className="w-full border border-[#CFCBC2] bg-white px-2.5 py-1.5 text-xs"
          >
            <option value="all">All Movements &amp; Events</option>
            {distinctMovements.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-[#525866] mb-1">Year</label>
          <input
            type="number"
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            placeholder="e.g. 2019"
            className="w-full border border-[#CFCBC2] bg-white px-2.5 py-1.5 text-xs font-mono tabular-nums"
          />
        </div>

        <div>
          <label className="block text-[11px] font-medium text-[#525866] mb-1">Impact Type</label>
          <select
            value={impactTypeFilter}
            onChange={(e) => setImpactTypeFilter(e.target.value)}
            className="w-full border border-[#CFCBC2] bg-white px-2.5 py-1.5 text-xs"
          >
            <option value="all">All 9 Human-Impact Categories</option>
            {IMPACT_TYPES.filter((t) => t !== 'all').map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-[#525866] mb-1">
            Source / Event Search
          </label>
          <input
            type="text"
            value={sourceSearch}
            onChange={(e) => setSourceSearch(e.target.value)}
            placeholder="Filter by source or title..."
            className="w-full border border-[#CFCBC2] bg-white px-2.5 py-1.5 text-xs"
          />
        </div>
      </section>

      {/* Human Impact Records Table */}
      {filteredRows.length > 0 ? (
        <section className="bg-white border border-[#E4E2DC] overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead className="bg-[#F1EFEA] border-b border-[#CFCBC2]">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-[#0F1E36]">
                  Impact Category &amp; Certainty
                </th>
                <th className="text-left px-4 py-3 font-semibold text-[#0F1E36]">
                  Country &amp; Event / Movement
                </th>
                <th className="text-left px-4 py-3 font-semibold text-[#0F1E36]">
                  Documented Figure / Finding
                </th>
                <th className="text-left px-4 py-3 font-semibold text-[#0F1E36]">
                  Source, Date &amp; Definition
                </th>
                <th className="text-right px-4 py-3 font-semibold text-[#0F1E36]">Provenance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E4E2DC]">
              {filteredRows.slice(0, 120).map((row) => (
                <tr key={row.id} className="hover:bg-[#F8F7F4] align-top">
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <div className="font-semibold text-[#0F1E36]">{row.category}</div>
                    <div className="text-[11px] text-[#9E2A2B] mt-0.5">{row.certainty}</div>
                  </td>

                  <td className="px-4 py-3.5">
                    <div className="font-medium text-[#1C1F26]">{row.countryName}</div>
                    <div className="text-[#525866] mt-0.5">{row.movementOrEventName}</div>
                    <div className="font-mono text-[11px] text-[#767D8C] tabular-nums">
                      Year: {row.year ?? 'Unspecified'}
                    </div>
                  </td>

                  <td className="px-4 py-3.5 max-w-xs">
                    <div className="font-mono font-medium text-[#1C1F26]">{row.figureDisplay}</div>
                    {row.competingAccountNote && (
                      <div className="mt-1.5 p-2 bg-[#FDF2F2] border border-[#9E2A2B]/30 text-[11px] text-[#7D2021]">
                        <strong>Disagreement in reports:</strong> {row.competingAccountNote}
                      </div>
                    )}
                  </td>

                  <td className="px-4 py-3.5 max-w-md">
                    <div className="font-medium text-[#1C1F26]">{row.sourceName}</div>
                    <div className="font-mono text-[11px] text-[#525866] tabular-nums">
                      Reported: {row.reportingDate}
                    </div>
                    <div className="text-[11px] text-[#525866] mt-1 leading-relaxed">
                      Definition: {row.sourceDefinition}
                    </div>
                  </td>

                  <td className="px-4 py-3.5 text-right whitespace-nowrap space-y-1">
                    <div>
                      <button
                        type="button"
                        onClick={() => {
                          if (row.originType === 'movement_dossier') {
                            setSelectedMovementId(row.originId);
                            setActivePage('movements');
                          } else {
                            const ev = activeEvents.find((e) => e.id === row.originId);
                            if (ev) setInspectedEvent(ev);
                          }
                        }}
                        className="text-[#0F1E36] hover:text-[#9E2A2B] underline font-medium cursor-pointer"
                      >
                        Inspect Record
                      </button>
                    </div>
                    {row.sourceUrl && (
                      <div>
                        <a
                          href={row.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-[#525866] hover:text-[#0F1E36] underline"
                        >
                          <span>Source Link</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredRows.length > 120 && (
            <div className="p-3 bg-[#F8F7F4] border-t border-[#E4E2DC] text-xs text-[#525866] text-center">
              Showing first 120 of {filteredRows.length.toLocaleString()} matching human-impact
              records. Refine country, year, or category filters above to narrow results.
            </div>
          )}
        </section>
      ) : (
        <section className="bg-white border border-[#E4E2DC] p-10 text-center space-y-4">
          <h2 className="text-lg font-semibold text-[#0F1E36]">
            Not reported in the available sources.
          </h2>
          <p className="text-xs text-[#525866] max-w-xl mx-auto leading-relaxed">
            No documented human-impact entries match your current filter selection—or historical
            datasets have not yet been imported. Import Harvard Mass Mobilization in Data Sources to
            inspect categorical state-response coercion records, or add source-attributed casualty
            and disruption reports in Movement Explorer.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => setActivePage('sources')}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-[#0F1E36] rounded cursor-pointer"
            >
              <Database className="w-3.5 h-3.5" />
              <span>Import Datasets in Data Sources</span>
            </button>
            <button
              type="button"
              onClick={() => setActivePage('movements')}
              className="px-4 py-2 text-xs font-medium text-[#0F1E36] bg-[#F1EFEA] hover:bg-[#E4E2DC] rounded cursor-pointer"
            >
              Document Impact in Movement Explorer
            </button>
          </div>
        </section>
      )}
    </div>
  );
};
