import {
  AiEngineProvider,
  AppDatabase,
  ClientLead,
  CreatorSkill,
  EmailGatewayConfig,
  PitchTone,
  SmsCloudConfig,
  SupabaseDatabaseConfig,
} from '../types/platform';
import {
  createInitialSeedDatabase,
  DEFAULT_SUPABASE_ANON_KEY,
  DEFAULT_SUPABASE_SERVICE_ROLE_KEY,
  DEFAULT_SUPABASE_URL,
} from './seedData';
import {
  calculateLeadConversionScore,
  cleanContactField,
  formatInstaHandle,
  generateLeadPitches,
  parsePortableImportData,
  parseRawAiLeadsInput,
} from './engine';
import {
  clearAllLeadsInSupabase,
  deleteLeadFromSupabase,
  loadStateFromSupabase,
  normalizeSupabaseUrl,
  persistStateToSupabase,
  verifyAndSyncSupabase,
} from './supabaseDb';

const STORAGE_KEY = 'avinash_studio_v7_supabase_cache';

function getBrowserEnv(key: string): string {
  try {
    const meta = (import.meta as any)?.env;
    if (meta && typeof meta[key] === 'string') {
      return meta[key].trim();
    }
  } catch {
    // ignore
  }
  return '';
}

export function getSupabaseHeaders(
  db?: AppDatabase,
  overrideConfig?: Partial<SupabaseDatabaseConfig>
): Record<string, string> {
  const key = (
    overrideConfig?.serviceRoleKey ||
    overrideConfig?.anonKey ||
    db?.supabaseConfig?.serviceRoleKey ||
    db?.supabaseConfig?.anonKey ||
    getBrowserEnv('VITE_SUPABASE_ANON_KEY') ||
    DEFAULT_SUPABASE_SERVICE_ROLE_KEY ||
    DEFAULT_SUPABASE_ANON_KEY ||
    ''
  ).trim();

  const rawUrl = (
    overrideConfig?.url ||
    db?.supabaseConfig?.url ||
    getBrowserEnv('VITE_SUPABASE_URL') ||
    DEFAULT_SUPABASE_URL ||
    ''
  ).trim();

  const url = normalizeSupabaseUrl(rawUrl, key);

  const headers: Record<string, string> = {};
  if (url && key) {
    headers['x-supabase-url'] = url;
    headers['x-supabase-key'] = key;
  }
  return headers;
}

export function getInitialClientDb(): AppDatabase {
  const seed = createInitialSeedDatabase();
  const envUrl = getBrowserEnv('VITE_SUPABASE_URL');
  const envKey = getBrowserEnv('VITE_SUPABASE_ANON_KEY');
  if (envUrl && envKey) {
    seed.supabaseConfig.url = normalizeSupabaseUrl(envUrl, envKey);
    seed.supabaseConfig.anonKey = envKey;
    seed.supabaseConfig.enabled = true;
  }

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AppDatabase;
        if (
          parsed &&
          Array.isArray(parsed.leads) &&
          parsed.smsConfig &&
          typeof parsed.smsConfig.serverAddress === 'string' &&
          parsed.personaConfig &&
          parsed.aiConfig
        ) {
          parsed.leads = parsed.leads
            .filter(
              (l) =>
                !String(l.id).startsWith('seed-lead-') &&
                !String(l.id).startsWith('lead-fallback-') &&
                l.source !== ('Verified Directory (Zero-Downtime Engine)' as any)
            )
            .map((l) => ({
              ...l,
              email: cleanContactField(l.email),
              phone: cleanContactField(l.phone),
              instaHandle: formatInstaHandle(l.instaHandle),
            }));

          if (parsed.smsConfig.deviceId === 'android-sim1-primary') {
            parsed.smsConfig.deviceId = 'DwLpHi0cv9sshAQF2sOx6';
          }
          if (!parsed.aiConfig.groqApiKey && parsed.aiConfig.selectedEngine === 'groq') {
            parsed.aiConfig.selectedEngine = 'gemini';
          }
          if (
            parsed.aiConfig.geminiApiKey &&
            parsed.aiConfig.geminiApiKey.startsWith('AQ.Ab8RN6')
          ) {
            parsed.aiConfig.geminiApiKey = '';
          }
          if (!parsed.supabaseConfig || !parsed.supabaseConfig.url) {
            parsed.supabaseConfig = seed.supabaseConfig;
          } else {
            parsed.supabaseConfig.url = normalizeSupabaseUrl(
              parsed.supabaseConfig.url,
              parsed.supabaseConfig.serviceRoleKey || parsed.supabaseConfig.anonKey
            );
            if (!parsed.supabaseConfig.anonKey) {
              parsed.supabaseConfig.anonKey = DEFAULT_SUPABASE_ANON_KEY;
            }
            if (!parsed.supabaseConfig.serviceRoleKey) {
              parsed.supabaseConfig.serviceRoleKey = DEFAULT_SUPABASE_SERVICE_ROLE_KEY;
            }
          }
          return parsed;
        }
      }
    }
  } catch {
    // ignore storage errors
  }

  saveClientDbCache(seed);
  return seed;
}

