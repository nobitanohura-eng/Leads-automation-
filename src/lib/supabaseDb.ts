import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppDatabase, ActivityLogItem, SupabaseDatabaseConfig } from '../types/platform';
import { leadToSupabaseRow, supabaseRowToLead } from './engine';
import {
  DEFAULT_SUPABASE_ANON_KEY,
  DEFAULT_SUPABASE_SERVICE_ROLE_KEY,
  DEFAULT_SUPABASE_URL,
} from './seedData';

/**
 * Extracts project ref from a Supabase JWT (anon or service_role) if present.
 */
export function extractSupabaseRefFromJwt(token?: string): string | null {
  const clean = (token || '').trim();
  const parts = clean.split('.');
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const jsonStr =
      typeof Buffer !== 'undefined'
        ? Buffer.from(base64, 'base64').toString('utf-8')
        : typeof atob === 'function'
        ? atob(base64)
        : '';
    if (!jsonStr) return null;
    const payload = JSON.parse(jsonStr);
    if (payload && typeof payload.ref === 'string' && payload.ref.trim()) {
      return payload.ref.trim();
    }
  } catch {
    // ignore invalid jwt
  }
  return null;
}

/**
 * Normalizes a Supabase URL — supports:
 * - https://ybywcdbxelmolbnfaqwk.supabase.co
 * - https://supabase.com/dashboard/project/ybywcdbxelmolbnfaqwk/settings/api-keys
 * - project ref "ybywcdbxelmolbnfaqwk"
 * - auto-deriving from JWT ref if URL is missing
 */
export function normalizeSupabaseUrl(rawUrl?: string, fallbackJwt?: string): string {
  const trimmed = (rawUrl || '').trim();
  const dashboardMatch = trimmed.match(/supabase\.com\/dashboard\/project\/([a-z0-9]+)/i);
  if (dashboardMatch?.[1]) {
    return `https://${dashboardMatch[1].toLowerCase()}.supabase.co`;
  }

  const supabaseHostMatch = trimmed.match(/https?:\/\/([a-z0-9-]+)\.supabase\.co/i);
  if (supabaseHostMatch?.[1]) {
    return `https://${supabaseHostMatch[1].toLowerCase()}.supabase.co`;
  }

  if (/^[a-z0-9]{15,25}$/i.test(trimmed)) {
    return `https://${trimmed.toLowerCase()}.supabase.co`;
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed.replace(/\/+$/, '');
  }

  const jwtRef = extractSupabaseRefFromJwt(fallbackJwt);
  if (jwtRef) {
    return `https://${jwtRef.toLowerCase()}.supabase.co`;
  }

  return '';
}

export function resolveSupabaseCredentials(
  config?: Partial<SupabaseDatabaseConfig>,
  headerUrl?: string,
  headerKey?: string
): { url: string; key: string } | null {
  const envObj: Record<string, string | undefined> =
    typeof process !== 'undefined' && process.env ? process.env : {};

  const rawKey = (
    headerKey ||
    config?.serviceRoleKey ||
    config?.anonKey ||
    (config as any)?.anonOrServiceKey ||
    envObj.SUPABASE_SERVICE_ROLE_KEY ||
    envObj.SUPABASE_ANON_KEY ||
    envObj.SUPABASE_KEY ||
    envObj.VITE_SUPABASE_ANON_KEY ||
    envObj.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    DEFAULT_SUPABASE_SERVICE_ROLE_KEY ||
    DEFAULT_SUPABASE_ANON_KEY ||
    ''
  ).trim();

  const rawUrl = (
    headerUrl ||
    config?.url ||
    (config as any)?.projectUrl ||
    envObj.SUPABASE_URL ||
    envObj.VITE_SUPABASE_URL ||
    envObj.NEXT_PUBLIC_SUPABASE_URL ||
    DEFAULT_SUPABASE_URL ||
    ''
  ).trim();

  const normalizedUrl = normalizeSupabaseUrl(rawUrl, rawKey);

  if (
    !normalizedUrl ||
    !rawKey ||
    normalizedUrl.includes('YOUR_PROJECT_ID') ||
    rawKey === 'MY_SUPABASE_ANON_KEY' ||
    rawKey === 'YOUR_SUPABASE_ANON_OR_SERVICE_ROLE_KEY'
  ) {
    return null;
  }

  return { url: normalizedUrl, key: rawKey };
}

export function createSupabaseClientInstance(url: string, key: string): SupabaseClient {
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function isMissingTableError(err: any): boolean {
  const code = String(err?.code || '');
  const msg = String(err?.message || err?.details || '').toLowerCase();
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    msg.includes('does not exist') ||
    msg.includes('could not find the table') ||
    msg.includes('schema cache')
  );
}

