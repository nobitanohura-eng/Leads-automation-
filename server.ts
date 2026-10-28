import express, { Request } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import { GoogleGenAI } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import { createInitialSeedDatabase } from './src/lib/seedData';
import {
  calculateLeadConversionScore,
  generateLeadPitches,
  parseRawAiLeadsInput,
  parsePortableImportData,
  buildSmsCloudRequest,
  formatInstaHandle,
  cleanContactField,
  normalizePhoneForSmsGate,
} from './src/lib/engine';
import {
  loadStateFromSupabase,
  persistStateToSupabase,
  verifyAndSyncSupabase,
  deleteLeadFromSupabase,
  clearAllLeadsInSupabase,
  resolveSupabaseCredentials,
} from './src/lib/supabaseDb';
import {
  AppDatabase,
  ClientLead,
  CreatorSkill,
  PitchTone,
  SmsConnectedDevice,
} from './src/types/platform';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = process.env.VERCEL ? path.join('/tmp', 'data') : path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'avinash-studio-v5-db.json');

function sortLeadsByConversion(leads: ClientLead[]): ClientLead[] {
  return [...leads].sort((a, b) => b.conversionScore - a.conversionScore);
}

function getHeaderSupabaseCreds(req: Request): { url?: string; key?: string } {
  const url = String(req.headers['x-supabase-url'] || '').trim();
  const key = String(req.headers['x-supabase-key'] || '').trim();
  return {
    url: url || undefined,
    key: key || undefined,
  };
}

function addActivityLog(
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
  if (!Array.isArray(db.activityLogs)) db.activityLogs = [];
  db.activityLogs.unshift({
    id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString().slice(0, 16).replace('T', ' '),
    ...entry,
  });
  if (db.activityLogs.length > 50) {
    db.activityLogs = db.activityLogs.slice(0, 50);
  }
}

function loadDatabase(): AppDatabase {
  const seed = createInitialSeedDatabase();
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as AppDatabase;
      if (
        parsed &&
        Array.isArray(parsed.leads) &&
        parsed.smsConfig &&
        typeof parsed.smsConfig.serverAddress === 'string' &&
        parsed.personaConfig &&
        parsed.aiConfig
      ) {
        parsed.leads = sortLeadsByConversion(
          parsed.leads
            .filter(
              (l) =>
                !String(l.id).startsWith('seed-lead-') &&
                !String(l.id).startsWith('showcase-') &&
                (l.source as string) !== 'Verified Directory (Zero-Downtime Engine)'
            )
            .map((l) => ({
              ...l,
              email: cleanContactField(l.email || ''),
              phone: cleanContactField(l.phone || ''),
              instaHandle: formatInstaHandle(l.instaHandle || ''),
            }))
        );
        if (parsed.smsConfig.deviceId === 'android-sim1-primary') {
          parsed.smsConfig.deviceId = 'DwLpHi0cv9sshAQF2sOx6';
        }
        if (
          parsed.aiConfig.geminiApiKey &&
          parsed.aiConfig.geminiApiKey.startsWith('AQ.Ab8RN6')
        ) {
          parsed.aiConfig.geminiApiKey = '';
        }
        if (!parsed.aiConfig.groqApiKey && parsed.aiConfig.selectedEngine === 'groq') {
          parsed.aiConfig.selectedEngine = 'gemini';
        }
        if (!parsed.supabaseConfig) {
          parsed.supabaseConfig = seed.supabaseConfig;
        }
        const envCreds = resolveSupabaseCredentials(parsed.supabaseConfig);
        if (envCreds) {
          parsed.supabaseConfig.url = envCreds.url;
          parsed.supabaseConfig.anonKey = envCreds.key;
        }
        return parsed;
      }
    }
  } catch (err) {
    console.error('Failed to read database file, initializing clean workspace:', err);
  }

  const envCreds = resolveSupabaseCredentials(seed.supabaseConfig);
  if (envCreds) {
    seed.supabaseConfig.url = envCreds.url;
    seed.supabaseConfig.anonKey = envCreds.key;
  }
  saveDatabaseLocalOnly(seed);
  return seed;
}

function saveDatabaseLocalOnly(db: AppDatabase): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    db.leads = sortLeadsByConversion(db.leads);
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to write database file:', err);
  }
}

async function saveDatabase(
  db: AppDatabase,
  headerCreds?: { url?: string; key?: string }
): Promise<void> {
  if (headerCreds?.url && headerCreds?.key) {
    db.supabaseConfig = {
      ...db.supabaseConfig,
      enabled: true,
      url: headerCreds.url,
      anonKey: headerCreds.key,
    };
  }
  saveDatabaseLocalOnly(db);
  await persistStateToSupabase(db, headerCreds);
  saveDatabaseLocalOnly(db);
}

