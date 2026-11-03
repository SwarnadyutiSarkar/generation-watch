import React, { useState } from 'react';
import {
  Globe2,
  Map as MapIcon,
  BookOpen,
  Flag,
  HeartHandshake,
  Archive,
  LineChart,
  Database,
  Menu,
  X,
} from 'lucide-react';
import { ResearchProvider, useResearch } from './context/ResearchContext';
import { PageRoute } from './types/research';
import { OverviewPage } from './pages/OverviewPage';
import { GlobalMapPage } from './pages/GlobalMapPage';
import { MovementExplorerPage } from './pages/MovementExplorerPage';
import { CountryProfilesPage } from './pages/CountryProfilesPage';
import { HumanImpactPage } from './pages/HumanImpactPage';
import { HistoricalArchivePage } from './pages/HistoricalArchivePage';
import { ResearchOutlookPage } from './pages/ResearchOutlookPage';
import { DataSourcesPage } from './pages/DataSourcesPage';
import { RecordDetailModal } from './components/RecordDetailModal';

const NAV_ITEMS: Array<{
  id: PageRoute;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'overview', label: 'Overview', icon: Globe2 },
  { id: 'map', label: 'Global Map', icon: MapIcon },
  { id: 'movements', label: 'Movement Explorer', icon: BookOpen },
  { id: 'countries', label: 'Country Profiles', icon: Flag },
  { id: 'impact', label: 'Human Impact', icon: HeartHandshake },
  { id: 'archive', label: 'Historical Archive', icon: Archive },
  { id: 'outlook', label: 'Research & Outlook', icon: LineChart },
  { id: 'sources', label: 'Data Sources', icon: Database },
];