export async function verifyAndSyncSupabase(
  db: AppDatabase,
  customCreds?: { url?: string; anonKey?: string; serviceRoleKey?: string }
): Promise<{
  connected: boolean;
  schemaMissing?: boolean;
  status: 'connected' | 'tables_missing' | 'disconnected' | 'unconfigured';
  message: string;
  db: AppDatabase;
}> {
  if (customCreds) {
    const candidateKey = (
      customCreds.serviceRoleKey ||
      customCreds.anonKey ||
      db.supabaseConfig?.serviceRoleKey ||
      db.supabaseConfig?.anonKey ||
      ''
    ).trim();
    const candidateUrl = normalizeSupabaseUrl(
      customCreds.url ?? db.supabaseConfig?.url ?? '',
      candidateKey
    );
    db.supabaseConfig = {
      ...db.supabaseConfig,
      enabled: true,
      url: candidateUrl,
      anonKey: (customCreds.anonKey ?? db.supabaseConfig?.anonKey ?? candidateKey).trim(),
      serviceRoleKey:
        customCreds.serviceRoleKey ?? db.supabaseConfig?.serviceRoleKey ?? undefined,
    };
  }

  const creds = resolveSupabaseCredentials(db.supabaseConfig);
  if (!creds) {
    db.supabaseConfig = {
      ...db.supabaseConfig,
      connectionStatus: 'unconfigured',
      connectionError:
        'Enter your Supabase Project URL (https://xyz.supabase.co) and Supabase API Key (anon or service_role).',
    };
    return {
      connected: false,
      status: 'unconfigured',
      message: db.supabaseConfig.connectionError || 'Supabase credentials not configured.',
      db,
    };
  }

  db.supabaseConfig.url = creds.url;
  if (!db.supabaseConfig.anonKey) {
    db.supabaseConfig.anonKey = creds.key;
  }

  try {
    const supabase = createSupabaseClientInstance(creds.url, creds.key);
    const { data: leadRows, error: leadsErr } = await supabase
      .from('avinash_leads')
      .select('*')
      .order('conversion_score', { ascending: false });

    if (leadsErr) {
      if (isMissingTableError(leadsErr)) {
        db.supabaseConfig.connectionStatus = 'tables_missing';
        db.supabaseConfig.connectionError =
          'Supabase API Keys Verified (Project: ybywcdbxelmolbnfaqwk)! Run the SQL Schema in your Supabase SQL Editor once to create the tables.';
        return {
          connected: false,
          schemaMissing: true,
          status: 'tables_missing',
          message: db.supabaseConfig.connectionError,
          db,
        };
      }
      db.supabaseConfig.connectionStatus = 'disconnected';
      db.supabaseConfig.connectionError = `Supabase Error (${leadsErr.code || 'Auth'}): ${leadsErr.message}`;
      return {
        connected: false,
        status: 'disconnected',
        message: db.supabaseConfig.connectionError,
        db,
      };
    }

    const nowStr = new Date().toISOString().slice(0, 16).replace('T', ' ');

    // Sync workspace config
    const { data: stateRow } = await supabase
      .from('avinash_workspace_state')
      .select('*')
      .eq('workspace_id', 'default')
      .maybeSingle();

    if (stateRow) {
      if (stateRow.sms_config && Object.keys(stateRow.sms_config).length > 0) {
        db.smsConfig = { ...db.smsConfig, ...stateRow.sms_config };
      }
      if (stateRow.email_config && Object.keys(stateRow.email_config).length > 0) {
        db.emailConfig = { ...db.emailConfig, ...stateRow.email_config };
      }
      if (stateRow.insta_config && Object.keys(stateRow.insta_config).length > 0) {
        db.instaConfig = { ...db.instaConfig, ...stateRow.insta_config };
      }
      if (stateRow.persona_config && Object.keys(stateRow.persona_config).length > 0) {
        db.personaConfig = { ...db.personaConfig, ...stateRow.persona_config };
      }
      if (stateRow.webhook_config && Object.keys(stateRow.webhook_config).length > 0) {
        db.webhookConfig = { ...db.webhookConfig, ...stateRow.webhook_config };
      }
      if (stateRow.ai_config && Object.keys(stateRow.ai_config).length > 0) {
        db.aiConfig = { ...db.aiConfig, ...stateRow.ai_config };
      }
      if (Array.isArray(stateRow.suppression_list)) {
        db.suppressionList = stateRow.suppression_list;
      }
    }

    // Sync leads (merge remote and local by ID)
    const remoteLeads = Array.isArray(leadRows) ? leadRows.map(supabaseRowToLead) : [];
    const leadMap = new Map<string, ReturnType<typeof supabaseRowToLead>>();
    for (const rl of remoteLeads) {
      leadMap.set(rl.id, rl);
    }
    for (const ll of db.leads) {
      if (!leadMap.has(ll.id)) {
        leadMap.set(ll.id, ll);
      }
    }
    db.leads = Array.from(leadMap.values()).sort(
      (a, b) => b.conversionScore - a.conversionScore
    );

    // Sync activity logs
    const { data: logRows } = await supabase
      .from('avinash_activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (Array.isArray(logRows) && logRows.length > 0) {
      const logMap = new Map<string, ActivityLogItem>();
      for (const r of logRows) {
        logMap.set(String(r.id), {
          id: String(r.id),
          timestamp: String(r.timestamp || ''),
          channel: (r.channel as ActivityLogItem['channel']) || 'Supabase DB',
          title: String(r.title || ''),
          detail: String(r.detail || ''),
          status: (r.status as ActivityLogItem['status']) || 'Success',
        });
      }
      for (const localLog of db.activityLogs || []) {
        if (!logMap.has(localLog.id)) {
          logMap.set(localLog.id, localLog);
        }
      }
      db.activityLogs = Array.from(logMap.values()).slice(0, 50);
    }

    db.supabaseConfig.connectionStatus = 'connected';
    db.supabaseConfig.connectionError = undefined;
    db.supabaseConfig.lastSyncedAt = nowStr;

    // Push merged state back to Supabase
    await persistStateToSupabase(db, { url: creds.url, key: creds.key });

    return {
      connected: true,
      status: 'connected',
      message: `Supabase PostgreSQL Connected & Synced (${db.leads.length} leads in cloud DB)!`,
      db,
    };
  } catch (err: any) {
    db.supabaseConfig.connectionStatus = 'disconnected';
    db.supabaseConfig.connectionError =
      err?.message || 'Failed to connect to Supabase PostgreSQL.';
    return {
      connected: false,
      status: 'disconnected',
      message: db.supabaseConfig.connectionError,
      db,
    };
  }
}

