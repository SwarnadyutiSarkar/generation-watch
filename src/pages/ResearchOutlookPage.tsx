import React, { useEffect, useMemo, useState } from 'react';
import {
  Database,
  Download,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { useResearch } from '../context/ResearchContext';
import { CountryIndicatorObservation } from '../types/research';
import { WORLD_BANK_INDICATORS } from '../data/worldBankCatalog';
import { ResearchChart } from '../components/ResearchChart';

const PANEL_MACRO_INDICATORS = WORLD_BANK_INDICATORS.filter((i) =>
  ['SL.UEM.1524.ZS', 'FP.CPI.TOTL.ZG', 'NY.GDP.MKTP.KD.ZG', 'SL.UEM.TOTL.ZS'].includes(i.code)
);

function computePearsonCorrelation(pairs: Array<[number, number]>): number | null {
  const n = pairs.length;
  if (n < 3) return null;
  let sumX = 0;
  let sumY = 0;
  for (const [x, y] of pairs) {
    sumX += x;
    sumY += y;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (const [x, y] of pairs) {
    const dx = x - meanX;
    const dy = y - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const denom = Math.sqrt(denX * denY);
  if (denom === 0) return null;
  return num / denom;
}

export const ResearchOutlookPage: React.FC = () => {
  const {
    activeEvents,
    datasets,
    fetchPanelIndicators,
    setActivePage,
  } = useResearch();

  const [trendDatasetId, setTrendDatasetId] = useState<string>('mass_mobilization');
  const [selectedMacroCode, setSelectedMacroCode] = useState<string>('SL.UEM.1524.ZS');
  const [panelYearRange, setPanelYearRange] = useState<string>('2005:2020');

  const [panelObservations, setPanelObservations] = useState<CountryIndicatorObservation[]>([]);
  const [panelLoading, setPanelLoading] = useState<boolean>(false);
  const [panelError, setPanelError] = useState<string | null>(null);

  const importedHistoricalDatasets = useMemo(
    () =>
      datasets.filter(
        (d) =>
          !d.isFutureRegistryOnly &&
          d.loadedRecordCount > 0 &&
          (d.id === 'mass_mobilization' || d.id === 'navco' || d.id.startsWith('custom_'))
      ),
    [datasets]
  );

  useEffect(() => {
    if (
      importedHistoricalDatasets.length > 0 &&
      !importedHistoricalDatasets.some((d) => d.id === trendDatasetId)
    ) {
      setTrendDatasetId(importedHistoricalDatasets[0].id);
    }
  }, [importedHistoricalDatasets, trendDatasetId]);

  const loadMacroPanel = async () => {
    setPanelLoading(true);
    setPanelError(null);
    try {
      const obs = await fetchPanelIndicators(selectedMacroCode, panelYearRange);
      setPanelObservations(obs);
    } catch (err: any) {
      setPanelError(err?.message || 'Unable to fetch World Bank cross-national panel series.');
    } finally {
      setPanelLoading(false);
    }
  };

  useEffect(() => {
    if (activeEvents.length > 0) {
      loadMacroPanel();
    }
  }, [selectedMacroCode, panelYearRange, activeEvents.length]);

  const selectedDatasetEvents = useMemo(
    () => activeEvents.filter((e) => e.datasetId === trendDatasetId),
    [activeEvents, trendDatasetId]
  );

  // A. Regional Comparison over Decades / Time
  const regionalTrendOption = useMemo(() => {
    if (selectedDatasetEvents.length === 0) return null;
    const regionCounts = new Map<string, number>();
    for (const ev of selectedDatasetEvents) {
      const reg = ev.region && ev.region !== 'Unspecified Region' ? ev.region : 'Country-Attributed';
      regionCounts.set(reg, (regionCounts.get(reg) || 0) + 1);
    }
    const entries = Array.from(regionCounts.entries()).sort((a, b) => b[1] - a[1]);

    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { left: 165, right: 24, top: 16, bottom: 28 },
      xAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: '#E4E2DC' } },
        axisLabel: { fontFamily: 'IBM Plex Mono', fontSize: 11, color: '#525866' },
      },
      yAxis: {
        type: 'category',
        data: entries.map(([k]) => k).reverse(),
        axisLabel: { fontSize: 11, color: '#1C1F26' },
      },
      series: [
        {
          type: 'bar',
          data: entries.map(([, v]) => v).reverse(),
          itemStyle: { color: '#0F1E36' },
          barMaxWidth: 20,
        },
      ],
    };
  }, [selectedDatasetEvents]);

  // B. Socioeconomic Country-Year Panel Matching
  const panelAnalysis = useMemo(() => {
    const [minYStr, maxYStr] = panelYearRange.split(':');
    const minY = Number(minYStr) || 2005;
    const maxY = Number(maxYStr) || 2020;

    // Aggregate protest events by (countryId, year) within selected historical dataset
    const protestByCountryYear = new Map<
      string,
      { countryId: string; countryName: string; year: number; protestCount: number }
    >();

    for (const ev of selectedDatasetEvents) {
      if (
        !ev.countryId ||
        ev.countryId === 'UNK' ||
        ev.startYear === null ||
        ev.startYear < minY ||
        ev.startYear > maxY
      ) {
        continue;
      }
      const key = `${ev.countryId}::${ev.startYear}`;
      const prev = protestByCountryYear.get(key) || {
        countryId: ev.countryId,
        countryName: ev.countryName,
        year: ev.startYear,
        protestCount: 0,
      };
      prev.protestCount += 1;
      protestByCountryYear.set(key, prev);
    }

    // Index World Bank indicator by (countryId, year)
    const wbMap = new Map<string, number | null>();
    for (const obs of panelObservations) {
      wbMap.set(`${obs.countryId}::${obs.year}`, obs.value);
    }

    const matchedRows: Array<{
      countryId: string;
      countryName: string;
      year: number;
      protestCount: number;
      indicatorValue: number;
    }> = [];
    let missingMacroCount = 0;

    for (const [key, item] of protestByCountryYear.entries()) {
      const val = wbMap.get(key);
      if (val === undefined || val === null) {
        missingMacroCount += 1;
      } else {
        matchedRows.push({
          ...item,
          indicatorValue: val,
        });
      }
    }

    const r = computePearsonCorrelation(
      matchedRows.map((m) => [m.indicatorValue, m.protestCount])
    );

    return {
      totalProtestCountryYears: protestByCountryYear.size,
      matchedCount: matchedRows.length,
      missingMacroCount,
      pearsonR: r,
      matchedRows,
    };
  }, [selectedDatasetEvents, panelObservations, panelYearRange]);

  const scatterOption = useMemo(() => {
    if (panelAnalysis.matchedRows.length === 0) return null;
    const spec = PANEL_MACRO_INDICATORS.find((i) => i.code === selectedMacroCode);

    return {
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          const d = params.data;
          return `<strong>${d[2]} (${d[3]})</strong><br/>${
            spec?.shortLabel || selectedMacroCode
          }: ${Number(d[0]).toFixed(2)}<br/>Recorded Observations: ${d[1]}`;
        },
      },
      grid: { left: 54, right: 24, top: 20, bottom: 44 },
      xAxis: {
        type: 'value',
        name: `${spec?.shortLabel || selectedMacroCode} (${spec?.unit || ''})`,
        nameLocation: 'middle',
        nameGap: 28,
        splitLine: { lineStyle: { color: '#E4E2DC' } },
        axisLabel: { fontFamily: 'IBM Plex Mono', fontSize: 11, color: '#525866' },
      },
      yAxis: {
        type: 'value',
        name: 'Recorded Observations (Country-Year)',
        nameLocation: 'middle',
        nameGap: 38,
        splitLine: { lineStyle: { color: '#E4E2DC' } },
        axisLabel: { fontFamily: 'IBM Plex Mono', fontSize: 11, color: '#525866' },
      },
      series: [
        {
          type: 'scatter',
          symbolSize: 7,
          itemStyle: { color: '#0F1E36', opacity: 0.65 },
          data: panelAnalysis.matchedRows.map((r) => [
            r.indicatorValue,
            r.protestCount,
            r.countryName,
            r.year,
          ]),
        },
      ],
    };
  }, [panelAnalysis.matchedRows, selectedMacroCode]);

  // C. NAVCO Campaign Outcomes by Resistance Method (Nonviolent vs Violent)
  const navcoEvents = useMemo(
    () => activeEvents.filter((e) => e.datasetId === 'navco'),
    [activeEvents]
  );

  const navcoOutcomeOption = useMemo(() => {
    if (navcoEvents.length === 0) return null;
    const outcomes = [
      'Full Success',
      'Limited / Partial Concessions',
      'Failure',
      'Ongoing at Dataset Cutoff',
    ];
    const nonviolCounts = outcomes.map(
      (out) =>
        navcoEvents.filter(
          (e) => e.primaryMethod === 'Nonviolent' && e.campaignOutcome === out
        ).length
    );
    const violCounts = outcomes.map(
      (out) =>
        navcoEvents.filter((e) => e.primaryMethod === 'Violent' && e.campaignOutcome === out)
          .length
    );

    return {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { top: 0, textStyle: { fontSize: 11, color: '#525866' } },
      grid: { left: 54, right: 20, top: 34, bottom: 40 },
      xAxis: {
        type: 'category',
        data: ['Full Success', 'Limited Concessions', 'Failure', 'Ongoing'],
        axisLabel: { fontSize: 11, color: '#1C1F26' },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: '#E4E2DC' } },
        axisLabel: { fontFamily: 'IBM Plex Mono', fontSize: 11, color: '#525866' },
      },
      series: [
        {
          name: 'Primarily Nonviolent Campaigns',
          type: 'bar',
          data: nonviolCounts,
          itemStyle: { color: '#2B5B6C' },
          barMaxWidth: 28,
        },
        {
          name: 'Primarily Violent Campaigns',
          type: 'bar',
          data: violCounts,
          itemStyle: { color: '#9E2A2B' },
          barMaxWidth: 28,
        },
      ],
    };
  }, [navcoEvents]);

  // Export Python-compatible country-year panel CSV
  const exportMatchedPanelCsv = () => {
    const header = [
      'country_iso3',
      'country_name',
      'year',
      'dataset_id',
      'protest_observation_count',
      'indicator_code',
      'indicator_value',
    ];
    const lines = [header.join(',')];
    for (const r of panelAnalysis.matchedRows) {
      lines.push(
        [
          r.countryId,
          `"${r.countryName.replace(/"/g, '""')}"`,
          r.year,
          trendDatasetId,
          r.protestCount,
          selectedMacroCode,
          r.indicatorValue,
        ].join(',')
      );
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `generation_watch_country_year_panel_${selectedMacroCode}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-12">
      {/* Header */}
      <header className="border-b border-[#E4E2DC] pb-6">
        <div className="text-xs text-[#525866] mb-1">
          Descriptive &amp; Exploratory Quantitative Analysis · Zero Unvalidated Predictions or Synthetic Risk Scores
        </div>
        <h1 className="text-3xl lg:text-4xl font-semibold text-[#0F1E36]">
          Research &amp; Quantitative Outlook
        </h1>
        <p className="text-sm text-[#525866] mt-2 max-w-3xl leading-relaxed">
          Empirical cross-national panel comparisons, resistance-campaign outcome distributions, and
          transparent methodological foundations for statistical research. Generation Watch never
          uses language models to predict protests or fabricate risk percentages.
        </p>
      </header>

      {/* A & B. Socioeconomic Country-Year Panel Explorer */}
      <section className="space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 border-b border-[#E4E2DC] pb-4">
          <div>
            <div className="text-xs text-[#525866]">
              01 · Matched Country-Year Exploratory Analysis
            </div>
            <h2 className="text-2xl font-semibold text-[#0F1E36]">
              Historical Mobilisation &amp; Socioeconomic Indicators
            </h2>
          </div>

          {panelAnalysis.matchedRows.length > 0 && (
            <button
              type="button"
              onClick={exportMatchedPanelCsv}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#0F1E36] bg-white border border-[#CFCBC2] hover:bg-[#F1EFEA] rounded cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Matched Country-Year Panel (Python / R CSV)</span>
            </button>
          )}
        </div>

        {/* Panel Controls */}
        <div className="bg-white border border-[#E4E2DC] p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-[11px] font-medium text-[#525866] mb-1">
              Historical Protest Dataset
            </label>
            <select
              value={trendDatasetId}
              onChange={(e) => setTrendDatasetId(e.target.value)}
              className="w-full border border-[#CFCBC2] bg-white px-2.5 py-1.5 text-xs"
            >
              {importedHistoricalDatasets.length > 0 ? (
                importedHistoricalDatasets.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.datasetName}
                  </option>
                ))
              ) : (
                <option value="mass_mobilization">No dataset loaded yet</option>
              )}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-[#525866] mb-1">
              World Bank Indicator (X-Axis)
            </label>
            <select
              value={selectedMacroCode}
              onChange={(e) => setSelectedMacroCode(e.target.value)}
              className="w-full border border-[#CFCBC2] bg-white px-2.5 py-1.5 text-xs"
            >
              {PANEL_MACRO_INDICATORS.map((ind) => (
                <option key={ind.code} value={ind.code}>
                  {ind.shortLabel} ({ind.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-[#525866] mb-1">
              Country-Year Panel Window
            </label>
            <select
              value={panelYearRange}
              onChange={(e) => setPanelYearRange(e.target.value)}
              className="w-full border border-[#CFCBC2] bg-white px-2.5 py-1.5 text-xs font-mono"
            >
              <option value="2010:2020">2010–2020 (11 years)</option>
              <option value="2005:2020">2005–2020 (16 years)</option>
              <option value="1995:2010">1995–2010 (16 years)</option>
            </select>
          </div>

          <div>
            <button
              type="button"
              onClick={loadMacroPanel}
              disabled={panelLoading || activeEvents.length === 0}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-[#0F1E36] hover:bg-[#1E3252] rounded cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${panelLoading ? 'animate-spin' : ''}`} />
              <span>{panelLoading ? 'Matching Panel...' : 'Run Panel Join'}</span>
            </button>
          </div>
        </div>

        {panelError && (
          <div className="bg-[#FDF2F2] border border-[#9E2A2B]/40 p-4 flex items-center gap-2 text-xs text-[#7D2021]">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{panelError}</span>
          </div>
        )}

        {/* Observation & Missing-Data Coverage Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-[#E4E2DC] p-4">
            <div className="text-xs text-[#525866]">Active Country-Years in Dataset</div>
            <div className="text-xl font-mono font-semibold text-[#0F1E36] tabular-nums mt-1">
              {panelAnalysis.totalProtestCountryYears.toLocaleString()}
            </div>
            <div className="text-[11px] text-[#767D8C] mt-0.5">Within {panelYearRange} window</div>
          </div>

          <div className="bg-white border border-[#E4E2DC] p-4">
            <div className="text-xs text-[#525866]">Matched Country-Year Pairs (N)</div>
            <div className="text-xl font-mono font-semibold text-[#0F1E36] tabular-nums mt-1">
              {panelAnalysis.matchedCount.toLocaleString()}
            </div>
            <div className="text-[11px] text-[#767D8C] mt-0.5">
              Non-null protest &amp; WDI observations
            </div>
          </div>

          <div className="bg-white border border-[#E4E2DC] p-4">
            <div className="text-xs text-[#525866]">Missing WDI Indicator Pairs</div>
            <div className="text-xl font-mono font-semibold text-[#9E2A2B] tabular-nums mt-1">
              {panelAnalysis.missingMacroCount.toLocaleString()}
            </div>
            <div className="text-[11px] text-[#767D8C] mt-0.5">
              Excluded rather than imputed as zero
            </div>
          </div>

          <div className="bg-white border border-[#E4E2DC] p-4">
            <div className="text-xs text-[#525866]">Descriptive Bivariate Pearson r</div>
            <div className="text-xl font-mono font-semibold text-[#0F1E36] tabular-nums mt-1">
              {panelAnalysis.pearsonR !== null ? panelAnalysis.pearsonR.toFixed(3) : 'N/A'}
            </div>
            <div className="text-[11px] text-[#767D8C] mt-0.5">
              Exploratory association (not causal)
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ResearchChart
            title={`Country-Year Scatter: ${selectedMacroCode} vs. Recorded Observations`}
            datasetAttribution={`Matched Panel (N = ${panelAnalysis.matchedCount.toLocaleString()} country-years)`}
            unitExplanation="Each point is one exact (country, year) pair with non-missing observations in both sources"
            option={scatterOption}
            height={300}
            emptyMessage={
              activeEvents.length === 0
                ? 'Import Mass Mobilization or NAVCO in Data Sources to join historical protest counts with World Bank country-year indicators.'
                : panelLoading
                  ? 'Joining historical country-year observations with World Bank WDI...'
                  : 'No matching country-year pairs found for the selected window.'
            }
            onEmptyAction={activeEvents.length === 0 ? () => setActivePage('sources') : undefined}
            emptyActionLabel={activeEvents.length === 0 ? 'Import Dataset' : undefined}
            footnote="Non-Causation Notice: Cross-national bivariate correlation does not account for country fixed effects, regime openness, reporting media freedom, or population scale, and never proves causation."
          />

          <ResearchChart
            title="Regional Distribution of Selected Historical Dataset"
            datasetAttribution={
              datasets.find((d) => d.id === trendDatasetId)?.datasetName ||
              'Selected Historical Dataset'
            }
            unitExplanation="Count of recorded observations grouped by world region"
            option={regionalTrendOption}
            height={300}
            onEmptyAction={() => setActivePage('sources')}
            emptyActionLabel="Import Dataset"
          />
        </div>
      </section>

      {/* C. Campaign Outcomes (NAVCO) */}
      <section className="space-y-4">
        <div className="border-b border-[#E4E2DC] pb-3">
          <div className="text-xs text-[#525866]">
            02 · Resistance Strategy &amp; Outcome Patterns (Harvard NAVCO)
          </div>
          <h2 className="text-2xl font-semibold text-[#0F1E36]">
            Nonviolent vs. Violent Maximalist Campaign Outcomes
          </h2>
        </div>

        <ResearchChart
          title="Documented Campaign Outcomes by Primary Resistance Method"
          datasetAttribution={`Harvard NAVCO (${navcoEvents.length.toLocaleString()} campaigns loaded)`}
          unitExplanation="Count of maximalist campaigns (1900–2021) by primary method and coded outcome"
          option={navcoOutcomeOption}
          height={300}
          emptyMessage="Import the official Harvard NAVCO dataset in Data Sources to examine empirical outcome distributions between primarily nonviolent and primarily violent maximalist campaigns."
          onEmptyAction={() => setActivePage('sources')}
          emptyActionLabel="Inspect & Import NAVCO in Data Sources"
          footnote="Dataset Limitation: NAVCO includes only maximalist campaigns (>=1,000 observed participants seeking regime change, anti-occupation, or secession). Endogeneity—where movement strategy reflects state repression capacity and coalition breadth—limits simple causal interpretation."
        />
      </section>

      {/* D. Future Outlook: Evidence and Limitations */}
      <section className="bg-white border border-[#E4E2DC] p-6 lg:p-10 space-y-6">
        <div className="border-b border-[#E4E2DC] pb-4">
          <div className="text-xs font-semibold text-[#9E2A2B]">
            03 · Methodological Governance &amp; Future Quantitative Architecture
          </div>
          <h2 className="text-2xl lg:text-3xl font-semibold text-[#0F1E36] mt-1">
            Future Outlook: Evidence and Limitations
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 text-sm text-[#1C1F26] leading-relaxed">
          <div className="space-y-4">
            <h3 className="text-base font-semibold text-[#0F1E36]">
              Why Generation Watch Displays No Risk Scores or Forecast Dates Today
            </h3>
            <p className="text-[#525866]">
              Generation Watch deliberately refrains from displaying country &ldquo;protest risk
              scores&rdquo;, probability percentages, or predicted uprising dates. Unvalidated
              indices—or language-model extrapolations—create an illusion of precision while
              confounding media visibility with underlying grievance and mobilisation capacity.
            </p>
            <p className="text-[#525866]">
              Before any statistical projection could responsibly appear in this observatory, the
              following evidentiary and validation prerequisites must be satisfied:
            </p>
            <ul className="list-disc list-inside text-xs text-[#525866] space-y-1.5">
              <li>
                <strong>Post-2020 Global Event Continuity:</strong> Public CC0 Mass Mobilization
                coverage terminates in March 2020; responsible panel estimation requires harmonised,
                audited event series covering 2020–present with transparent media-bias corrections.
              </li>
              <li>
                <strong>Sub-Annual Institutional &amp; Price Covariates:</strong> Annual World Bank
                averages obscure rapid food-price spikes (FAOSTAT), currency shocks, electoral
                calendars, and institutional rule-of-law shifts (V-Dem).
              </li>
              <li>
                <strong>Strict Walk-Forward Validation:</strong> Candidate models (negative-binomial
                country-year panels, regularised logistic regression for defined onset thresholds,
                hierarchical Bayesian time-series) must be evaluated out-of-sample using strict
                temporal cutoffs, Brier/log-loss calibration curves, and explicit uncertainty
                intervals.
              </li>
            </ul>
          </div>

          <div className="space-y-4">
            <h3 className="text-base font-semibold text-[#0F1E36]">
              Python-Compatible Statistical Pipeline &amp; Ethical Boundaries
            </h3>
            <p className="text-[#525866]">
              The platform&rsquo;s normalised data model and country-year panel exporter above are
              structured for clean ingestion into Python (<code>pandas</code>,{' '}
              <code>statsmodels</code>, <code>scikit-learn</code>) and R panel-econometrics
              workflows without altering source provenance labels.
            </p>

            <div className="bg-[#F8F7F4] border border-[#E4E2DC] p-4 space-y-2 text-xs">
              <div className="font-semibold text-[#0F1E36]">
                Permanent Research Ethics &amp; Non-Surveillance Commitments
              </div>
              <ul className="list-disc list-inside text-[#525866] space-y-1.5">
                <li>
                  Generation Watch studies aggregate macro-political conditions and historical
                  movements—never individuals, organisers, student leaders, or private groups.
                </li>
                <li>
                  No future statistical model on this platform will ever target specific localities,
                  dates, demonstrations, or participants.
                </li>
                <li>
                  Any future validated aggregate model output will carry the explicit provenance
                  label <em>&ldquo;Statistical projection&rdquo;</em> alongside its training window,
                  error bounds, and missing-data exclusions.
                </li>
              </ul>
            </div>

            {activeEvents.length === 0 && (
              <button
                type="button"
                onClick={() => setActivePage('sources')}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-[#0F1E36] rounded cursor-pointer"
              >
                <Database className="w-3.5 h-3.5" />
                <span>Load Historical Datasets to Enable Panel Export</span>
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