function createGeminiClientWithKey(rawKey?: string): GoogleGenAI | null {
  const key = (rawKey || '').trim();
  if (
    !key ||
    key === 'MY_GEMINI_API_KEY' ||
    key.startsWith('AQ.Ab8RN6') ||
    key.length < 10
  ) {
    return null;
  }
  return new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function getCandidateGeminiClients(customApiKey?: string): GoogleGenAI[] {
  const clients: GoogleGenAI[] = [];
  const customClient = createGeminiClientWithKey(customApiKey);
  if (customClient) clients.push(customClient);

  const envClient = createGeminiClientWithKey(process.env.GEMINI_API_KEY);
  if (envClient && customApiKey?.trim() !== process.env.GEMINI_API_KEY?.trim()) {
    clients.push(envClient);
  }
  return clients;
}

function withTimeout<T>(promise: Promise<T>, ms = 12000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Request timed out')), ms);
    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

async function callGroqChatCompletion(params: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
}): Promise<string> {
  const response = await withTimeout(
    fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.apiKey.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: params.model || 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: params.systemPrompt },
          { role: 'user', content: params.userPrompt },
        ],
        temperature: 0.3,
      }),
    }),
    14000
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq API error (${response.status}): ${errText.slice(0, 180)}`);
  }

  const data = (await response.json()) as any;
  return data?.choices?.[0]?.message?.content || '';
}

async function verifySmsCloudDevices(smsConfig: AppDatabase['smsConfig']): Promise<{
  connected: boolean;
  devices: SmsConnectedDevice[];
  error?: string;
}> {
  if (!smsConfig.username || !smsConfig.password) {
    return {
      connected: false,
      devices: [],
      error: 'Enter your Cloud Username and Password from the Android SMS Gateway app.',
    };
  }

  const built = buildSmsCloudRequest(smsConfig, '+919800000000', 'ping');
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(built.devicesUrl, {
      method: 'GET',
      headers: {
        Authorization: built.headers['Authorization'],
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const txt = await res.text();
      return {
        connected: false,
        devices: [],
        error:
          res.status === 401
            ? 'Invalid Cloud Username or Password (401 Unauthorized). Check the credentials shown on your phone app.'
            : `Cloud Server returned ${res.status}: ${txt.slice(0, 120)}`,
      };
    }

    const rawDevices = (await res.json()) as any[];
    if (!Array.isArray(rawDevices) || rawDevices.length === 0) {
      return {
        connected: false,
        devices: [],
        error:
          'Credentials valid, but no Android phone is registered on this account yet. Turn ON Cloud Server in your phone app.',
      };
    }

    const devices: SmsConnectedDevice[] = rawDevices.map((d) => ({
      id: String(d.id || ''),
      name: String(d.name || 'Android Phone'),
      lastSeen: d.lastSeen ? String(d.lastSeen) : undefined,
      updatedAt: d.updatedAt ? String(d.updatedAt) : undefined,
      simCards: Array.isArray(d.simCards)
        ? d.simCards.map((s: any) => ({
            slotIndex: Number(s.slotIndex || 0),
            simNumber: Number(s.simNumber || 1),
            phoneNumber: s.phoneNumber ? String(s.phoneNumber) : undefined,
            carrierName: s.carrierName ? String(s.carrierName) : undefined,
          }))
        : [],
    }));

    return { connected: true, devices };
  } catch (err: any) {
    return {
      connected: false,
      devices: [],
      error: err?.message || 'Could not reach SMS Cloud Server.',
    };
  }
}

export const app = express();
app.use(express.json({ limit: '10mb' }));

// Middleware to normalize paths on serverless platforms (e.g. Vercel rewrites)
app.use((req, _res, next) => {
  if (
    process.env.VERCEL &&
    req.url &&
    !req.url.startsWith('/api') &&
    !req.url.startsWith('/assets') &&
    !req.url.startsWith('/node_modules') &&
    !req.url.startsWith('/@') &&
    !req.url.startsWith('/src') &&
    !req.url.startsWith('/favicon') &&
    req.url !== '/'
  ) {
    req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
  }
  next();
});

let db = loadDatabase();

// Hydrate from Supabase & verify SMS device connection on startup in background
loadStateFromSupabase(db)
  .then((hydrated) => {
    db = hydrated;
    saveDatabaseLocalOnly(db);
  })
  .catch(() => {});

verifySmsCloudDevices(db.smsConfig)
  .then((res) => {
    if (res.connected && res.devices.length > 0) {
      db.smsConfig.connectedDevices = res.devices;
      db.smsConfig.connectionStatus = 'connected';
      db.smsConfig.connectionError = undefined;
      db.smsConfig.lastVerifiedAt = new Date().toISOString().slice(0, 16).replace('T', ' ');
      if (
        !db.smsConfig.deviceId ||
        db.smsConfig.deviceId === 'android-sim1-primary' ||
        !res.devices.some((d) => d.id === db.smsConfig.deviceId)
      ) {
        db.smsConfig.deviceId = res.devices[0].id;
      }
      saveDatabase(db);
    }
  })
  .catch(() => {});

// GET full application state (hydrates from Supabase if configured)
app.get('/api/state', async (req, res) => {
  const headerCreds = getHeaderSupabaseCreds(req);
  db = await loadStateFromSupabase(db, headerCreds);
  db.leads = sortLeadsByConversion(db.leads);
  saveDatabaseLocalOnly(db);

  res.json({
    db,
    aiConfigured: Boolean(
      getCandidateGeminiClients(db.aiConfig.geminiApiKey).length > 0 ||
        db.aiConfig.groqApiKey ||
        process.env.GROQ_API_KEY ||
        db.aiConfig.customApiKey
    ),
  });
});

// POST Verify & Sync Supabase PostgreSQL Connection
app.post('/api/verify/supabase', async (req, res) => {
  const headerCreds = getHeaderSupabaseCreds(req);
  const customUrl = req.body?.supabaseConfig?.url ?? headerCreds.url;
  const customKey = req.body?.supabaseConfig?.anonKey ?? headerCreds.key;
  const customServiceKey = req.body?.supabaseConfig?.serviceRoleKey;

  const result = await verifyAndSyncSupabase(db, {
    url: customUrl,
    anonKey: customKey,
    serviceRoleKey: customServiceKey,
  });
  db = result.db;

  if (result.status === 'connected') {
    addActivityLog(db, {
      channel: 'Supabase DB',
      title: 'Supabase PostgreSQL Connected & Synced',
      detail: `${db.leads.length} client leads synced with public.avinash_leads`,
      status: 'Success',
    });
    await saveDatabase(db);
    return res.json({
      connected: true,
      status: result.status,
      message: result.message,
      db,
    });
  }

  saveDatabaseLocalOnly(db);
  return res.status(400).json({
    connected: false,
    schemaMissing: result.status === 'tables_missing',
    status: result.status,
    error: result.message,
    message: result.message,
    db,
  });
});

// POST Verify Android SMS Cloud Connection & Fetch Connected Phone Details
app.post('/api/verify/sms', async (req, res) => {
  const headerCreds = getHeaderSupabaseCreds(req);
  if (req.body?.smsConfig) {
    db.smsConfig = { ...db.smsConfig, ...req.body.smsConfig };
  }
  const check = await verifySmsCloudDevices(db.smsConfig);
  const nowStr = new Date().toISOString().slice(0, 16).replace('T', ' ');

  if (check.connected) {
    db.smsConfig.connectedDevices = check.devices;
    db.smsConfig.connectionStatus = 'connected';
    db.smsConfig.connectionError = undefined;
    db.smsConfig.lastVerifiedAt = nowStr;

    if (
      !db.smsConfig.deviceId ||
      db.smsConfig.deviceId === 'android-sim1-primary' ||
      !check.devices.some((d) => d.id === db.smsConfig.deviceId)
    ) {
      db.smsConfig.deviceId = check.devices[0].id;
    }

    const primaryPhone = check.devices[0];
    const simInfo = primaryPhone.simCards?.[0]
      ? `SIM ${primaryPhone.simCards[0].simNumber} (${primaryPhone.simCards[0].carrierName || 'Mobile'} · ${primaryPhone.simCards[0].phoneNumber || ''})`
      : `SIM ${db.smsConfig.simSlot}`;

    addActivityLog(db, {
      channel: 'SMS Cloud',
      title: `Phone Connected: ${primaryPhone.name}`,
      detail: `Device ID: ${primaryPhone.id} · ${simInfo}`,
      status: 'Success',
    });
    await saveDatabase(db, headerCreds);

    return res.json({
      connected: true,
      devices: check.devices,
      message: `Phone Connected: ${primaryPhone.name} (${simInfo})`,
      db,
    });
  } else {
    db.smsConfig.connectionStatus = 'disconnected';
    db.smsConfig.connectionError = check.error;
    db.smsConfig.lastVerifiedAt = nowStr;
    await saveDatabase(db, headerCreds);

    return res.status(400).json({
      connected: false,
      error: check.error || 'Phone connection failed',
      db,
    });
  }
});

// POST Verify Email Gateway (Gmail App Password SMTP or Resend API)
app.post('/api/verify/email', async (req, res) => {
  const headerCreds = getHeaderSupabaseCreds(req);
  if (req.body?.emailConfig) {
    db.emailConfig = { ...db.emailConfig, ...req.body.emailConfig };
  }

  const nowStr = new Date().toISOString().slice(0, 16).replace('T', ' ');

  if (db.emailConfig.provider === 'resend_api') {
    if (!db.emailConfig.resendApiKey || db.emailConfig.resendApiKey.trim().length < 8) {
      db.emailConfig.connectionStatus = 'disconnected';
      db.emailConfig.connectionError = 'Enter a valid Resend API key (starts with re_...)';
      await saveDatabase(db, headerCreds);
      return res.status(400).json({
        connected: false,
        error: db.emailConfig.connectionError,
        db,
      });
    }
    db.emailConfig.connectionStatus = 'connected';
    db.emailConfig.connectionError = undefined;
    db.emailConfig.lastVerifiedAt = nowStr;
    await saveDatabase(db, headerCreds);
    return res.json({
      connected: true,
      message: 'Resend API Key saved & ready for outbound emails.',
      db,
    });
  }

  const cleanEmail = (db.emailConfig.senderEmail || '').trim();
  const cleanPass = (db.emailConfig.appPassword || '').replace(/\s+/g, '');

  if (!cleanEmail || !cleanEmail.includes('@')) {
    db.emailConfig.connectionStatus = 'disconnected';
    db.emailConfig.connectionError = 'Enter your Gmail address first.';
    await saveDatabase(db, headerCreds);
    return res.status(400).json({
      connected: false,
      error: db.emailConfig.connectionError,
      db,
    });
  }

  if (!cleanPass || cleanPass.length < 12) {
    db.emailConfig.connectionStatus = 'disconnected';
    db.emailConfig.connectionError =
      '16-Letter Google App Password is missing. Generate an App Password in Google Account → Security → App Passwords and paste it here.';
    await saveDatabase(db, headerCreds);
    return res.status(400).json({
      connected: false,
      error: db.emailConfig.connectionError,
      db,
    });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: db.emailConfig.smtpHost || 'smtp.gmail.com',
      port: Number(db.emailConfig.smtpPort) || 465,
      secure: Number(db.emailConfig.smtpPort || 465) === 465,
      auth: {
        user: cleanEmail,
        pass: cleanPass,
      },
    });

    await withTimeout(transporter.verify(), 6000);
    db.emailConfig.connectionStatus = 'connected';
    db.emailConfig.connectionError = undefined;
    db.emailConfig.lastVerifiedAt = nowStr;

    addActivityLog(db, {
      channel: 'Email',
      title: `Gmail SMTP Verified (${cleanEmail})`,
      detail: '16-Letter Google App Password authenticated with smtp.gmail.com',
      status: 'Success',
    });
    await saveDatabase(db, headerCreds);

    return res.json({
      connected: true,
      message: `Gmail SMTP Verified & Connected for ${cleanEmail}!`,
      db,
    });
  } catch (err: any) {
    db.emailConfig.connectionStatus = 'disconnected';
    db.emailConfig.connectionError = `Gmail SMTP Auth Failed: ${
      err?.message || 'Check your 16-letter Google App Password (do not use your normal Gmail login password).'
    }`;
    await saveDatabase(db, headerCreds);
    return res.status(400).json({
      connected: false,
      error: db.emailConfig.connectionError,
      db,
    });
  }
});

// PUT update SMS Cloud / Email / Insta / Persona / Webhook / AI / Supabase settings
app.put('/api/config', async (req, res) => {
  const headerCreds = getHeaderSupabaseCreds(req);
  const {
    leads,
    smsConfig,
    emailConfig,
    instaConfig,
    personaConfig,
    webhookConfig,
    aiConfig,
    supabaseConfig,
    suppressionList,
  } = req.body;

  if (Array.isArray(leads) && db.leads.length === 0 && leads.length > 0) {
    db.leads = sortLeadsByConversion(leads);
  }
  if (Array.isArray(suppressionList)) {
    db.suppressionList = suppressionList;
  }

  if (smsConfig) {
    db.smsConfig = { ...db.smsConfig, ...smsConfig };
    if (db.smsConfig.deviceId === 'android-sim1-primary') {
      db.smsConfig.deviceId = db.smsConfig.connectedDevices?.[0]?.id || '';
    }
    const check = await verifySmsCloudDevices(db.smsConfig);
    if (check.connected) {
      db.smsConfig.connectedDevices = check.devices;
      db.smsConfig.connectionStatus = 'connected';
      db.smsConfig.connectionError = undefined;
      db.smsConfig.lastVerifiedAt = new Date().toISOString().slice(0, 16).replace('T', ' ');
      if (
        !db.smsConfig.deviceId ||
        !check.devices.some((d) => d.id === db.smsConfig.deviceId)
      ) {
        db.smsConfig.deviceId = check.devices[0].id;
      }
    } else {
      db.smsConfig.connectionStatus = 'disconnected';
      db.smsConfig.connectionError = check.error;
    }
  }
  if (emailConfig) {
    db.emailConfig = { ...db.emailConfig, ...emailConfig };
  }
  if (instaConfig) db.instaConfig = { ...db.instaConfig, ...instaConfig };
  if (personaConfig) {
    db.personaConfig = { ...db.personaConfig, ...personaConfig };
    if (personaConfig.signatureName) db.aiConfig.creatorName = personaConfig.signatureName;
    if (personaConfig.portfolioUrl) db.aiConfig.creatorPortfolioUrl = personaConfig.portfolioUrl;
    if (personaConfig.defaultTone) db.aiConfig.defaultTone = personaConfig.defaultTone;
  }
  if (webhookConfig) db.webhookConfig = { ...db.webhookConfig, ...webhookConfig };
  if (aiConfig) db.aiConfig = { ...db.aiConfig, ...aiConfig };
  if (supabaseConfig) {
    db.supabaseConfig = { ...db.supabaseConfig, ...supabaseConfig };
  }

  addActivityLog(db, {
    channel: 'Webhook',
    title: 'Updated Avinash Studio Connections & Rules',
    detail: `Phone: ${
      db.smsConfig.connectionStatus === 'connected'
        ? db.smsConfig.connectedDevices?.[0]?.name || 'Connected'
        : 'Unverified'
    } · AI: ${db.aiConfig.selectedEngine.toUpperCase()}`,
    status: 'Success',
  });
  await saveDatabase(db, headerCreds);
  res.json({ db });
});

// POST Portable JSON / CSV Import (Full Workspace Backup or Lead List Merge)
app.post('/api/backup/import', async (req, res) => {
  const headerCreds = getHeaderSupabaseCreds(req);
  const { rawContent } = req.body;
  const result = parsePortableImportData(String(rawContent || ''), db);
  if ('error' in result) {
    return res.status(400).json({ error: result.error });
  }
  db = result.nextDb;
  addActivityLog(db, {
    channel: 'Backup / JSON',
    title:
      result.mode === 'full_backup'
        ? `Restored Full Workspace JSON (${result.importedLeadsCount} Leads)`
        : `Imported ${result.importedLeadsCount} Real Leads from File`,
    detail: 'Portable JSON/CSV sync completed',
    status: 'Success',
  });
  await saveDatabase(db, headerCreds);
  return res.json({
    mode: result.mode,
    importedLeadsCount: result.importedLeadsCount,
    db,
  });
});

// POST Suppression List Management
app.post('/api/suppression', async (req, res) => {
  const headerCreds = getHeaderSupabaseCreds(req);
  const { email, action } = req.body;
  const clean = String(email || '').trim().toLowerCase();
  if (!clean) {
    return res.status(400).json({ error: 'Valid email or phone required' });
  }
  if (action === 'remove') {
    db.suppressionList = db.suppressionList.filter((item) => item !== clean);
  } else if (!db.suppressionList.includes(clean)) {
    db.suppressionList.push(clean);
    db.leads.forEach((l) => {
      if (l.email.toLowerCase() === clean || l.phone === clean) {
        l.status = 'Suppressed';
      }
    });
  }
  await saveDatabase(db, headerCreds);
  return res.json({ db });
});

// POST Clear All Leads
app.post('/api/leads/clear-all', async (req, res) => {
  const headerCreds = getHeaderSupabaseCreds(req);
  db.leads = [];
  await clearAllLeadsInSupabase(db, headerCreds);
  addActivityLog(db, {
    channel: 'Backup / JSON',
    title: 'Cleared Lead List',
    detail: 'Workspace lead list is now empty and ready for fresh client imports.',
    status: 'Success',
  });
  await saveDatabase(db, headerCreds);
  return res.json({ db });
});

// POST External Webhook Endpoint for AI Bots / Python Scrapers / n8n / Make.com
app.post('/api/external/leads', async (req, res) => {
  const headerCreds = getHeaderSupabaseCreds(req);
  const authHeader = req.headers.authorization || '';
  const tokenFromHeader = authHeader.replace(/^Bearer\s+/i, '').trim();
  const tokenFromQuery = String(req.query.secret || '').trim();
  const expectedToken = db.webhookConfig.secretToken;

  if (
    db.webhookConfig.enabled &&
    expectedToken &&
    tokenFromHeader !== expectedToken &&
    tokenFromQuery !== expectedToken
  ) {
    return res.status(401).json({ error: 'Invalid webhook secret token' });
  }

  const bodyPayload = Array.isArray(req.body)
    ? req.body
    : Array.isArray(req.body?.leads)
    ? req.body.leads
    : [req.body];

  const parsedLeads = parseRawAiLeadsInput(JSON.stringify(bodyPayload), {
    defaultSkill: 'Business Website & Landing Page',
    creatorName: db.personaConfig.signatureName,
    creatorPortfolioUrl: db.personaConfig.portfolioUrl,
    tone: db.personaConfig.defaultTone,
    customInstructions: db.personaConfig.customInstructions,
    pricingNote: db.personaConfig.pricingNote,
    sourceLabel: 'External Webhook',
  });

  if (parsedLeads.length === 0) {
    return res.status(400).json({ error: 'No valid lead records found in webhook payload.' });
  }

  db.leads = sortLeadsByConversion([...parsedLeads, ...db.leads]);
  addActivityLog(db, {
    channel: 'Webhook',
    title: `Webhook Pushed ${parsedLeads.length} New Client Lead(s)`,
    detail: `Top lead: ${parsedLeads[0].businessName} (${parsedLeads[0].conversionScore}% Match)`,
    status: 'Success',
  });
  await saveDatabase(db, headerCreds);

  return res.json({
    success: true,
    importedCount: parsedLeads.length,
    db,
  });
});

// POST AI-powered real client discovery (Zero Mock Data)
app.post('/api/leads/ai-discover', async (req, res) => {
  const headerCreds = getHeaderSupabaseCreds(req);
  const {
    skill,
    niche,
    location,
    count,
    tone,
    geminiApiKey,
    groqApiKey,
    groqModel,
    selectedEngine,
  } = req.body as {
    skill: CreatorSkill;
    niche: string;
    location: string;
    count?: number;
    tone?: PitchTone;
    geminiApiKey?: string;
    groqApiKey?: string;
    groqModel?: string;
    selectedEngine?: string;
  };

  if (geminiApiKey !== undefined) {
    db.aiConfig.geminiApiKey = geminiApiKey.trim();
  }
  if (groqApiKey !== undefined) {
    db.aiConfig.groqApiKey = groqApiKey.trim();
  }
  if (groqModel) {
    db.aiConfig.groqModel = groqModel;
  }
  if (selectedEngine) {
    db.aiConfig.selectedEngine = selectedEngine as any;
  }

  const targetSkill: CreatorSkill = skill || 'Business Website & Landing Page';
  const targetNiche = (niche || '').trim();
  const targetLocation = (location || 'India').trim();
  const desiredCount = Math.min(12, Math.max(3, Number(count) || 6));
  const selectedTone: PitchTone = tone || db.personaConfig.defaultTone;
  const enginePreference = db.aiConfig.selectedEngine || 'gemini';

  if (!targetNiche) {
    return res.status(400).json({ error: 'Please enter a target business niche first.' });
  }

  const systemPrompt =
    'You are an elite B2B Lead Research Engine for Avinash Studio. Return ONLY a valid JSON array of real, verifiable businesses in the requested niche and city. Never use markdown code blocks around the JSON if possible, and never invent fictional placeholder names.';

  const promptText = `Search Google for ${desiredCount} real, genuine businesses in the "${targetNiche}" sector in "${targetLocation}" that are strong prospects for "${targetSkill}" from Avinash Studio.
