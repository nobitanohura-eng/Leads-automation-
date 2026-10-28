/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  CheckCircle2,
  AlertCircle,
  Smartphone,
  Mail,
  Database,
  Upload,
  Download,
  Search,
  Settings,
  Bell,
  X,
} from 'lucide-react';
import { AppDatabase } from './types/platform';
import {
  getInitialClientDb,
  apiFetchState,
  saveClientDbCache,
  apiVerifySmsConnection,
  apiImportPortableData,
} from './lib/apiClient';
import { serializeWorkspaceBackup } from './lib/engine';
import { LeadListAndPitchView } from './components/LeadListAndPitchView';
import { AiLeadFinderView } from './components/AiLeadFinderView';
import { FollowUpAndBulkView } from './components/FollowUpAndBulkView';
import { SmsCloudGatewayView } from './components/SmsCloudGatewayView';
import { GatewaySetupView } from './components/GatewaySetupView';

type ActiveTab = 'leads' | 'finder' | 'followups' | 'sms_cloud' | 'settings';

/* Tactile 3D-Styled Sidebar Emblem Icons matching target design */
const MagnetNavEmblem: React.FC = () => (
  <svg viewBox="0 0 48 48" className="w-10 h-10 shrink-0 drop-shadow-[0_4px_8px_rgba(0,0,0,0.5)]">
    <defs>
      <linearGradient id="magBody" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#EF4444" />
        <stop offset="100%" stopColor="#991B1B" />
      </linearGradient>
      <linearGradient id="magTips" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#E2E8F0" />
        <stop offset="100%" stopColor="#64748B" />
      </linearGradient>
    </defs>
    <path
      d="M16 14 C8 22, 8 34, 16 40 C24 46, 36 42, 40 32 L33 27 C31 33, 24 36, 20 33 C16 30, 16 24, 21 19 Z"
      fill="url(#magBody)"
      stroke="rgba(255,255,255,0.25)"
      strokeWidth="1"
    />
    <path d="M16 14 L21 19 L26 14 L21 9 Z" fill="url(#magTips)" />
    <path d="M33 27 L40 32 L43 26 L36 21 Z" fill="url(#magTips)" />
    <polygon points="33,6 35,10 39,10 36,13 37,17 33,14 29,17 30,13 27,10 31,10" fill="#FBBF24" />
    <polygon points="42,13 43,16 46,16 44,18 45,21 42,19 39,21 40,18 38,16 41,16" fill="#FDE047" />
  </svg>
);

const LensNavEmblem: React.FC = () => (
  <svg viewBox="0 0 48 48" className="w-10 h-10 shrink-0 drop-shadow-[0_4px_8px_rgba(0,0,0,0.5)]">
    <defs>
      <radialGradient id="lensGlass" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#38BDF8" />
        <stop offset="55%" stopColor="#1D4ED8" />
        <stop offset="100%" stopColor="#1E1B4B" />
      </radialGradient>
    </defs>
    <ellipse cx="21" cy="22" rx="14" ry="11" fill="#CBD5E1" opacity="0.9" />
    <circle cx="21" cy="22" r="9.5" fill="url(#lensGlass)" stroke="#E2E8F0" strokeWidth="2" />
    <circle cx="18" cy="19" r="2.5" fill="#FFFFFF" opacity="0.8" />
    <path d="M30 29 L41 40" stroke="#818CF8" strokeWidth="5" strokeLinecap="round" />
    <path d="M29 28 L33 32" stroke="#E2E8F0" strokeWidth="5" strokeLinecap="round" />
  </svg>
);