export function saveClientDbCache(db: AppDatabase): AppDatabase {
  const sorted: AppDatabase = {
    ...db,
    leads: [...(db.leads || [])]
      .filter(
        (l) =>
          !String(l.id).startsWith('seed-lead-') &&
          !String(l.id).startsWith('lead-fallback-') &&
          l.source !== ('Verified Directory (Zero-Downtime Engine)' as any)
      )
      .map((l) => ({
        ...l,
        email: cleanContactField(l.email),
        phone: cleanContactField(l.phone),
        instaHandle: formatInstaHandle(l.instaHandle),
      }))
      .sort((a, b) => b.conversionScore - a.conversionScore),
  };
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sorted));
    }
  } catch {
    // ignore storage errors
  }
  return sorted;
}

function logActivityLocal(
  db: AppDatabase,
  entry: {
    channel:
      | 'SMS Cloud'
      | 'Email'
      | 'Instagram DM'
      | 'Webhook'
      | 'AI Discovery'
      | 'Backup / JSON'
      | 'Supabase DB';
    title: string;
    detail: string;
    status: 'Success' | 'Queued' | 'Warning';
  }
) {
  const logs = Array.isArray(db.activityLogs) ? [...db.activityLogs] : [];
  logs.unshift({
    id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString().slice(0, 16).replace('T', ' '),
    ...entry,
  });
  db.activityLogs = logs.slice(0, 50);
}

export async function apiFetchState(): Promise<AppDatabase> {
  const cached = getInitialClientDb();
  const supaHeaders = getSupabaseHeaders(cached);

  try {
    const res = await fetch('/api/state', {
      headers: { Accept: 'application/json', ...supaHeaders },
    });
    if (res.ok) {
      const data = await res.json();
      const serverDb = (data.db || data) as AppDatabase;
      if (serverDb && Array.isArray(serverDb.leads)) {
        if (
          cached.supabaseConfig?.url &&
          cached.supabaseConfig?.anonKey &&
          !serverDb.supabaseConfig?.url
        ) {
          serverDb.supabaseConfig = cached.supabaseConfig;
        }
        // If server database is empty on a cold serverless boot, sync cached browser data
        if (serverDb.leads.length === 0 && cached.leads.length > 0) {
          serverDb.leads = cached.leads;
          if (cached.activityLogs?.length) serverDb.activityLogs = cached.activityLogs;
          if (cached.smsConfig?.username) serverDb.smsConfig = cached.smsConfig;
          if (cached.emailConfig?.senderEmail) serverDb.emailConfig = cached.emailConfig;
          if (cached.aiConfig?.geminiApiKey) serverDb.aiConfig.geminiApiKey = cached.aiConfig.geminiApiKey;
          if (cached.aiConfig?.groqApiKey) serverDb.aiConfig.groqApiKey = cached.aiConfig.groqApiKey;
          if (cached.suppressionList?.length) serverDb.suppressionList = cached.suppressionList;
          fetch('/api/config', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...getSupabaseHeaders(serverDb) },
            body: JSON.stringify(serverDb),
          }).catch(() => {});
        }
        return saveClientDbCache(serverDb);
      }
    }
  } catch {
    // If API server is unreachable, try loading directly from Supabase if configured
    if (cached.supabaseConfig?.url && cached.supabaseConfig?.anonKey) {
      const remote = await loadStateFromSupabase(cached, {
        url: cached.supabaseConfig.url,
        key: cached.supabaseConfig.serviceRoleKey || cached.supabaseConfig.anonKey,
      });
      if (remote) return saveClientDbCache(remote);
    }
  }
  return cached;
}