Focus on real businesses that are active on Google Search, Google Maps, Instagram, or local directories and have a clear digital conversion gap (e.g., no modern booking website, taking orders manually via DM/WhatsApp, or needing better reels/ad graphics).

Return ONLY a valid JSON array where each object has these exact keys:
[
  {
    "businessName": "Real Business Name",
    "contactPerson": "Owner / Founder / Team",
    "niche": "${targetNiche}",
    "location": "${targetLocation}",
    "matchedSkill": "${targetSkill}",
    "painPoint": "Specific reason why they will convert for ${targetSkill} from Avinash Studio",
    "email": "public business email if found or empty string",
    "phone": "public phone number with country code if found or empty string",
    "instaHandle": "@instagram_handle or empty string",
    "websiteUrl": "current website URL or 'No website'",
    "estimatedDealValue": "e.g. ₹25,000"
  }
]`;

  let rawAiOutput = '';
  let usedProvider = '';
  let geminiErrorReason = '';
  let fellBackToGroq = false;
  const groundingSources: { uri: string; title: string }[] = [];
  const errorsEncountered: string[] = [];

  const activeGroqKey = (db.aiConfig.groqApiKey || process.env.GROQ_API_KEY || '').trim();

  // Helper to run Google Gemini with Live Google Search Grounding (tries custom key, then server GEMINI_API_KEY, and supports both gemini-3.8-flash and gemini-2.5-flash)
  const runGeminiGoogleSearch = async () => {
    const clients = getCandidateGeminiClients(geminiApiKey || db.aiConfig.geminiApiKey);
    if (clients.length === 0) {
      geminiErrorReason = 'Gemini API key is not configured.';
      return;
    }

    const modelsToTry = ['gemini-3.8-flash', 'gemini-2.5-flash'];
    for (const ai of clients) {
      for (const modelName of modelsToTry) {
        try {
          const response = await withTimeout(
            ai.models.generateContent({
              model: modelName,
              contents: promptText,
              config: {
                systemInstruction: systemPrompt,
                tools: [{ googleSearch: {} }],
              },
            }),
            20000
          );
          rawAiOutput = response.text || '';
          const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
          if (Array.isArray(chunks)) {
            for (const chunk of chunks) {
              const uri = chunk?.web?.uri;
              const title = chunk?.web?.title;
              if (uri && typeof uri === 'string') {
                groundingSources.push({
                  uri,
                  title: typeof title === 'string' && title.trim() ? title.trim() : uri,
                });
              }
            }
          }
          if (rawAiOutput) {
            usedProvider = 'Google Gemini + Live Google Search';
            return;
          }
        } catch (err: any) {
          const msg = err?.message || 'Gemini Google Search failed';
          geminiErrorReason = msg;
          // If model name not found on external Vercel, continue to next model in modelsToTry
          if (msg.includes('404') || msg.toLowerCase().includes('not found')) {
            continue;
          }
          break;
        }
      }
    }
    if (geminiErrorReason) {
      errorsEncountered.push(`Gemini Search: ${geminiErrorReason}`);
    }
  };

  // Helper to run Groq Cloud API
  const runGroqDiscovery = async (isFallback: boolean) => {
    if (!activeGroqKey) return;
    try {
      rawAiOutput = await callGroqChatCompletion({
        apiKey: activeGroqKey,
        model: db.aiConfig.groqModel || 'llama-3.3-70b-versatile',
        systemPrompt,
        userPrompt: promptText,
      });
      if (rawAiOutput) {
        fellBackToGroq = isFallback;
        usedProvider = isFallback
          ? `Groq Cloud Fallback (${db.aiConfig.groqModel || 'llama-3.3-70b-versatile'})`
          : `Groq Cloud (${db.aiConfig.groqModel || 'llama-3.3-70b-versatile'})`;
      }
    } catch (err: any) {
      errorsEncountered.push(err?.message || 'Groq API error');
    }
  };

  if (enginePreference === 'gemini') {
    await runGeminiGoogleSearch();
    if (!rawAiOutput && activeGroqKey) {
      await runGroqDiscovery(true);
    }
  } else if (enginePreference === 'groq') {
    if (activeGroqKey) {
      await runGroqDiscovery(false);
    }
    if (!rawAiOutput) {
      await runGeminiGoogleSearch();
    }
  } else if (
    (enginePreference === 'openai' ||
      enginePreference === 'openrouter' ||
      enginePreference === 'custom') &&
    db.aiConfig.customEndpointUrl &&
    db.aiConfig.customApiKey
  ) {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${db.aiConfig.customApiKey.trim()}`,
      };
      const customRes = await withTimeout(
        fetch(db.aiConfig.customEndpointUrl.trim(), {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: db.aiConfig.customModel || 'gpt-4o-mini',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: promptText },
            ],
            temperature: 0.3,
          }),
        }),
        14000
      );
      if (customRes.ok) {
        const json = (await customRes.json()) as any;
        rawAiOutput =
          json?.choices?.[0]?.message?.content ||
          json?.response ||
          json?.text ||
          '';
        if (rawAiOutput) {
          usedProvider = `${enginePreference.toUpperCase()} (${db.aiConfig.customModel})`;
        }
      } else {
        errorsEncountered.push(`Custom API status ${customRes.status}`);
      }
    } catch (err: any) {
      errorsEncountered.push(err?.message || 'Custom AI endpoint error');
    }
    if (!rawAiOutput) {
      await runGeminiGoogleSearch();
    }
    if (!rawAiOutput && activeGroqKey) {
      await runGroqDiscovery(true);
    }
  }

  const discoveredLeads = parseRawAiLeadsInput(rawAiOutput, {
    defaultSkill: targetSkill,
    creatorName: db.personaConfig.signatureName,
    creatorPortfolioUrl: db.personaConfig.portfolioUrl,
    tone: selectedTone,
    customInstructions: db.personaConfig.customInstructions,
    pricingNote: db.personaConfig.pricingNote,
    sourceLabel: usedProvider.startsWith('Groq') ? 'Groq AI Engine' : 'AI Live Search',
  });

  const isQuotaExhausted = Boolean(
    geminiErrorReason.includes('429') ||
      geminiErrorReason.includes('RESOURCE_EXHAUSTED') ||
      geminiErrorReason.includes('quota')
  );

  if (discoveredLeads.length === 0) {
    await saveDatabase(db, headerCreds);
    const needsGroqKey = !activeGroqKey;
    return res.status(400).json({
      needsGroqKey,
      geminiError: geminiErrorReason || undefined,
      geminiQuotaExhausted: isQuotaExhausted,
      error: needsGroqKey
        ? `Google Gemini Search limit reached (${
            geminiErrorReason || 'Quota or API key required'
          }). Enter your free Groq API Key (gsk_...) or a valid Gemini API key (AIzaSy...) below for real client discovery, or copy the Research Prompt into ChatGPT/Perplexity.`
        : `AI Discovery Notice: ${
            errorsEncountered.join(' | ') || 'Could not parse structured leads from response'
          }. Check your API Key or try another niche.`,
    });
  }

  db.leads = sortLeadsByConversion([...discoveredLeads, ...db.leads]);
  addActivityLog(db, {
    channel: 'AI Discovery',
    title: `Discovered ${discoveredLeads.length} Real Clients via ${usedProvider}`,
    detail: `Niche: ${targetNiche} (${targetLocation})${
      groundingSources.length > 0 ? ` · ${groundingSources.length} Google web sources verified` : ''
    }`,
    status: 'Success',
  });
  await saveDatabase(db, headerCreds);

  return res.json({
    discoveredCount: discoveredLeads.length,
    usedProvider,
    fellBackToGroq,
    groundingSources: groundingSources.slice(0, 8),
    leads: discoveredLeads,
    geminiQuotaExhausted: isQuotaExhausted,
    needsGroqKey: !activeGroqKey,
    db,
  });
});