function GenerationWatchWorkspace() {
  const {
    activePage,
    setActivePage,
    activeEvents,
    newsLeads,
    countries,
    movements,
    inspectedEvent,
    setInspectedEvent,
    inspectedNewsLead,
    setInspectedNewsLead,
    updateRecordVerification,
    navigateToCountryProfile,
    startMovementFromEvent,
  } = useResearch();

  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const handleNav = (page: PageRoute) => {
    setActivePage(page);
    setMobileNavOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8F7F4] text-[#1C1F26]">
      {/* Strict 3-Zone Institutional Top Bar */}
      <header className="sticky top-0 z-30 h-14 bg-[#0F1E36] text-white border-b border-[#1E3252] px-4 lg:px-8 flex items-center justify-between gap-8">
        {/* Zone 1: Single-element Brand Wordmark */}
        <a
          href="#overview"
          onClick={(e) => {
            e.preventDefault();
            handleNav('overview');
          }}
          className="font-serif text-lg font-semibold tracking-wide text-white whitespace-nowrap shrink-0"
        >
          GENERATION WATCH
        </a>

        {/* Zone 2: Concise Single-Line Primary Links */}
        <nav
          aria-label="Primary quick navigation"
          className="hidden md:flex items-center gap-6 text-xs font-medium text-white/80"
        >
          <button
            type="button"
            onClick={() => handleNav('overview')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activePage === 'overview' ? 'text-white underline underline-offset-4' : ''
            }`}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => handleNav('map')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activePage === 'map' ? 'text-white underline underline-offset-4' : ''
            }`}
          >
            Global Map
          </button>
          <button
            type="button"
            onClick={() => handleNav('countries')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activePage === 'countries' ? 'text-white underline underline-offset-4' : ''
            }`}
          >
            Country Profiles
          </button>
          <button
            type="button"
            onClick={() => handleNav('archive')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activePage === 'archive' ? 'text-white underline underline-offset-4' : ''
            }`}
          >
            Historical Archive
          </button>
          <button
            type="button"
            onClick={() => handleNav('outlook')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activePage === 'outlook' ? 'text-white underline underline-offset-4' : ''
            }`}
          >
            Research &amp; Outlook
          </button>
        </nav>

        {/* Zone 3: Primary Action + Mobile Menu Trigger */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => handleNav('sources')}
            className="px-3.5 py-1.5 text-xs font-medium text-white bg-[#9E2A2B] hover:bg-[#7D2021] rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Data Sources &amp; Import
          </button>

          <button
            type="button"
            onClick={() => setMobileNavOpen((v) => !v)}
            className="lg:hidden p-1.5 text-white/90 hover:text-white cursor-pointer"
            aria-label="Toggle section directory"
          >
            {mobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Mobile Slide-Down Section Directory */}
      {mobileNavOpen && (
        <div className="lg:hidden bg-white border-b border-[#CFCBC2] px-4 py-4 z-20">
          <nav aria-label="Mobile research navigation" className="grid grid-cols-2 gap-2">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = activePage === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNav(item.id)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 text-xs font-medium rounded text-left cursor-pointer whitespace-nowrap ${
                    active
                      ? 'bg-[#0F1E36] text-white'
                      : 'text-[#1C1F26] hover:bg-[#F1EFEA]'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      )}

      {/* Main 1440px+ Institutional Workspace Layout */}
      <div className="flex-1 flex max-w-[1600px] w-full mx-auto">
        {/* Desktop 8-Section Observatory Rail */}
        <aside className="hidden lg:flex lg:flex-col w-60 shrink-0 border-r border-[#E4E2DC] bg-[#F8F7F4] py-8 px-4 justify-between">
          <div className="space-y-6 sticky top-22">
            <div>
              <div className="px-3 text-[11px] font-medium text-[#767D8C] mb-2">
                Observatory Sections
              </div>
              <nav aria-label="Full observatory navigation" className="space-y-1">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const active = activePage === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleNav(item.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                        active
                          ? 'bg-[#0F1E36] text-white'
                          : 'text-[#1C1F26] hover:bg-[#ECE9E2]'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Quiet Workspace Data Inventory (Actual Loaded Counts Only) */}
            <div className="border-t border-[#E4E2DC] pt-5 px-3 space-y-2.5 text-xs">
              <div className="text-[11px] font-medium text-[#767D8C]">
                Loaded Workspace Inventory
              </div>
              <div className="flex items-center justify-between text-[#525866]">
                <span>Historical Events</span>
                <span className="font-mono text-[#0F1E36] font-medium tabular-nums">
                  {activeEvents.length.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between text-[#525866]">
                <span>Movement Dossiers</span>
                <span className="font-mono text-[#0F1E36] font-medium tabular-nums">
                  {movements.length.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between text-[#525866]">
                <span>GDELT Lead Clusters</span>
                <span className="font-mono text-[#0F1E36] font-medium tabular-nums">
                  {newsLeads.length.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between text-[#525866]">
                <span>WDI Countries</span>
                <span className="font-mono text-[#0F1E36] font-medium tabular-nums">
                  {countries.length.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </aside>

        {/* Active Research Page Viewport */}
        <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-10 py-8 lg:py-10">
          {activePage === 'overview' && <OverviewPage />}
          {activePage === 'map' && <GlobalMapPage />}
          {activePage === 'movements' && <MovementExplorerPage />}
          {activePage === 'countries' && <CountryProfilesPage />}
          {activePage === 'impact' && <HumanImpactPage />}
          {activePage === 'archive' && <HistoricalArchivePage />}
          {activePage === 'outlook' && <ResearchOutlookPage />}
          {activePage === 'sources' && <DataSourcesPage />}
        </main>
      </div>

      {/* Clean Institutional Publication Footer */}
      <footer className="border-t border-[#E4E2DC] bg-white px-4 sm:px-8 py-8 mt-12">
        <div className="max-w-[1520px] mx-auto flex flex-col md:flex-row md:items-start md:justify-between gap-6 text-xs text-[#525866]">
          <div className="max-w-xl space-y-1.5">
            <div className="font-serif text-sm font-semibold text-[#0F1E36]">
              GENERATION WATCH — Global Protest &amp; Youth Movement Observatory
            </div>
            <p className="leading-relaxed">
              Nonpartisan research and educational platform. Historical datasets retain original
              scholarly attributions: Clark &amp; Regan Mass Mobilization (Harvard Dataverse, CC0
              1.0), NAVCO Data Project (Harvard Ash Center), World Bank Open Data (CC BY 4.0), and
              GDELT DOC 2.0 news-discovery leads. Zero fabricated records or synthetic AI forecasts.
            </p>
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNav(item.id)}
                className="hover:text-[#0F1E36] underline decoration-[#CFCBC2] cursor-pointer whitespace-nowrap"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </footer>

      {/* Global Provenance & Researcher Verification Modal */}
      <RecordDetailModal
        eventRecord={inspectedEvent}
        newsLead={inspectedNewsLead}
        onClose={() => {
          setInspectedEvent(null);
          setInspectedNewsLead(null);
        }}
        onSaveVerification={async (id, type, status, notes) => {
          await updateRecordVerification(id, type, status, notes);
        }}
        onNavigateCountry={(iso3) => navigateToCountryProfile(iso3)}
        onCreateMovementStub={(ev) => startMovementFromEvent(ev)}
      />
    </div>
  );
}

export default function App() {
  return (
    <ResearchProvider>
      <GenerationWatchWorkspace />
    </ResearchProvider>
  );
}