export async function apiVerifySupabaseConnection(
  currentDb: AppDatabase,
  supabaseConfig?: Partial<SupabaseDatabaseConfig>
): Promise<{
  connected: boolean;
  schemaMissing?: boolean;
  message: string;
  db: AppDatabase;
}> {
  const candidateKey = (
    supabaseConfig?.serviceRoleKey ??
    supabaseConfig?.anonKey ??
    currentDb.supabaseConfig?.serviceRoleKey ??
    currentDb.supabaseConfig?.anonKey ??
    DEFAULT_SUPABASE_SERVICE_ROLE_KEY
  ).trim();

  const candidateUrl = normalizeSupabaseUrl(
    supabaseConfig?.url ?? currentDb.supabaseConfig?.url ?? DEFAULT_SUPABASE_URL,
    candidateKey
  );

  const mergedConfig: SupabaseDatabaseConfig = {
    ...currentDb.supabaseConfig,
    ...supabaseConfig,
    url: candidateUrl,
    anonKey: (supabaseConfig?.anonKey ?? currentDb.supabaseConfig?.anonKey ?? candidateKey).trim(),
    serviceRoleKey:
      (supabaseConfig?.serviceRoleKey ?? currentDb.supabaseConfig?.serviceRoleKey ?? '').trim() ||
      undefined,
    enabled: true,
  };

  try {
    const res = await fetch('/api/verify/supabase', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getSupabaseHeaders(currentDb, mergedConfig),
      },
      body: JSON.stringify({ supabaseConfig: mergedConfig }),
    });
    const data = await res.json();
    const updatedDb = data?.db ? saveClientDbCache(data.db) : currentDb;
    if (res.ok && data.connected) {
      return {
        connected: true,
        message: data.message || 'Supabase PostgreSQL Connected & Synced!',
        db: updatedDb,
      };
    }
    return {
      connected: false,
      schemaMissing: Boolean(data?.schemaMissing || data?.status === 'tables_missing'),
      message: data?.error || data?.message || 'Supabase connection failed.',
      db: updatedDb,
    };
  } catch {
    const directRes = await verifyAndSyncSupabase(currentDb, {
      url: mergedConfig.url,
      anonKey: mergedConfig.anonKey,
      serviceRoleKey: mergedConfig.serviceRoleKey,
    });
    return {
      connected: directRes.connected,
      schemaMissing: directRes.schemaMissing || directRes.status === 'tables_missing',
      message: directRes.message,
      db: saveClientDbCache(directRes.db),
    };
  }
}

export async function apiVerifySmsConnection(
  currentDb: AppDatabase,
  smsConfig?: SmsCloudConfig
): Promise<{
  connected: boolean;
  message: string;
  db: AppDatabase;
}> {
  try {
    const res = await fetch('/api/verify/sms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getSupabaseHeaders(currentDb),
      },
      body: JSON.stringify({ smsConfig: smsConfig || currentDb.smsConfig }),
    });
    const data = await res.json();
    const updatedDb = data?.db ? saveClientDbCache(data.db) : currentDb;
    if (res.ok && data.connected) {
      return {
        connected: true,
        message: data.message || 'Android Phone Connected!',
        db: updatedDb,
      };
    }
    return {
      connected: false,
      message: data?.error || 'Could not verify Android phone connection.',
      db: updatedDb,
    };
  } catch {
    return {
      connected: false,
      message: 'Could not reach server to verify SMS Cloud connection.',
      db: currentDb,
    };
  }
}

export async function apiVerifyEmailConnection(
  currentDb: AppDatabase,
  emailConfig?: EmailGatewayConfig
): Promise<{
  connected: boolean;
  message: string;
  db: AppDatabase;
}> {
  try {
    const res = await fetch('/api/verify/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getSupabaseHeaders(currentDb),
      },
      body: JSON.stringify({ emailConfig: emailConfig || currentDb.emailConfig }),
    });
    const data = await res.json();
    const updatedDb = data?.db ? saveClientDbCache(data.db) : currentDb;
    if (res.ok && data.connected) {
      return {
        connected: true,
        message: data.message || 'Email Gateway Verified & Connected!',
        db: updatedDb,
      };
    }
    return {
      connected: false,
      message: data?.error || 'Email SMTP Verification Failed.',
      db: updatedDb,
    };
  } catch {
    return {
      connected: false,
      message: 'Could not reach server to verify Email SMTP.',
      db: currentDb,
    };
  }
}