// POST Import leads pasted from external AI Agent (ChatGPT, Gemini, Perplexity, CSV, JSON)
app.post('/api/leads/import-raw', async (req, res) => {
  const headerCreds = getHeaderSupabaseCreds(req);
  const { rawText, defaultSkill, tone, sourceLabel } = req.body;
  if (!rawText || typeof rawText !== 'string' || !rawText.trim()) {
    return res.status(400).json({ error: 'Please paste AI output, JSON, or CSV rows first.' });
  }

  const parsedLeads = parseRawAiLeadsInput(rawText, {
    defaultSkill: defaultSkill || 'Business Website & Landing Page',
    creatorName: db.personaConfig.signatureName,
    creatorPortfolioUrl: db.personaConfig.portfolioUrl,
    tone: tone || db.personaConfig.defaultTone,
    customInstructions: db.personaConfig.customInstructions,
    pricingNote: db.personaConfig.pricingNote,
    sourceLabel: sourceLabel || 'Pasted from AI Agent',
  });

  if (parsedLeads.length === 0) {
    return res.status(400).json({
      error:
        'Could not detect any valid leads. Make sure the text includes JSON, a table, or lines with business names and email / phone / @instagram.',
    });
  }

  db.leads = sortLeadsByConversion([...parsedLeads, ...db.leads]);
  addActivityLog(db, {
    channel: 'AI Discovery',
    title: `Imported ${parsedLeads.length} Genuine Leads`,
    detail: `Ranked by conversion score (Top: ${parsedLeads[0].businessName} at ${parsedLeads[0].conversionScore}%)`,
    status: 'Success',
  });
  await saveDatabase(db, headerCreds);

  return res.json({
    importedCount: parsedLeads.length,
    leads: parsedLeads,
    db,
  });
});

