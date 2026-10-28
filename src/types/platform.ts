export type CreatorSkill =
  | 'Business Website & Landing Page'
  | 'E-Commerce & Product Storefront'
  | 'Social Media Graphics & Posters'
  | 'Short-Form Video Ads & Reels'
  | 'Digital Ad Banners & Product Visuals'
  | 'Complete Brand Kit & Marketing Copy';

export const ALL_CREATOR_SKILLS: CreatorSkill[] = [
  'Business Website & Landing Page',
  'E-Commerce & Product Storefront',
  'Social Media Graphics & Posters',
  'Short-Form Video Ads & Reels',
  'Digital Ad Banners & Product Visuals',
  'Complete Brand Kit & Marketing Copy',
];

export type LeadStatus =
  | 'New — High Priority'
  | 'Ready for Review'
  | 'Contacted'
  | 'Follow-Up 1 Due'
  | 'Follow-Up 2 Due'
  | 'Replied / Interested'
  | 'Quotation Sent'
  | 'Client Closed'
  | 'Not Interested'
  | 'Suppressed';

export const ALL_LEAD_STATUSES: LeadStatus[] = [
  'New — High Priority',
  'Ready for Review',
  'Contacted',
  'Follow-Up 1 Due',
  'Follow-Up 2 Due',
  'Replied / Interested',
  'Quotation Sent',
  'Client Closed',
  'Not Interested',
  'Suppressed',
];

export type PitchTone =
  | 'High-Pitch Closer (Free Demo Hook)'
  | 'Friendly Hinglish + English'
  | 'Direct & Professional'
  | 'Short Value Hook'
  | 'Fully Custom Persona';

export const ALL_PITCH_TONES: PitchTone[] = [
  'High-Pitch Closer (Free Demo Hook)',
  'Friendly Hinglish + English',
  'Direct & Professional',
  'Short Value Hook',
  'Fully Custom Persona',
];

export interface LeadPitches {
  emailSubject: string;
  emailBody: string;
  smsText: string;
  instaDmText: string;
  followUp1Text: string;
  followUp2Text: string;
}

export interface ClientLead {
  id: string;
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
  conversionScore: number; // 0-100
  conversionReasons: string[];
  status: LeadStatus;
  lastContactedAt: string | null;
  nextFollowUpDate: string;
  pitches: LeadPitches;
  outreachHistory: {
    id: string;
    channel: 'Email' | 'SMS' | 'Instagram DM';
    sentAt: string;
    preview: string;
    status: 'Sent via Cloud' | 'Opened App / Copied' | 'Failed';
  }[];
  source:
    | 'AI Live Search'
    | 'Groq AI Engine'
    | 'Pasted from AI Agent'
    | 'External Webhook'
    | 'JSON / CSV Import'
    | 'Manual Entry';
  createdAt: string;
}

export interface SmsConnectedDevice {
  id: string;
  name: string;
  lastSeen?: string;
  updatedAt?: string;
  simCards?: {
    slotIndex: number;
    simNumber: number;
    phoneNumber?: string;
    carrierName?: string;
  }[];
}

/**
 * Direct Android SMS Gateway Cloud Server Configuration (api.sms-gate.app / Private Server)
 * Uses Server Address, Username, Password, Device ID, and SIM Slot — no external desktop tools required.
 */
export interface SmsCloudConfig {
  enabled: boolean;
  connectionMode: 'cloud_server' | 'private_server';
  serverAddress: string; // e.g. "https://api.sms-gate.app"
  username: string;
  password: string;
  deviceId: string;
  simSlot: 1 | 2;
  autoFollowUpSms: boolean;
  connectedDevices?: SmsConnectedDevice[];
  lastVerifiedAt?: string;
  connectionStatus?: 'connected' | 'disconnected' | 'unverified';
  connectionError?: string;
}

export interface EmailGatewayConfig {
  enabled: boolean;
  provider: 'gmail_smtp' | 'resend_api';
  senderName: string;
  senderEmail: string;
  appPassword: string; // 16-letter Google App Password
  resendApiKey: string;
  smtpHost: string;
  smtpPort: number;
  globalOutboundActive: boolean;
  dailySendLimit: number;
  sentTodayCount: number;
  connectionStatus?: 'connected' | 'disconnected' | 'unverified';
  connectionError?: string;
  lastVerifiedAt?: string;
}

export interface InstaAutomationConfig {
  defaultAction: 'ig.me Deep Link + Auto-Copy' | 'Webhook / ManyChat URL';
  webhookUrl: string;
  autoCopyOnOpen: boolean;
}

export interface OutreachPersonaConfig {
  personaStyle:
    | 'High-Pitch Closer (Avinash Studio)'
    | 'Polite Hinglish Creator'
    | 'Direct B2B Studio'
    | 'Urgent Value Hook'
    | 'Fully Custom';
  customInstructions: string; // "Jaisa instruct ho waisa likhe"
  pricingNote: string;
  signatureName: string;
  portfolioUrl: string;
  defaultTone: PitchTone;
}

export interface WebhookInboundConfig {
  enabled: boolean;
  secretToken: string;
}

export type AiEngineProvider = 'groq' | 'gemini' | 'openai' | 'openrouter' | 'custom';

export interface ExternalAiConfig {
  selectedEngine: AiEngineProvider;
  providerName: string;
  geminiApiKey?: string;
  groqApiKey: string;
  groqModel: string;
  customEndpointUrl: string;
  customApiKey: string;
  customModel: string;
  creatorName: string;
  creatorPortfolioUrl: string;
  defaultTone: PitchTone;
}

export interface SupabaseDatabaseConfig {
  enabled: boolean;
  url: string;
  anonKey: string;
  serviceRoleKey?: string;
  connectionStatus?: 'connected' | 'tables_missing' | 'disconnected' | 'unconfigured';
  connectionError?: string;
  lastSyncedAt?: string;
}

export const GROQ_MODELS = [
  {
    id: 'llama-3.3-70b-versatile',
    label: 'Llama 3.3 70B Versatile (Best for Lead Finding & High-Pitch)',
  },
  {
    id: 'compound-beta',
    label: 'Groq Compound Beta (Web-Connected Agentic Model)',
  },
  {
    id: 'llama-3.1-8b-instant',
    label: 'Llama 3.1 8B Instant (Ultra-Fast Pitch & Extraction)',
  },
  {
    id: 'deepseek-r1-distill-llama-70b',
    label: 'DeepSeek R1 Distill Llama 70B (Deep Strategy & Reasoning)',
  },
  {
    id: 'qwen-qwq-32b',
    label: 'Qwen QwQ 32B (Structured JSON & Analysis)',
  },
];

export interface ActivityLogItem {
  id: string;
  timestamp: string;
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

export interface AppDatabase {
  leads: ClientLead[];
  smsConfig: SmsCloudConfig;
  emailConfig: EmailGatewayConfig;
  instaConfig: InstaAutomationConfig;
  personaConfig: OutreachPersonaConfig;
  webhookConfig: WebhookInboundConfig;
  aiConfig: ExternalAiConfig;
  supabaseConfig: SupabaseDatabaseConfig;
  suppressionList: string[];
  activityLogs: ActivityLogItem[];
}