export async function apiSaveConfig(
  currentDb: AppDatabase,
  updates: Partial<AppDatabase>
): Promise<AppDatabase> {
  try {
    const res = await fetch('/api/config', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getSupabaseHeaders(currentDb, updates.supabaseConfig),
      },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.db) return saveClientDbCache(data.db);
    }
  } catch {
    // Fallback to local update
  }

  const nextDb: AppDatabase = {
    ...currentDb,
    supabaseConfig: updates.supabaseConfig
      ? { ...currentDb.supabaseConfig, ...updates.supabaseConfig }
      : currentDb.supabaseConfig,
    smsConfig: updates.smsConfig
      ? { ...currentDb.smsConfig, ...updates.smsConfig }
      : currentDb.smsConfig,
    emailConfig: updates.emailConfig
      ? { ...currentDb.emailConfig, ...updates.emailConfig }
      : currentDb.emailConfig,
    instaConfig: updates.instaConfig
      ? { ...currentDb.instaConfig, ...updates.instaConfig }
      : currentDb.instaConfig,
    personaConfig: updates.personaConfig
      ? { ...currentDb.personaConfig, ...updates.personaConfig }
      : currentDb.personaConfig,
    webhookConfig: updates.webhookConfig
      ? { ...currentDb.webhookConfig, ...updates.webhookConfig }
      : currentDb.webhookConfig,
    aiConfig: updates.aiConfig
      ? { ...currentDb.aiConfig, ...updates.aiConfig }
      : currentDb.aiConfig,
  };
  logActivityLocal(nextDb, {
    channel: 'Webhook',
    title: 'Saved Avinash Studio Connections & Rules',
    detail: `AI: ${nextDb.aiConfig.selectedEngine.toUpperCase()} · SMS Cloud: ${nextDb.smsConfig.serverAddress} (SIM ${nextDb.smsConfig.simSlot})`,
    status: 'Success',
  });
  await persistStateToSupabase(nextDb, {
    url: nextDb.supabaseConfig.url,
    key: nextDb.supabaseConfig.serviceRoleKey || nextDb.supabaseConfig.anonKey,
  }).catch(() => {});
  return saveClientDbCache(nextDb);
}

export async function apiImportPortableData(
  currentDb: AppDatabase,
  rawContent: string
): Promise<
  | {
      db: AppDatabase;
      mode: 'full_backup' | 'leads_merge';
      importedLeadsCount: number;
    }
  | { error: string }
> {
  try {
    const res = await fetch('/api/backup/import', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getSupabaseHeaders(currentDb),
      },
      body: JSON.stringify({ rawContent }),
    });
    const data = await res.json();
    if (res.ok && data.db) {
      return {
        db: saveClientDbCache(data.db),
        mode: data.mode || 'leads_merge',
        importedLeadsCount: data.importedLeadsCount || 0,
      };
    }
    if (data?.error) {
      return { error: data.error };
    }
  } catch {
    // Local fallback
  }

  const localResult = parsePortableImportData(rawContent, currentDb);
  if ('error' in localResult) {
    return { error: localResult.error };
  }

  logActivityLocal(localResult.nextDb, {
    channel: 'Backup / JSON',
    title:
      localResult.mode === 'full_backup'
        ? `Restored Full Workspace JSON (${localResult.importedLeadsCount} Leads)`
        : `Imported ${localResult.importedLeadsCount} Leads from File`,
    detail: 'Saved to portable workspace',
    status: 'Success',
  });

  await persistStateToSupabase(localResult.nextDb, {
    url: localResult.nextDb.supabaseConfig.url,
    key:
      localResult.nextDb.supabaseConfig.serviceRoleKey ||
      localResult.nextDb.supabaseConfig.anonKey,
  }).catch(() => {});

  return {
    db: saveClientDbCache(localResult.nextDb),
    mode: localResult.mode,
    importedLeadsCount: localResult.importedLeadsCount,
  };
}