// POST Add a single manual lead
app.post('/api/leads', async (req, res) => {
  const headerCreds = getHeaderSupabaseCreds(req);
  const {
    businessName,
    contactPerson,
    niche,
    location,
    matchedSkill,
    painPoint,
    email,
    phone,
    instaHandle,
    websiteUrl,
    estimatedDealValue,
    tone,
  } = req.body;

  if (!businessName || !String(businessName).trim()) {
    return res.status(400).json({ error: 'Business name is required.' });
  }

  const skill: CreatorSkill = matchedSkill || 'Business Website & Landing Page';
  const cleanInsta = formatInstaHandle(instaHandle || '');
  const cleanWebsite = cleanContactField(websiteUrl || '') || 'No website';
  const cleanEmail = cleanContactField(email || '');
  const cleanPhone = cleanContactField(phone || '');
  const cleanPain =
    painPoint?.trim() || `High conversion fit for ${skill} by Avinash Studio`;

  const { score, reasons } = calculateLeadConversionScore({
    businessName: String(businessName).trim(),
    niche: String(niche || 'Business').trim(),
    matchedSkill: skill,
    painPoint: cleanPain,
    email: cleanEmail,
    phone: cleanPhone,
    instaHandle: cleanInsta,
    websiteUrl: cleanWebsite,
  });

  const pitches = generateLeadPitches({
    businessName: String(businessName).trim(),
    contactPerson: String(contactPerson || '').trim(),
    niche: String(niche || 'Business').trim(),
    location: String(location || '').trim(),
    matchedSkill: skill,
    painPoint: cleanPain,
    instaHandle: cleanInsta,
    creatorName: db.personaConfig.signatureName,
    creatorPortfolioUrl: db.personaConfig.portfolioUrl,
    tone: tone || db.personaConfig.defaultTone,
    customInstructions: db.personaConfig.customInstructions,
    pricingNote: db.personaConfig.pricingNote,
  });

  const newLead: ClientLead = {
    id: `lead-${Date.now()}`,
    businessName: String(businessName).trim(),
    contactPerson: String(contactPerson || `${businessName} Owner`).trim(),
    niche: String(niche || 'Business').trim(),
    location: String(location || 'India').trim(),
    matchedSkill: skill,
    painPoint: cleanPain,
    email: cleanEmail,
    phone: cleanPhone,
    instaHandle: cleanInsta,
    websiteUrl: cleanWebsite,
    estimatedDealValue: estimatedDealValue ? String(estimatedDealValue).trim() : undefined,
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

  db.leads = sortLeadsByConversion([newLead, ...db.leads]);
  await saveDatabase(db, headerCreds);
  return res.json({ lead: newLead, db });
});

// PATCH Update lead status, pitches, or contact info
app.patch('/api/leads/:id', async (req, res) => {
  const headerCreds = getHeaderSupabaseCreds(req);
  const idx = db.leads.findIndex((l) => l.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Lead not found' });
  }

  const existing = db.leads[idx];
  const updated: ClientLead = {
    ...existing,
    ...req.body,
    pitches: req.body.pitches
      ? { ...existing.pitches, ...req.body.pitches }
      : existing.pitches,
  };

  db.leads[idx] = updated;
  db.leads = sortLeadsByConversion(db.leads);
  await saveDatabase(db, headerCreds);
  return res.json({ lead: updated, db });
});

// DELETE lead
app.delete('/api/leads/:id', async (req, res) => {
  const headerCreds = getHeaderSupabaseCreds(req);
  const leadId = req.params.id;
  db.leads = db.leads.filter((l) => l.id !== leadId);
  await deleteLeadFromSupabase(db, leadId, headerCreds);
  await saveDatabase(db, headerCreds);
  return res.json({ db });
});

// POST Regenerate pitch for a lead
app.post('/api/leads/:id/regenerate-pitch', async (req, res) => {
  const headerCreds = getHeaderSupabaseCreds(req);
  const lead = db.leads.find((l) => l.id === req.params.id);
  if (!lead) {
    return res.status(404).json({ error: 'Lead not found' });
  }

  const tone: PitchTone = req.body.tone || db.personaConfig.defaultTone;
  const skill: CreatorSkill = req.body.matchedSkill || lead.matchedSkill;
  const useAiRewrite = Boolean(req.body.useAiRewrite);

  lead.matchedSkill = skill;

  const pitchSystemPrompt =
    'You are the High-Pitch Copywriter for Avinash Studio. Return ONLY valid JSON with keys: emailSubject, emailBody, smsText, instaDmText, followUp1Text, followUp2Text.';
  const pitchUserPrompt = `Write an irresistible high-converting pitch from "${db.personaConfig.signatureName}" (Portfolio: ${db.personaConfig.portfolioUrl}) to "${lead.businessName}" (Contact: ${lead.contactPerson}, Niche: ${lead.niche}, Location: ${lead.location}).
Service offered: ${skill}.
Specific client gap: ${lead.painPoint}.
Tone style: ${tone}.
Custom instructions: ${db.personaConfig.customInstructions}.
Strategy: Offer a free 1-screen custom live demo first so there is zero risk, and ask them to reply "DEMO" to get the link in 2 minutes. Output ONLY valid JSON.`;

  if (useAiRewrite) {
    let aiPitchJson = '';
    const clients = getCandidateGeminiClients(db.aiConfig.geminiApiKey);
    for (const ai of clients) {
      try {
        const geminiRes = await withTimeout(
          ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: pitchUserPrompt,
            config: {
              systemInstruction: pitchSystemPrompt,
              responseMimeType: 'application/json',
            },
          }),
          12000
        );
        aiPitchJson = geminiRes.text || '';
        if (aiPitchJson) break;
      } catch {
        // Fall through
      }
    }

    const activeGroqKey = (db.aiConfig.groqApiKey || process.env.GROQ_API_KEY || '').trim();
    if (!aiPitchJson && activeGroqKey) {
      try {
        aiPitchJson = await callGroqChatCompletion({
          apiKey: activeGroqKey,
          model: db.aiConfig.groqModel || 'llama-3.3-70b-versatile',
          systemPrompt: pitchSystemPrompt,
          userPrompt: pitchUserPrompt,
        });
      } catch {
        // Fall through to deterministic High-Pitch engine
      }
    }

    if (aiPitchJson) {
      try {
        const match = aiPitchJson.match(/\{[\s\S]*\}/);
        if (match) {
          const parsedPitch = JSON.parse(match[0]);
          if (parsedPitch.emailSubject && parsedPitch.emailBody && parsedPitch.smsText) {
            lead.pitches = {
              emailSubject: String(parsedPitch.emailSubject),
              emailBody: String(parsedPitch.emailBody),
              smsText: String(parsedPitch.smsText),
              instaDmText: String(parsedPitch.instaDmText || lead.pitches.instaDmText),
              followUp1Text: String(parsedPitch.followUp1Text || lead.pitches.followUp1Text),
              followUp2Text: String(parsedPitch.followUp2Text || lead.pitches.followUp2Text),
            };
            await saveDatabase(db, headerCreds);
            return res.json({ lead, db, usedAi: true });
          }
        }
      } catch {
        // Fall through to deterministic High-Pitch engine
      }
    }
  }

  lead.pitches = generateLeadPitches({
    businessName: lead.businessName,
    contactPerson: lead.contactPerson,
    niche: lead.niche,
    location: lead.location,
    matchedSkill: skill,
    painPoint: lead.painPoint,
    instaHandle: lead.instaHandle,
    creatorName: db.personaConfig.signatureName,
    creatorPortfolioUrl: db.personaConfig.portfolioUrl,
    tone,
    customInstructions: db.personaConfig.customInstructions,
    pricingNote: db.personaConfig.pricingNote,
  });

  await saveDatabase(db, headerCreds);
  return res.json({ lead, db, usedAi: false });
});

