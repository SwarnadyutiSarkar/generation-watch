import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Search,
  Edit3,
  Trash2,
  ExternalLink,
  Download,
  X,
} from 'lucide-react';
import { useResearch } from '../context/ResearchContext';
import {
  EventClassification,
  HumanImpactReportItem,
  MovementProfile,
  MovementSourceItem,
  MovementTimelineItem,
  VerificationStatus,
} from '../types/research';

const CLASSIFICATIONS: EventClassification[] = [
  'Youth-led movement',
  'Student movement',
  'Labour movement',
  'Civil resistance campaign',
  'Organised protest campaign',
  'General public demonstration',
  'Individual protest event',
  'Violent demonstration',
];

const IMPACT_CATEGORIES: HumanImpactReportItem['category'][] = [
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

function createEmptyMovementForm(defaultCountryId: string, defaultCountryName: string): MovementProfile {
  const now = new Date().toISOString();
  return {
    id: `mov_${Date.now()}`,
    name: '',
    countryId: defaultCountryId,
    countryName: defaultCountryName,
    region: '',
    startDate: '',
    endDate: '',
    classification: 'Organised protest campaign',
    overview: '',
    background: '',
    immediateTrigger: '',
    underlyingCauses: '',
    demands: [],
    participantsAndLeadership: '',
    youthInvolvementEvidence: '',
    youthLeadershipClassification: 'Insufficient evidence',
    governmentResponse: '',
    humanImpactSummary: '',
    humanImpactReports: [],
    timeline: [],
    outcomes: '',
    longTermConsequences: '',
    relatedMovementIds: [],
    sources: [],
    publicationStatus: 'Published Research Record',
    verificationStatus: 'reviewed',
    recordType: 'Independently verified research record',
    createdAt: now,
    updatedAt: now,
  };
}

export const MovementExplorerPage: React.FC = () => {
  const {
    movements,
    countries,
    selectedMovementId,
    setSelectedMovementId,
    draftMovementSeed,
    setDraftMovementSeed,
    saveMovementProfile,
    deleteMovementProfile,
    navigateToCountryProfile,
  } = useResearch();

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterCountry, setFilterCountry] = useState<string>('all');
  const [filterClassification, setFilterClassification] = useState<string>('all');

  const [editorOpen, setEditorOpen] = useState<boolean>(false);
  const [formState, setFormState] = useState<MovementProfile>(() =>
    createEmptyMovementForm('KEN', 'Kenya')
  );
  const [demandsInput, setDemandsInput] = useState<string>('');

  // Sub-builders in editor
  const [newTimelineDate, setNewTimelineDate] = useState<string>('');
  const [newTimelineText, setNewTimelineText] = useState<string>('');
  const [newSourceTitle, setNewSourceTitle] = useState<string>('');
  const [newSourceUrl, setNewSourceUrl] = useState<string>('');
  const [newSourcePub, setNewSourcePub] = useState<string>('');

  const [impactCategory, setImpactCategory] =
    useState<HumanImpactReportItem['category']>('Fatalities');
  const [impactFigureText, setImpactFigureText] = useState<string>('');
  const [impactNumeric, setImpactNumeric] = useState<string>('');
  const [impactCertainty, setImpactCertainty] =
    useState<HumanImpactReportItem['certainty']>('Reported');
  const [impactSource, setImpactSource] = useState<string>('');
  const [impactSourceUrl, setImpactSourceUrl] = useState<string>('');
  const [impactDate, setImpactDate] = useState<string>('');
  const [impactDef, setImpactDef] = useState<string>('');
  const [impactCompeting, setImpactCompeting] = useState<string>('');

  const [confirmDelete, setConfirmDelete] = useState<boolean>(false);

  // Open editor automatically if user clicked "Author Movement Dossier from Record"
  useEffect(() => {
    if (draftMovementSeed) {
      const base = createEmptyMovementForm(
        draftMovementSeed.countryId || 'KEN',
        draftMovementSeed.countryName || 'Kenya'
      );
      const merged: MovementProfile = {
        ...base,
        ...draftMovementSeed,
        id: `mov_${Date.now()}`,
      };
      setFormState(merged);
      setDemandsInput((merged.demands || []).join('\n'));
      setEditorOpen(true);
      setDraftMovementSeed(null);
    }
  }, [draftMovementSeed, setDraftMovementSeed]);

  const filteredMovements = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return movements.filter((m) => {
      if (filterCountry !== 'all' && m.countryId !== filterCountry) return false;
      if (filterClassification !== 'all' && m.classification !== filterClassification)
        return false;
      if (
        q &&
        !m.name.toLowerCase().includes(q) &&
        !m.countryName.toLowerCase().includes(q) &&
        !m.overview.toLowerCase().includes(q) &&
        !m.demands.some((d) => d.toLowerCase().includes(q))
      ) {
        return false;
      }
      return true;
    });
  }, [movements, searchQuery, filterCountry, filterClassification]);

  const activeMovement = useMemo(
    () =>
      filteredMovements.find((m) => m.id === selectedMovementId) ||
      filteredMovements[0] ||
      null,
    [filteredMovements, selectedMovementId]
  );

  const openNewDossierForm = () => {
    const defaultC = countries.find((c) => c.id === 'KEN') || countries[0];
    const empty = createEmptyMovementForm(
      defaultC?.id || 'KEN',
      defaultC?.countryName || 'Kenya'
    );
    empty.region = defaultC?.region || '';
    setFormState(empty);
    setDemandsInput('');
    setEditorOpen(true);
  };

  const openEditDossierForm = (profile: MovementProfile) => {
    setFormState({ ...profile });
    setDemandsInput(profile.demands.join('\n'));
    setEditorOpen(true);
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formState.name.trim()) return;

    const demands = demandsInput
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    const countryMatch = countries.find((c) => c.id === formState.countryId);

    const payload: MovementProfile = {
      ...formState,
      name: formState.name.trim(),
      countryName: countryMatch?.countryName || formState.countryName,
      region: countryMatch?.region || formState.region || 'Global',
      demands,
      updatedAt: new Date().toISOString(),
    };

    await saveMovementProfile(payload);
    setEditorOpen(false);
  };

  const addTimelineMilestone = () => {
    if (!newTimelineDate.trim() || !newTimelineText.trim()) return;
    const item: MovementTimelineItem = {
      date: newTimelineDate.trim(),
      milestone: newTimelineText.trim(),
    };
    setFormState((prev) => ({ ...prev, timeline: [...prev.timeline, item] }));
    setNewTimelineDate('');
    setNewTimelineText('');
  };

  const addSourceItem = () => {
    if (!newSourceTitle.trim() || !newSourceUrl.trim()) return;
    const item: MovementSourceItem = {
      title: newSourceTitle.trim(),
      url: newSourceUrl.trim(),
      publisher: newSourcePub.trim() || undefined,
      accessDate: new Date().toISOString().slice(0, 10),
    };
    setFormState((prev) => ({ ...prev, sources: [...prev.sources, item] }));
    setNewSourceTitle('');
    setNewSourceUrl('');
    setNewSourcePub('');
  };

  const addHumanImpactEntry = () => {
    if (!impactFigureText.trim() || !impactSource.trim()) return;
    const numVal = impactNumeric.trim() !== '' ? Number(impactNumeric) : null;
    const item: HumanImpactReportItem = {
      id: `imp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      category: impactCategory,
      figureText: impactFigureText.trim(),
      numericValue: numVal !== null && Number.isFinite(numVal) ? numVal : null,
      certainty: impactCertainty,
      sourceName: impactSource.trim(),
      sourceUrl: impactSourceUrl.trim(),
      reportingDate: impactDate.trim() || new Date().toISOString().slice(0, 10),
      sourceDefinition: impactDef.trim() || 'As defined by primary reporting organisation',
      competingAccountNote: impactCompeting.trim() || undefined,
    };
    setFormState((prev) => ({
      ...prev,
      humanImpactReports: [...prev.humanImpactReports, item],
    }));
    setImpactFigureText('');
    setImpactNumeric('');
    setImpactSource('');
    setImpactSourceUrl('');
    setImpactDate('');
    setImpactDef('');
    setImpactCompeting('');
  };

  const exportDossiersJson = () => {
    const blob = new Blob([JSON.stringify(movements, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `generation_watch_movement_dossiers_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="border-b border-[#E4E2DC] pb-6 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <div className="text-xs text-[#525866] mb-1">
            Structured Qualitative &amp; Primary-Source Dossiers · Zero Algorithmic Narrative Fabrication
          </div>
          <h1 className="text-3xl lg:text-4xl font-semibold text-[#0F1E36]">
            Movement Explorer &amp; Editorial Archive
          </h1>
          <p className="text-sm text-[#525866] mt-2 max-w-3xl leading-relaxed">
            Examine or author 14-part movement research profiles documenting historical background,
            immediate triggers, demands, youth participation evidence, institutional responses, and
            source-attributed human consequences. Narratives are never synthesized from incomplete
            CSV rows.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {movements.length > 0 && (
            <button
              type="button"
              onClick={exportDossiersJson}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#0F1E36] bg-white border border-[#CFCBC2] hover:bg-[#F1EFEA] rounded cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Dossiers (JSON)</span>
            </button>
          )}
          <button
            type="button"
            onClick={openNewDossierForm}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium text-white bg-[#9E2A2B] hover:bg-[#7D2021] rounded transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Author Movement Research Profile</span>
          </button>
        </div>
      </header>

      {/* Search & Filter Bar */}
      <div className="bg-white border border-[#E4E2DC] p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-[#767D8C] absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search movement name, demand, or country..."
            className="w-full border border-[#CFCBC2] bg-white pl-8 pr-3 py-1.5 text-xs text-[#1C1F26]"
          />
        </div>

        <select
          value={filterCountry}
          onChange={(e) => setFilterCountry(e.target.value)}
          className="border border-[#CFCBC2] bg-white px-3 py-1.5 text-xs text-[#1C1F26]"
        >
          <option value="all">All Countries</option>
          {Array.from(new Set(movements.map((m) => m.countryId))).map((cid) => {
            const cName = movements.find((m) => m.countryId === cid)?.countryName || cid;
            return (
              <option key={cid} value={cid}>
                {cName} ({cid})
              </option>
            );
          })}
        </select>

        <select
          value={filterClassification}
          onChange={(e) => setFilterClassification(e.target.value)}
          className="border border-[#CFCBC2] bg-white px-3 py-1.5 text-xs text-[#1C1F26]"
        >
          <option value="all">All Movement Classifications</option>
          {CLASSIFICATIONS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* Editorial Research Form Modal / Drawer */}
      {editorOpen && (
        <section className="bg-white border border-[#0F1E36] p-6 lg:p-8 space-y-6">
          <div className="flex items-start justify-between border-b border-[#E4E2DC] pb-4">
            <div>
              <div className="text-xs font-medium text-[#9E2A2B]">
                Researcher-Authored Movement Dossier
              </div>
              <h2 className="text-xl font-semibold text-[#0F1E36] mt-0.5">
                {movements.some((m) => m.id === formState.id)
                  ? `Edit Research Profile: ${formState.name}`
                  : 'Create New Movement Research Profile'}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setEditorOpen(false)}
              className="p-1.5 text-[#525866] hover:text-[#0F1E36] cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSaveForm} className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="lg:col-span-2">
                <label className="block text-xs font-medium text-[#0F1E36] mb-1">
                  Movement Name *
                </label>
                <input
                  type="text"
                  required
                  value={formState.name}
                  onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                  placeholder="e.g. 2011 Chilean Winter Student Mobilisation"
                  className="w-full border border-[#CFCBC2] px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#0F1E36] mb-1">Country *</label>
                <select
                  value={formState.countryId}
                  onChange={(e) => {
                    const c = countries.find((item) => item.id === e.target.value);
                    setFormState({
                      ...formState,
                      countryId: e.target.value,
                      countryName: c?.countryName || e.target.value,
                      region: c?.region || formState.region,
                    });
                  }}
                  className="w-full border border-[#CFCBC2] bg-white px-3 py-2 text-xs"
                >
                  {countries.length > 0 ? (
                    countries.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.countryName} ({c.id})
                      </option>
                    ))
                  ) : (
                    <option value={formState.countryId}>{formState.countryName}</option>
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#0F1E36] mb-1">
                  Movement Classification
                </label>
                <select
                  value={formState.classification}
                  onChange={(e) =>
                    setFormState({
                      ...formState,
                      classification: e.target.value as EventClassification,
                    })
                  }
                  className="w-full border border-[#CFCBC2] bg-white px-3 py-2 text-xs"
                >
                  {CLASSIFICATIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#0F1E36] mb-1">Start Date</label>
                <input
                  type="text"
                  value={formState.startDate}
                  onChange={(e) => setFormState({ ...formState, startDate: e.target.value })}
                  placeholder="YYYY-MM-DD or YYYY"
                  className="w-full border border-[#CFCBC2] px-3 py-2 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#0F1E36] mb-1">
                  End Date (or Ongoing)
                </label>
                <input
                  type="text"
                  value={formState.endDate}
                  onChange={(e) => setFormState({ ...formState, endDate: e.target.value })}
                  placeholder="YYYY-MM-DD or Ongoing"
                  className="w-full border border-[#CFCBC2] px-3 py-2 text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#0F1E36] mb-1">
                  Youth Leadership Evidence Classification
                </label>
                <select
                  value={formState.youthLeadershipClassification}
                  onChange={(e) =>
                    setFormState({
                      ...formState,
                      youthLeadershipClassification:
                        e.target.value as MovementProfile['youthLeadershipClassification'],
                    })
                  }
                  className="w-full border border-[#CFCBC2] bg-white px-3 py-2 text-xs"
                >
                  <option value="Demonstrably youth-led">Demonstrably youth-led</option>
                  <option value="Substantial youth/student coalition">
                    Substantial youth/student coalition
                  </option>
                  <option value="Broad cross-generational participation">
                    Broad cross-generational participation
                  </option>
                  <option value="Insufficient evidence">Insufficient evidence</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#0F1E36] mb-1">
                  Publication &amp; Verification Status
                </label>
                <select
                  value={formState.verificationStatus}
                  onChange={(e) =>
                    setFormState({
                      ...formState,
                      verificationStatus: e.target.value as VerificationStatus,
                    })
                  }
                  className="w-full border border-[#CFCBC2] bg-white px-3 py-2 text-xs"
                >
                  <option value="reviewed">Reviewed Research Record</option>
                  <option value="corroborated">Independently Corroborated</option>
                  <option value="conflicting">Conflicting Primary Accounts</option>
                  <option value="unverified">Unverified Working Note</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#0F1E36] mb-1">
                  01. Executive Overview
                </label>
                <textarea
                  rows={3}
                  value={formState.overview}
                  onChange={(e) => setFormState({ ...formState, overview: e.target.value })}
                  placeholder="Neutral factual summary of what occurred, where, and when..."
                  className="w-full border border-[#CFCBC2] px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#0F1E36] mb-1">
                  02. Historical Background
                </label>
                <textarea
                  rows={3}
                  value={formState.background}
                  onChange={(e) => setFormState({ ...formState, background: e.target.value })}
                  placeholder="Institutional, legal, and historical context preceding mobilisation..."
                  className="w-full border border-[#CFCBC2] px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#0F1E36] mb-1">
                  03. Immediate Trigger
                </label>
                <textarea
                  rows={2}
                  value={formState.immediateTrigger}
                  onChange={(e) => setFormState({ ...formState, immediateTrigger: e.target.value })}
                  placeholder="Specific policy announcement, court ruling, price shock, or incident..."
                  className="w-full border border-[#CFCBC2] px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#0F1E36] mb-1">
                  04. Underlying Structural Causes
                </label>
                <textarea
                  rows={2}
                  value={formState.underlyingCauses}
                  onChange={(e) => setFormState({ ...formState, underlyingCauses: e.target.value })}
                  placeholder="Longer-term socioeconomic, governance, or demographic conditions..."
                  className="w-full border border-[#CFCBC2] px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#0F1E36] mb-1">
                  05. Main Demands (One per line; note internal differences if heterogeneous)
                </label>
                <textarea
                  rows={3}
                  value={demandsInput}
                  onChange={(e) => setDemandsInput(e.target.value)}
                  placeholder="Repeal of specific legislation&#10;Public university funding reform&#10;Independent judicial inquiry"
                  className="w-full border border-[#CFCBC2] px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#0F1E36] mb-1">
                  06. Participants &amp; Organisational Leadership
                </label>
                <textarea
                  rows={3}
                  value={formState.participantsAndLeadership}
                  onChange={(e) =>
                    setFormState({ ...formState, participantsAndLeadership: e.target.value })
                  }
                  placeholder="Documented unions, student federations, civic coalitions, or decentralized networks (do not include PII of ordinary participants)..."
                  className="w-full border border-[#CFCBC2] px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#0F1E36] mb-1">
                  07. Youth Participation &amp; Empirical Evidence
                </label>
                <textarea
                  rows={3}
                  value={formState.youthInvolvementEvidence}
                  onChange={(e) =>
                    setFormState({ ...formState, youthInvolvementEvidence: e.target.value })
                  }
                  placeholder="Document empirical evidence (survey data, student union leadership, age demographics) establishing whether or not youth led the movement..."
                  className="w-full border border-[#CFCBC2] px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#0F1E36] mb-1">
                  08. Government &amp; Institutional Response
                </label>
                <textarea
                  rows={3}
                  value={formState.governmentResponse}
                  onChange={(e) =>
                    setFormState({ ...formState, governmentResponse: e.target.value })
                  }
                  placeholder="Policing tactics, negotiations, legislative concessions, curfews, judicial actions..."
                  className="w-full border border-[#CFCBC2] px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#0F1E36] mb-1">
                  09. Human Impact Narrative Overview
                </label>
                <textarea
                  rows={2}
                  value={formState.humanImpactSummary}
                  onChange={(e) =>
                    setFormState({ ...formState, humanImpactSummary: e.target.value })
                  }
                  placeholder="Summary of documented casualties, arrests, shutdowns, and competing estimates..."
                  className="w-full border border-[#CFCBC2] px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#0F1E36] mb-1">
                  11 &amp; 12. Immediate Outcomes &amp; Long-Term Consequences
                </label>
                <textarea
                  rows={2}
                  value={formState.outcomes}
                  onChange={(e) => setFormState({ ...formState, outcomes: e.target.value })}
                  placeholder="Policy outcomes, institutional reforms, or stalemate..."
                  className="w-full border border-[#CFCBC2] px-3 py-2 text-xs mb-2"
                />
                <input
                  type="text"
                  value={formState.longTermConsequences}
                  onChange={(e) =>
                    setFormState({ ...formState, longTermConsequences: e.target.value })
                  }
                  placeholder="Long-term electoral, constitutional, or social consequences..."
                  className="w-full border border-[#CFCBC2] px-3 py-1.5 text-xs"
                />
              </div>
            </div>

            {/* Structured Disaggregated Human Impact Sub-Form */}
            <div className="bg-[#F8F7F4] border border-[#E4E2DC] p-4 space-y-3">
              <div className="text-xs font-semibold text-[#0F1E36]">
                Structured Human Impact Reports (Synced to Human Impact Research Page)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                <select
                  value={impactCategory}
                  onChange={(e) =>
                    setImpactCategory(e.target.value as HumanImpactReportItem['category'])
                  }
                  className="border border-[#CFCBC2] bg-white px-2.5 py-1.5 text-xs"
                >
                  {IMPACT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={impactFigureText}
                  onChange={(e) => setImpactFigureText(e.target.value)}
                  placeholder="Reported figure (e.g. '39 deaths' or '72h shutdown')"
                  className="border border-[#CFCBC2] bg-white px-2.5 py-1.5 text-xs"
                />
                <input
                  type="number"
                  value={impactNumeric}
                  onChange={(e) => setImpactNumeric(e.target.value)}
                  placeholder="Numeric count (optional)"
                  className="border border-[#CFCBC2] bg-white px-2.5 py-1.5 text-xs font-mono"
                />
                <select
                  value={impactCertainty}
                  onChange={(e) =>
                    setImpactCertainty(e.target.value as HumanImpactReportItem['certainty'])
                  }
                  className="border border-[#CFCBC2] bg-white px-2.5 py-1.5 text-xs"
                >
                  <option value="Confirmed">Confirmed</option>
                  <option value="Reported">Reported</option>
                  <option value="Estimated">Estimated</option>
                </select>
                <input
                  type="text"
                  value={impactSource}
                  onChange={(e) => setImpactSource(e.target.value)}
                  placeholder="Reporting Source (e.g. KNCHR, OHCHR)"
                  className="border border-[#CFCBC2] bg-white px-2.5 py-1.5 text-xs"
                />
                <input
                  type="url"
                  value={impactSourceUrl}
                  onChange={(e) => setImpactSourceUrl(e.target.value)}
                  placeholder="Source URL (https://...)"
                  className="border border-[#CFCBC2] bg-white px-2.5 py-1.5 text-xs"
                />
                <input
                  type="text"
                  value={impactDate}
                  onChange={(e) => setImpactDate(e.target.value)}
                  placeholder="Reporting Date (YYYY-MM-DD)"
                  className="border border-[#CFCBC2] bg-white px-2.5 py-1.5 text-xs font-mono"
                />
                <button
                  type="button"
                  onClick={addHumanImpactEntry}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-[#0F1E36] rounded cursor-pointer"
                >
                  Add Source Figure
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  type="text"
                  value={impactDef}
                  onChange={(e) => setImpactDef(e.target.value)}
                  placeholder="Source definition (e.g. 'Confirmed hospital fatalities during demonstrations')"
                  className="border border-[#CFCBC2] bg-white px-2.5 py-1.5 text-xs"
                />
                <input
                  type="text"
                  value={impactCompeting}
                  onChange={(e) => setImpactCompeting(e.target.value)}
                  placeholder="Competing report note if sources disagree (optional)"
                  className="border border-[#CFCBC2] bg-white px-2.5 py-1.5 text-xs"
                />
              </div>
              {formState.humanImpactReports.length > 0 && (
                <ul className="divide-y divide-[#E4E2DC] bg-white border border-[#E4E2DC] text-xs">
                  {formState.humanImpactReports.map((rep) => (
                    <li key={rep.id} className="p-2.5 flex items-center justify-between gap-2">
                      <span>
                        <strong>{rep.category}:</strong> {rep.figureText} ({rep.certainty} ·{' '}
                        {rep.sourceName}, {rep.reportingDate})
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setFormState((prev) => ({
                            ...prev,
                            humanImpactReports: prev.humanImpactReports.filter(
                              (i) => i.id !== rep.id
                            ),
                          }))
                        }
                        className="text-[#9E2A2B] hover:underline cursor-pointer"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Timeline & Primary Sources Sub-Forms */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-[#F8F7F4] border border-[#E4E2DC] p-4 space-y-2.5">
                <div className="text-xs font-semibold text-[#0F1E36]">10. Chronological Timeline</div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newTimelineDate}
                    onChange={(e) => setNewTimelineDate(e.target.value)}
                    placeholder="Date"
                    className="w-28 border border-[#CFCBC2] bg-white px-2 py-1.5 text-xs font-mono"
                  />
                  <input
                    type="text"
                    value={newTimelineText}
                    onChange={(e) => setNewTimelineText(e.target.value)}
                    placeholder="Documented milestone..."
                    className="flex-1 border border-[#CFCBC2] bg-white px-2 py-1.5 text-xs"
                  />
                  <button
                    type="button"
                    onClick={addTimelineMilestone}
                    className="px-3 py-1.5 text-xs font-medium bg-[#0F1E36] text-white rounded cursor-pointer"
                  >
                    Add
                  </button>
                </div>
                {formState.timeline.length > 0 && (
                  <ul className="space-y-1 text-xs">
                    {formState.timeline.map((t, idx) => (
                      <li key={idx} className="flex justify-between gap-2 bg-white p-2 border border-[#E4E2DC]">
                        <span>
                          <strong className="font-mono">{t.date}:</strong> {t.milestone}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setFormState((prev) => ({
                              ...prev,
                              timeline: prev.timeline.filter((_, i) => i !== idx),
                            }))
                          }
                          className="text-[#9E2A2B] cursor-pointer"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="bg-[#F8F7F4] border border-[#E4E2DC] p-4 space-y-2.5">
                <div className="text-xs font-semibold text-[#0F1E36]">
                  14. Primary Sources &amp; Scholarly References
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={newSourceTitle}
                    onChange={(e) => setNewSourceTitle(e.target.value)}
                    placeholder="Citation / Title"
                    className="border border-[#CFCBC2] bg-white px-2 py-1.5 text-xs"
                  />
                  <input
                    type="url"
                    value={newSourceUrl}
                    onChange={(e) => setNewSourceUrl(e.target.value)}
                    placeholder="https://..."
                    className="border border-[#CFCBC2] bg-white px-2 py-1.5 text-xs"
                  />
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newSourcePub}
                      onChange={(e) => setNewSourcePub(e.target.value)}
                      placeholder="Publisher"
                      className="flex-1 border border-[#CFCBC2] bg-white px-2 py-1.5 text-xs"
                    />
                    <button
                      type="button"
                      onClick={addSourceItem}
                      className="px-3 py-1.5 text-xs font-medium bg-[#0F1E36] text-white rounded cursor-pointer"
                    >
                      Add
                    </button>
                  </div>
                </div>
                {formState.sources.length > 0 && (
                  <ul className="space-y-1 text-xs">
                    {formState.sources.map((s, idx) => (
                      <li key={idx} className="flex justify-between gap-2 bg-white p-2 border border-[#E4E2DC]">
                        <span className="truncate">
                          {s.title} ({s.url})
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setFormState((prev) => ({
                              ...prev,
                              sources: prev.sources.filter((_, i) => i !== idx),
                            }))
                          }
                          className="text-[#9E2A2B] cursor-pointer"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#E4E2DC]">
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                className="px-4 py-2 text-xs font-medium text-[#525866] hover:text-[#0F1E36] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 text-xs font-medium text-white bg-[#0F1E36] hover:bg-[#1E3252] rounded cursor-pointer"
              >
                Save Researcher-Authored Movement Profile
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Main Explorer Layout */}
      {filteredMovements.length > 0 && activeMovement ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Directory Rail */}
          <aside className="lg:col-span-4 bg-white border border-[#E4E2DC] divide-y divide-[#E4E2DC]">
            <div className="p-4 bg-[#F8F7F4] text-xs font-semibold text-[#0F1E36]">
              Authored Research Profiles ({filteredMovements.length})
            </div>
            {filteredMovements.map((m) => {
              const selected = m.id === activeMovement.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setSelectedMovementId(m.id);
                    setConfirmDelete(false);
                  }}
                  className={`w-full text-left p-4 transition-colors cursor-pointer ${
                    selected ? 'bg-[#F1EFEA]' : 'hover:bg-[#F8F7F4]'
                  }`}
                >
                  <div className="text-[11px] text-[#525866]">
                    <span>{m.countryName}</span>
                    <span className="mx-1.5">·</span>
                    <span className="font-mono tabular-nums">
                      {m.startDate || 'Undated'}
                      {m.endDate && m.endDate !== m.startDate ? `–${m.endDate}` : ''}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-[#0F1E36] mt-0.5">{m.name}</div>
                  <div className="text-[11px] text-[#767D8C] mt-1">
                    {m.classification} · {m.youthLeadershipClassification}
                  </div>
                </button>
              );
            })}
          </aside>

          {/* 14-Part Research Dossier Reader */}
          <article className="lg:col-span-8 bg-white border border-[#E4E2DC] p-6 lg:p-10 space-y-8">
            <div className="border-b border-[#E4E2DC] pb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="space-y-2">
                <div className="text-xs text-[#525866] flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-semibold text-[#9E2A2B]">{activeMovement.recordType}</span>
                  <span>·</span>
                  <span>{activeMovement.classification}</span>
                  <span>·</span>
                  <span className="capitalize">Status: {activeMovement.verificationStatus}</span>
                </div>
                <h2 className="text-2xl lg:text-3xl font-semibold text-[#0F1E36]">
                  {activeMovement.name}
                </h2>
                <div className="text-xs text-[#525866]">
                  <button
                    type="button"
                    onClick={() => navigateToCountryProfile(activeMovement.countryId)}
                    className="font-medium text-[#0F1E36] underline cursor-pointer"
                  >
                    {activeMovement.countryName} ({activeMovement.countryId})
                  </button>
                  <span className="mx-2">·</span>
                  <span className="font-mono tabular-nums">
                    Period: {activeMovement.startDate || 'Unspecified'}
                    {activeMovement.endDate ? ` – ${activeMovement.endDate}` : ''}
                  </span>
                  <span className="mx-2">·</span>
                  <span>Youth Assessment: {activeMovement.youthLeadershipClassification}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => openEditDossierForm(activeMovement)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#F1EFEA] hover:bg-[#E4E2DC] text-[#0F1E36] rounded cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit Dossier</span>
                </button>
                {confirmDelete ? (
                  <button
                    type="button"
                    onClick={async () => {
                      await deleteMovementProfile(activeMovement.id);
                      setConfirmDelete(false);
                    }}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-[#9E2A2B] rounded cursor-pointer"
                  >
                    Confirm Delete
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="p-1.5 text-[#525866] hover:text-[#9E2A2B] cursor-pointer"
                    aria-label="Delete movement dossier"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Structured 14 Research Sections */}
            <div className="space-y-6 text-sm leading-relaxed max-w-prose">
              {[
                { num: '01', title: 'Overview', content: activeMovement.overview },
                { num: '02', title: 'Historical Background', content: activeMovement.background },
                { num: '03', title: 'Immediate Trigger', content: activeMovement.immediateTrigger },
                { num: '04', title: 'Underlying Causes', content: activeMovement.underlyingCauses },
              ].map((sec) => (
                <section key={sec.num} className="space-y-1.5">
                  <h3 className="text-sm font-semibold text-[#0F1E36]">
                    {sec.num}. {sec.title}
                  </h3>
                  <p className="text-[#1C1F26] whitespace-pre-wrap">
                    {sec.content || (
                      <span className="text-[#767D8C] italic">
                        Not yet documented by researcher in available primary sources.
                      </span>
                    )}
                  </p>
                </section>
              ))}

              <section className="space-y-1.5">
                <h3 className="text-sm font-semibold text-[#0F1E36]">05. Main Demands</h3>
                {activeMovement.demands.length > 0 ? (
                  <ul className="list-disc list-inside space-y-1 text-[#1C1F26]">
                    {activeMovement.demands.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[#767D8C] italic">Not reported in the available sources.</p>
                )}
              </section>

              {[
                {
                  num: '06',
                  title: 'Participants & Organisational Leadership',
                  content: activeMovement.participantsAndLeadership,
                },
                {
                  num: '07',
                  title: `Youth Participation & Evidence (${activeMovement.youthLeadershipClassification})`,
                  content: activeMovement.youthInvolvementEvidence,
                },
                {
                  num: '08',
                  title: 'Government & Institutional Response',
                  content: activeMovement.governmentResponse,
                },
                {
                  num: '09',
                  title: 'Human Impact',
                  content: activeMovement.humanImpactSummary,
                },
              ].map((sec) => (
                <section key={sec.num} className="space-y-1.5">
                  <h3 className="text-sm font-semibold text-[#0F1E36]">
                    {sec.num}. {sec.title}
                  </h3>
                  <p className="text-[#1C1F26] whitespace-pre-wrap">
                    {sec.content || (
                      <span className="text-[#767D8C] italic">
                        Not reported in the available sources.
                      </span>
                    )}
                  </p>
                </section>
              ))}

              {activeMovement.humanImpactReports.length > 0 && (
                <div className="border border-[#E4E2DC] bg-[#F8F7F4] p-4 space-y-2">
                  <div className="text-xs font-semibold text-[#0F1E36]">
                    Source-Attributed Human Impact Figures
                  </div>
                  <ul className="divide-y divide-[#E4E2DC] text-xs">
                    {activeMovement.humanImpactReports.map((rep) => (
                      <li key={rep.id} className="py-2 space-y-0.5">
                        <div className="font-medium text-[#1C1F26]">
                          {rep.category}: <span className="font-mono">{rep.figureText}</span> (
                          {rep.certainty})
                        </div>
                        <div className="text-[#525866]">
                          Source: {rep.sourceName} · Reported {rep.reportingDate} · Definition:{' '}
                          {rep.sourceDefinition}
                        </div>
                        {rep.competingAccountNote && (
                          <div className="text-[#9E2A2B]">
                            Competing account: {rep.competingAccountNote}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-[#0F1E36]">10. Chronological Timeline</h3>
                {activeMovement.timeline.length > 0 ? (
                  <ol className="border-t border-[#E4E2DC] divide-y divide-[#E4E2DC] text-xs">
                    {activeMovement.timeline.map((item, idx) => (
                      <li key={idx} className="py-2.5 flex gap-4">
                        <span className="font-mono font-semibold text-[#0F1E36] w-28 shrink-0 tabular-nums">
                          {item.date}
                        </span>
                        <span className="text-[#1C1F26]">{item.milestone}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-[#767D8C] italic">No timeline milestones recorded yet.</p>
                )}
              </section>

              <section className="space-y-1.5">
                <h3 className="text-sm font-semibold text-[#0F1E36]">11. Outcomes</h3>
                <p className="text-[#1C1F26] whitespace-pre-wrap">
                  {activeMovement.outcomes || (
                    <span className="text-[#767D8C] italic">
                      Not reported in the available sources.
                    </span>
                  )}
                </p>
              </section>

              <section className="space-y-1.5">
                <h3 className="text-sm font-semibold text-[#0F1E36]">
                  12. Long-Term Consequences
                </h3>
                <p className="text-[#1C1F26] whitespace-pre-wrap">
                  {activeMovement.longTermConsequences || (
                    <span className="text-[#767D8C] italic">
                      Not reported in the available sources.
                    </span>
                  )}
                </p>
              </section>

              <section className="space-y-1.5">
                <h3 className="text-sm font-semibold text-[#0F1E36]">13. Related Movements</h3>
                {activeMovement.relatedMovementIds.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {activeMovement.relatedMovementIds.map((rid) => {
                      const rel = movements.find((m) => m.id === rid);
                      return (
                        <button
                          key={rid}
                          type="button"
                          onClick={() => setSelectedMovementId(rid)}
                          className="text-xs underline text-[#0F1E36] cursor-pointer"
                        >
                          {rel?.name || rid}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-[#767D8C]">
                    No linked movement profiles in current workspace.
                  </p>
                )}
              </section>

              <section className="space-y-2 border-t border-[#E4E2DC] pt-4">
                <h3 className="text-sm font-semibold text-[#0F1E36]">
                  14. Primary Sources &amp; Further Reading
                </h3>
                {activeMovement.sources.length > 0 ? (
                  <ul className="space-y-1.5 text-xs">
                    {activeMovement.sources.map((s, idx) => (
                      <li key={idx} className="flex items-center justify-between gap-3">
                        <span className="text-[#1C1F26]">
                          {s.title}
                          {s.publisher ? ` — ${s.publisher}` : ''}
                          {s.accessDate ? ` (Accessed ${s.accessDate})` : ''}
                        </span>
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[#0F1E36] hover:text-[#9E2A2B] underline shrink-0"
                        >
                          <span>Source</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-[#767D8C]">No external source URLs attached yet.</p>
                )}
              </section>
            </div>
          </article>
        </div>
      ) : (
        <div className="bg-white border border-[#E4E2DC] p-10 text-center space-y-4">
          <h2 className="text-xl font-semibold text-[#0F1E36]">
            No Researcher-Authored Movement Profiles Yet
          </h2>
          <p className="text-sm text-[#525866] max-w-xl mx-auto leading-relaxed">
            In accordance with Generation Watch methodology, historical narratives are never
            invented or synthesized from incomplete CSV rows. Use the editorial form to document a
            movement from verified primary and scholarly sources—or open any historical record in
            the Archive or Map and click &ldquo;Author Movement Dossier from Record&rdquo;.
          </p>
          <button
            type="button"
            onClick={openNewDossierForm}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-medium text-white bg-[#0F1E36] hover:bg-[#1E3252] rounded cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create First Movement Research Profile</span>
          </button>
        </div>
      )}
    </div>
  );
};