export async function apiDispatchSms(
  currentDb: AppDatabase,
  payload: { leadId?: string; phone: string; message: string }
): Promise<{ ok: boolean; db: AppDatabase; gatewayNote: string }> {
  try {
    const res = await fetch('/api/dispatch/sms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getSupabaseHeaders(currentDb),
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    const updatedDb = data?.db ? saveClientDbCache(data.db) : currentDb;

    if (res.ok && data.gatewayDispatched) {
      return {
        ok: true,
        db: updatedDb,
        gatewayNote:
          data.gatewayNote ||
          `LIVE SMS sent to ${payload.phone} via SIM ${updatedDb.smsConfig.simSlot}!`,
      };
    }

    return {
      ok: false,
      db: updatedDb,
      gatewayNote:
        data?.error ||
        data?.gatewayNote ||
        'SMS dispatch failed — check your Android SMS Cloud Server credentials.',
    };
  } catch {
    return {
      ok: false,
      db: currentDb,
      gatewayNote: 'Network error while dispatching SMS via server.',
    };
  }
}

export async function apiDispatchEmail(
  currentDb: AppDatabase,
  payload: { leadId?: string; toEmail: string; subject: string; body: string }
): Promise<{ ok: boolean; db: AppDatabase; statusNote: string }> {
  try {
    const res = await fetch('/api/dispatch/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getSupabaseHeaders(currentDb),
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    const updatedDb = data?.db ? saveClientDbCache(data.db) : currentDb;

    if (res.ok && data.smtpSent) {
      return {
        ok: true,
        db: updatedDb,
        statusNote: data.statusNote || `LIVE Email sent to ${payload.toEmail}!`,
      };
    }

    return {
      ok: false,
      db: updatedDb,
      statusNote:
        data?.error ||
        data?.statusNote ||
        'Email not sent via SMTP — set your 16-letter Google App Password in Settings or click "Open Gmail Web Compose".',
    };
  } catch {
    return {
      ok: false,
      db: currentDb,
      statusNote: 'Network error while attempting to send email.',
    };
  }
}

export async function apiDispatchInsta(
  currentDb: AppDatabase,
  payload: { leadId?: string; instaHandle: string; message: string }
): Promise<{ db: AppDatabase }> {
  try {
    const res = await fetch('/api/dispatch/insta', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getSupabaseHeaders(currentDb),
      },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.db) return { db: saveClientDbCache(data.db) };
    }
  } catch {
    // Local fallback
  }

  const nextDb: AppDatabase = {
    ...currentDb,
    leads: currentDb.leads.map((l) => {
      if (l.id !== payload.leadId) return l;
      return {
        ...l,
        lastContactedAt: new Date().toISOString().slice(0, 10),
        status:
          l.status === 'New — High Priority' || l.status === 'Ready for Review'
            ? 'Contacted'
            : l.status,
        outreachHistory: [
          {
            id: `out-${Date.now()}`,
            channel: 'Instagram DM',
            sentAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
            preview: payload.message.slice(0, 90),
            status: 'Opened App / Copied',
          },
          ...l.outreachHistory,
        ],
      };
    }),
  };

  logActivityLocal(nextDb, {
    channel: 'Instagram DM',
    title: `Avinash Studio DM Copied for ${payload.instaHandle}`,
    detail: 'Ready to paste in ig.me direct chat',
    status: 'Success',
  });

  await persistStateToSupabase(nextDb, {
    url: nextDb.supabaseConfig.url,
    key: nextDb.supabaseConfig.serviceRoleKey || nextDb.supabaseConfig.anonKey,
  }).catch(() => {});
  return { db: saveClientDbCache(nextDb) };
}

export async function apiDiscoverLeads(
  currentDb: AppDatabase,
  params: {
    skill: CreatorSkill;
    niche: string;
    location: string;
    count?: number;
    tone?: PitchTone;
    geminiApiKey?: string;
    groqApiKey?: string;
    groqModel?: string;
    selectedEngine?: AiEngineProvider;
  }
): Promise<
  | {
      db: AppDatabase;
      discoveredCount: number;
      usedProvider: string;
      fellBackToGroq?: boolean;
      groundingSources?: { uri: string; title: string }[];
      quotaNotice?: string;
      geminiQuotaExhausted?: boolean;
    }
  | {
      error: string;
      needsGroqKey?: boolean;
      geminiError?: string;
      geminiQuotaExhausted?: boolean;
    }