// POST Send SMS directly via Android SMS Gateway Cloud Server (https://api.sms-gate.app)
app.post('/api/dispatch/sms', async (req, res) => {
  const headerCreds = getHeaderSupabaseCreds(req);
  const { leadId, phone, message } = req.body;
  if (!phone || !String(phone).trim() || !message || !String(message).trim()) {
    return res.status(400).json({ error: 'Phone number and SMS message text are required.' });
  }

  const normalizedPhone = normalizePhoneForSmsGate(String(phone));
  if (!normalizedPhone || normalizedPhone.length < 8) {
    return res.status(400).json({ error: `Invalid mobile number format: ${phone}` });
  }

  if (db.suppressionList.includes(normalizedPhone.toLowerCase())) {
    return res.status(400).json({ error: 'Recipient is on the Central Suppression List.' });
  }

  if (db.smsConfig.deviceId === 'android-sim1-primary') {
    db.smsConfig.deviceId = db.smsConfig.connectedDevices?.[0]?.id || '';
  }

  const built = buildSmsCloudRequest(db.smsConfig, normalizedPhone, String(message));
  let gatewayDispatched = false;
  let gatewayResponseText = '';
  let messageId = '';

  if (db.smsConfig.enabled && db.smsConfig.username && db.smsConfig.password) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6500);
      const response = await fetch(built.url, {
        method: built.method,
        headers: built.headers,
        body: built.body,
        signal: controller.signal,
      });
      clearTimeout(timer);
      gatewayResponseText = await response.text();
      gatewayDispatched = response.ok;

      if (response.ok) {
        try {
          const parsedJson = JSON.parse(gatewayResponseText);
          messageId = parsedJson.id || '';
        } catch {
          // ignore json parse
        }
        db.smsConfig.connectionStatus = 'connected';
        db.smsConfig.connectionError = undefined;
      } else {
        db.smsConfig.connectionError = `SMS Gateway Error (${response.status}): ${gatewayResponseText}`;
      }
    } catch (err: any) {
      gatewayResponseText =
        err?.message || 'Cloud Server connection timeout — verify phone is online.';
      db.smsConfig.connectionError = gatewayResponseText;
    }
  } else {
    gatewayResponseText =
      'Cloud Server credentials (Username & Password) not entered yet in SMS Cloud tab.';
  }

  const activePhoneName =
    db.smsConfig.connectedDevices?.[0]?.name || db.smsConfig.deviceId || 'Android Phone';

  if (leadId) {
    const lead = db.leads.find((l) => l.id === leadId);
    if (lead) {
      lead.lastContactedAt = new Date().toISOString().slice(0, 10);
      if (
        gatewayDispatched &&
        (lead.status === 'New — High Priority' || lead.status === 'Ready for Review')
      ) {
        lead.status = 'Contacted';
      }
      lead.outreachHistory.unshift({
        id: `out-${Date.now()}`,
        channel: 'SMS',
        sentAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
        preview: String(message).slice(0, 90),
        status: gatewayDispatched ? 'Sent via Cloud' : 'Failed',
      });
    }
  }

  addActivityLog(db, {
    channel: 'SMS Cloud',
    title: gatewayDispatched
      ? `Sent SIM ${db.smsConfig.simSlot} SMS to ${normalizedPhone} via ${activePhoneName}`
      : `SMS Failed for ${normalizedPhone}`,
    detail: gatewayDispatched
      ? `Dispatched to ${activePhoneName} (SIM ${db.smsConfig.simSlot})${
          messageId ? ` · ID: ${messageId}` : ''
        }`
      : gatewayResponseText,
    status: gatewayDispatched ? 'Success' : 'Warning',
  });
  await saveDatabase(db, headerCreds);

  if (!gatewayDispatched) {
    return res.status(400).json({
      gatewayDispatched: false,
      error: `SMS Send Failed: ${gatewayResponseText}`,
      gatewayNote: `SMS Send Failed: ${gatewayResponseText}`,
      db,
    });
  }

  return res.json({
    gatewayDispatched: true,
    messageId,
    gatewayNote: `LIVE SMS Sent to ${normalizedPhone} via ${activePhoneName} (SIM ${db.smsConfig.simSlot})!`,
    db,
  });
});

