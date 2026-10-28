import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ALL_CREATOR_SKILLS,
  ALL_LEAD_STATUSES,
  ALL_PITCH_TONES,
  AppDatabase,
  ClientLead,
  CreatorSkill,
  LeadStatus,
  PitchTone,
} from '../types/platform';
import { getInstaUsernameOnly, computeStudioPipelineMetrics } from '../lib/engine';
import {
  apiClearAllLeads,
  apiCreateManualLead,
  apiDeleteLead,
  apiDispatchEmail,
  apiDispatchInsta,
  apiDispatchSms,
  apiRegeneratePitch,
  apiUpdateLead,
} from '../lib/apiClient';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Copy,
  Database,
  ExternalLink,
  FileText,
  Instagram,
  Lightbulb,
  Mail,
  Plus,
  Search,
  Settings,
  Smartphone,
  Trash2,
  TrendingUp,
} from 'lucide-react';

interface LeadListAndPitchViewProps {
  db: AppDatabase;
  externalSearchQuery?: string;
  onExternalSearchChange?: (q: string) => void;
  onRefreshDb: (newDb: AppDatabase) => void;
  onOpenFinder: () => void;
  onOpenSmsCloud: () => void;
  onOpenSettings: () => void;
  onOpenDataModal: () => void;
  notify: (msg: string, type?: 'success' | 'error') => void;
}