> {
  let serverError = '';
  let serverNeedsGroqKey = false;
  let serverGeminiError = '';
  let serverQuotaExhausted = false;
  try {
    const res = await fetch('/api/leads/ai-discover', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getSupabaseHeaders(currentDb),
      },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (res.ok && data.db) {
      return {
        db: saveClientDbCache(data.db),
        discoveredCount: data.discoveredCount || 0,
        usedProvider: data.usedProvider || 'Google Gemini + Live Google Search',
        fellBackToGroq: Boolean(data.fellBackToGroq),
        groundingSources: Array.isArray(data.groundingSources) ? data.groundingSources : [],
        quotaNotice: data.quotaNotice,
        geminiQuotaExhausted: Boolean(data.geminiQuotaExhausted),
      };
    }
    if (data?.error) {
      serverError = data.error;
      serverNeedsGroqKey = Boolean(data.needsGroqKey);
      serverGeminiError = data.geminiError || '';
      serverQuotaExhausted = Boolean(data.geminiQuotaExhausted);
    }
  } catch {
    // Try direct client-side Groq API if key is present
  }

  const activeGroqKey = (
    params.groqApiKey ??
    currentDb.aiConfig.groqApiKey ??
    ''
  ).trim();
  const activeGroqModel =
    params.groqModel || currentDb.aiConfig.groqModel || 'llama-3.3-70b-versatile';

  if (activeGroqKey) {
    try {
      const promptText = `Find ${params.count || 6} real, genuine businesses in the "${params.niche}" niche in "${params.location}" that need "${params.skill}" from Avinash Studio.
Return ONLY a valid JSON array where each object has: businessName, contactPerson, niche, location, matchedSkill, painPoint, email, phone, instaHandle, websiteUrl, estimatedDealValue. Use empty string "" if a contact field is not publicly listed.`;

      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${activeGroqKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: activeGroqModel,
          messages: [
            {
              role: 'system',
              content:
                'You are an elite B2B Lead Research Engine for Avinash Studio. Output ONLY a valid JSON array of real businesses.',
            },
            { role: 'user', content: promptText },
          ],
          temperature: 0.3,
        }),
      });

      if (groqRes.ok) {
        const json = await groqRes.json();
        const content = json?.choices?.[0]?.message?.content || '';
        const discovered = parseRawAiLeadsInput(content, {
          defaultSkill: params.skill,
          creatorName: currentDb.personaConfig.signatureName,
          creatorPortfolioUrl: currentDb.personaConfig.portfolioUrl,
          tone: params.tone || currentDb.personaConfig.defaultTone,
          customInstructions: currentDb.personaConfig.customInstructions,
          pricingNote: currentDb.personaConfig.pricingNote,
          sourceLabel: 'Groq AI Engine',
        });

        if (discovered.length > 0) {
          const nextDb: AppDatabase = {
            ...currentDb,
            aiConfig: {
              ...currentDb.aiConfig,
              groqApiKey: activeGroqKey,
              groqModel: activeGroqModel,
            },
            leads: [...discovered, ...currentDb.leads],
          };
          logActivityLocal(nextDb, {
            channel: 'AI Discovery',
            title: `Discovered ${discovered.length} Real Clients via Groq (${activeGroqModel})`,
            detail: `Niche: ${params.niche} (${params.location})`,
            status: 'Success',
          });
          await persistStateToSupabase(nextDb, {
            url: nextDb.supabaseConfig.url,
            key: nextDb.supabaseConfig.serviceRoleKey || nextDb.supabaseConfig.anonKey,
          }).catch(() => {});
          return {
            db: saveClientDbCache(nextDb),
            discoveredCount: discovered.length,
            usedProvider: `Groq Cloud (${activeGroqModel})`,
          };
        }
      }
    } catch {
      // Fall through to honest error message
    }
  }

  return {
    needsGroqKey: serverNeedsGroqKey || !activeGroqKey,
    geminiError: serverGeminiError || undefined,
    geminiQuotaExhausted:
      serverQuotaExhausted ||
      Boolean(
        serverGeminiError.includes('429') ||
        serverGeminiError.includes('RESOURCE_EXHAUSTED') ||
        serverGeminiError.includes('quota')
      ),
    error:
      serverError ||
      'Live AI Discovery requires a valid Google Gemini API Key (AIzaSy...) or a free Groq API Key (gsk_...). Add your key above or paste leads from ChatGPT/Perplexity.',
  };
}

export async function apiImportRawLeads(
  currentDb: AppDatabase,
  params: { rawText: string; defaultSkill: CreatorSkill; tone: PitchTone }
): Promise<{ db: AppDatabase; importedCount: number } | { error: string }> {
  try {
    const res = await fetch('/api/leads/import-raw', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getSupabaseHeaders(currentDb),
      },
      body: JSON.stringify({
        ...params,
        sourceLabel: 'Pasted from AI Agent',
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.db) {
        return {
          db: saveClientDbCache(data.db),
          importedCount: data.importedCount,
        };
      }
    }
  } catch {
    // Local fallback
  }

  const parsedLeads = parseRawAiLeadsInput(params.rawText, {
    defaultSkill: params.defaultSkill,
    creatorName: currentDb.personaConfig.signatureName,
    creatorPortfolioUrl: currentDb.personaConfig.portfolioUrl,
    tone: params.tone,
    customInstructions: currentDb.personaConfig.customInstructions,
    pricingNote: currentDb.personaConfig.pricingNote,
    sourceLabel: 'Pasted from AI Agent',
  });

  if (parsedLeads.length === 0) {
    return {
      error:
        'Could not detect any valid leads. Make sure the text includes JSON, a table, or lines with email / phone / @instagram.',
    };
  }

  const nextDb: AppDatabase = {
    ...currentDb,
    leads: [...parsedLeads, ...currentDb.leads],
  };

  logActivityLocal(nextDb, {
    channel: 'AI Discovery',
    title: `Imported ${parsedLeads.length} Genuine Leads`,
    detail: `Top lead: ${parsedLeads[0].businessName} (${parsedLeads[0].conversionScore}% Match)`,
    status: 'Success',
  });

  await persistStateToSupabase(nextDb, {
    url: nextDb.supabaseConfig.url,
    key: nextDb.supabaseConfig.serviceRoleKey || nextDb.supabaseConfig.anonKey,
  }).catch(() => {});

  return {
    db: saveClientDbCache(nextDb),
    importedCount: parsedLeads.length,
  };
}

