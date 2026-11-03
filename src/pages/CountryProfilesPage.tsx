import React, { useEffect, useMemo, useState } from 'react';
import {
  Search,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  Database,
} from 'lucide-react';
import { useResearch } from '../context/ResearchContext';
import { CountryIndicatorObservation } from '../types/research';
import { WORLD_BANK_INDICATORS } from '../data/worldBankCatalog';
import { ResearchChart } from '../components/ResearchChart';

export const CountryProfilesPage: React.FC = () => {
  const {
    countries,
    countriesLoading,
    countriesError,
    selectedCountryId,
    setSelectedCountryId,
    activeEvents,
    movements,
    fetchCountryIndicators,
    setInspectedEvent,
    setSelectedMovementId,
    setActivePage,
  } = useResearch();

  const [directorySearch, setDirectorySearch] = useState<string>('');
  const [regionFilter, setRegionFilter] = useState<string>('all');

  const [indicators, setIndicators] = useState<CountryIndicatorObservation[]>([]);
  const [indLoading, setIndLoading] = useState<boolean>(false);
  const [indError, setIndError] = useState<string | null>(null);
  const [selectedChartIndicator, setSelectedChartIndicator] = useState<string>('SL.UEM.1524.ZS');

  useEffect(() => {
    if (!selectedCountryId) return;
    let cancelled = false;
    setIndLoading(true);
    setIndError(null);

    fetchCountryIndicators(selectedCountryId)
      .then((obs) => {
        if (!cancelled) setIndicators(obs);
      })
      .catch((err: any) => {
        if (!cancelled)
          setIndError(err?.message || 'Unable to retrieve World Bank indicators for this country.');
      })
      .finally(() => {
        if (!cancelled) setIndLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedCountryId, fetchCountryIndicators]);

  const regions = useMemo(() => {
    const s = new Set(countries.map((c) => c.region).filter(Boolean));
    return Array.from(s).sort();
  }, [countries]);

  const filteredCountries = useMemo(() => {
    const q = directorySearch.trim().toLowerCase();
    return countries.filter((c) => {
      if (regionFilter !== 'all' && c.region !== regionFilter) return false;
      if (
        q &&
        !c.countryName.toLowerCase().includes(q) &&
        !c.id.toLowerCase().includes(q) &&
        !c.iso2Code.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [countries, directorySearch, regionFilter]);

  const selectedCountry = useMemo(
    () => countries.find((c) => c.id === selectedCountryId) || null,
    [countries, selectedCountryId]
  );

  // Country historical protest records
  const countryEvents = useMemo(
    () =>
      activeEvents
        .filter((e) => e.countryId === selectedCountryId)
        .sort((a, b) => (b.startYear || 0) - (a.startYear || 0)),
    [activeEvents, selectedCountryId]
  );

  const countryMovements = useMemo(
    () => movements.filter((m) => m.countryId === selectedCountryId),
    [movements, selectedCountryId]
  );

  // Latest non-null observation per World Bank indicator
  const latestIndicatorSummary = useMemo(() => {
    return WORLD_BANK_INDICATORS.map((spec) => {
      const series = indicators
        .filter((o) => o.indicatorCode === spec.code)
        .sort((a, b) => b.year - a.year);
      const latestNonNull = series.find((o) => o.value !== null) || null;
      const totalYearsChecked = series.length;
      const missingYearsCount = series.filter((o) => o.value === null).length;

      return {
        spec,
        latest: latestNonNull,
        series,
        totalYearsChecked,
        missingYearsCount,
      };
    });
  }, [indicators]);

  const populationLatest = latestIndicatorSummary.find((i) => i.spec.code === 'SP.POP.TOTL')?.latest;
  const urbanLatest = latestIndicatorSummary.find((i) => i.spec.code === 'SP.URB.TOTL.IN.ZS')?.latest;

  // Country Historical Protest Timeline Chart (segregated by dataset)
  const protestTimelineOption = useMemo(() => {
    if (countryEvents.length === 0) return null;
    const byYear = new Map<number, number>();
    for (const ev of countryEvents) {
      if (ev.startYear !== null) {
        byYear.set(ev.startYear, (byYear.get(ev.startYear) || 0) + 1);
      }
    }
    const years = Array.from(byYear.keys()).sort((a, b) => a - b);
    if (years.length === 0) return null;

    return {
      tooltip: { trigger: 'axis' },
      grid: { left: 44, right: 20, top: 18, bottom: 32 },
      xAxis: {
        type: 'category',
        data: years.map(String),
        axisLabel: { fontFamily: 'IBM Plex Mono', fontSize: 11, color: '#525866' },
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        splitLine: { lineStyle: { color: '#E4E2DC' } },
        axisLabel: { fontFamily: 'IBM Plex Mono', fontSize: 11, color: '#525866' },
      },
      series: [
        {
          name: 'Recorded Observations',
          type: 'bar',
          data: years.map((y) => byYear.get(y) || 0),
          itemStyle: { color: '#0F1E36' },
          barMaxWidth: 20,
        },
      ],
    };
  }, [countryEvents]);

  // Socioeconomic Indicator Time-Series Chart (preserving null gaps — connectNulls: false!)
  const activeMacroSummary = latestIndicatorSummary.find(
    (s) => s.spec.code === selectedChartIndicator
  );

  const macroChartOption = useMemo(() => {
    if (!activeMacroSummary || activeMacroSummary.series.length === 0) return null;
    const asc = [...activeMacroSummary.series].sort((a, b) => a.year - b.year);
    const hasAnyValue = asc.some((o) => o.value !== null);
    if (!hasAnyValue) return null;

    return {
      tooltip: {
        trigger: 'axis',
        valueFormatter: (v: any) =>
          v === null || v === undefined ? 'Data unavailable (missing observation)' : Number(v).toFixed(2),
      },
      grid: { left: 54, right: 20, top: 20, bottom: 34 },
      xAxis: {
        type: 'category',
        data: asc.map((o) => String(o.year)),
        axisLabel: { fontFamily: 'IBM Plex Mono', fontSize: 11, color: '#525866' },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: '#E4E2DC' } },
        axisLabel: { fontFamily: 'IBM Plex Mono', fontSize: 11, color: '#525866' },
      },
      series: [
        {
          name: activeMacroSummary.spec.shortLabel,
          type: 'line',
          connectNulls: false,
          data: asc.map((o) => o.value),
          itemStyle: { color: '#9E2A2B' },
          lineStyle: { width: 2, color: '#9E2A2B' },
          symbolSize: 5,
        },
      ],
    };
  }, [activeMacroSummary]);

  // Structured Research Questions Analysis from Loaded Evidence
  const documentedDemandsSummary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const ev of countryEvents) {
      for (const d of ev.demands) {
        if (d.trim()) counts.set(d.trim(), (counts.get(d.trim()) || 0) + 1);
      }
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [countryEvents]);

  const documentedResponsesSummary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const ev of countryEvents) {
      for (const s of ev.stateResponses) {
        if (s.trim()) counts.set(s.trim(), (counts.get(s.trim()) || 0) + 1);
      }
      if (ev.campaignOutcome) {
        counts.set(`Campaign outcome: ${ev.campaignOutcome}`, (counts.get(`Campaign outcome: ${ev.campaignOutcome}`) || 0) + 1);
      }
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [countryEvents]);

  const formatIndicatorNumber = (val: number | null, code: string) => {
    if (val === null) return 'Data unavailable';
    if (code === 'SP.POP.TOTL') return Math.round(val).toLocaleString();
    if (code === 'NY.GDP.PCAP.CD')
      return `$${val.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    return `${val.toFixed(2)}%`;
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="border-b border-[#E4E2DC] pb-6">
        <div className="text-xs text-[#525866] mb-1">
          Global Sovereign &amp; Territorial Directory · World Bank Open Data API v2 + Historical Archives
        </div>
        <h1 className="text-3xl lg:text-4xl font-semibold text-[#0F1E36]">
          Country Profiles &amp; Socioeconomic Context
        </h1>
        <p className="text-sm text-[#525866] mt-2 max-w-3xl leading-relaxed">
          Explore national protest histories alongside official World Bank macroeconomic,
          demographic, labour, and educational series across every world region. Missing country-year
          observations are explicitly disclosed and never replaced with zero.
        </p>
      </header>

      {countriesError && (
        <div className="bg-[#FDF2F2] border border-[#9E2A2B]/40 p-4 flex items-center gap-3 text-xs text-[#7D2021]">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>World Bank Country Directory Error: {countriesError}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Global Country Selector Sidebar */}
        <aside className="lg:col-span-3 bg-white border border-[#E4E2DC] p-4 space-y-3">
          <div className="text-xs font-semibold text-[#0F1E36]">
            Global Directory ({filteredCountries.length} countries)
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#767D8C] absolute left-2.5 top-2.5" />
            <input
              type="text"
              value={directorySearch}
              onChange={(e) => setDirectorySearch(e.target.value)}
              placeholder="Search country or ISO3..."
              className="w-full border border-[#CFCBC2] pl-8 pr-2.5 py-1.5 text-xs"
            />
          </div>

          <select
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
            className="w-full border border-[#CFCBC2] bg-white px-2.5 py-1.5 text-xs text-[#1C1F26]"
          >
            <option value="all">All World Regions</option>
            {regions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>

          {countriesLoading ? (
            <div className="py-8 text-center text-xs text-[#525866]">
              Loading World Bank global directory...
            </div>
          ) : (
            <div className="max-h-[620px] overflow-y-auto divide-y divide-[#E4E2DC] border-t border-[#E4E2DC]">
              {filteredCountries.map((c) => {
                const active = c.id === selectedCountryId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedCountryId(c.id)}
                    className={`w-full text-left px-2.5 py-2 text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#0F1E36] text-white font-medium'
                        : 'text-[#1C1F26] hover:bg-[#F8F7F4]'
                    }`}
                  >
                    <span className="truncate">{c.countryName}</span>
                    <span
                      className={`font-mono text-[11px] shrink-0 ${
                        active ? 'text-white/80' : 'text-[#767D8C]'
                      }`}
                    >
                      {c.id}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        {/* Main Country Research Dossier */}
        <div className="lg:col-span-9 space-y-8">
          {/* A. Country Overview */}
          <section className="bg-white border border-[#E4E2DC] p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 border-b border-[#E4E2DC] pb-5">
              <div>
                <div className="text-xs text-[#525866]">
                  <span>ISO-3: </span>
                  <strong className="font-mono text-[#0F1E36]">
                    {selectedCountry?.id || selectedCountryId}
                  </strong>
                  <span className="mx-2">·</span>
                  <span>Region: {selectedCountry?.region || 'Unspecified'}</span>
                  <span className="mx-2">·</span>
                  <span>Income Classification: {selectedCountry?.incomeLevel || 'Unspecified'}</span>
                </div>
                <h2 className="text-3xl font-semibold text-[#0F1E36] mt-1">
                  {selectedCountry?.countryName || selectedCountryId}
                </h2>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIndLoading(true);
                  fetchCountryIndicators(selectedCountryId)
                    .then(setIndicators)
                    .finally(() => setIndLoading(false));
                }}
                disabled={indLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#F1EFEA] hover:bg-[#E4E2DC] text-[#0F1E36] rounded cursor-pointer whitespace-nowrap shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${indLoading ? 'animate-spin' : ''}`} />
                <span>Refresh World Bank Series</span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <div className="text-xs text-[#525866]">Total Population</div>
                <div className="text-lg font-mono font-semibold text-[#0F1E36] tabular-nums mt-0.5">
                  {populationLatest
                    ? formatIndicatorNumber(populationLatest.value, 'SP.POP.TOTL')
                    : indLoading
                      ? 'Loading...'
                      : 'Data unavailable'}
                </div>
                <div className="text-[11px] text-[#767D8C]">
                  {populationLatest
                    ? `Obs. year: ${populationLatest.year} (World Bank)`
                    : 'No observation reported'}
                </div>
              </div>

              <div>
                <div className="text-xs text-[#525866]">Urban Population Share</div>
                <div className="text-lg font-mono font-semibold text-[#0F1E36] tabular-nums mt-0.5">
                  {urbanLatest
                    ? formatIndicatorNumber(urbanLatest.value, 'SP.URB.TOTL.IN.ZS')
                    : indLoading
                      ? 'Loading...'
                      : 'Data unavailable'}
                </div>
                <div className="text-[11px] text-[#767D8C]">
                  {urbanLatest ? `Obs. year: ${urbanLatest.year}` : 'No observation reported'}
                </div>
              </div>

              <div>
                <div className="text-xs text-[#525866]">Recorded Historical Events</div>
                <div className="text-lg font-mono font-semibold text-[#0F1E36] tabular-nums mt-0.5">
                  {countryEvents.length.toLocaleString()}
                </div>
                <div className="text-[11px] text-[#767D8C]">In loaded workspace datasets</div>
              </div>

              <div>
                <div className="text-xs text-[#525866]">Authored Movement Dossiers</div>
                <div className="text-lg font-mono font-semibold text-[#0F1E36] tabular-nums mt-0.5">
                  {countryMovements.length.toLocaleString()}
                </div>
                <div className="text-[11px] text-[#767D8C]">Researcher-verified profiles</div>
              </div>
            </div>
          </section>

          {/* C. Socioeconomic Context (Official World Bank API) */}
          <section className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
              <div>
                <div className="text-xs text-[#525866]">
                  Official World Bank Open Data API (v2) · Country-Level Structural Context
                </div>
                <h3 className="text-xl font-semibold text-[#0F1E36]">
                  Socioeconomic &amp; Demographic Indicators
                </h3>
              </div>
              <span className="text-xs text-[#525866]">
                Click any indicator row to plot its historical series (1990–present)
              </span>
            </div>

            {indError && (
              <div className="bg-[#FDF2F2] border border-[#9E2A2B]/40 p-4 text-xs text-[#7D2021]">
                {indError}
              </div>
            )}

            <div className="bg-white border border-[#E4E2DC] overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead className="bg-[#F1EFEA] border-b border-[#CFCBC2]">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-semibold text-[#0F1E36]">
                      Indicator &amp; Official Code
                    </th>
                    <th className="text-left px-4 py-2.5 font-semibold text-[#0F1E36]">
                      Provenance Label
                    </th>
                    <th className="text-right px-4 py-2.5 font-semibold text-[#0F1E36]">
                      Latest Available Value
                    </th>
                    <th className="text-right px-4 py-2.5 font-semibold text-[#0F1E36]">
                      Observation Year
                    </th>
                    <th className="text-left px-4 py-2.5 font-semibold text-[#0F1E36]">Unit</th>
                    <th className="text-right px-4 py-2.5 font-semibold text-[#0F1E36]">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4E2DC]">
                  {latestIndicatorSummary.map(({ spec, latest, missingYearsCount }) => {
                    const selected = selectedChartIndicator === spec.code;
                    return (
                      <tr
                        key={spec.code}
                        onClick={() => setSelectedChartIndicator(spec.code)}
                        className={`cursor-pointer transition-colors ${
                          selected ? 'bg-[#F8F7F4]' : 'hover:bg-[#F8F7F4]/60'
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className="font-semibold text-[#0F1E36]">{spec.shortLabel}</div>
                          <div className="font-mono text-[11px] text-[#767D8C]">{spec.code}</div>
                        </td>
                        <td className="px-4 py-3 text-[#525866]">{spec.dataLabel}</td>
                        <td className="px-4 py-3 text-right font-mono font-semibold text-[#1C1F26] tabular-nums">
                          {indLoading
                            ? '...'
                            : latest
                              ? formatIndicatorNumber(latest.value, spec.code)
                              : 'Data unavailable'}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-[#525866] tabular-nums">
                          {latest ? latest.year : '—'}
                          {missingYearsCount > 0 && (
                            <span className="text-[10px] text-[#767D8C] block">
                              ({missingYearsCount} missing yrs)
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-[#525866]">{spec.unit}</td>
                        <td className="px-4 py-3 text-right">
                          <a
                            href={`https://data.worldbank.org/indicator/${spec.code}?locations=${selectedCountryId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-[#0F1E36] hover:text-[#9E2A2B] underline"
                          >
                            <span>WDI</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <ResearchChart
              title={`${selectedCountry?.countryName || selectedCountryId}: ${
                activeMacroSummary?.spec.officialName || selectedChartIndicator
              }`}
              datasetAttribution="World Bank Open Data (World Development Indicators)"
              unitExplanation={`Unit: ${activeMacroSummary?.spec.unit || ''} · ${
                activeMacroSummary?.spec.dataLabel || ''
              } · Missing years left blank (never substituted with zero)`}
              option={macroChartOption}
              height={260}
              emptyMessage={
                indLoading
                  ? 'Retrieving historical World Bank series...'
                  : 'Data unavailable — World Bank reports no non-missing observations for this indicator in the selected country.'
              }
              footnote="Methodological Caution: Macroeconomic indicators provide structural background only and do not establish causal responsibility for individual protest events without direct empirical evidence."
            />
          </section>

          {/* B. Historical Protest Activity */}
          <section className="space-y-4">
            <div className="flex items-end justify-between">
              <div>
                <div className="text-xs text-[#525866]">
                  Historical Mobilisation Activity in Loaded Datasets
                </div>
                <h3 className="text-xl font-semibold text-[#0F1E36]">
                  Recorded Protest Events &amp; Resistance Campaigns
                </h3>
              </div>
              {activeEvents.length === 0 && (
                <button
                  type="button"
                  onClick={() => setActivePage('sources')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#0F1E36] rounded cursor-pointer"
                >
                  <Database className="w-3.5 h-3.5" />
                  <span>Import Datasets</span>
                </button>
              )}
            </div>

            <ResearchChart
              title={`Annual Recorded Observations in ${
                selectedCountry?.countryName || selectedCountryId
              }`}
              datasetAttribution="Loaded Historical Workspace Datasets"
              unitExplanation="Count of recorded historical observations per start year"
              option={protestTimelineOption}
              height={240}
              emptyMessage={
                activeEvents.length === 0
                  ? 'No historical dataset imported yet. Load Mass Mobilization or NAVCO in Data Sources.'
                  : `0 historical observations recorded for ${
                      selectedCountry?.countryName || selectedCountryId
                    } in currently imported datasets.`
              }
              onEmptyAction={activeEvents.length === 0 ? () => setActivePage('sources') : undefined}
              emptyActionLabel={activeEvents.length === 0 ? 'Open Data Sources' : undefined}
            />

            {countryEvents.length > 0 && (
              <div className="bg-white border border-[#E4E2DC] divide-y divide-[#E4E2DC] max-h-96 overflow-y-auto">
                {countryEvents.slice(0, 40).map((ev) => (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => setInspectedEvent(ev)}
                    className="w-full text-left p-4 hover:bg-[#F8F7F4] transition-colors flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 cursor-pointer"
                  >
                    <div>
                      <div className="text-xs text-[#525866]">
                        <span className="font-mono tabular-nums">
                          {ev.eventDate || ev.startYear || 'Undated'}
                        </span>
                        <span className="mx-1.5">·</span>
                        <span>{ev.eventType}</span>
                        <span className="mx-1.5">·</span>
                        <span>{ev.datasetName}</span>
                      </div>
                      <div className="text-sm font-semibold text-[#0F1E36] mt-0.5">
                        {ev.eventName}
                      </div>
                    </div>
                    <span className="text-xs text-[#9E2A2B] underline shrink-0">
                      Inspect Provenance
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* D & E. Research Questions & Source Transparency */}
          <section className="bg-white border border-[#E4E2DC] p-6 space-y-6">
            <h3 className="text-xl font-semibold text-[#0F1E36] border-b border-[#E4E2DC] pb-3">
              Structured Country Research Questions &amp; Data-Gap Audit
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs leading-relaxed">
              <div className="space-y-2">
                <h4 className="font-semibold text-[#0F1E36] text-sm">
                  1. What major grievances have appeared historically?
                </h4>
                {documentedDemandsSummary.length > 0 ? (
                  <ul className="list-disc list-inside text-[#1C1F26] space-y-1">
                    {documentedDemandsSummary.slice(0, 6).map(([d, count]) => (
                      <li key={d}>
                        {d} <span className="font-mono text-[#525866]">({count} records)</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[#525866]">
                    No coded grievance records currently loaded for this country. Import Harvard
                    Mass Mobilization or NAVCO to inspect source-coded demands.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold text-[#0F1E36] text-sm">
                  2. Which movements have shaped the country?
                </h4>
                {countryMovements.length > 0 ? (
                  <ul className="space-y-1">
                    {countryMovements.map((m) => (
                      <li key={m.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedMovementId(m.id);
                            setActivePage('movements');
                          }}
                          className="text-[#0F1E36] underline font-medium cursor-pointer"
                        >
                          {m.name} ({m.startDate})
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[#525866]">
                    {countryEvents.filter((e) => e.datasetId === 'navco').length > 0
                      ? `${
                          countryEvents.filter((e) => e.datasetId === 'navco').length
                        } maximalist campaign(s) recorded in NAVCO; 0 researcher-authored dossiers created yet.`
                      : 'No researcher-authored movement profiles recorded for this country yet.'}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold text-[#0F1E36] text-sm">
                  3. What institutional responses &amp; outcomes followed?
                </h4>
                {documentedResponsesSummary.length > 0 ? (
                  <ul className="list-disc list-inside text-[#1C1F26] space-y-1">
                    {documentedResponsesSummary.slice(0, 6).map(([resp, count]) => (
                      <li key={resp}>
                        {resp} <span className="font-mono text-[#525866]">({count})</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[#525866]">
                    State response distributions require imported Mass Mobilization or researcher
                    dossiers.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold text-[#0F1E36] text-sm">
                  4. Which socioeconomic indicators are missing or lagged?
                </h4>
                <ul className="list-disc list-inside text-[#525866] space-y-1">
                  {latestIndicatorSummary.map(({ spec, latest }) => {
                    if (!latest) {
                      return (
                        <li key={spec.code} className="text-[#9E2A2B]">
                          <strong>{spec.shortLabel} ({spec.code}):</strong> Completely absent in
                          World Bank WDI for this country.
                        </li>
                      );
                    }
                    if (latest.year <= 2021) {
                      return (
                        <li key={spec.code}>
                          <strong>{spec.shortLabel}:</strong> Latest observation is lagged (
                          <span className="font-mono">{latest.year}</span>).
                        </li>
                      );
                    }
                    return null;
                  })}
                  {latestIndicatorSummary.every((s) => s.latest && s.latest.year > 2021) && (
                    <li>All 9 core WDI series have observations post-2021 for this country.</li>
                  )}
                </ul>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
