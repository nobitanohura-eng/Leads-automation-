import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  Mail,
  Instagram,
  CheckCircle2,
  RefreshCw,
  UserCheck,
  Smartphone,
  Cpu,
  Database,
  AlertCircle,
  ExternalLink,
  Copy,
  Code2,
} from 'lucide-react';
import {
  AppDatabase,
  EmailGatewayConfig,
  ExternalAiConfig,
  GROQ_MODELS,
  InstaAutomationConfig,
  OutreachPersonaConfig,
  ALL_PITCH_TONES,
  SupabaseDatabaseConfig,
} from '../types/platform';
import {
  apiSaveConfig,
  apiVerifyEmailConnection,
  apiVerifySmsConnection,
  apiVerifySupabaseConnection,
  apiDispatchEmail,
} from '../lib/apiClient';
import { SUPABASE_SETUP_SQL } from '../lib/supabaseSql';

interface Props {
  db: AppDatabase;
  onUpdateDb?: (next: AppDatabase) => void;
  onRefreshDb?: (next: AppDatabase) => void;
  showToast?: (msg: string) => void;
  notify?: (msg: string, type?: 'success' | 'error') => void;
  onOpenDataModal: () => void;
}

export const GatewaySetupView: React.FC<Props> = ({
  db,
  onUpdateDb,
  onRefreshDb,
  showToast,
  notify,
  onOpenDataModal,
}) => {
  const triggerRefresh = (next: AppDatabase) => {
    if (onRefreshDb) onRefreshDb(next);
    if (onUpdateDb) onUpdateDb(next);
  };

  const triggerToast = (msg: string, type?: 'success' | 'error') => {
    if (notify) notify(msg, type);
    else if (showToast) showToast(msg);
  };

  const [supabaseForm, setSupabaseForm] = useState<SupabaseDatabaseConfig>(() => ({
    url: db.supabaseConfig?.url || 'https://ybywcdbxelmolbnfaqwk.supabase.co',
    anonKey: db.supabaseConfig?.anonKey || '',
    serviceRoleKey: db.supabaseConfig?.serviceRoleKey || '',
    enabled: Boolean(db.supabaseConfig?.enabled ?? true),
    connectionStatus: db.supabaseConfig?.connectionStatus || 'connected',
    lastSyncedAt: db.supabaseConfig?.lastSyncedAt || undefined,
    connectionError: db.supabaseConfig?.connectionError,
  }));
  const [showSqlDrawer, setShowSqlDrawer] = useState(
    db.supabaseConfig?.connectionStatus === 'tables_missing'
  );
  const [verifyingSupabase, setVerifyingSupabase] = useState(false);
  const [supabaseStatusBanner, setSupabaseStatusBanner] = useState<{
    ok: boolean;
    msg: string;
    schemaMissing?: boolean;
  } | null>(null);

  const [emailForm, setEmailForm] = useState<EmailGatewayConfig>(db.emailConfig);
  const [aiForm, setAiForm] = useState<ExternalAiConfig>({
    ...db.aiConfig,
    geminiApiKey: db.aiConfig.geminiApiKey || '',
  });
  const [personaForm, setPersonaForm] = useState<OutreachPersonaConfig>(db.personaConfig);
  const [instaForm, setInstaForm] = useState<InstaAutomationConfig>(db.instaConfig);

  const [saving, setSaving] = useState(false);
  const [verifyingEmail, setVerifyingEmail] = useState(false);
  const [verifyingSms, setVerifyingSms] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [emailStatusBanner, setEmailStatusBanner] = useState<{ ok: boolean; msg: string } | null>(
    null
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      const next = await apiSaveConfig(db, {
        supabaseConfig: {
          ...supabaseForm,
          url: supabaseForm.url.trim(),
          anonKey: supabaseForm.anonKey.trim(),
          serviceRoleKey: supabaseForm.serviceRoleKey?.trim() || undefined,
          enabled: Boolean(supabaseForm.url.trim() && supabaseForm.anonKey.trim()),
        },
        emailConfig: emailForm,
        aiConfig: aiForm,
        personaConfig: personaForm,
        instaConfig: instaForm,
      });
      triggerRefresh(next);
      triggerToast('Avinash Studio settings saved & synced', 'success');
    } catch (e: any) {
      triggerToast(`Failed to save settings: ${e.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleVerifySupabase = async () => {
    if (!supabaseForm.url.trim() || (!supabaseForm.anonKey.trim() && !supabaseForm.serviceRoleKey?.trim())) {
      setSupabaseStatusBanner({
        ok: false,
        msg: 'Please enter both your Supabase Project URL (https://xxxx.supabase.co) and Supabase API Key (anon / service_role).',
      });
      triggerToast('Enter Supabase Project URL and API Key first', 'error');
      return;
    }
    setVerifyingSupabase(true);
    setSupabaseStatusBanner(null);
    try {
      const res = await apiVerifySupabaseConnection(db, {
        ...supabaseForm,
        url: supabaseForm.url.trim(),
        anonKey: supabaseForm.anonKey.trim(),
        serviceRoleKey: supabaseForm.serviceRoleKey?.trim() || undefined,
        enabled: true,
      });
      triggerRefresh(res.db);
      if (res.db.supabaseConfig) {
        setSupabaseForm(res.db.supabaseConfig);
      }
      if (res.schemaMissing) {
        setShowSqlDrawer(true);
      }
      setSupabaseStatusBanner({
        ok: res.connected,
        msg: res.message,
        schemaMissing: res.schemaMissing,
      });
      triggerToast(res.message, res.connected ? 'success' : 'error');
    } catch (e: any) {
      setSupabaseStatusBanner({
        ok: false,
        msg: e.message || 'Supabase connection test failed',
      });
      triggerToast(`Supabase check failed: ${e.message}`, 'error');
    } finally {
      setVerifyingSupabase(false);
    }
  };

  const handleVerifyEmail = async () => {
    setVerifyingEmail(true);
    setEmailStatusBanner(null);
    try {
      const res = await apiVerifyEmailConnection(db, emailForm);
      triggerRefresh(res.db);
      setEmailForm(res.db.emailConfig);
      setEmailStatusBanner({ ok: res.connected, msg: res.message });
      triggerToast(res.message, res.connected ? 'success' : 'error');
    } catch (e: any) {
      setEmailStatusBanner({ ok: false, msg: e.message || 'SMTP verification failed' });
      triggerToast(`Email check failed: ${e.message}`, 'error');
    } finally {
      setVerifyingEmail(false);
    }
  };

  const handleSendTestEmail = async () => {
    if (!emailForm.senderEmail.trim()) {
      triggerToast('Enter your Gmail address first', 'error');
      return;
    }
    setTestingEmail(true);
    setEmailStatusBanner(null);
    try {
      const savedDb = await apiSaveConfig(db, { emailConfig: emailForm });
      const res = await apiDispatchEmail(savedDb, {
        toEmail: emailForm.senderEmail.trim(),
        subject: 'Avinash Studio — Live Gmail SMTP Test',
        body: `Hi Avinash,\n\nYour Gmail App Key SMTP connection is working inside Avinash Studio.\n\nBest,\n${personaForm.signatureName}`,
      });
      triggerRefresh(res.db);
      setEmailStatusBanner({ ok: res.ok, msg: res.statusNote });
      triggerToast(res.statusNote, res.ok ? 'success' : 'error');
    } catch (e: any) {
      setEmailStatusBanner({ ok: false, msg: e.message });
      triggerToast(`Email dispatch error: ${e.message}`, 'error');
    } finally {
      setTestingEmail(false);
    }
  };

  const handleVerifySms = async () => {
    setVerifyingSms(true);
    try {
      const res = await apiVerifySmsConnection(db);
      triggerRefresh(res.db);
      triggerToast(res.message, res.connected ? 'success' : 'error');
    } catch (e: any) {
      triggerToast(`Phone check failed: ${e.message}`, 'error');
    } finally {
      setVerifyingSms(false);
    }
  };

  const isEmailConnected = db.emailConfig.connectionStatus === 'connected';
  const isPhoneConnected = db.smsConfig.connectionStatus === 'connected';
  const isSupabaseConnected =
    db.supabaseConfig?.connectionStatus === 'connected' ||
    Boolean(supabaseForm.url.trim() && (supabaseForm.anonKey.trim() || supabaseForm.serviceRoleKey?.trim()));

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bento-card rounded-3xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4"
      >
        <div>
          <span className="text-xs font-bold tracking-wide text-red-400">
            Avinash Studio • Control Center &amp; Supabase Cloud DB
          </span>
          <h1 className="text-xl md:text-2xl font-extrabold text-white mt-0.5">
            Supabase PostgreSQL Database, AI Engines, Gmail App Key &amp; Gateways
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Connect your <strong className="text-zinc-200">Supabase PostgreSQL Database</strong> for permanent cloud storage on Vercel, configure Gemini &amp; Groq AI keys, and verify your Android SIM SMS &amp; Gmail SMTP gateways.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onOpenDataModal}
            className="px-4 py-2.5 rounded-2xl backdrop-blur-md bg-white/5 hover:bg-white/10 text-zinc-100 border border-white/10 font-bold text-xs flex items-center gap-2 transition-all cursor-pointer"
          >
            <Database className="w-3.5 h-3.5 text-red-400" />
            JSON / CSV Import &amp; Export
          </motion.button>
          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleSave}
            disabled={saving}
            className="crimson-btn px-5 py-2.5 rounded-2xl text-white font-bold text-xs flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Save All Settings
          </motion.button>
        </div>
      </motion.div>

      {/* Live Connection Health Strip (3 Cards: Supabase DB, Android Phone, Gmail SMTP) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Supabase Status Card */}
        <div
          className={`p-5 rounded-3xl backdrop-blur-md border flex items-center justify-between gap-3 ${
            isSupabaseConnected
              ? 'bg-emerald-500/10 border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.12)]'
              : 'bg-amber-500/10 border-amber-500/30 shadow-[0_0_20px_rgba(245,158,11,0.12)]'
          }`}
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border ${
                isSupabaseConnected
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                  : 'bg-amber-500/20 border-amber-500/40 text-amber-300'
              }`}
            >
              <Database className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-extrabold text-white truncate">
                Supabase DB: {isSupabaseConnected ? 'CONNECTED' : 'KEYS NEEDED'}
              </div>
              <div className="text-[11px] text-zinc-400 mt-0.5 truncate">
                {db.supabaseConfig?.connectionError ||
                  (isSupabaseConnected
                    ? `Synced (${db.supabaseConfig?.lastSyncedAt || 'Live'})`
                    : 'Paste Supabase URL & Key below')}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleVerifySupabase}
            disabled={verifyingSupabase}
            className="px-3.5 py-2 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-bold text-white flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-red-400 ${verifyingSupabase ? 'animate-spin' : ''}`} />
            {verifyingSupabase ? 'Syncing...' : 'Sync DB'}
          </button>
        </div>

        {/* Phone Connection Status Card */}
        <div
          className={`p-5 rounded-3xl backdrop-blur-md border flex items-center justify-between gap-3 ${
            isPhoneConnected
              ? 'bg-emerald-500/10 border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.12)]'
              : 'bg-amber-500/10 border-amber-500/30 shadow-[0_0_20px_rgba(245,158,11,0.12)]'
          }`}
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border ${
                isPhoneConnected
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                  : 'bg-amber-500/20 border-amber-500/40 text-amber-300'
              }`}
            >
              <Smartphone className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-extrabold text-white truncate">
                Android SMS: {isPhoneConnected ? 'CONNECTED' : 'Check Required'}
              </div>
              <div className="text-[11px] text-zinc-400 mt-0.5 truncate">
                {db.smsConfig.connectionError
                  ? db.smsConfig.connectionError
                  : `Device: ${db.smsConfig.deviceId} · SIM ${db.smsConfig.simSlot}`}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleVerifySms}
            disabled={verifyingSms}
            className="px-3.5 py-2 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-bold text-white flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-red-400 ${verifyingSms ? 'animate-spin' : ''}`} />
            {verifyingSms ? 'Checking...' : 'Test Phone'}
          </button>
        </div>

        {/* Email SMTP Status Card */}
        <div
          className={`p-5 rounded-3xl backdrop-blur-md border flex items-center justify-between gap-3 ${
            isEmailConnected
              ? 'bg-emerald-500/10 border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.12)]'
              : 'bg-amber-500/10 border-amber-500/30 shadow-[0_0_20px_rgba(245,158,11,0.12)]'
          }`}
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border ${
                isEmailConnected
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                  : 'bg-amber-500/20 border-amber-500/40 text-amber-300'
              }`}
            >
              <Mail className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-extrabold text-white truncate">
                Gmail SMTP: {isEmailConnected ? 'CONNECTED' : 'APP KEY NEEDED'}
              </div>
              <div className="text-[11px] text-zinc-400 mt-0.5 truncate">
                {db.emailConfig.connectionError ||
                  'Enter 16-char Google App Password below'}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleVerifyEmail}
            disabled={verifyingEmail}
            className="px-3.5 py-2 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-bold text-white flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-red-400 ${verifyingEmail ? 'animate-spin' : ''}`} />
            {verifyingEmail ? 'Checking...' : 'Verify Email'}
          </button>
        </div>
      </div>

      {/* DEDICATED SUPABASE POSTGRESQL CLOUD DATABASE CARD */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bento-card-elevated rounded-3xl p-6 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
              <Database className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white">
                Supabase Cloud Database (PostgreSQL Persistence for Vercel)
              </h2>
              <p className="text-xs text-zinc-400">
                Paste your Supabase Project URL and API Key (<code className="text-emerald-400">anon</code> or{' '}
                <code className="text-emerald-400">service_role</code>) below, or set{' '}
                <code className="text-zinc-200">SUPABASE_URL</code> &amp;{' '}
                <code className="text-zinc-200">SUPABASE_ANON_KEY</code> in Vercel Environment Variables.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowSqlDrawer((prev) => !prev)}
              className="px-3.5 py-2 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-zinc-200 flex items-center gap-1.5 cursor-pointer"
            >
              <Code2 className="w-3.5 h-3.5 text-emerald-400" />
              {showSqlDrawer ? 'Hide Supabase SQL Code' : 'View Supabase SQL Schema Code'}
            </button>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(SUPABASE_SETUP_SQL);
                triggerToast('Copied SUPABASE_SETUP.sql! Paste it in Supabase SQL Editor and click Run.', 'success');
              }}
              className="px-3.5 py-2 rounded-2xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-xs font-bold text-emerald-300 flex items-center gap-1.5 cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              Copy SQL for Supabase
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
          <div className="md:col-span-5">
            <label className="block text-xs font-bold text-zinc-300 mb-1.5">
              1. Supabase Project URL
            </label>
            <input
              type="text"
              value={supabaseForm.projectUrl}
              onChange={(e) =>
                setSupabaseForm({ ...supabaseForm, projectUrl: e.target.value })
              }
              placeholder="https://xxxxxxxxxxxxxxxxxxxx.supabase.co"
              className="w-full bg-black/40 border border-white/10 focus:border-emerald-500/50 rounded-2xl px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none"
            />
          </div>

          <div className="md:col-span-5">
            <label className="block text-xs font-bold text-zinc-300 mb-1.5">
              2. Supabase API Key (anon public OR service_role secret)
            </label>
            <input
              type="password"
              value={supabaseForm.anonOrServiceKey}
              onChange={(e) =>
                setSupabaseForm({ ...supabaseForm, anonOrServiceKey: e.target.value })
              }
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              className="w-full bg-black/40 border border-white/10 focus:border-emerald-500/50 rounded-2xl px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none"
            />
          </div>

          <div className="md:col-span-2">
            <button
              type="button"
              onClick={handleVerifySupabase}
              disabled={verifyingSupabase}
              className="crimson-btn w-full py-2.5 px-4 rounded-2xl text-xs font-bold text-white flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${verifyingSupabase ? 'animate-spin' : ''}`} />
              {verifyingSupabase ? 'Verifying...' : 'Connect & Sync'}
            </button>
          </div>
        </div>

        {supabaseStatusBanner && (
          <div
            className={`p-3.5 rounded-2xl border text-xs flex items-start gap-2.5 ${
              supabaseStatusBanner.ok
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
            }`}
          >
            {supabaseStatusBanner.ok ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            )}
            <div className="space-y-1">
              <div className="font-semibold">{supabaseStatusBanner.msg}</div>
              {supabaseStatusBanner.schemaMissing && (
                <div className="text-[11px] text-amber-300">
                  Copy the SQL script below, open your{' '}
                  <strong>Supabase Dashboard → SQL Editor → New Query</strong>, paste the script, and click{' '}
                  <strong>Run</strong>. Then click <strong>Connect &amp; Sync</strong> again!
                </div>
              )}
            </div>
          </div>
        )}

        {showSqlDrawer && (
          <div className="p-4 rounded-2xl bg-black/50 border border-emerald-500/30 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-emerald-300">
                Paste this SQL in Supabase Dashboard → SQL Editor → New Query → Run
              </span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(SUPABASE_SETUP_SQL);
                  triggerToast('Copied SUPABASE_SETUP.sql to clipboard!', 'success');
                }}
                className="px-3 py-1 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-200 font-bold cursor-pointer flex items-center gap-1"
              >
                <Copy className="w-3 h-3" /> Copy SQL
              </button>
            </div>
            <pre className="text-[11px] font-mono text-zinc-300 max-h-64 overflow-y-auto whitespace-pre-wrap p-3 rounded-xl bg-black/60 border border-white/10">
              {SUPABASE_SETUP_SQL}
            </pre>
          </div>
        )}
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. Groq API + Multi-AI Engine Card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="bento-card rounded-3xl p-6 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-white/10 pb-3.5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center">
                <Cpu className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">Groq API &amp; Multi-AI Lead Engine</h2>
                <p className="text-xs text-zinc-400">
                  Run ultra-fast Groq models, Gemini Live Search, or OpenAI/OpenRouter
                </p>
              </div>
            </div>
            <span className="text-[10px] font-bold uppercase px-2.5 py-1 rounded-full bg-red-500/15 text-red-300 border border-red-500/30">
              Multi-Engine
            </span>
          </div>

          <div className="space-y-3.5">
            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1">
                Primary AI Provider (Auto-Falls Back to Groq When Needed)
              </label>
              <select
                value={aiForm.selectedEngine}
                onChange={(e) => setAiForm({ ...aiForm, selectedEngine: e.target.value as any })}
                className="w-full bg-black/40 border border-white/10 focus:border-red-500/50 rounded-2xl px-3.5 py-2.5 text-xs font-semibold text-white focus:outline-none"
              >
                <option value="gemini">Google Gemini + Live Google Search (Default)</option>
                <option value="groq">Groq Cloud API (Auto-Fallback / Llama 3.3 70B)</option>
                <option value="openrouter">OpenRouter API (Claude / DeepSeek / GPT)</option>
                <option value="openai">OpenAI Official API</option>
                <option value="custom">Custom OpenAI-Compatible Endpoint</option>
              </select>
            </div>

            {/* Google Gemini In-Platform API Key Input */}
            <div className="p-4 rounded-2xl bg-red-500/5 border border-red-500/25 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white">Google Gemini API Key</span>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] font-semibold text-red-400 hover:underline flex items-center gap-1"
                >
                  Get Key from Google AI Studio <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <input
                type="password"
                value={aiForm.geminiApiKey || ''}
                onChange={(e) => setAiForm({ ...aiForm, geminiApiKey: e.target.value })}
                placeholder="Paste your Gemini key (AIzaSy...) or leave blank to use server GEMINI_API_KEY"
                className="w-full bg-black/40 border border-white/10 focus:border-red-500/50 rounded-2xl px-3.5 py-2 text-xs text-white font-mono focus:outline-none"
              />
            </div>

            <div className="p-4 rounded-2xl bg-black/30 border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white">Groq Cloud Configuration</span>
                <a
                  href="https://console.groq.com/keys"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] font-semibold text-red-400 hover:underline flex items-center gap-1"
                >
                  Get Free Groq Key <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-zinc-400 mb-1">
                  Groq API Key (gsk_...)
                </label>
                <input
                  type="password"
                  value={aiForm.groqApiKey}
                  onChange={(e) => setAiForm({ ...aiForm, groqApiKey: e.target.value })}
                  placeholder="gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  className="w-full bg-black/40 border border-white/10 focus:border-red-500/50 rounded-2xl px-3.5 py-2 text-xs text-white font-mono focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-zinc-400 mb-1">
                  Groq Model Selection
                </label>
                <select
                  value={aiForm.groqModel || 'llama-3.3-70b-versatile'}
                  onChange={(e) => setAiForm({ ...aiForm, groqModel: e.target.value })}
                  className="w-full bg-black/40 border border-white/10 focus:border-red-500/50 rounded-2xl px-3.5 py-2 text-xs text-white font-semibold focus:outline-none"
                >
                  {GROQ_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </motion.div>

        {/* 2. Gmail App Key Automation Card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bento-card rounded-3xl p-6 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-white/10 pb-3.5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center">
                <Mail className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">Gmail App Key Automation</h2>
                <p className="text-xs text-zinc-400">
                  Send 1-click automated emails via Gmail SMTP or fallback to Gmail Web Compose
                </p>
              </div>
            </div>
            <a
              href="https://myaccount.google.com/apppasswords"
              target="_blank"
              rel="noreferrer"
              className="text-[11px] font-bold text-red-400 hover:underline flex items-center gap-1"
            >
              Get 16-Letter App Key <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="space-y-3.5">
            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1">
                Your Gmail Address
              </label>
              <input
                type="email"
                value={emailForm.senderEmail}
                onChange={(e) => setEmailForm({ ...emailForm, senderEmail: e.target.value })}
                placeholder="avinash@gmail.com"
                className="w-full bg-black/40 border border-white/10 focus:border-red-500/50 rounded-2xl px-3.5 py-2.5 text-xs text-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1">
                Google 16-Character App Password
              </label>
              <input
                type="password"
                value={emailForm.appPassword}
                onChange={(e) => setEmailForm({ ...emailForm, appPassword: e.target.value })}
                placeholder="xxxx xxxx xxxx xxxx"
                className="w-full bg-black/40 border border-white/10 focus:border-red-500/50 rounded-2xl px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none"
              />
              <p className="text-[11px] text-zinc-400 mt-1">
                Google Account → Security → 2-Step Verification → App Passwords.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleVerifyEmail}
                disabled={verifyingEmail}
                className="px-4 py-2.5 rounded-2xl bg-white/5 hover:bg-white/10 text-zinc-100 border border-white/10 font-bold text-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-red-400 ${verifyingEmail ? 'animate-spin' : ''}`} />
                {verifyingEmail ? 'Verifying SMTP...' : 'Verify Gmail App Key'}
              </button>

              <button
                type="button"
                onClick={handleSendTestEmail}
                disabled={testingEmail}
                className="crimson-btn px-4 py-2.5 rounded-2xl text-white font-bold text-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Mail className="w-3.5 h-3.5" />
                {testingEmail ? 'Sending Test...' : 'Send Test Email to Myself'}
              </button>
            </div>

            {emailStatusBanner && (
              <div
                className={`p-3.5 rounded-2xl border text-xs flex items-start gap-2 ${
                  emailStatusBanner.ok
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                }`}
              >
                {emailStatusBanner.ok ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                )}
                <span>{emailStatusBanner.msg}</span>
              </div>
            )}
          </div>
        </motion.div>

        {/* 3. Avinash Studio High-Pitch Identity */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="bento-card rounded-3xl p-6 space-y-4"
        >
          <div className="flex items-center gap-3 border-b border-white/10 pb-3.5">
            <div className="w-10 h-10 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center">
              <UserCheck className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Avinash Studio High-Pitch Identity</h2>
              <p className="text-xs text-zinc-400">
                Every Email, SMS, and Instagram DM is signed with your studio identity and portfolio
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1">
                Studio / Sender Sign-Off
              </label>
              <input
                type="text"
                value={personaForm.signatureName}
                onChange={(e) => setPersonaForm({ ...personaForm, signatureName: e.target.value })}
                placeholder="Avinash — Avinash Studio"
                className="w-full bg-black/40 border border-white/10 focus:border-red-500/50 rounded-2xl px-3.5 py-2.5 text-xs text-white focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1">
                Portfolio / Demo Link
              </label>
              <input
                type="text"
                value={personaForm.portfolioUrl}
                onChange={(e) => setPersonaForm({ ...personaForm, portfolioUrl: e.target.value })}
                placeholder="https://avinashstudio.com"
                className="w-full bg-black/40 border border-white/10 focus:border-red-500/50 rounded-2xl px-3.5 py-2.5 text-xs text-white focus:outline-none"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-zinc-300 mb-1">
                Default Pitch Strategy
              </label>
              <select
                value={personaForm.defaultTone}
                onChange={(e) => setPersonaForm({ ...personaForm, defaultTone: e.target.value as any })}
                className="w-full bg-black/40 border border-white/10 focus:border-red-500/50 rounded-2xl px-3.5 py-2.5 text-xs font-semibold text-white focus:outline-none"
              >
                {ALL_PITCH_TONES.map((tone) => (
                  <option key={tone} value={tone}>
                    {tone}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </motion.div>

        {/* 4. Instagram DM & Webhook Bridge */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="bento-card rounded-3xl p-6 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-white/10 pb-3.5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center">
                <Instagram className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">Instagram DM Deep-Link &amp; Webhook</h2>
                <p className="text-xs text-zinc-400">
                  1-Click copy High-Pitch DM &amp; open <code className="text-red-400">ig.me/m/handle</code>
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3.5">
            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1">
                Instagram Action Mode
              </label>
              <select
                value={instaForm.defaultAction}
                onChange={(e) => setInstaForm({ ...instaForm, defaultAction: e.target.value as any })}
                className="w-full bg-black/40 border border-white/10 focus:border-red-500/50 rounded-2xl px-3.5 py-2.5 text-xs font-semibold text-white focus:outline-none"
              >
                <option value="ig.me Deep Link + Auto-Copy">ig.me Deep Link + Auto-Copy DM</option>
                <option value="Webhook / ManyChat URL">Webhook / ManyChat Automation URL</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1">
                Optional Automation Webhook URL (Make / n8n / Zapier)
              </label>
              <input
                type="text"
                value={instaForm.webhookUrl}
                onChange={(e) => setInstaForm({ ...instaForm, webhookUrl: e.target.value })}
                placeholder="https://hook.eu1.make.com/..."
                className="w-full bg-black/40 border border-white/10 focus:border-red-500/50 rounded-2xl px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none"
              />
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};