export async function apiCreateManualLead(
  currentDb: AppDatabase,
  payload: {
    businessName: string;
    contactPerson: string;
    niche: string;
    location: string;
    matchedSkill: CreatorSkill;
    painPoint: string;
    email: string;
    phone: string;
    instaHandle: string;
    websiteUrl: string;
    estimatedDealValue?: string;
  }
): Promise<{ db: AppDatabase; lead: ClientLead }> {
  try {
    const res = await fetch('/api/leads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getSupabaseHeaders(currentDb),
      },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.db && data.lead) {
        return { db: saveClientDbCache(data.db), lead: data.lead };
      }
    }
  } catch {
    // Local fallback
  }

  const cleanInsta = formatInstaHandle(payload.instaHandle || '');
  const cleanEmail = cleanContactField(payload.email || '');
  const cleanPhone = cleanContactField(payload.phone || '');
  const cleanWebsite = cleanContactField(payload.websiteUrl || '') || 'No website';
  const cleanPain =
    payload.painPoint?.trim() ||
    `High conversion fit for ${payload.matchedSkill} by Avinash Studio`;

  const { score, reasons } = calculateLeadConversionScore({
    businessName: payload.businessName.trim(),
    niche: (payload.niche || 'Business').trim(),
    matchedSkill: payload.matchedSkill,
    painPoint: cleanPain,
    email: cleanEmail,
    phone: cleanPhone,
    instaHandle: cleanInsta,
    websiteUrl: cleanWebsite,
  });

  const pitches = generateLeadPitches({
    businessName: payload.businessName.trim(),
    contactPerson: (payload.contactPerson || '').trim(),
    niche: (payload.niche || 'Business').trim(),
    location: (payload.location || '').trim(),
    matchedSkill: payload.matchedSkill,
    painPoint: cleanPain,
    instaHandle: cleanInsta,
    creatorName: currentDb.personaConfig.signatureName,
    creatorPortfolioUrl: currentDb.personaConfig.portfolioUrl,
    tone: currentDb.personaConfig.defaultTone,
    customInstructions: currentDb.personaConfig.customInstructions,
    pricingNote: currentDb.personaConfig.pricingNote,
  });

  const newLead: ClientLead = {
    id: `lead-${Date.now()}`,
    businessName: payload.businessName.trim(),
    contactPerson: (payload.contactPerson || `${payload.businessName} Owner`).trim(),
    niche: (payload.niche || 'Business').trim(),
    location: (payload.location || 'India').trim(),
    matchedSkill: payload.matchedSkill,
    painPoint: cleanPain,
    email: cleanEmail,
    phone: cleanPhone,
    instaHandle: cleanInsta,
    websiteUrl: cleanWebsite,
    estimatedDealValue: payload.estimatedDealValue?.trim() || undefined,
    conversionScore: score,
    conversionReasons: reasons,
    status: 'New — High Priority',
    lastContactedAt: null,
    nextFollowUpDate: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
    pitches,
    outreachHistory: [],
    source: 'Manual Entry',
    createdAt: new Date().toISOString().slice(0, 10),
  };

  const nextDb: AppDatabase = {
    ...currentDb,
    leads: [newLead, ...currentDb.leads],
  };

  await persistStateToSupabase(nextDb, {
    url: nextDb.supabaseConfig.url,
    key: nextDb.supabaseConfig.serviceRoleKey || nextDb.supabaseConfig.anonKey,
  }).catch(() => {});
  return { db: saveClientDbCache(nextDb), lead: newLead };
}