// POST Send Email via Gmail App Password (SMTP) or Resend API
app.post('/api/dispatch/email', async (req, res) => {
  const headerCreds = getHeaderSupabaseCreds(req);
  const { leadId, toEmail, subject, body } = req.body;
  if (!toEmail || !String(toEmail).includes('@') || !subject || !body) {
    return res.status(400).json({ error: 'Valid recipient email, subject, and body are required.' });
  }

  if (!db.emailConfig.globalOutboundActive) {
    return res.status(400).json({
      error: 'Global Outbound Email Switch is currently PAUSED in Settings.',
    });
  }

  if (db.suppressionList.includes(String(toEmail).trim().toLowerCase())) {
    return res.status(400).json({
      error: `Blocked: ${toEmail} is on the Central Suppression List.`,
    });
  }

  let smtpSent = false;
  let statusNote = '';

  if (
    db.emailConfig.provider === 'resend_api' &&
    db.emailConfig.resendApiKey &&
    db.emailConfig.resendApiKey.trim().length > 5
  ) {
    try {
      const r = await withTimeout(
        fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${db.emailConfig.resendApiKey.trim()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: `${db.emailConfig.senderName || 'Avinash Studio'} <onboarding@resend.dev>`,
            to: [String(toEmail).trim()],
            subject: String(subject).trim(),
            text: String(body),
          }),
        }),
        6000
      );
      const respTxt = await r.text();
      smtpSent = r.ok;
      if (smtpSent) {
        db.emailConfig.connectionStatus = 'connected';
        db.emailConfig.connectionError = undefined;
        statusNote = `LIVE Email sent via Resend API to ${toEmail}!`;
      } else {
        db.emailConfig.connectionStatus = 'disconnected';
        db.emailConfig.connectionError = `Resend API rejected request: ${respTxt.slice(0, 140)}`;
        statusNote = db.emailConfig.connectionError;
      }
    } catch (err: any) {
      db.emailConfig.connectionStatus = 'disconnected';
      db.emailConfig.connectionError = `Resend API Error: ${err?.message}`;
      statusNote = db.emailConfig.connectionError;
    }
  } else if (
    db.emailConfig.senderEmail &&
    db.emailConfig.appPassword &&
    db.emailConfig.appPassword.replace(/\s+/g, '').length >= 12
  ) {
    try {
      const transporter = nodemailer.createTransport({
        host: db.emailConfig.smtpHost || 'smtp.gmail.com',
        port: Number(db.emailConfig.smtpPort) || 465,
        secure: Number(db.emailConfig.smtpPort || 465) === 465,
        auth: {
          user: db.emailConfig.senderEmail.trim(),
          pass: db.emailConfig.appPassword.replace(/\s+/g, ''),
        },
      });

      await withTimeout(
        transporter.sendMail({
          from: `"${db.emailConfig.senderName || 'Avinash Studio'}" <${db.emailConfig.senderEmail.trim()}>`,
          to: String(toEmail).trim(),
          subject: String(subject).trim(),
          text: String(body),
        }),
        6500
      );
      smtpSent = true;
      db.emailConfig.connectionStatus = 'connected';
      db.emailConfig.connectionError = undefined;
      statusNote = `LIVE Email sent via Gmail SMTP (${db.emailConfig.senderEmail}) to ${toEmail}!`;
    } catch (err: any) {
      db.emailConfig.connectionStatus = 'disconnected';
      db.emailConfig.connectionError = `Gmail SMTP Error: ${
        err?.message || 'Invalid 16-letter App Password'
      }`;
      statusNote = db.emailConfig.connectionError;
    }
  } else {
    db.emailConfig.connectionStatus = 'unverified';
    db.emailConfig.connectionError =
      'Gmail 16-Letter App Password is not entered yet in Settings. Enter your 16-letter Google App Password in Settings for automatic sending, or click "Open Gmail Web Compose" to send directly.';
    statusNote = db.emailConfig.connectionError;
  }

  if (smtpSent) {
    db.emailConfig.sentTodayCount = (db.emailConfig.sentTodayCount || 0) + 1;
  }

  if (leadId) {
    const lead = db.leads.find((l) => l.id === leadId);
    if (lead && smtpSent) {
      lead.lastContactedAt = new Date().toISOString().slice(0, 10);
      if (lead.status === 'New — High Priority' || lead.status === 'Ready for Review') {
        lead.status = 'Contacted';
      }
      lead.outreachHistory.unshift({
        id: `out-${Date.now()}`,
        channel: 'Email',
        sentAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
        preview: String(subject),
        status: 'Sent via Cloud',
      });
    }
  }

  addActivityLog(db, {
    channel: 'Email',
    title: smtpSent ? `Sent Email to ${toEmail}` : `Email Not Sent (${toEmail})`,
    detail: smtpSent ? `Subject: ${subject}` : statusNote,
    status: smtpSent ? 'Success' : 'Warning',
  });
  await saveDatabase(db, headerCreds);

  if (!smtpSent) {
    return res.status(400).json({
      smtpSent: false,
      error: statusNote,
      statusNote,
      db,
    });
  }

  return res.json({
    smtpSent: true,
    statusNote,
    db,
  });
});