export async function loadStateFromSupabase(
  fallbackDb: AppDatabase,
  headerCreds?: { url?: string; key?: string }
): Promise<AppDatabase> {
  const creds = resolveSupabaseCredentials(
    fallbackDb.supabaseConfig,
    headerCreds?.url,
    headerCreds?.key
  );
  if (!creds) {
    return fallbackDb;
  }

  try {
    const supabase = createSupabaseClientInstance(creds.url, creds.key);

    const [leadsRes, stateRes, logsRes] = await Promise.all([
      supabase.from('avinash_leads').select('*').order('conversion_score', { ascending: false }),
      supabase
        .from('avinash_workspace_state')
        .select('*')
        .eq('workspace_id', 'default')
        .maybeSingle(),
      supabase
        .from('avinash_activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    if (leadsRes.error) {
      if (isMissingTableError(leadsRes.error)) {
        fallbackDb.supabaseConfig = {
          ...fallbackDb.supabaseConfig,
          enabled: true,
          url: creds.url,
          anonKey: fallbackDb.supabaseConfig?.anonKey || creds.key,
          connectionStatus: 'tables_missing',
          connectionError:
            'Supabase API Keys Connected (ybywcdbxelmolbnfaqwk). Paste SUPABASE_SETUP.sql in Supabase SQL Editor and click Run to activate tables.',
        };
      }
      return fallbackDb;
    }

    const nextDb: AppDatabase = {
      ...fallbackDb,
      leads: Array.isArray(leadsRes.data) ? leadsRes.data.map(supabaseRowToLead) : fallbackDb.leads,
      supabaseConfig: {
        ...fallbackDb.supabaseConfig,
        enabled: true,
        url: creds.url,
        anonKey: fallbackDb.supabaseConfig?.anonKey || creds.key,
        connectionStatus: 'connected',
        connectionError: undefined,
        lastSyncedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
      },
    };

    if (stateRes.data) {
      const s = stateRes.data;
      if (s.sms_config && Object.keys(s.sms_config).length > 0) {
        nextDb.smsConfig = { ...nextDb.smsConfig, ...s.sms_config };
      }
      if (s.email_config && Object.keys(s.email_config).length > 0) {
        nextDb.emailConfig = { ...nextDb.emailConfig, ...s.email_config };
      }
      if (s.insta_config && Object.keys(s.insta_config).length > 0) {
        nextDb.instaConfig = { ...nextDb.instaConfig, ...s.insta_config };
      }
      if (s.persona_config && Object.keys(s.persona_config).length > 0) {
        nextDb.personaConfig = { ...nextDb.personaConfig, ...s.persona_config };
      }
      if (s.webhook_config && Object.keys(s.webhook_config).length > 0) {
        nextDb.webhookConfig = { ...nextDb.webhookConfig, ...s.webhook_config };
      }
      if (s.ai_config && Object.keys(s.ai_config).length > 0) {
        nextDb.aiConfig = { ...nextDb.aiConfig, ...s.ai_config };
      }
      if (Array.isArray(s.suppression_list)) {
        nextDb.suppressionList = s.suppression_list;
      }
    }

    if (Array.isArray(logsRes.data) && logsRes.data.length > 0) {
      nextDb.activityLogs = logsRes.data.map((r: any) => ({
        id: String(r.id),
        timestamp: String(r.timestamp || ''),
        channel: (r.channel as ActivityLogItem['channel']) || 'Supabase DB',
        title: String(r.title || ''),
        detail: String(r.detail || ''),
        status: (r.status as ActivityLogItem['status']) || 'Success',
      }));
    }

    return nextDb;
  } catch {
    return fallbackDb;
  }
}

export async function persistStateToSupabase(
  db: AppDatabase,
  headerCreds?: { url?: string; key?: string }
): Promise<void> {
  const creds = resolveSupabaseCredentials(
    db.supabaseConfig,
    headerCreds?.url,
    headerCreds?.key
  );
  if (!creds) return;

  try {
    const supabase = createSupabaseClientInstance(creds.url, creds.key);

    const workspacePayload = {
      workspace_id: 'default',
      sms_config: db.smsConfig,
      email_config: db.emailConfig,
      insta_config: db.instaConfig,
      persona_config: db.personaConfig,
      webhook_config: db.webhookConfig,
      ai_config: db.aiConfig,
      suppression_list: db.suppressionList || [],
      updated_at: new Date().toISOString(),
    };

    const promises: PromiseLike<any>[] = [
      supabase
        .from('avinash_workspace_state')
        .upsert(workspacePayload, { onConflict: 'workspace_id' }),
    ];

    if (Array.isArray(db.leads) && db.leads.length > 0) {
      const rows = db.leads.map(leadToSupabaseRow);
      promises.push(supabase.from('avinash_leads').upsert(rows, { onConflict: 'id' }));
    }

    if (Array.isArray(db.activityLogs) && db.activityLogs.length > 0) {
      const logRows = db.activityLogs.slice(0, 50).map((l) => ({
        id: l.id,
        timestamp: l.timestamp,
        channel: l.channel,
        title: l.title,
        detail: l.detail,
        status: l.status,
      }));
      promises.push(supabase.from('avinash_activity_logs').upsert(logRows, { onConflict: 'id' }));
    }

    const results = await Promise.all(promises);
    const firstError = results.find((r) => r?.error)?.error;
    if (!firstError) {
      db.supabaseConfig = {
        ...db.supabaseConfig,
        url: creds.url,
        anonKey: db.supabaseConfig?.anonKey || creds.key,
        connectionStatus: 'connected',
        connectionError: undefined,
        lastSyncedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
      };
    } else if (isMissingTableError(firstError)) {
      db.supabaseConfig = {
        ...db.supabaseConfig,
        url: creds.url,
        anonKey: db.supabaseConfig?.anonKey || creds.key,
        connectionStatus: 'tables_missing',
        connectionError:
          'Supabase API Keys Connected (ybywcdbxelmolbnfaqwk). Run the SQL Schema in Supabase SQL Editor to create tables.',
      };
    }
  } catch {
    // Non-blocking background sync
  }
}

export async function deleteLeadFromSupabase(
  db: AppDatabase,
  leadId: string,
  headerCreds?: { url?: string; key?: string }
): Promise<void> {
  const creds = resolveSupabaseCredentials(
    db.supabaseConfig,
    headerCreds?.url,
    headerCreds?.key
  );
  if (!creds) return;
  try {
    const supabase = createSupabaseClientInstance(creds.url, creds.key);
    await supabase.from('avinash_leads').delete().eq('id', leadId);
  } catch {
    // Ignore error
  }
}

export async function clearAllLeadsInSupabase(
  db: AppDatabase,
  headerCreds?: { url?: string; key?: string }
): Promise<void> {
  const creds = resolveSupabaseCredentials(
    db.supabaseConfig,
    headerCreds?.url,
    headerCreds?.key
  );
  if (!creds) return;
  try {
    const supabase = createSupabaseClientInstance(creds.url, creds.key);
    await supabase.from('avinash_leads').delete().neq('id', '__never__');
  } catch {
    // Ignore error
  }
}
