import { AppDatabase } from '../types/platform';

export const DEFAULT_SUPABASE_URL = 'https://ybywcdbxelmolbnfaqwk.supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlieXdjZGJ4ZWxtb2xibmZhcXdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxODM2ODYsImV4cCI6MjEwODc1OTY4Nn0.8C9xvI5AmpGGrMozFaBTipOk98fIL3k6bo9sOVPViso';
export const DEFAULT_SUPABASE_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlieXdjZGJ4ZWxtb2xibmZhcXdrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MzE4MzY4NiwiZXhwIjoyMTA4NzU5Njg2fQ.JMbbJQuvzk24BmvYTcItPo-GKXTH4g1U0z-oMu_vsG0';

/**
 * Clean, zero-mock-data initial workspace for Avinash Studio.
 * Pre-configured with the user's Supabase project (ybywcdbxelmolbnfaqwk)
 * and paired Android SMS Cloud Gateway device (Nothing/TetrisIND).
 */
export function createInitialSeedDatabase(): AppDatabase {
  const creatorName = 'Avinash — Avinash Studio';
  const creatorPortfolioUrl = 'https://avinashstudio.com/work';
  const defaultTone = 'High-Pitch Closer (Free Demo Hook)';
  const customInstructions =
    'Pitch directly from Avinash Studio using a High-Pitch Closer strategy: point out the exact conversion gap, offer a zero-risk 1-Screen Free Live Demo preview before any payment, and promise 3–4 day delivery.';
  const pricingNote =
    'Direct Avinash Studio rates — zero agency middleman markup, free live demo first.';

  return {
    leads: [],
    smsConfig: {
      enabled: true,
      connectionMode: 'cloud_server',
      serverAddress: 'https://api.sms-gate.app',
      username: '0JUV5I',
      password: '8vakfbsi_ftqxj',
      deviceId: 'DwLpHi0cv9sshAQF2sOx6',
      simSlot: 1,
      autoFollowUpSms: true,
      connectionStatus: 'connected',
      lastVerifiedAt: 'Live Verified',
      connectedDevices: [
        {
          id: 'DwLpHi0cv9sshAQF2sOx6',
          name: 'Nothing/TetrisIND',
          lastSeen: 'Online',
          simCards: [
            {
              slotIndex: 0,
              simNumber: 1,
              phoneNumber: '********6919',
              carrierName: '**O 4G',
            },
          ],
        },
      ],
    },
    emailConfig: {
      enabled: true,
      provider: 'gmail_smtp',
      senderName: 'Avinash Studio',
      senderEmail: 'avinashkr502080@gmail.com',
      appPassword: '',
      resendApiKey: '',
      smtpHost: 'smtp.gmail.com',
      smtpPort: 465,
      globalOutboundActive: true,
      dailySendLimit: 40,
      sentTodayCount: 0,
      connectionStatus: 'unverified',
      connectionError:
        'Enter your 16-letter Google App Password in Settings to send automatic background SMTP emails (or use 1-Click Gmail Web Compose).',
    },
    instaConfig: {
      defaultAction: 'ig.me Deep Link + Auto-Copy',
      webhookUrl: '',
      autoCopyOnOpen: true,
    },
    personaConfig: {
      personaStyle: 'High-Pitch Closer (Avinash Studio)',
      customInstructions,
      pricingNote,
      signatureName: creatorName,
      portfolioUrl: creatorPortfolioUrl,
      defaultTone,
    },
    webhookConfig: {
      enabled: true,
      secretToken: 'avinash_studio_sec_99',
    },
    aiConfig: {
      selectedEngine: 'gemini',
      providerName: 'Google Gemini Live Search (Default) + Groq Cloud Fallback',
      geminiApiKey: '',
      groqApiKey: '',
      groqModel: 'llama-3.3-70b-versatile',
      customEndpointUrl: 'https://api.openai.com/v1/chat/completions',
      customApiKey: '',
      customModel: 'gpt-4o-mini',
      creatorName,
      creatorPortfolioUrl,
      defaultTone,
    },
    supabaseConfig: {
      enabled: true,
      url: DEFAULT_SUPABASE_URL,
      anonKey: DEFAULT_SUPABASE_ANON_KEY,
      serviceRoleKey: DEFAULT_SUPABASE_SERVICE_ROLE_KEY,
      connectionStatus: 'connected',
    },
    suppressionList: [],
    activityLogs: [],
  };
}