// POST Log Instagram DM Outreach (& optional Webhook trigger)
app.post('/api/dispatch/insta', async (req, res) => {
  const headerCreds = getHeaderSupabaseCreds(req);
  const { leadId, instaHandle, message } = req.body;
  let webhookSent = false;

  if (db.instaConfig.webhookUrl && db.instaConfig.webhookUrl.startsWith('http')) {
    try {
      const r = await withTimeout(
        fetch(db.instaConfig.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instaHandle, message, leadId }),
        }),
        4000
      );
      webhookSent = r.ok;
    } catch {
      // Ignore webhook error
    }
  }

  if (leadId) {
    const lead = db.leads.find((l) => l.id === leadId);
    if (lead) {
      lead.lastContactedAt = new Date().toISOString().slice(0, 10);
      if (lead.status === 'New — High Priority' || lead.status === 'Ready for Review') {
        lead.status = 'Contacted';
      }
      lead.outreachHistory.unshift({
        id: `out-${Date.now()}`,
        channel: 'Instagram DM',
        sentAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
        preview: String(message || '').slice(0, 90),
        status: webhookSent ? 'Sent via Cloud' : 'Opened App / Copied',
      });
    }
  }

  addActivityLog(db, {
    channel: 'Instagram DM',
    title: `Instagram DM Dispatched to ${instaHandle || 'Lead'}`,
    detail: webhookSent
      ? 'Triggered Instagram Automation Webhook'
      : 'Copied Avinash Studio DM & opened ig.me direct thread',
    status: 'Success',
  });
  await saveDatabase(db, headerCreds);

  return res.json({
    webhookSent,
    db,
  });
});

// POST Reset Workspace to Clean Zero-Mock State
app.post('/api/backup/reset', async (req, res) => {
  const headerCreds = getHeaderSupabaseCreds(req);
  await clearAllLeadsInSupabase(db, headerCreds);
  db = createInitialSeedDatabase();
  await saveDatabase(db, headerCreds);
  return res.json({ db });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else if (!process.env.VERCEL) {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  if (!process.env.VERCEL) {
    const PORT = Number(process.env.PORT) || 3000;
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Avinash Studio Client Engine running on http://localhost:${PORT}`);
    });
  }
}

if (!process.env.VERCEL) {
  startServer();
}

export default app;