const PaperPlaneNavEmblem: React.FC = () => (
  <svg viewBox="0 0 48 48" className="w-10 h-10 shrink-0 drop-shadow-[0_4px_8px_rgba(0,0,0,0.5)]">
    <defs>
      <linearGradient id="planeGold" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#FDE68A" />
        <stop offset="50%" stopColor="#F59E0B" />
        <stop offset="100%" stopColor="#B45309" />
      </linearGradient>
    </defs>
    <polygon points="6,24 40,10 28,40 21,29" fill="url(#planeGold)" />
    <polygon points="6,24 40,10 21,29" fill="#FEF3C7" opacity="0.7" />
    <circle cx="36" cy="12" r="6" fill="#EF4444" stroke="#121318" strokeWidth="1.5" />
    <circle cx="34" cy="33" r="5.5" fill="#6366F1" stroke="#121318" strokeWidth="1.5" />
  </svg>
);

const SmsCloudNavEmblem: React.FC = () => (
  <svg viewBox="0 0 48 48" className="w-10 h-10 shrink-0 drop-shadow-[0_4px_8px_rgba(0,0,0,0.5)]">
    <path
      d="M14 38 H36 C40 38 43 35 43 31 C43 27.5 40.5 24.5 37 24 C36 18 31 14 25 14 C19 14 14 18.5 13.5 24.5 C10 25.5 8 28.5 8 32 C8 35.5 10.5 38 14 38 Z"
      fill="#E2E8F0"
    />
    <rect x="13" y="8" width="22" height="15" rx="5" fill="#DC2626" stroke="#FCA5A5" strokeWidth="1" />
    <circle cx="19" cy="15.5" r="1.6" fill="#FFFFFF" />
    <circle cx="24" cy="15.5" r="1.6" fill="#FFFFFF" />
    <circle cx="29" cy="15.5" r="1.6" fill="#FFFFFF" />
  </svg>
);

const GearsNavEmblem: React.FC = () => (
  <svg viewBox="0 0 48 48" className="w-10 h-10 shrink-0 drop-shadow-[0_4px_8px_rgba(0,0,0,0.5)]">
    <circle cx="20" cy="22" r="10" fill="none" stroke="#CBD5E1" strokeWidth="5" strokeDasharray="5 3" />
    <circle cx="20" cy="22" r="6" fill="#64748B" stroke="#E2E8F0" strokeWidth="2" />
    <circle cx="34" cy="32" r="7" fill="none" stroke="#D97706" strokeWidth="4" strokeDasharray="4 2.5" />
    <circle cx="34" cy="32" r="4" fill="#78350F" stroke="#FBBF24" strokeWidth="1.5" />
  </svg>
);

const DatabaseNavEmblem: React.FC = () => (
  <svg viewBox="0 0 48 48" className="w-10 h-10 shrink-0 drop-shadow-[0_4px_8px_rgba(0,0,0,0.5)]">
    <rect x="8" y="10" width="18" height="26" rx="4" fill="#64748B" stroke="#CBD5E1" strokeWidth="1.5" />
    <ellipse cx="17" cy="14" rx="9" ry="3.5" fill="#E2E8F0" />
    <line x1="8" y1="21" x2="26" y2="21" stroke="#CBD5E1" strokeWidth="1.5" />
    <line x1="8" y1="28" x2="26" y2="28" stroke="#CBD5E1" strokeWidth="1.5" />
    <circle cx="12" cy="18" r="1.2" fill="#EF4444" />
    <circle cx="12" cy="25" r="1.2" fill="#22C55E" />
    <path d="M22 23 H39 L42 38 H19 Z" fill="#F59E0B" stroke="#FDE68A" strokeWidth="1" />
  </svg>
);

