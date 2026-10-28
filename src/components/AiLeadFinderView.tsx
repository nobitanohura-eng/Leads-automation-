import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  ALL_CREATOR_SKILLS,
  ALL_PITCH_TONES,
  AiEngineProvider,
  AppDatabase,
  CreatorSkill,
  GROQ_MODELS,
  PitchTone,
} from '../types/platform';
import { buildAgentResearchPrompt } from '../lib/engine';
import { apiDiscoverLeads, apiImportRawLeads, apiSaveConfig } from '../lib/apiClient';
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Copy,
  Database,
  ExternalLink,
  Globe,
  KeyRound,
  Sparkles,
  Upload,
} from 'lucide-react';

interface AiLeadFinderViewProps {
  db: AppDatabase;
  onRefreshDb: (newDb: AppDatabase) => void;
  onJumpToLeads: () => void;
  onOpenDataModal: () => void;
  notify: (msg: string, type?: 'success' | 'error') => void;
}

export const AiLeadFinderView: React.FC<AiLeadFinderViewProps> = ({
  db,
  onRefreshDb,
  onJumpToLeads,
  onOpenDataModal,
  notify,
}) => {
  const [selectedSkill, setSelectedSkill] = useState<CreatorSkill>(
    'Business Website & Landing Page'
  );
  const [niche, setNiche] = useState('Dental & Skin Clinics');
  const [location, setLocation] = useState('Mumbai & Delhi NCR');
  const [tone, setTone] = useState<PitchTone>(db.personaConfig.defaultTone);

  const [selectedEngine, setSelectedEngine] = useState<AiEngineProvider>(
    db.aiConfig.selectedEngine || 'gemini'
  );
  const [geminiApiKey, setGeminiApiKey] = useState(db.aiConfig.geminiApiKey || '');
  const [showGeminiKeyBox, setShowGeminiKeyBox] = useState(Boolean(db.aiConfig.geminiApiKey));
  const [groqApiKey, setGroqApiKey] = useState(db.aiConfig.groqApiKey || '');
  const [groqModel, setGroqModel] = useState(
    db.aiConfig.groqModel || 'llama-3.3-70b-versatile'
  );

  const [showGroqFallbackPrompt, setShowGroqFallbackPrompt] = useState(false);
  const [fallbackTriggeredMessage, setFallbackTriggeredMessage] = useState<string | null>(null);

  const [discovering, setDiscovering] = useState(false);
  const [finderStatus, setFinderStatus] = useState<{
    type: 'error' | 'success';
    message: string;
  } | null>(null);
  const [groundingSources, setGroundingSources] = useState<{ uri: string; title: string }[]>([]);

  const [rawPasteText, setRawPasteText] = useState('');
  const [importing, setImporting] = useState(false);

  const generatedAgentPrompt = buildAgentResearchPrompt({
    skill: selectedSkill,
    niche,
    location,
    count: 15,
  });

  const handleSaveAiKeyQuick = async () => {
    const nextDb = await apiSaveConfig(db, {
      aiConfig: {
        ...db.aiConfig,
        selectedEngine,
        geminiApiKey: geminiApiKey.trim(),
        groqApiKey: groqApiKey.trim(),
        groqModel,
      },
    });
    onRefreshDb(nextDb);
    notify('Saved AI Engine & API Keys successfully!');
  };

  const runDiscoveryWithEngine = async (engineToUse: AiEngineProvider, keyOverride?: string) => {
    setFinderStatus(null);
    setFallbackTriggeredMessage(null);
    setGroundingSources([]);

    if (!niche.trim()) {
      setFinderStatus({
        type: 'error',
        message: 'Please enter a target business niche first.',
      });
      return;
    }

    setDiscovering(true);
    const activeKey = (keyOverride ?? groqApiKey).trim();
    const result = await apiDiscoverLeads(db, {
      skill: selectedSkill,
      niche,
      location,
      count: 6,
      tone,
      geminiApiKey: geminiApiKey.trim() || undefined,
      groqApiKey: activeKey,
      groqModel,
      selectedEngine: engineToUse,
    });

    if ('error' in result) {
      if (result.needsGroqKey) {
        setShowGroqFallbackPrompt(true);
        setFallbackTriggeredMessage(
          result.geminiError
            ? `Google Gemini Search quota/limit reached (${result.geminiError}). Enter your Groq API Key (gsk_...) below to continue immediately with Groq Fallback!`
            : 'Google Gemini Search credits/quota exhausted or unavailable. Enter your free Groq API Key (gsk_...) below for automatic fallback!'
        );
      }
      setFinderStatus({
        type: 'error',
        message: result.error,
      });
      notify(result.error, 'error');
    } else {
      onRefreshDb(result.db);
      if (result.groundingSources && result.groundingSources.length > 0) {
        setGroundingSources(result.groundingSources);
      }
      if (result.geminiQuotaExhausted || result.quotaNotice) {
        setShowGroqFallbackPrompt(true);
        setFallbackTriggeredMessage(
          result.quotaNotice ||
            'Google Gemini Search quota limit was reached (429). We automatically switched to Zero-Downtime Verified Leads so your work never stops! You can add your free Groq API Key (gsk_...) or a fresh Gemini key anytime.'
        );
      }
      setFinderStatus({
        type: 'success',
        message: `Discovered & ranked ${result.discoveredCount} real clients via ${result.usedProvider}! Avinash Studio High-Pitches are ready.`,
      });
      notify(`Added ${result.discoveredCount} real client leads via ${result.usedProvider}!`);
    }
    setDiscovering(false);
  };

  const handleLiveAiSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    await runDiscoveryWithEngine(selectedEngine);
  };

  const handleSaveGroqAndRetry = async () => {
    if (!groqApiKey.trim()) {
      notify('Please paste your Groq API Key (gsk_...) first', 'error');
      return;
    }
    const nextDb = await apiSaveConfig(db, {
      aiConfig: {
        ...db.aiConfig,
        groqApiKey: groqApiKey.trim(),
        groqModel,
      },
    });
    onRefreshDb(nextDb);
    await runDiscoveryWithEngine('groq', groqApiKey.trim());
  };

  const handleImportRawAiOutput = async (e: React.FormEvent) => {
    e.preventDefault();
    setFinderStatus(null);
    if (!rawPasteText.trim()) {
      setFinderStatus({
        type: 'error',
        message:
          'Paste the real client output from ChatGPT, Gemini, Perplexity, Google Maps, or CSV/JSON rows first.',
      });
      return;
    }

    setImporting(true);
    const result = await apiImportRawLeads(db, {
      rawText: rawPasteText,
      defaultSkill: selectedSkill,
      tone,
    });
    if ('error' in result) {
      setFinderStatus({
        type: 'error',
        message: result.error,
      });
    } else {
      onRefreshDb(result.db);
      setRawPasteText('');
      setFinderStatus({
        type: 'success',
        message: `Imported ${result.importedCount} genuine leads, ranked their conversion probability, and generated Avinash Studio High-Pitches!`,
      });
      notify(`Imported & ranked ${result.importedCount} leads!`);
    }
    setImporting(false);
  };

  const showGroqBox =
    selectedEngine === 'groq' || showGroqFallbackPrompt || Boolean(fallbackTriggeredMessage);

  return (
    <div className="space-y-6">
      {/* Header Glass Banner */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bento-card p-6 rounded-3xl"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-red-400 tracking-wide mb-1">
              <Globe className="w-3.5 h-3.5" />
              Avinash Studio • Google Gemini Search Default + Smart Groq Fallback
            </div>
            <h1 className="text-xl lg:text-2xl font-extrabold text-white tracking-tight">
              Find Genuine Clients from Google Data (Gemini Default + Groq Fallback)
            </h1>
            <p className="text-xs text-zinc-400 mt-1 max-w-3xl leading-relaxed">
              By default, <strong className="text-zinc-200">Google Gemini + Live Google Search</strong> finds real businesses from Google data automatically. If Gemini credits/quota ever run out, it automatically falls back to <strong className="text-zinc-200">Groq Cloud API</strong>.
            </p>
          </div>

          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onOpenDataModal}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl backdrop-blur-md bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-100 text-xs font-bold shrink-0 cursor-pointer"
          >
            <Database className="w-4 h-4 text-red-400" />
            Import / Export JSON & CSV
          </motion.button>
        </div>

        {/* Engine Selector Bar */}
        <div className="mt-5 pt-4 border-t border-white/10 bg-black/30 rounded-2xl p-4 space-y-3 border">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-zinc-200">
              <Sparkles className="w-4 h-4 text-red-400" />
              <span>
                Active AI Engine:{' '}
                <span className="text-red-400">
                  {selectedEngine === 'gemini'
                    ? 'Google Gemini + Live Google Search (Default)'
                    : selectedEngine === 'groq'
                    ? `Groq Cloud API (${groqModel})`
                    : 'Custom OpenAI / OpenRouter'}
                </span>
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  { id: 'gemini', label: 'Google Gemini Search (Default)' },
                  { id: 'groq', label: 'Groq Cloud Fallback' },
                  { id: 'openai', label: 'OpenAI / Custom' },
                ] as const
              ).map((eng) => (
                <button
                  key={eng.id}
                  type="button"
                  onClick={() => {
                    setSelectedEngine(eng.id);
                    if (eng.id === 'groq') setShowGroqFallbackPrompt(true);
                  }}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-bold cursor-pointer transition-all ${
                    selectedEngine === eng.id
                      ? 'bg-red-500/20 border border-red-500/50 text-white shadow-[0_0_20px_rgba(239,68,68,0.2)]'
                      : 'bg-white/5 border border-white/10 text-zinc-400 hover:text-white'
                  }`}
                >
                  {eng.label}
                </button>
              ))}

              {selectedEngine === 'gemini' && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowGeminiKeyBox((prev) => !prev)}
                    className="px-3 py-1.5 rounded-full text-[11px] font-semibold bg-red-500/10 border border-red-500/30 text-red-300 hover:bg-red-500/20 cursor-pointer"
                  >
                    {geminiApiKey
                      ? 'Gemini Key: Ready ✓'
                      : showGeminiKeyBox
                      ? 'Hide Gemini Key'
                      : '+ Set Gemini API Key'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowGroqFallbackPrompt((prev) => !prev)}
                    className="px-3 py-1.5 rounded-full text-[11px] font-semibold bg-white/5 border border-white/10 text-zinc-300 hover:text-white cursor-pointer"
                  >
                    {groqApiKey
                      ? 'Groq Fallback Key: Ready ✓'
                      : showGroqFallbackPrompt
                      ? 'Hide Groq Fallback Key'
                      : '+ Set Backup Groq Key'}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Gemini In-Platform Key Box */}
          {showGeminiKeyBox && selectedEngine === 'gemini' && (
            <div className="rounded-2xl p-4 border border-red-500/30 bg-red-500/5 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-red-400" />
                  Google Gemini API Key or Custom Token (Platform Enter)
                </span>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="text-red-400 font-bold hover:underline inline-flex items-center gap-1"
                >
                  Get Key <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  value={geminiApiKey}
                  onChange={(e) => setGeminiApiKey(e.target.value)}
                  placeholder="Paste your Gemini API key (AIzaSy...) or auth token here"
                  className="flex-1 bg-black/40 border border-white/10 focus:border-red-500/50 rounded-2xl px-3.5 py-2 text-xs text-white font-mono focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleSaveAiKeyQuick}
                  className="px-4 py-2 rounded-2xl text-xs font-bold crimson-btn text-white cursor-pointer shrink-0"
                >
                  Save Key
                </button>
              </div>
            </div>
          )}

          {/* Highlighted Groq Fallback Prompt */}
          {showGroqBox && (
            <div
              className={`rounded-2xl p-4 border space-y-2.5 ${
                fallbackTriggeredMessage
                  ? 'bg-amber-500/10 border-amber-500/40'
                  : 'bg-white/5 border-white/10'
              }`}
            >
              {fallbackTriggeredMessage && (
                <div className="flex items-start gap-2 text-xs font-bold text-amber-300">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>{fallbackTriggeredMessage}</span>
                </div>
              )}

              <div className="flex items-center justify-between text-xs text-zinc-300">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-red-400" />
                  Groq Cloud API Key (Used automatically if Gemini quota/credits run out)
                </span>
                <a
                  href="https://console.groq.com/keys"
                  target="_blank"
                  rel="noreferrer"
                  className="text-red-400 font-bold hover:underline inline-flex items-center gap-1"
                >
                  Get Free Groq Key <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center text-xs">
                <div className="md:col-span-5">
                  <input
                    type="password"
                    value={groqApiKey}
                    onChange={(e) => setGroqApiKey(e.target.value)}
                    placeholder="Enter Groq API Key (gsk_...) for fallback"
                    className="w-full rounded-2xl bg-black/40 border border-white/10 px-3.5 py-2 text-white font-mono"
                  />
                </div>
                <div className="md:col-span-4">
                  <select
                    aria-label="Select Groq AI Model"
                    value={groqModel}
                    onChange={(e) => setGroqModel(e.target.value)}
                    className="w-full rounded-2xl bg-black/40 border border-white/10 px-3.5 py-2 text-white font-medium"
                  >
                    {GROQ_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-3 flex gap-1.5">
                  <button
                    type="button"
                    onClick={handleSaveAiKeyQuick}
                    className="flex-1 py-2 px-3 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold cursor-pointer"
                  >
                    Save Key
                  </button>
                  {fallbackTriggeredMessage && (
                    <button
                      type="button"
                      onClick={handleSaveGroqAndRetry}
                      disabled={discovering}
                      className="flex-1 py-2 px-3 rounded-2xl crimson-btn text-white font-bold cursor-pointer"
                    >
                      Retry Groq
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {finderStatus && (
          <div
            className={`mt-4 p-4 rounded-2xl border space-y-2 text-xs font-medium ${
              finderStatus.type === 'error'
                ? 'bg-red-500/10 border-red-500/40 text-red-200'
                : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {finderStatus.type === 'error' ? (
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                )}
                <span>{finderStatus.message}</span>
              </div>
              {finderStatus.type === 'success' && (
                <button
                  type="button"
                  onClick={onJumpToLeads}
                  className="crimson-btn px-4 py-1.5 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Open Ranked Leads & Send High-Pitches →
                </button>
              )}
            </div>

            {groundingSources.length > 0 && (
              <div className="pt-2 border-t border-emerald-500/30 flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold text-emerald-300 flex items-center gap-1">
                  <Globe className="w-3.5 h-3.5" /> Google Search Grounding Sources:
                </span>
                {groundingSources.map((src, i) => (
                  <a
                    key={`${src.uri}-${i}`}
                    href={src.uri}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-white/10 border border-emerald-500/30 text-[11px] text-emerald-200 hover:underline"
                  >
                    <span className="truncate max-w-[180px]">{src.title}</span>
                    <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: 1-Click Live AI Lead Discovery */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-6 bento-card p-6 rounded-3xl space-y-5"
        >
          <div>
            <div className="flex items-center gap-2 text-red-400 font-bold text-sm">
              <Globe className="w-4 h-4" />
              <h2>01. Automatic Google Data & AI Client Finder</h2>
            </div>
            <p className="text-xs text-zinc-400 mt-1">
              Uses <strong className="text-zinc-200">Google Gemini + Google Search Grounding</strong> by default to find real businesses and auto-switches to <strong className="text-zinc-200">Groq Cloud</strong> if credits run out.
            </p>
          </div>

          <form onSubmit={handleLiveAiSearch} className="space-y-4 text-xs">
            <div>
              <label className="block font-bold text-zinc-200 mb-1.5">
                1. Avinash Studio Service to Pitch
              </label>
              <select
                value={selectedSkill}
                onChange={(e) => setSelectedSkill(e.target.value as CreatorSkill)}
                className="w-full rounded-2xl bg-black/40 border border-white/10 px-3.5 py-2.5 text-white font-medium"
              >
                {ALL_CREATOR_SKILLS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-zinc-200 mb-1.5">
                  2. Target Business Niche *
                </label>
                <input
                  type="text"
                  value={niche}
                  onChange={(e) => setNiche(e.target.value)}
                  placeholder="e.g., Dental Clinics, Streetwear, Gyms"
                  className="w-full rounded-2xl bg-black/40 border border-white/10 px-3.5 py-2.5 text-white"
                />
              </div>

              <div>
                <label className="block font-bold text-zinc-200 mb-1.5">
                  3. Target City / Country
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g., Mumbai, Delhi NCR, Dubai"
                  className="w-full rounded-2xl bg-black/40 border border-white/10 px-3.5 py-2.5 text-white"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-zinc-200 mb-1.5">
                4. Pitch Strategy
              </label>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value as PitchTone)}
                className="w-full rounded-2xl bg-black/40 border border-white/10 px-3.5 py-2.5 text-white"
              >
                {ALL_PITCH_TONES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <motion.button
              type="submit"
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              disabled={discovering}
              className="crimson-btn w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              {discovering
                ? selectedEngine === 'gemini'
                  ? 'Searching Google Data via Gemini Live Search...'
                  : `Searching Real Clients via ${selectedEngine.toUpperCase()}...`
                : selectedEngine === 'gemini'
                ? 'Find Real Clients via Google Gemini Search (Default)'
                : `Find Real Clients via ${selectedEngine.toUpperCase()}`}
            </motion.button>
          </form>

          {/* Quick High-Paying Niche Presets */}
          <div className="pt-3 border-t border-white/10">
            <span className="text-[11px] font-bold text-zinc-400 block mb-2">
              High-Converting Niche Presets:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {[
                {
                  label: 'Clinics & Dentists (Booking Website)',
                  niche: 'Dental & Aesthetic Skin Clinics',
                  skill: 'Business Website & Landing Page' as CreatorSkill,
                },
                {
                  label: 'Instagram Apparel Brands (E-Commerce)',
                  niche: 'D2C Streetwear & Boutique Clothing',
                  skill: 'E-Commerce & Product Storefront' as CreatorSkill,
                },
                {
                  label: 'Gyms & Cafes (Ad Posters)',
                  niche: 'Fitness Gyms & Specialty Cafes',
                  skill: 'Social Media Graphics & Posters' as CreatorSkill,
                },
                {
                  label: 'Coaches & Agencies (Reels & Video Ads)',
                  niche: 'Business Coaches & Real Estate Agencies',
                  skill: 'Short-Form Video Ads & Reels' as CreatorSkill,
                },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setNiche(preset.niche);
                    setSelectedSkill(preset.skill);
                  }}
                  className="text-xs px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white border border-white/10 font-medium cursor-pointer transition-colors"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </motion.div>

        {/* RIGHT COLUMN: Copy Agent Prompt + Paste Raw Output */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="lg:col-span-6 bento-card p-6 rounded-3xl space-y-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-red-400 font-bold text-sm">
                <Bot className="w-4 h-4" />
                <h2>02. Copy Prompt for ChatGPT / Perplexity & Paste Real Leads</h2>
              </div>
              <p className="text-xs text-zinc-400 mt-1">
                Copy this prompt into ChatGPT Search, Perplexity, Claude, or Gemini, then paste the real client list below to auto-extract Emails, Phones, and `@insta` handles.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(generatedAgentPrompt);
                notify('Copied Avinash Studio Research Prompt!');
              }}
              className="crimson-btn shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl text-xs font-bold cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              Copy Prompt
            </button>
          </div>

          <div className="bg-black/40 border border-white/10 rounded-2xl p-3.5 text-[11px] font-mono text-zinc-300 max-h-36 overflow-y-auto whitespace-pre-wrap">
            {generatedAgentPrompt}
          </div>

          <form onSubmit={handleImportRawAiOutput} className="space-y-3">
            <label className="block text-xs font-bold text-zinc-200">
              Paste Real Client Data (JSON, CSV, Markdown Table, or Raw Lines with Phone/Email/@Insta)
            </label>

            <textarea
              rows={6}
              value={rawPasteText}
              onChange={(e) => setRawPasteText(e.target.value)}
              placeholder="Paste the real client response from ChatGPT, Perplexity, Gemini, or Google Maps here..."
              className="w-full rounded-2xl bg-black/40 border border-white/10 p-3.5 text-xs font-mono text-white"
            />

            <motion.button
              type="submit"
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              disabled={importing}
              className="crimson-btn w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              {importing
                ? 'Extracting & Ranking Real Clients...'
                : 'Extract Real Leads & Generate Avinash Studio High-Pitches'}
            </motion.button>
          </form>
        </motion.div>
      </div>
    </div>
  );
};
