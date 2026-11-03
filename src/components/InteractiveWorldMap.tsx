import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { EventRecord, NewsArticleLead } from '../types/research';
import { COUNTRY_GEOGRAPHIC_CENTROIDS } from '../data/countryCentroids';
import { resolveCountryIso3 } from '../data/worldBankCatalog';

export interface CountryMapAggregate {
  countryId: string;
  countryName: string;
  historicalCount: number;
  corroboratedCount: number;
  newsLeadCount: number;
}

interface InteractiveWorldMapProps {
  coordinateEvents: EventRecord[];
  countryAggregates: CountryMapAggregate[];
  newsLeads?: NewsArticleLead[];
  showHistoricalLayer: boolean;
  showCountrySummaryLayer: boolean;
  showNewsLeadLayer: boolean;
  selectedCountryId?: string;
  heightClass?: string;
  onSelectEvent: (ev: EventRecord) => void;
  onSelectCountry: (countryId: string, countryName: string) => void;
}

export const InteractiveWorldMap: React.FC<InteractiveWorldMapProps> = ({
  coordinateEvents,
  countryAggregates,
  newsLeads = [],
  showHistoricalLayer,
  showCountrySummaryLayer,
  showNewsLeadLayer,
  selectedCountryId,
  heightClass = 'h-[480px]',
  onSelectEvent,
  onSelectCountry,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [18, 12],
      zoom: 2,
      minZoom: 2,
      maxZoom: 14,
      worldCopyJump: true,
      scrollWheelZoom: true,
    });

    // Clean publication-grade CartoDB Positron / OSM base tiles
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    const group = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerGroupRef.current = group;

    return () => {
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    // 1. Country-Level Summary Layer (for country-attributed records lacking sub-national coordinates)
    if (showCountrySummaryLayer) {
      for (const agg of countryAggregates) {
        if (agg.historicalCount === 0) continue;
        const coords = COUNTRY_GEOGRAPHIC_CENTROIDS[agg.countryId];
        if (!coords) continue;

        const isSelected = selectedCountryId === agg.countryId;
        const radius = Math.min(26, Math.max(8, 6 + Math.log2(agg.historicalCount + 1) * 3.2));

        const circle = L.circleMarker(coords, {
          radius,
          color: isSelected ? '#9E2A2B' : '#0F1E36',
          weight: isSelected ? 2.5 : 1.5,
          dashArray: '4 3',
          fillColor: isSelected ? '#9E2A2B' : '#1E3252',
          fillOpacity: isSelected ? 0.32 : 0.16,
        });

        circle.bindTooltip(
          `<div style="font-family: Public Sans, sans-serif; font-size: 12px; color: #1C1F26;">
            <strong>${escapeHtml(agg.countryName)} (${escapeHtml(agg.countryId)})</strong><br/>
            <span>Country-Level Summary: <strong>${agg.historicalCount.toLocaleString()}</strong> historical records</span><br/>
            <span style="color:#525866; font-size:11px;">Country interior reference — exact city coordinates not assumed</span>
          </div>`,
          { direction: 'top', sticky: true }
        );

        circle.on('click', () => {
          onSelectCountry(agg.countryId, agg.countryName);
        });

        circle.addTo(group);
      }
    }

    // 2. News-Derived Country Leads Layer (clustered by GDELT sourcecountry; never plotted as confirmed city events)
    if (showNewsLeadLayer && newsLeads.length > 0) {
      const byCountry = new Map<string, { name: string; count: number }>();
      for (const lead of newsLeads) {
        if (!lead.country) continue;
        const iso3 = resolveCountryIso3(lead.country);
        if (!COUNTRY_GEOGRAPHIC_CENTROIDS[iso3]) continue;
        const prev = byCountry.get(iso3) || { name: lead.country, count: 0 };
        prev.count += 1;
        byCountry.set(iso3, prev);
      }

      for (const [iso3, info] of byCountry.entries()) {
        const base = COUNTRY_GEOGRAPHIC_CENTROIDS[iso3];
        if (!base) continue;
        // Slight visual offset only if historical country summary is also rendered so both remain clickable
        const markerPos: [number, number] = showCountrySummaryLayer
          ? [base[0] + 0.9, base[1] + 0.9]
          : base;

        const leadMarker = L.circleMarker(markerPos, {
          radius: Math.min(16, 6 + Math.sqrt(info.count) * 2.5),
          color: '#9E2A2B',
          weight: 1.75,
          dashArray: '2 3',
          fillColor: '#9E2A2B',
          fillOpacity: 0.24,
        });

        leadMarker.bindTooltip(
          `<div style="font-family: Public Sans, sans-serif; font-size: 12px; color: #1C1F26;">
            <strong>${escapeHtml(info.name)}</strong><br/>
            <span>News-Derived Leads: <strong>${info.count}</strong> article cluster(s)</span><br/>
            <span style="color:#9E2A2B; font-size:11px;">Unverified media coverage — click to inspect country records</span>
          </div>`,
          { direction: 'top' }
        );

        leadMarker.on('click', () => {
          onSelectCountry(iso3, info.name);
        });

        leadMarker.addTo(group);
      }
    }

    // 3. Exact Point-Coordinate Historical Records (ONLY records with verified lat/lng in dataset)
    if (showHistoricalLayer) {
      // Cap rendered point markers to 1,200 at once for smooth DOM/SVG performance
      const points = coordinateEvents.slice(0, 1200);
      for (const ev of points) {
        if (ev.latitude === null || ev.longitude === null) continue;
        const isCorroborated = ev.verificationStatus === 'corroborated';

        const marker = L.circleMarker([ev.latitude, ev.longitude], {
          radius: isCorroborated ? 6.5 : 5,
          color: isCorroborated ? '#14532D' : '#0F1E36',
          weight: 1.5,
          fillColor: isCorroborated ? '#166534' : '#0F1E36',
          fillOpacity: 0.85,
        });

        marker.bindTooltip(
          `<div style="font-family: Public Sans, sans-serif; font-size: 12px; color: #1C1F26;">
            <strong>${escapeHtml(ev.eventName)}</strong><br/>
            <span>${escapeHtml(ev.countryName)}${ev.locationName ? ` · ${escapeHtml(ev.locationName)}` : ''} · ${escapeHtml(ev.eventDate || String(ev.startYear || 'Undated'))}</span><br/>
            <span style="color:#525866; font-size:11px;">${escapeHtml(ev.recordType)} · Click for provenance</span>
          </div>`,
          { direction: 'top' }
        );

        marker.on('click', () => {
          onSelectEvent(ev);
        });

        marker.addTo(group);
      }
    }
  }, [
    coordinateEvents,
    countryAggregates,
    newsLeads,
    showHistoricalLayer,
    showCountrySummaryLayer,
    showNewsLeadLayer,
    selectedCountryId,
    onSelectEvent,
    onSelectCountry,
  ]);

  // Pan gently when selectedCountryId changes if centroid known
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedCountryId) return;
    const centroid = COUNTRY_GEOGRAPHIC_CENTROIDS[selectedCountryId];
    if (centroid && map.getZoom() > 3) {
      map.panTo(centroid, { animate: true });
    }
  }, [selectedCountryId]);

  return (
    <div className="relative border border-[#E4E2DC] bg-[#E8ECEF]">
      <div ref={mapContainerRef} className={`w-full ${heightClass} z-0`} />

      {/* Transparent Methodological Map Legend */}
      <div className="bg-white/95 border-t border-[#E4E2DC] px-4 py-3 flex flex-wrap items-center justify-between gap-4 text-xs text-[#525866]">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <span className="inline-flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#0F1E36]" />
            <span>Exact Coordinate Observation ({coordinateEvents.length.toLocaleString()})</span>
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#166534]" />
            <span>Researcher-Corroborated Coordinate Record</span>
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-full border border-dashed border-[#0F1E36] bg-[#1E3252]/20" />
            <span>Country-Level Summary (Country attribution only; no city coordinates assumed)</span>
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-full border border-dashed border-[#9E2A2B] bg-[#9E2A2B]/25" />
            <span>News-Derived Country Leads (Unverified GDELT coverage)</span>
          </span>
        </div>
        <span className="text-[11px] text-[#767D8C]">
          Coordinates are never fabricated or defaulted to national capitals.
        </span>
      </div>
    </div>
  );
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