export const LeadListAndPitchView: React.FC<LeadListAndPitchViewProps> = ({
  db,
  externalSearchQuery = '',
  onRefreshDb,
  onOpenFinder,
  onOpenSmsCloud,
  onOpenSettings,
  onOpenDataModal,
  notify,
}) => {
  const [localSearch] = useState('');
  const searchQuery = externalSearchQuery || localSearch;

  const [skillFilter, setSkillFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [rightPanelTab, setRightPanelTab] = useState<'pipeline' | 'connections'>('pipeline');

  const [selectedLeadId, setSelectedLeadId] = useState<string>(db.leads[0]?.id || '');
  const activeLead = db.leads.find((l) => l.id === selectedLeadId) || db.leads[0];

  const [activeChannelTab, setActiveChannelTab] = useState<
    'sms' | 'email' | 'insta' | 'followup'
  >('sms');
  const [dispatchStatus, setDispatchStatus] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  const [sending, setSending] = useState(false);

  // Manual Lead Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newBizName, setNewBizName] = useState('');
  const [newContactPerson, setNewContactPerson] = useState('');
  const [newNiche, setNewNiche] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newSkill, setNewSkill] = useState<CreatorSkill>('Business Website & Landing Page');
  const [newPainPoint, setNewPainPoint] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newInsta, setNewInsta] = useState('');
  const [newWebsite, setNewWebsite] = useState('');
  const [addError, setAddError] = useState<string | null>(null);

  const filteredLeads = db.leads.filter((lead) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      lead.businessName.toLowerCase().includes(q) ||
      lead.niche.toLowerCase().includes(q) ||
      lead.location.toLowerCase().includes(q) ||
      lead.email.toLowerCase().includes(q) ||
      lead.phone.toLowerCase().includes(q) ||
      lead.instaHandle.toLowerCase().includes(q) ||
      lead.painPoint.toLowerCase().includes(q);

    const matchesSkill = skillFilter === 'ALL' || lead.matchedSkill === skillFilter;
    const matchesStatus = statusFilter === 'ALL' || lead.status === statusFilter;
    return matchesSearch && matchesSkill && matchesStatus;
  });

  const handleUpdateLeadField = async (
    leadId: string,
    updates: Partial<ClientLead>
  ) => {
    const nextDb = await apiUpdateLead(db, leadId, updates);
    onRefreshDb(nextDb);
  };

  const handleRegeneratePitch = async (
    leadId: string,
    tone: PitchTone,
    useAiRewrite = false
  ) => {
    const { db: nextDb, usedAi } = await apiRegeneratePitch(
      db,
      leadId,
      tone,
      useAiRewrite
    );
    onRefreshDb(nextDb);
    const msg = usedAi
      ? `Rewrote pitch via Groq AI (${tone})`
      : `Updated Avinash Studio pitch to "${tone}"`;
    setDispatchStatus({ ok: true, text: msg });
    notify(msg);
  };

  const handleSendSmsViaCloud = async (lead: ClientLead, textToSend: string) => {
    if (!lead.phone) {
      setDispatchStatus({
        ok: false,
        text: 'No phone number on this lead. Add a mobile number first.',
      });
      notify('Add a mobile number to this lead first', 'error');
      return;
    }
    setSending(true);
    setDispatchStatus(null);
    const { ok, db: nextDb, gatewayNote } = await apiDispatchSms(db, {
      leadId: lead.id,
      phone: lead.phone,
      message: textToSend,
    });
    onRefreshDb(nextDb);
    setDispatchStatus({ ok, text: gatewayNote });
    notify(gatewayNote, ok ? 'success' : 'error');
    setSending(false);
  };

  const handleSendEmailViaAppKey = async (lead: ClientLead) => {
    if (!lead.email) {
      setDispatchStatus({ ok: false, text: 'No email address on this lead.' });
      notify('No email address on this lead', 'error');
      return;
    }
    setSending(true);
    setDispatchStatus(null);
    const { ok, db: nextDb, statusNote } = await apiDispatchEmail(db, {
      leadId: lead.id,
      toEmail: lead.email,
      subject: lead.pitches.emailSubject,
      body: lead.pitches.emailBody,
    });
    onRefreshDb(nextDb);
    setDispatchStatus({ ok, text: statusNote });
    notify(statusNote, ok ? 'success' : 'error');
    setSending(false);
  };

  const handleSendInstaDm = async (lead: ClientLead) => {
    try {
      await navigator.clipboard.writeText(lead.pitches.instaDmText);
    } catch {
      // Clipboard fallback
    }
    const { db: nextDb } = await apiDispatchInsta(db, {
      leadId: lead.id,
      instaHandle: lead.instaHandle,
      message: lead.pitches.instaDmText,
    });
    onRefreshDb(nextDb);
    setDispatchStatus({
      ok: true,
      text: `Avinash Studio DM copied! Click "Open Instagram Direct Chat" below to paste & send to ${
        lead.instaHandle || 'client'
      }.`,
    });
    notify(`Copied DM for ${lead.instaHandle || lead.businessName}`);
  };

  const handleDeleteLead = async (id: string) => {
    const nextDb = await apiDeleteLead(db, id);
    onRefreshDb(nextDb);
    notify('Lead removed');
  };

  const handleClearAll = async () => {
    const nextDb = await apiClearAllLeads(db);
    onRefreshDb(nextDb);
    notify('Cleared all leads from workspace');
  };

  const handleAddManualLead = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);
    if (!newBizName.trim()) {
      setAddError('Business Name is required.');
      return;
    }

    const { db: nextDb, lead } = await apiCreateManualLead(db, {
      businessName: newBizName,
      contactPerson: newContactPerson,
      niche: newNiche,
      location: newLocation,
      matchedSkill: newSkill,
      painPoint: newPainPoint,
      email: newEmail,
      phone: newPhone,
      instaHandle: newInsta,
      websiteUrl: newWebsite,
    });
    onRefreshDb(nextDb);
    setSelectedLeadId(lead.id);
    setShowAddModal(false);
    setNewBizName('');
    setNewContactPerson('');
    setNewNiche('');
    setNewLocation('');
    setNewPainPoint('');
    setNewEmail('');
    setNewPhone('');
    setNewInsta('');
    setNewWebsite('');
    notify(`Added ${lead.businessName} (${lead.conversionScore}% Match)`);
  };

  const connectedPhone = db.smsConfig.connectedDevices?.[0];
  const isPhoneConnected =
    db.smsConfig.connectionStatus === 'connected' && Boolean(connectedPhone);
  const isEmailConnected =
    db.emailConfig.connectionStatus === 'connected' &&
    Boolean(db.emailConfig.appPassword || db.emailConfig.resendApiKey);
  const isSupabaseConnected =
    db.supabaseConfig?.connectionStatus === 'connected' ||
    Boolean(
      db.supabaseConfig?.url &&
        (db.supabaseConfig?.anonKey || db.supabaseConfig?.serviceRoleKey) &&
        db.supabaseConfig?.enabled
    );

  const metrics = computeStudioPipelineMetrics(db);

  // Short display labels for filter pills
  const filterPills: { id: string; label: string }[] = [
    { id: 'ALL', label: db.leads.length > 0 ? `All Skills (${db.leads.length})` : 'All Skills' },
    { id: 'Business Website & Landing Page', label: 'Business Website & Landing Page' },
    { id: 'E-Commerce & Product Storefront', label: 'E-Commerce' },
    { id: 'Social Media Graphics & Posters', label: 'Social Media' },
    { id: 'Short-Form Video Ads & Reels', label: 'Video Ads & Reels' },
  ];

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      {/* LEFT / CENTER MAIN COLUMN (8 cols) */}
      <div className="xl:col-span-8 space-y-5">
        {/* Top Editorial Title Section */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-red-400 tracking-wide">
              Avinash Studio • Real Client Pipeline
            </div>
            <h1 className="text-2xl sm:text-[28px] font-extrabold tracking-tight text-white leading-[1.2] mt-1">
              Genuine Client Leads Ranked by Conversion Probability
            </h1>
            <p className="text-base text-zinc-400 mt-1.5">
              Workspace Ready for Genuine Clients
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <motion.button
              type="button"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-2xl backdrop-blur-md bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-100 text-xs font-bold shadow-[0_0_20px_rgba(239,68,68,0.12)] cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 text-red-400" />
              + Add Client
            </motion.button>
            {db.leads.length > 0 && (
              <motion.button
                type="button"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={handleClearAll}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-2xl backdrop-blur-md bg-white/5 hover:bg-red-500/15 border border-white/10 hover:border-red-500/40 text-zinc-400 hover:text-red-300 text-xs font-semibold cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear List
              </motion.button>
            )}
          </div>
        </div>

        {/* Hero 3D Illustration Showcase Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          whileHover={{ scale: 1.005 }}
          transition={{ duration: 0.2 }}
          className="relative rounded-3xl overflow-hidden border border-white/15 bg-gradient-to-r from-[#381819] via-[#5B251E] to-[#7C2D12] shadow-[0_24px_60px_rgba(0,0,0,0.65),0_0_25px_rgba(239,68,68,0.15)]"
        >
          <img
            src="/assets/aistudio/hero-banner-crop.png"
            alt="Avinash Studio High-Pitch Client Outreach Showcase"
            referrerPolicy="no-referrer"
            className="w-full h-[200px] sm:h-[235px] object-cover block"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
          <div className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-inset ring-white/15" />
        </motion.div>

        {/* Skill Filter Pills Row */}
        <div className="flex items-center gap-2.5 overflow-x-auto pb-1 no-scrollbar">
          {filterPills.map((pill) => {
            const isActive = skillFilter === pill.id;
            return (
              <motion.button
                key={pill.id}
                type="button"
                whileHover={{ scale: 1.03, y: -1 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setSkillFilter(pill.id)}
                className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap shrink-0 transition-all cursor-pointer ${
                  isActive
                    ? 'backdrop-blur-md bg-red-500/15 border border-red-500/60 text-white shadow-[0_0_20px_rgba(239,68,68,0.25)]'
                    : 'backdrop-blur-md bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white'
                }`}
              >
                {pill.label}
              </motion.button>
            );
          })}
        </div>

        {/* Two Large Side-by-Side Primary Action Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <motion.button
            type="button"
            whileHover={{ scale: 1.015, y: -2 }}
            whileTap={{ scale: 0.985 }}
            onClick={onOpenFinder}
            className="crimson-btn w-full py-3.5 px-6 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2.5 shadow-[0_0_25px_rgba(239,68,68,0.35)] cursor-pointer"
          >
            <Search className="w-4 h-4" />
            <span>Find Real Clients (Groq / AI)</span>
          </motion.button>

          <motion.button
            type="button"
            whileHover={{ scale: 1.015, y: -2 }}
            whileTap={{ scale: 0.985 }}
            onClick={onOpenDataModal}
            className="w-full py-3.5 px-6 rounded-2xl backdrop-blur-md bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-bold text-zinc-100 flex items-center justify-center gap-2.5 shadow-[0_15px_35px_rgba(0,0,0,0.5)] cursor-pointer transition-all"
          >
            <FileText className="w-4 h-4 text-zinc-300" />
            <span>Import JSON / CSV File</span>
          </motion.button>
        </div>

        {/* Client Pipeline & Outreach Reports Section */}
        <div className="pt-1 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold text-white tracking-tight">
                Client Pipeline &amp; Outreach Reports
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                {db.leads.length > 0 ? (
                  <>
                    <span className="text-red-400 font-semibold">
                      Live! {db.leads.length} Ranked
                    </span>{' '}
                    client leads ready for outreach
                  </>
                ) : (
                  <>
                    <span className="text-zinc-300 font-semibold">0 client leads</span> in
                    workspace — discover via AI or import real clients above
                  </>
                )}
              </p>
            </div>

            <div className="flex items-center gap-3">
              {db.leads.length > 0 && (
                <select
                  aria-label="Filter by Lead Status"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-1.5 rounded-xl backdrop-blur-md bg-white/5 border border-white/10 text-xs text-zinc-200 focus:outline-none focus:border-red-500/50"
                >
                  <option value="ALL">All Statuses</option>
                  {ALL_LEAD_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              )}

              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-300 hover:text-white group cursor-pointer"
              >
                <span>Customer / Client Leads</span>
                <span className="w-6 h-6 rounded-lg backdrop-blur-md bg-white/10 border border-white/10 flex items-center justify-center group-hover:bg-red-500/20 group-hover:border-red-500/40 transition-colors">
                  <ChevronRight className="w-3.5 h-3.5" />
                </span>
              </button>
            </div>
          </div>

          {/* Glass Table Column Header Bar */}
          <div className="grid grid-cols-12 gap-2 px-4 py-2.5 rounded-2xl backdrop-blur-md bg-white/5 border border-white/10 text-xs font-medium text-zinc-400">
            <div className="col-span-4">Client / Business</div>
            <div className="col-span-3">Phone / Contact</div>
            <div className="col-span-2 hidden sm:block">Location / Niche</div>
            <div className="col-span-3 sm:col-span-1 text-right sm:text-left">Win Score</div>
            <div className="col-span-2 text-right">Status</div>
          </div>

          {/* Rows: Real Leads only — authentic empty state when 0 leads */}
          {filteredLeads.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-8 rounded-3xl backdrop-blur-md bg-white/[0.03] border border-white/10 text-center space-y-3"
            >
              <div className="text-sm font-bold text-white">
                {db.leads.length === 0
                  ? 'No Client Leads in Workspace Yet'
                  : 'No Leads Match Your Current Search / Filter'}
              </div>
              <p className="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed">
                {db.leads.length === 0
                  ? 'Use the AI Client Finder (Google Gemini Live Search or Groq Cloud), add a client manually, or import your JSON/CSV file to generate custom High-Pitches.'
                  : 'Try clearing your search filter or selecting "All Skills" above.'}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={onOpenFinder}
                  className="crimson-btn px-4 py-2 rounded-2xl text-xs font-bold text-white cursor-pointer"
                >
                  Find Real Clients (AI)
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddModal(true)}
                  className="px-4 py-2 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-zinc-200 cursor-pointer"
                >
                  + Add Manual Client
                </button>
              </div>
            </motion.div>
          ) : (
            <div className="space-y-3">
              {filteredLeads.map((lead, index) => {
                const isSelected = activeLead?.id === lead.id;
                const isCompleted =
                  lead.status === 'Closed / Won' ||
                  lead.status === 'Replied / Interested' ||
                  lead.status === 'Contacted';
                return (
                  <motion.article
                    key={lead.id}
                    layout
                    whileHover={{ scale: 1.006 }}
                    onClick={() => {
                      setSelectedLeadId(lead.id);
                      setDispatchStatus(null);
                    }}
                    className={`p-4 rounded-3xl transition-all cursor-pointer ${
                      isSelected
                        ? 'bento-card-elevated'
                        : 'bento-card hover:border-red-500/35'
                    }`}
                  >
                    <div className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-4 flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-red-500 to-amber-600 flex items-center justify-center text-xs font-extrabold text-white shrink-0 shadow-[0_0_15px_rgba(239,68,68,0.3)] tabular-nums">
                          #{index + 1}
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-xs font-bold text-white truncate">
                            {lead.businessName}
                          </h3>
                          <div className="text-[11px] text-zinc-400 truncate">
                            {lead.contactPerson} · {lead.matchedSkill}
                          </div>
                        </div>
                      </div>

                      <div className="col-span-3 text-xs font-mono tabular-nums text-zinc-300 truncate">
                        {lead.phone || lead.instaHandle || lead.email || 'Unlisted'}
                      </div>

                      <div className="col-span-2 hidden sm:block text-xs text-zinc-400 truncate">
                        {lead.location || lead.niche}
                      </div>

                      <div className="col-span-3 sm:col-span-1 text-xs font-extrabold font-mono tabular-nums text-red-400 text-right sm:text-left">
                        {lead.conversionScore}%
                      </div>

                      <div className="col-span-2 flex justify-end">
                        <span
                          className={`px-3 py-1 rounded-full text-[10px] font-bold truncate ${
                            isCompleted
                              ? 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.2)]'
                              : 'bg-amber-500/20 border border-amber-500/50 text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.2)]'
                          }`}
                        >
                          {lead.status === 'New — High Priority' ? 'High Priority' : lead.status}
                        </span>
                      </div>
                    </div>

                    {/* Pain Point & Quick Channel Triggers */}
                    <div
                      className="mt-3 pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="text-[11px] text-zinc-400 truncate max-w-md">
                        <strong className="text-zinc-200">Gap:</strong> {lead.painPoint}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <select
                          aria-label={`Status for ${lead.businessName}`}
                          value={lead.status}
                          onChange={(e) =>
                            handleUpdateLeadField(lead.id, {
                              status: e.target.value as LeadStatus,
                            })
                          }
                          className="text-[11px] font-medium bg-white/5 border border-white/10 rounded-xl px-2.5 py-1 text-zinc-200"
                        >
                          {ALL_LEAD_STATUSES.map((st) => (
                            <option key={st} value={st}>
                              {st}
                            </option>
                          ))}
                        </select>

                        <button
                          type="button"
                          onClick={() => {
                            setSelectedLeadId(lead.id);
                            setActiveChannelTab('sms');
                            handleSendSmsViaCloud(lead, lead.pitches.smsText);
                          }}
                          className="px-2.5 py-1 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/40 text-red-300 text-[11px] font-bold cursor-pointer"
                        >
                          SIM SMS
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedLeadId(lead.id);
                            setActiveChannelTab('email');
                            handleSendEmailViaAppKey(lead);
                          }}
                          className="px-2.5 py-1 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-200 text-[11px] font-semibold cursor-pointer"
                        >
                          Email
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedLeadId(lead.id);
                            setActiveChannelTab('insta');
                            handleSendInstaDm(lead);
                          }}
                          className="px-2.5 py-1 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-200 text-[11px] font-semibold cursor-pointer"
                        >
                          Insta DM
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete ${lead.businessName}`}
                          onClick={() => handleDeleteLead(lead.id)}
                          className="p-1.5 text-zinc-400 hover:text-red-400 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </motion.article>
                );
              })}
            </div>
          )}
        </div>

        {/* Interactive High-Pitch Outreach Studio when a Lead is Selected */}
        {activeLead && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="bento-card-elevated p-6 rounded-3xl space-y-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3 pb-3.5 border-b border-white/10">
              <div>
                <div className="text-xs text-zinc-400">
                  Avinash Studio High-Pitch Composer ·{' '}
                  <strong className="text-red-400">{activeLead.matchedSkill}</strong>
                </div>
                <h2 className="text-lg font-extrabold text-white mt-0.5">
                  {activeLead.businessName}{' '}
                  <span className="text-xs font-mono text-emerald-400 ml-1">
                    ({activeLead.conversionScore}% Win Score)
                  </span>
                </h2>
              </div>

              <div className="flex items-center gap-2">
                <select
                  aria-label="Select Pitch Tone"
                  onChange={(e) =>
                    handleRegeneratePitch(activeLead.id, e.target.value as PitchTone, false)
                  }
                  defaultValue={db.personaConfig.defaultTone}
                  className="text-xs bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-zinc-100 font-medium"
                >
                  {ALL_PITCH_TONES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                {db.aiConfig.groqApiKey && (
                  <button
                    type="button"
                    onClick={() =>
                      handleRegeneratePitch(
                        activeLead.id,
                        db.personaConfig.defaultTone,
                        true
                      )
                    }
                    className="px-3 py-1.5 rounded-xl bg-red-500/15 border border-red-500/40 text-xs font-bold text-red-300 hover:bg-red-500/25 cursor-pointer"
                  >
                    ✨ Rewrite with Groq AI
                  </button>
                )}
              </div>
            </div>

            {/* 4 Channel Selector Tabs */}
            <div className="grid grid-cols-4 gap-1.5 bg-black/40 p-1.5 rounded-2xl border border-white/10">
              {(
                [
                  { id: 'sms', label: 'SIM SMS' },
                  { id: 'email', label: 'Email' },
                  { id: 'insta', label: 'Insta DM' },
                  { id: 'followup', label: 'Follow-Up' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveChannelTab(tab.id)}
                  className={`py-2 px-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    activeChannelTab === tab.id
                      ? 'crimson-btn text-white'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* TAB 1: DIRECT SIM CLOUD SMS */}
            {activeChannelTab === 'sms' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span>
                    To:{' '}
                    <strong className="font-mono text-white">
                      {activeLead.phone || 'No mobile number'}
                    </strong>
                  </span>
                  <button
                    type="button"
                    onClick={onOpenSmsCloud}
                    className="text-xs font-semibold text-emerald-400 hover:underline cursor-pointer"
                  >
                    {isPhoneConnected
                      ? `${connectedPhone?.name} (SIM ${db.smsConfig.simSlot} Online)`
                      : 'Verify Phone Connection'}
                  </button>
                </div>

                <textarea
                  aria-label="SMS Pitch Text"
                  rows={4}
                  value={activeLead.pitches.smsText}
                  onChange={(e) =>
                    handleUpdateLeadField(activeLead.id, {
                      pitches: { ...activeLead.pitches, smsText: e.target.value },
                    })
                  }
                  className="w-full rounded-2xl bg-black/40 border border-white/10 p-3.5 text-xs text-zinc-100 leading-relaxed focus:outline-none focus:border-red-500/50"
                />

                <div className="flex flex-wrap gap-2.5">
                  <button
                    type="button"
                    disabled={sending}
                    onClick={() =>
                      handleSendSmsViaCloud(activeLead, activeLead.pitches.smsText)
                    }
                    className="crimson-btn flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
                  >
                    <Smartphone className="w-4 h-4" />
                    {sending
                      ? 'Sending via Phone SIM...'
                      : `Send Direct SMS via ${
                          connectedPhone?.name || `SIM ${db.smsConfig.simSlot} Cloud`
                        }`}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(activeLead.pitches.smsText);
                      notify('Copied SMS text');
                    }}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-200 text-xs font-semibold cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copy SMS
                  </button>
                </div>
              </div>
            )}

            {/* TAB 2: EMAIL AUTOMATION */}
            {activeChannelTab === 'email' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span>
                    To:{' '}
                    <strong className="font-mono text-white">
                      {activeLead.email || 'No email'}
                    </strong>
                  </span>
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    className="text-xs font-semibold text-amber-400 hover:underline cursor-pointer"
                  >
                    {isEmailConnected ? 'SMTP Connected' : 'Set 16-Letter App Key'}
                  </button>
                </div>

                <input
                  type="text"
                  aria-label="Email Subject Line"
                  value={activeLead.pitches.emailSubject}
                  onChange={(e) =>
                    handleUpdateLeadField(activeLead.id, {
                      pitches: {
                        ...activeLead.pitches,
                        emailSubject: e.target.value,
                      },
                    })
                  }
                  className="w-full rounded-2xl bg-black/40 border border-white/10 px-3.5 py-2.5 text-xs font-semibold text-white"
                />

                <textarea
                  aria-label="Email Pitch Body"
                  rows={6}
                  value={activeLead.pitches.emailBody}
                  onChange={(e) =>
                    handleUpdateLeadField(activeLead.id, {
                      pitches: {
                        ...activeLead.pitches,
                        emailBody: e.target.value,
                      },
                    })
                  }
                  className="w-full rounded-2xl bg-black/40 border border-white/10 p-3.5 text-xs text-zinc-100 leading-relaxed"
                />

                <div className="flex flex-wrap gap-2.5">
                  <button
                    type="button"
                    disabled={sending}
                    onClick={() => handleSendEmailViaAppKey(activeLead)}
                    className="crimson-btn flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold cursor-pointer"
                  >
                    <Mail className="w-4 h-4" />
                    {sending
                      ? 'Sending via SMTP...'
                      : 'Send Automatic Email (Gmail App Key / Resend)'}
                  </button>

                  {activeLead.email && (
                    <a
                      href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
                        activeLead.email
                      )}&su=${encodeURIComponent(
                        activeLead.pitches.emailSubject
                      )}&body=${encodeURIComponent(activeLead.pitches.emailBody)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-200 text-xs font-bold"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Gmail Web Compose
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* TAB 3: INSTAGRAM DM */}
            {activeChannelTab === 'insta' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span>
                    Instagram:{' '}
                    <strong className="font-mono text-white">
                      {activeLead.instaHandle || 'Not set'}
                    </strong>
                  </span>
                  <span className="text-xs font-semibold text-red-400">
                    Avinash Studio DM
                  </span>
                </div>

                <textarea
                  aria-label="Instagram DM Pitch Text"
                  rows={4}
                  value={activeLead.pitches.instaDmText}
                  onChange={(e) =>
                    handleUpdateLeadField(activeLead.id, {
                      pitches: {
                        ...activeLead.pitches,
                        instaDmText: e.target.value,
                      },
                    })
                  }
                  className="w-full rounded-2xl bg-black/40 border border-white/10 p-3.5 text-xs text-zinc-100 leading-relaxed"
                />

                <div className="flex flex-wrap gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleSendInstaDm(activeLead)}
                    className="crimson-btn flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold cursor-pointer"
                  >
                    <Instagram className="w-4 h-4" />
                    Copy Avinash Studio DM &amp; Log Outreach
                  </button>

                  {activeLead.instaHandle && (
                    <a
                      href={`https://ig.me/m/${getInstaUsernameOnly(activeLead.instaHandle)}`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => handleSendInstaDm(activeLead)}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-200 text-xs font-bold"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Open IG Chat (@{getInstaUsernameOnly(activeLead.instaHandle)})
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* TAB 4: FOLLOW-UPS */}
            {activeChannelTab === 'followup' && (
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-zinc-200">
                      Follow-Up #1 (Day 2 Demo Reminder)
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        handleSendSmsViaCloud(
                          activeLead,
                          activeLead.pitches.followUp1Text
                        )
                      }
                      className="text-xs text-red-400 font-bold hover:underline cursor-pointer"
                    >
                      Send via SIM SMS →
                    </button>
                  </div>
                  <textarea
                    rows={3}
                    value={activeLead.pitches.followUp1Text}
                    onChange={(e) =>
                      handleUpdateLeadField(activeLead.id, {
                        pitches: {
                          ...activeLead.pitches,
                          followUp1Text: e.target.value,
                        },
                      })
                    }
                    className="w-full rounded-2xl bg-black/40 border border-white/10 p-3 text-xs text-zinc-100"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-zinc-200">
                      Follow-Up #2 (Day 5 Final Check-in)
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        handleSendSmsViaCloud(
                          activeLead,
                          activeLead.pitches.followUp2Text
                        )
                      }
                      className="text-xs text-red-400 font-bold hover:underline cursor-pointer"
                    >
                      Send via SIM SMS →
                    </button>
                  </div>
                  <textarea
                    rows={3}
                    value={activeLead.pitches.followUp2Text}
                    onChange={(e) =>
                      handleUpdateLeadField(activeLead.id, {
                        pitches: {
                          ...activeLead.pitches,
                          followUp2Text: e.target.value,
                        },
                      })
                    }
                    className="w-full rounded-2xl bg-black/40 border border-white/10 p-3 text-xs text-zinc-100"
                  />
                </div>
              </div>
            )}

            {dispatchStatus && (
              <div
                className={`p-3.5 rounded-2xl border text-xs font-medium flex items-start gap-2 ${
                  dispatchStatus.ok
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                    : 'bg-red-500/10 border-red-500/30 text-red-200'
                }`}
              >
                {dispatchStatus.ok ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                )}
                <span>{dispatchStatus.text}</span>
              </div>
            )}
          </motion.div>
        )}
      </div>

      {/* RIGHT COLUMN (4 cols): STUDIO PIPELINE & LIVE CONNECTIONS */}
      <div className="xl:col-span-4 space-y-5">
        {/* Top Mode Pill Switcher */}
        <div className="flex items-center gap-3">
          <motion.button
            type="button"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setRightPanelTab('pipeline')}
            className={`px-4 py-1.5 rounded-full text-[11px] font-extrabold uppercase tracking-wider transition-all cursor-pointer ${
              rightPanelTab === 'pipeline'
                ? 'backdrop-blur-md bg-red-500/15 border border-red-500/50 text-white shadow-[0_0_20px_rgba(239,68,68,0.25)]'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            STUDIO PIPELINE
          </motion.button>
          <motion.button
            type="button"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setRightPanelTab('connections')}
            className={`px-3 py-1.5 rounded-full text-[11px] font-semibold uppercase tracking-wider transition-all cursor-pointer ${
              rightPanelTab === 'connections'
                ? 'backdrop-blur-md bg-red-500/15 border border-red-500/50 text-white shadow-[0_0_20px_rgba(239,68,68,0.25)]'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            &amp; LIVE CONNECTIONS
          </motion.button>
        </div>

        {/* Card 1: AVG WIN SCORE Fiery Ring Gauge & 3 Glass Metric Tiles */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bento-card p-6 rounded-3xl space-y-5"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold tracking-wider uppercase text-white">
              AVG WIN SCORE
            </span>
            {/* Glowing Red Sparkline SVG */}
            <svg viewBox="0 0 90 28" className="w-20 h-6 overflow-visible">
              <path
                d="M2 22 L16 20 L26 23 L38 16 L48 19 L58 10 L68 18 L78 8 L88 12"
                fill="none"
                stroke="#EF4444"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="drop-shadow-[0_0_6px_rgba(239,68,68,0.8)]"
              />
            </svg>
          </div>

          {/* Fiery Glowing Circular Gauge */}
          <div className="relative w-52 h-52 mx-auto flex items-center justify-center">
            {/* Ambient Crimson/Orange Glow */}
            <div className="absolute inset-4 rounded-full bg-gradient-to-tr from-red-600/25 via-orange-500/15 to-transparent blur-xl pointer-events-none" />

            <svg viewBox="0 0 220 220" className="w-full h-full -rotate-90 overflow-visible">
              <defs>
                <linearGradient id="fieryRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#FBBF24" />
                  <stop offset="45%" stopColor="#EF4444" />
                  <stop offset="100%" stopColor="#991B1B" />
                </linearGradient>
                <linearGradient id="outerFlameArc" x1="0%" y1="100%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="rgba(239,68,68,0)" />
                  <stop offset="50%" stopColor="#EF4444" />
                  <stop offset="85%" stopColor="#F59E0B" />
                  <stop offset="100%" stopColor="rgba(251,191,36,0)" />
                </linearGradient>
              </defs>

              {/* Outer Decorative Flame Energy Arcs */}
              <circle
                cx="110"
                cy="110"
                r="96"
                fill="none"
                stroke="url(#outerFlameArc)"
                strokeWidth="3"
                strokeDasharray="180 120"
                strokeLinecap="round"
                className="drop-shadow-[0_0_12px_rgba(239,68,68,0.8)]"
              />
              <circle
                cx="110"
                cy="110"
                r="90"
                fill="none"
                stroke="rgba(255,255,255,0.07)"
                strokeWidth="10"
              />
              {/* Active Progress Ring (Reflects actual metrics.avgWinScore) */}
              <circle
                cx="110"
                cy="110"
                r="90"
                fill="none"
                stroke="url(#fieryRingGrad)"
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 90}
                strokeDashoffset={
                  2 * Math.PI * 90 * (1 - Math.max(0, Math.min(1, metrics.avgWinScore / 100)))
                }
                className="drop-shadow-[0_0_16px_rgba(239,68,68,0.65)] transition-all duration-700"
              />
              {/* Inner Dark Bezel Ring */}
              <circle
                cx="110"
                cy="110"
                r="74"
                fill="rgba(16,17,22,0.9)"
                stroke="rgba(255,255,255,0.1)"
                strokeWidth="1.5"
              />
            </svg>

            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
              <div className="text-4xl font-extrabold text-white tabular-nums tracking-tight">
                {metrics.avgWinScore}%
              </div>
              <div className="text-xs text-zinc-300 mt-1 leading-tight">
                {metrics.totalLeads === 0 ? (
                  <>
                    No Lead Data
                    <br />
                    Yet
                  </>
                ) : (
                  `${metrics.hotLeadsCount} Hot Leads`
                )}
              </div>
            </div>
          </div>

          {/* 3 Mini Glass Metric Tiles */}
          <div className="grid grid-cols-3 gap-3 pt-1">
            <motion.div
              whileHover={{ y: -2, scale: 1.02 }}
              className="p-3.5 rounded-2xl backdrop-blur-md bg-white/5 border border-white/10 text-center shadow-[0_0_20px_rgba(239,68,68,0.1)]"
            >
              <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 flex items-center justify-center mx-auto mb-2">
                <Lightbulb className="w-4 h-4" />
              </div>
              <div className="text-base font-extrabold text-white tabular-nums">
                {metrics.totalLeads}
              </div>
              <div className="text-[11px] text-zinc-400 mt-0.5">Leads</div>
            </motion.div>

            <motion.div
              whileHover={{ y: -2, scale: 1.02 }}
              className="p-3.5 rounded-2xl backdrop-blur-md bg-white/5 border border-white/10 text-center shadow-[0_0_20px_rgba(239,68,68,0.1)]"
            >
              <div className="w-8 h-8 rounded-xl bg-zinc-400/15 border border-white/15 text-zinc-200 flex items-center justify-center mx-auto mb-2">
                <Settings className="w-4 h-4" />
              </div>
              <div className="text-base font-extrabold text-white tabular-nums">
                {metrics.connectedCount}
              </div>
              <div className="text-[11px] text-zinc-400 mt-0.5">Connected</div>
            </motion.div>

            <motion.div
              whileHover={{ y: -2, scale: 1.02 }}
              className="p-3.5 rounded-2xl backdrop-blur-md bg-white/5 border border-white/10 text-center shadow-[0_0_20px_rgba(239,68,68,0.1)]"
            >
              <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 flex items-center justify-center mx-auto mb-2">
                <TrendingUp className="w-4 h-4" />
              </div>
              <div className="text-base font-extrabold text-white tabular-nums">
                {metrics.dailySentLabel}
              </div>
              <div className="text-[11px] text-zinc-400 mt-0.5">Daily Sent</div>
            </motion.div>
          </div>
        </motion.div>

        {/* Card 2: Live Connections Glass Card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bento-card p-5 rounded-3xl space-y-3.5"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-base font-extrabold text-white">Live Connections</h2>
          </div>

          <div className="space-y-3">
            {/* Supabase Cloud DB Subcard */}
            <motion.div
              whileHover={{ scale: 1.015, y: -1 }}
              whileTap={{ scale: 0.99 }}
              onClick={onOpenSettings}
              className="p-4 rounded-2xl backdrop-blur-md bg-white/5 hover:bg-white/10 border border-white/10 hover:border-emerald-500/40 transition-all cursor-pointer"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-white flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-emerald-400" />
                  Supabase Cloud DB
                </span>
                <span
                  className={`px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                    isSupabaseConnected
                      ? 'bg-emerald-500/15 border border-emerald-500/50 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.25)]'
                      : 'bg-amber-500/15 border border-amber-500/50 text-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.25)]'
                  }`}
                >
                  {isSupabaseConnected ? 'CONNECTED' : 'SET KEYS'}
                </span>
              </div>
              <div className="text-xs text-zinc-400 mt-1.5 truncate">
                {isSupabaseConnected
                  ? `PostgreSQL Sync Active (${db.supabaseConfig?.lastSyncedAt || 'Live'})`
                  : 'Click to paste Supabase URL & API Key in Settings'}
              </div>
            </motion.div>

            {/* Android SIM SMS Subcard */}
            <motion.div
              whileHover={{ scale: 1.015, y: -1 }}
              whileTap={{ scale: 0.99 }}
              onClick={onOpenSmsCloud}
              className="p-4 rounded-2xl backdrop-blur-md bg-white/5 hover:bg-white/10 border border-white/10 hover:border-emerald-500/40 transition-all cursor-pointer"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-white">Android SIM SMS</span>
                <span
                  className={`px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                    isPhoneConnected
                      ? 'bg-emerald-500/15 border border-emerald-500/50 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.25)]'
                      : 'bg-amber-500/15 border border-amber-500/50 text-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.25)]'
                  }`}
                >
                  {isPhoneConnected ? 'CONNECTED' : 'VERIFY PHONE'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 mt-2">
                <span className="text-xs text-zinc-400 truncate">
                  {isPhoneConnected
                    ? `Connected SIM SMS, SIM ${db.smsConfig.simSlot} (${connectedPhone?.name || 'Online'})`
                    : `SIM ${db.smsConfig.simSlot} Gateway (${db.smsConfig.deviceId})`}
                </span>
                {/* Green ECG Pulse SVG */}
                <svg viewBox="0 0 36 16" className="w-8 h-4 shrink-0 text-emerald-400">
                  <path
                    d="M1 8 H9 L12 2 L16 14 L20 5 L23 11 L26 8 H35"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="drop-shadow-[0_0_6px_rgba(52,211,153,0.9)]"
                  />
                </svg>
              </div>
            </motion.div>

            {/* Email Gateway Subcard */}
            <motion.div
              whileHover={{ scale: 1.015, y: -1 }}
              whileTap={{ scale: 0.99 }}
              onClick={onOpenSettings}
              className="p-4 rounded-2xl backdrop-blur-md bg-white/5 hover:bg-white/10 border border-white/10 hover:border-amber-500/40 transition-all cursor-pointer"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-white">Email Gateway</span>
                <span
                  className={`px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                    isEmailConnected
                      ? 'bg-emerald-500/15 border border-emerald-500/50 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.25)]'
                      : 'bg-amber-500/15 border border-amber-500/50 text-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.25)]'
                  }`}
                >
                  {isEmailConnected ? 'SMTP LIVE' : 'APP KEY NEEDED'}
                </span>
              </div>
              <div className="text-xs text-zinc-400 mt-2 leading-relaxed">
                {isEmailConnected
                  ? `Active SMTP: ${db.emailConfig.senderEmail}`
                  : 'Set 16-letter Gmail App Key or use Email web button'}
              </div>
            </motion.div>
          </div>
        </motion.div>
      </div>

      {/* Add Manual Lead Modal */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 12 }}
              className="bento-card-elevated max-w-lg w-full p-6 rounded-3xl space-y-4 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h2 className="text-base font-bold text-white">
                  + Add Real Client Lead (Avinash Studio)
                </h2>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="text-xs text-zinc-400 hover:text-white cursor-pointer"
                >
                  Close ✕
                </button>
              </div>

              {addError && (
                <div className="p-3 rounded-2xl bg-red-500/15 border border-red-500/40 text-xs text-red-200">
                  {addError}
                </div>
              )}

              <form onSubmit={handleAddManualLead} className="space-y-3 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-zinc-300 font-semibold mb-1">
                      Business Name *
                    </label>
                    <input
                      type="text"
                      value={newBizName}
                      onChange={(e) => setNewBizName(e.target.value)}
                      placeholder="e.g., Aura Skin Clinic"
                      className="w-full rounded-2xl bg-black/40 border border-white/10 px-3 py-2.5 text-white focus:outline-none focus:border-red-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-zinc-300 font-semibold mb-1">
                      Contact Person / Owner
                    </label>
                    <input
                      type="text"
                      value={newContactPerson}
                      onChange={(e) => setNewContactPerson(e.target.value)}
                      placeholder="e.g., Dr. Neha"
                      className="w-full rounded-2xl bg-black/40 border border-white/10 px-3 py-2.5 text-white focus:outline-none focus:border-red-500/50"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-zinc-300 font-semibold mb-1">
                      Niche / Industry
                    </label>
                    <input
                      type="text"
                      value={newNiche}
                      onChange={(e) => setNewNiche(e.target.value)}
                      placeholder="e.g., Dental Clinic, Streetwear"
                      className="w-full rounded-2xl bg-black/40 border border-white/10 px-3 py-2.5 text-white focus:outline-none focus:border-red-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-zinc-300 font-semibold mb-1">
                      City / Location
                    </label>
                    <input
                      type="text"
                      value={newLocation}
                      onChange={(e) => setNewLocation(e.target.value)}
                      placeholder="e.g., Mumbai, Delhi"
                      className="w-full rounded-2xl bg-black/40 border border-white/10 px-3 py-2.5 text-white focus:outline-none focus:border-red-500/50"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-zinc-300 font-semibold mb-1">
                    Skill to Pitch from Avinash Studio
                  </label>
                  <select
                    value={newSkill}
                    onChange={(e) => setNewSkill(e.target.value as CreatorSkill)}
                    className="w-full rounded-2xl bg-black/40 border border-white/10 px-3 py-2.5 text-white focus:outline-none focus:border-red-500/50"
                  >
                    {ALL_CREATOR_SKILLS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-zinc-300 font-semibold mb-1">
                    Why They Will Convert (Pain Point / Gap)
                  </label>
                  <input
                    type="text"
                    value={newPainPoint}
                    onChange={(e) => setNewPainPoint(e.target.value)}
                    placeholder="e.g., Running Instagram ads with 15k followers but no booking website"
                    className="w-full rounded-2xl bg-black/40 border border-white/10 px-3 py-2.5 text-white focus:outline-none focus:border-red-500/50"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-zinc-300 font-semibold mb-1">
                      Mobile / WhatsApp
                    </label>
                    <input
                      type="text"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      placeholder="+91 9876543210"
                      className="w-full rounded-2xl bg-black/40 border border-white/10 px-3 py-2 text-white font-mono focus:outline-none focus:border-red-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-zinc-300 font-semibold mb-1">
                      Email Address
                    </label>
                    <input
                      type="text"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="hello@brand.com"
                      className="w-full rounded-2xl bg-black/40 border border-white/10 px-3 py-2 text-white font-mono focus:outline-none focus:border-red-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-zinc-300 font-semibold mb-1">
                      Instagram Handle
                    </label>
                    <input
                      type="text"
                      value={newInsta}
                      onChange={(e) => setNewInsta(e.target.value)}
                      placeholder="@brandhandle"
                      className="w-full rounded-2xl bg-black/40 border border-white/10 px-3 py-2 text-white font-mono focus:outline-none focus:border-red-500/50"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="crimson-btn px-4 py-2 rounded-2xl font-bold cursor-pointer"
                  >
                    Save &amp; Generate High-Pitch
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