export default function App() {
  const [db, setDb] = useState<AppDatabase>(() => getInitialClientDb());
  const [activeTab, setActiveTab] = useState<ActiveTab>('leads');
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [verifyingPhone, setVerifyingPhone] = useState(false);
  const [showDataModal, setShowDataModal] = useState(false);
  const [pasteJsonText, setPasteJsonText] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const notify = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 4500);
  }, []);

  const handleRefreshDb = useCallback((newDb: AppDatabase) => {
    setDb(saveClientDbCache(newDb));
  }, []);

  useEffect(() => {
    let mounted = true;
    apiFetchState().then((remoteDb) => {
      if (mounted && remoteDb && Array.isArray(remoteDb.leads)) {
        setDb(remoteDb);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const handleQuickVerifyPhone = async () => {
    setVerifyingPhone(true);
    const res = await apiVerifySmsConnection(db);
    handleRefreshDb(res.db);
    notify(res.message, res.connected ? 'success' : 'error');
    setVerifyingPhone(false);
  };

  const handleExportFullJsonBackup = () => {
    const jsonString = serializeWorkspaceBackup(db);
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `avinash-studio-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify('Downloaded full Avinash Studio JSON backup!');
  };

  const handleExportLeadsJsonOnly = () => {
    const jsonString = JSON.stringify(db.leads, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `avinash-studio-leads-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify(`Exported ${db.leads.length} leads as JSON!`);
  };

  const handleExportLeadsCsv = () => {
    const headers = [
      'Conversion_Score',
      'Business_Name',
      'Contact_Person',
      'Niche',
      'Location',
      'Matched_Skill',
      'Status',
      'Phone',
      'Email',
      'Instagram',
      'Website',
      'Pain_Point',
    ];
    const escapeCsv = (val: string) => `"${String(val || '').replace(/"/g, '""')}"`;
    const rows = db.leads.map((l) =>
      [
        `${l.conversionScore}%`,
        l.businessName,
        l.contactPerson,
        l.niche,
        l.location,
        l.matchedSkill,
        l.status,
        l.phone,
        l.email,
        l.instaHandle,
        l.websiteUrl,
        l.painPoint,
      ]
        .map(escapeCsv)
        .join(',')
    );
    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `avinash-studio-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    notify(`Exported ${db.leads.length} leads as CSV!`);
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const res = await apiImportPortableData(db, text);
    if ('error' in res) {
      notify(res.error, 'error');
    } else {
      handleRefreshDb(res.db);
      setShowDataModal(false);
      notify(
        res.mode === 'full_backup'
          ? `Restored Full Workspace (${res.importedLeadsCount} leads)!`
          : `Imported ${res.importedLeadsCount} leads from ${file.name}!`
      );
    }
    e.target.value = '';
  };

  const handlePasteImport = async () => {
    if (!pasteJsonText.trim()) {
      notify('Paste JSON or CSV data first', 'error');
      return;
    }
    const res = await apiImportPortableData(db, pasteJsonText);
    if ('error' in res) {
      notify(res.error, 'error');
    } else {
      handleRefreshDb(res.db);
      setPasteJsonText('');
      setShowDataModal(false);
      notify(`Imported ${res.importedLeadsCount} real client leads!`);
    }
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

  const navItems: {
    id: ActiveTab;
    title: string;
    subtitle: string;
    emblem: React.FC;
  }[] = [
    {
      id: 'leads',
      title: 'Leads & High-Pitch',
      subtitle: 'Reales & Clients',
      emblem: MagnetNavEmblem,
    },
    {
      id: 'finder',
      title: 'Find Clients (AI)',
      subtitle: 'Groq & Gemini Search',
      emblem: LensNavEmblem,
    },
    {
      id: 'followups',
      title: 'Follow-Ups &\nBatch',
      subtitle: 'Bulk Send & Pipeline',
      emblem: PaperPlaneNavEmblem,
    },
    {
      id: 'sms_cloud',
      title: 'SIM SMS Cloud',
      subtitle: isPhoneConnected ? connectedPhone?.name || 'Connected' : 'Verify Phone',
      emblem: SmsCloudNavEmblem,
    },
    {
      id: 'settings',
      title: 'Settings &\nConnections',
      subtitle: 'Supabase, Email, AI',
      emblem: GearsNavEmblem,
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0D0E11] via-[#121318] to-[#16171B] text-[#F8FAFC] flex flex-col lg:flex-row selection:bg-red-500 selection:text-white">
      {/* LEFT DARK GLASS SIDEBAR */}
      <aside className="lg:w-[270px] shrink-0 bg-[#121317]/95 backdrop-blur-xl border-b lg:border-b-0 lg:border-r border-white/10 flex flex-col justify-between p-4 lg:px-5 lg:py-4 lg:sticky lg:top-0 lg:h-screen shadow-[10px_0_40px_rgba(0,0,0,0.5)]">
        <div className="space-y-4">
          {/* Avinash Studio Flame Emblem Header */}
          <div className="flex items-center gap-3.5 px-1">
            <div className="relative w-11 h-11 rounded-2xl overflow-hidden bg-gradient-to-br from-red-600/30 to-amber-500/20 border border-red-500/30 shadow-[0_0_20px_rgba(239,68,68,0.25)] flex items-center justify-center shrink-0">
              <img
                src="/assets/aistudio/as-logo-crop.png"
                alt="Avinash Studio Emblem"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
              <span className="font-extrabold text-lg bg-gradient-to-b from-amber-300 via-orange-500 to-red-600 bg-clip-text text-transparent sr-only">
                AS
              </span>
            </div>
            <div>
              <div className="text-lg font-extrabold tracking-tight text-white leading-[1.15]">
                Avinash
                <br />
                Studio
              </div>
            </div>
          </div>

          {/* Navigation Menu */}
          <div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-400 font-semibold px-2 mb-2 hidden lg:block">
              WORKSPACE
            </div>
            <nav
              aria-label="Workspace Navigation"
              className="flex lg:flex-col gap-1.5 overflow-x-auto pb-1 lg:pb-0"
            >
              {navItems.map((item) => {
                const Emblem = item.emblem;
                const isActive = activeTab === item.id;
                return (
                  <motion.button
                    key={item.id}
                    type="button"
                    whileHover={{ scale: 1.015, x: 2 }}
                    whileTap={{ scale: 0.985 }}
                    onClick={() => setActiveTab(item.id)}
                    className={`group relative flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-2xl text-left transition-all cursor-pointer shrink-0 lg:shrink ${
                      isActive
                        ? 'bg-gradient-to-r from-[#581625] via-[#8E1C32] to-[#C82333] text-white border border-red-400/35 shadow-[0_0_25px_rgba(239,68,68,0.25)]'
                        : 'text-zinc-300 hover:text-white hover:bg-white/5 border border-transparent hover:border-white/10'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-[13px] font-bold leading-snug whitespace-pre-line">
                        {item.title}
                      </div>
                      {isActive && (
                        <div className="text-[11px] text-red-100/85 mt-0.5 truncate">
                          {item.subtitle}
                        </div>
                      )}
                    </div>
                    <Emblem />
                  </motion.button>
                );
              })}

              {/* JSON / CSV Backup Sidebar Item matching reference */}
              <motion.button
                type="button"
                whileHover={{ scale: 1.015, x: 2 }}
                whileTap={{ scale: 0.985 }}
                onClick={() => setShowDataModal(true)}
                className="group relative flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-2xl text-left text-zinc-300 hover:text-white hover:bg-white/5 border border-transparent hover:border-white/10 transition-all cursor-pointer shrink-0 lg:shrink"
              >
                <div className="min-w-0">
                  <div className="text-[13px] font-bold leading-snug">
                    JSON / CSV
                    <br className="hidden lg:inline" /> Backup
                  </div>
                </div>
                <DatabaseNavEmblem />
              </motion.button>
            </nav>
          </div>
        </div>

        {/* Bottom Live Hardware & Gateway Status Box in Sidebar */}
        <div className="hidden lg:block space-y-3 pt-3 border-t border-white/10">
          <div className="p-3 rounded-2xl backdrop-blur-md bg-white/5 border border-white/10 space-y-2.5 shadow-[0_12px_30px_rgba(0,0,0,0.45)]">
            <button
              type="button"
              onClick={handleQuickVerifyPhone}
              className="w-full flex items-center justify-between text-xs text-left hover:opacity-90 cursor-pointer"
              title="Click to check live Android SIM connection"
            >
              <span className="flex items-center gap-2 text-zinc-300 font-medium">
                <Smartphone className="w-4 h-4 text-zinc-400" />
                <span>
                  SIM {db.smsConfig.simSlot}:{' '}
                  <strong className="text-emerald-400 font-semibold">
                    {verifyingPhone ? 'Checking...' : isPhoneConnected ? 'Online' : 'Standby'}
                  </strong>
                </span>
              </span>
              {/* Signal Bars */}
              <span className="flex items-end gap-0.5 h-3.5" aria-hidden="true">
                <span className="w-1 h-1.5 rounded-xs bg-emerald-400" />
                <span className="w-1 h-2.5 rounded-xs bg-emerald-400" />
                <span className="w-1 h-3.5 rounded-xs bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className="w-full flex items-center justify-between text-xs text-left hover:opacity-90 cursor-pointer"
              title="Click to configure Email Gateway"
            >
              <span className="flex items-center gap-2 text-zinc-300 font-medium">
                <Mail className="w-4 h-4 text-zinc-400" />
                <span>
                  Email:{' '}
                  <strong className="text-amber-400 font-semibold">
                    {isEmailConnected ? 'SMTP Live' : 'Set App Key'}
                  </strong>
                </span>
              </span>
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  isEmailConnected
                    ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]'
                    : 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.9)]'
                }`}
                aria-hidden="true"
              />
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className="w-full flex items-center justify-between text-xs text-left hover:opacity-90 cursor-pointer"
              title="Click to configure Supabase Cloud Database"
            >
              <span className="flex items-center gap-2 text-zinc-300 font-medium">
                <Database className="w-4 h-4 text-zinc-400" />
                <span>
                  Supabase:{' '}
                  <strong
                    className={`font-semibold ${
                      isSupabaseConnected ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    {isSupabaseConnected ? 'Connected' : 'Set Keys'}
                  </strong>
                </span>
              </span>
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  isSupabaseConnected
                    ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]'
                    : 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.9)]'
                }`}
                aria-hidden="true"
              />
            </button>
          </div>

          {/* Bottom Circular Glass Action Buttons */}
          <div className="flex items-center gap-3 px-1">
            <motion.button
              type="button"
              aria-label="Open Settings and Connections"
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.94 }}
              onClick={() => setActiveTab('settings')}
              className="w-9 h-9 rounded-full backdrop-blur-md bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-zinc-300 hover:text-white shadow-lg cursor-pointer"
            >
              <Settings className="w-4 h-4" />
            </motion.button>
            <motion.button
              type="button"
              aria-label="Open Outreach Activity and Follow-Ups"
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.94 }}
              onClick={() => setActiveTab('followups')}
              className="relative w-9 h-9 rounded-full backdrop-blur-md bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-zinc-300 hover:text-white shadow-lg cursor-pointer"
            >
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-2 w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.9)]" />
            </motion.button>
          </div>
        </div>
      </aside>

      {/* RIGHT MAIN WORKSPACE */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Glassmorphic Search & Status Bar */}
        <header className="sticky top-0 z-30 bg-[#0D0E11]/80 backdrop-blur-xl border-b border-white/10 px-4 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4">
          {/* Left: Global Search Input */}
          <div className="relative flex-1 min-w-[220px] max-w-xl">
            <Search className="w-4 h-4 text-zinc-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              aria-label="Search client leads"
              value={globalSearchQuery}
              onChange={(e) => {
                setGlobalSearchQuery(e.target.value);
                if (activeTab !== 'leads') setActiveTab('leads');
              }}
              placeholder="Search"
              className="w-full pl-11 pr-4 py-2.5 rounded-2xl backdrop-blur-md bg-white/5 border border-white/10 text-xs text-white placeholder:text-zinc-400 focus:outline-none focus:border-red-500/50 focus:shadow-[0_0_20px_rgba(239,68,68,0.15)] transition-all"
            />
          </div>

          {/* Right: Glowing Interactive Status Badges */}
          <div className="flex flex-wrap items-center gap-2.5 text-xs shrink-0">
            <motion.button
              type="button"
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setActiveTab('settings')}
              className={`inline-flex items-center gap-2 px-3.5 py-2.5 rounded-2xl backdrop-blur-md border text-zinc-100 cursor-pointer transition-all ${
                isSupabaseConnected
                  ? 'bg-emerald-500/10 hover:bg-emerald-500/15 border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.15)]'
                  : 'bg-white/5 hover:bg-white/10 border-white/15'
              }`}
              title="Click to configure Supabase Cloud PostgreSQL Database"
            >
              <Database
                className={`w-4 h-4 ${
                  isSupabaseConnected ? 'text-emerald-400' : 'text-red-400'
                }`}
              />
              <span className="font-medium">Supabase DB:</span>
              <strong
                className={`font-bold ${
                  isSupabaseConnected ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {isSupabaseConnected ? 'Connected' : 'Set Keys'}
              </strong>
            </motion.button>

            <motion.button
              type="button"
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setActiveTab('sms_cloud')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl backdrop-blur-md bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/30 text-zinc-100 shadow-[0_0_20px_rgba(16,185,129,0.15)] cursor-pointer transition-all"
              title="Click to inspect or test Android SIM SMS Cloud Gateway"
            >
              <Smartphone className="w-4 h-4 text-emerald-400" />
              <span className="font-medium">Phone Status:</span>
              <strong className="font-bold text-emerald-400">
                {isPhoneConnected ? 'Active' : 'Standby'}
              </strong>
            </motion.button>

            <motion.button
              type="button"
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setActiveTab('settings')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl backdrop-blur-md bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/30 text-zinc-100 shadow-[0_0_20px_rgba(245,158,11,0.15)] cursor-pointer transition-all"
              title="Click to configure Gmail 16-letter App Password"
            >
              <Mail className="w-4 h-4 text-amber-400" />
              <span className="font-medium">Email:</span>
              <strong className="font-bold text-amber-400">
                {isEmailConnected ? 'SMTP Live' : 'Set App Key'}
              </strong>
            </motion.button>
          </div>
        </header>

        {/* Toast Notification Banner */}
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="fixed bottom-5 right-5 z-50 max-w-md"
            >
              <div
                className={`px-4 py-3 rounded-2xl backdrop-blur-xl border shadow-[0_20px_50px_rgba(0,0,0,0.7)] flex items-center gap-2.5 text-xs font-semibold ${
                  toast.type === 'error'
                    ? 'bg-red-950/90 border-red-500/40 text-red-100 shadow-[0_0_20px_rgba(239,68,68,0.2)]'
                    : 'bg-[#16171B]/95 border-emerald-500/40 text-zinc-100 shadow-[0_0_20px_rgba(16,185,129,0.2)]'
                }`}
              >
                {toast.type === 'error' ? (
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                )}
                <span>{toast.message}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Content Canvas */}
        <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 lg:px-8 py-6">
          {activeTab === 'leads' && (
            <LeadListAndPitchView
              db={db}
              externalSearchQuery={globalSearchQuery}
              onExternalSearchChange={setGlobalSearchQuery}
              onRefreshDb={handleRefreshDb}
              onOpenFinder={() => setActiveTab('finder')}
              onOpenSmsCloud={() => setActiveTab('sms_cloud')}
              onOpenSettings={() => setActiveTab('settings')}
              onOpenDataModal={() => setShowDataModal(true)}
              notify={notify}
            />
          )}

          {activeTab === 'finder' && (
            <AiLeadFinderView
              db={db}
              onRefreshDb={handleRefreshDb}
              onJumpToLeads={() => setActiveTab('leads')}
              onOpenDataModal={() => setShowDataModal(true)}
              notify={notify}
            />
          )}

          {activeTab === 'followups' && (
            <FollowUpAndBulkView
              db={db}
              onRefreshDb={handleRefreshDb}
              notify={notify}
            />
          )}

          {activeTab === 'sms_cloud' && (
            <SmsCloudGatewayView
              db={db}
              onRefreshDb={handleRefreshDb}
              notify={notify}
            />
          )}

          {activeTab === 'settings' && (
            <GatewaySetupView
              db={db}
              onRefreshDb={handleRefreshDb}
              onOpenDataModal={() => setShowDataModal(true)}
              notify={notify}
            />
          )}
        </main>
      </div>

      {/* PORTABLE JSON / CSV IMPORT & EXPORT MODAL */}
      <AnimatePresence>
        {showDataModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 12 }}
              className="bento-card-elevated max-w-xl w-full p-6 rounded-3xl space-y-5 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-3.5">
                <div>
                  <h2 className="text-base font-bold text-white">
                    Avinash Studio · Portable JSON & CSV Data Hub
                  </h2>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Save or load your entire workspace and client list via JSON or CSV files — zero database setup required.
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Close Data Hub Modal"
                  onClick={() => setShowDataModal(false)}
                  className="p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* 1. Export Section */}
              <div className="space-y-2.5">
                <div className="text-xs font-bold text-zinc-200">
                  1. Export / Backup Your Data ({db.leads.length} Leads)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={handleExportFullJsonBackup}
                    className="crimson-btn flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-2xl text-xs font-bold cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Full Backup (.json)
                  </button>
                  <button
                    type="button"
                    onClick={handleExportLeadsJsonOnly}
                    className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-2xl backdrop-blur-md bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-100 text-xs font-semibold cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-red-400" />
                    Leads Only (.json)
                  </button>
                  <button
                    type="button"
                    onClick={handleExportLeadsCsv}
                    className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-2xl backdrop-blur-md bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-100 text-xs font-semibold cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-red-400" />
                    Excel / Sheets (.csv)
                  </button>
                </div>
              </div>

              {/* 2. Upload File Section */}
              <div className="space-y-2.5 pt-3 border-t border-white/10">
                <div className="text-xs font-bold text-zinc-200">
                  2. Import from File (.json Backup, .json Leads, or .csv)
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,.csv,.txt"
                  onChange={handleFileImport}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-4 px-4 rounded-2xl border-2 border-dashed border-red-500/40 hover:border-red-400 bg-red-500/10 text-xs font-bold text-red-300 flex items-center justify-center gap-2 cursor-pointer transition-all"
                >
                  <Upload className="w-4 h-4" />
                  Click to Upload .JSON or .CSV File from Device
                </button>
              </div>

              {/* 3. Direct Paste JSON / CSV Section */}
              <div className="space-y-2.5 pt-3 border-t border-white/10">
                <div className="text-xs font-bold text-zinc-200">
                  3. Or Paste Raw JSON / CSV Text Directly
                </div>
                <textarea
                  rows={4}
                  value={pasteJsonText}
                  onChange={(e) => setPasteJsonText(e.target.value)}
                  placeholder='Paste JSON array [{"businessName": "...", "phone": "+91..."}] or CSV rows here...'
                  className="w-full rounded-2xl bg-black/40 border border-white/10 p-3 text-xs font-mono text-zinc-100 focus:outline-none focus:border-red-500/50"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowDataModal(false)}
                    className="px-4 py-2 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-zinc-300 cursor-pointer"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={handlePasteImport}
                    className="crimson-btn px-4 py-2 rounded-2xl text-xs font-bold cursor-pointer"
                  >
                    Import Pasted Data
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