export async function apiUpdateLead(
  currentDb: AppDatabase,
  leadId: string,
  updates: Partial<ClientLead>
): Promise<AppDatabase> {
  try {
    const res = await fetch(`/api/leads/${leadId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...getSupabaseHeaders(currentDb),
      },
      body: JSON.stringify(updates),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.db) return saveClientDbCache(data.db);
    }
  } catch {
    // Local fallback
  }

  const nextDb: AppDatabase = {
    ...currentDb,
    leads: currentDb.leads.map((l) =>
      l.id === leadId
        ? {
            ...l,
            ...updates,
            pitches: updates.pitches ? { ...l.pitches, ...updates.pitches } : l.pitches,
          }
        : l
    ),
  };
  await persistStateToSupabase(nextDb, {
    url: nextDb.supabaseConfig.url,
    key: nextDb.supabaseConfig.serviceRoleKey || nextDb.supabaseConfig.anonKey,
  }).catch(() => {});
  return saveClientDbCache(nextDb);
}

export async function apiRegeneratePitch(
  currentDb: AppDatabase,
  leadId: string,
  tone: PitchTone,
  useAiRewrite = false
): Promise<{ db: AppDatabase; usedAi: boolean }> {
  try {
    const res = await fetch(`/api/leads/${leadId}/regenerate-pitch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getSupabaseHeaders(currentDb),
      },
      body: JSON.stringify({ tone, useAiRewrite }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.db) {
        return {
          db: saveClientDbCache(data.db),
          usedAi: Boolean(data.usedAi),
        };
      }
    }
  } catch {
    // Local fallback
  }

  const nextDb: AppDatabase = {
    ...currentDb,
    leads: currentDb.leads.map((l) => {
      if (l.id !== leadId) return l;
      return {
        ...l,
        pitches: generateLeadPitches({
          businessName: l.businessName,
          contactPerson: l.contactPerson,
          niche: l.niche,
          location: l.location,
          matchedSkill: l.matchedSkill,
          painPoint: l.painPoint,
          instaHandle: l.instaHandle,
          creatorName: currentDb.personaConfig.signatureName,
          creatorPortfolioUrl: currentDb.personaConfig.portfolioUrl,
          tone,
          customInstructions: currentDb.personaConfig.customInstructions,
          pricingNote: currentDb.personaConfig.pricingNote,
        }),
      };
    }),
  };
  await persistStateToSupabase(nextDb, {
    url: nextDb.supabaseConfig.url,
    key: nextDb.supabaseConfig.serviceRoleKey || nextDb.supabaseConfig.anonKey,
  }).catch(() => {});
  return { db: saveClientDbCache(nextDb), usedAi: false };
}

export async function apiDeleteLead(
  currentDb: AppDatabase,
  leadId: string
): Promise<AppDatabase> {
  try {
    const res = await fetch(`/api/leads/${leadId}`, {
      method: 'DELETE',
      headers: getSupabaseHeaders(currentDb),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.db) return saveClientDbCache(data.db);
    }
  } catch {
    // Local fallback
  }

  await deleteLeadFromSupabase(currentDb, leadId, {
    url: currentDb.supabaseConfig.url,
    key: currentDb.supabaseConfig.serviceRoleKey || currentDb.supabaseConfig.anonKey,
  }).catch(() => {});
  return saveClientDbCache({
    ...currentDb,
    leads: currentDb.leads.filter((l) => l.id !== leadId),
  });
}

export async function apiClearAllLeads(currentDb: AppDatabase): Promise<AppDatabase> {
  try {
    const res = await fetch('/api/leads/clear-all', {
      method: 'POST',
      headers: getSupabaseHeaders(currentDb),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.db) return saveClientDbCache(data.db);
    }
  } catch {
    // Local fallback
  }

  await clearAllLeadsInSupabase(currentDb, {
    url: currentDb.supabaseConfig.url,
    key: currentDb.supabaseConfig.serviceRoleKey || currentDb.supabaseConfig.anonKey,
  }).catch(() => {});
  return saveClientDbCache({
    ...currentDb,
    leads: [],
  });
}

export async function apiUpdateSuppression(
  currentDb: AppDatabase,
  emailOrPhone: string,
  action: 'add' | 'remove'
): Promise<AppDatabase> {
  try {
    const res = await fetch('/api/suppression', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getSupabaseHeaders(currentDb),
      },
      body: JSON.stringify({ email: emailOrPhone, action }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.db) return saveClientDbCache(data.db);
    }
  } catch {
    // Local fallback
  }

  const clean = emailOrPhone.trim().toLowerCase();
  const nextList =
    action === 'remove'
      ? currentDb.suppressionList.filter((i) => i !== clean)
      : Array.from(new Set([...currentDb.suppressionList, clean]));

  const nextDb = {
    ...currentDb,
    suppressionList: nextList,
  };
  await persistStateToSupabase(nextDb, {
    url: nextDb.supabaseConfig.url,
    key: nextDb.supabaseConfig.serviceRoleKey || nextDb.supabaseConfig.anonKey,
  }).catch(() => {});
  return saveClientDbCache(nextDb);
}

export async function apiResetDatabase(): Promise<AppDatabase> {
  try {
    const res = await fetch('/api/backup/reset', {
      method: 'POST',
    });
    if (res.ok) {
      const data = await res.json();
      if (data.db) return saveClientDbCache(data.db);
    }
  } catch {
    // Local fallback
  }

  const fresh = createInitialSeedDatabase();
  return saveClientDbCache(fresh);
}
