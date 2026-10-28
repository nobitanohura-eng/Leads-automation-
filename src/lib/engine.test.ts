import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateLeadPitches,
  parseRawAiLeadsInput,
  buildSmsCloudRequest,
  buildWebhookCodeSnippets,
  serializeWorkspaceBackup,
  parsePortableImportData,
  normalizePhoneForSmsGate,
  formatInstaHandle,
  leadToSupabaseRow,
  supabaseRowToLead,
  computeStudioPipelineMetrics,
} from './engine';
import {
  createInitialSeedDatabase,
  DEFAULT_SUPABASE_ANON_KEY,
  DEFAULT_SUPABASE_SERVICE_ROLE_KEY,
  DEFAULT_SUPABASE_URL,
} from './seedData';
import { extractSupabaseRefFromJwt, normalizeSupabaseUrl } from './supabaseDb';

test('createInitialSeedDatabase has zero mock leads and Avinash Studio defaults', () => {
  const seed = createInitialSeedDatabase();
  assert.equal(seed.leads.length, 0);
  assert.ok(seed.personaConfig.signatureName.includes('Avinash Studio'));
  assert.equal(seed.personaConfig.defaultTone, 'High-Pitch Closer (Free Demo Hook)');
  assert.equal(seed.smsConfig.deviceId, 'DwLpHi0cv9sshAQF2sOx6');
  assert.equal(seed.aiConfig.selectedEngine, 'gemini');
  assert.equal(seed.aiConfig.geminiApiKey, '');
  assert.equal(seed.supabaseConfig.url, DEFAULT_SUPABASE_URL);
  assert.equal(seed.supabaseConfig.anonKey, DEFAULT_SUPABASE_ANON_KEY);
  assert.equal(seed.supabaseConfig.serviceRoleKey, DEFAULT_SUPABASE_SERVICE_ROLE_KEY);
});

test('normalizeSupabaseUrl converts dashboard URLs and JWT refs to https://<ref>.supabase.co', () => {
  assert.equal(
    normalizeSupabaseUrl('https://supabase.com/dashboard/project/ybywcdbxelmolbnfaqwk/settings/api-keys'),
    'https://ybywcdbxelmolbnfaqwk.supabase.co'
  );
  assert.equal(
    extractSupabaseRefFromJwt(DEFAULT_SUPABASE_ANON_KEY),
    'ybywcdbxelmolbnfaqwk'
  );
  assert.equal(
    normalizeSupabaseUrl('', DEFAULT_SUPABASE_SERVICE_ROLE_KEY),
    'https://ybywcdbxelmolbnfaqwk.supabase.co'
  );
});

test('formatInstaHandle strips placeholder values like Not publicly listed or N/A', () => {
  assert.equal(formatInstaHandle('Not publicly listed'), '');
  assert.equal(formatInstaHandle('@Not publicly listed'), '');
  assert.equal(formatInstaHandle('N/A'), '');
  assert.equal(formatInstaHandle('https://instagram.com/avinash.studio/'), '@avinash.studio');
});

test('generateLeadPitches builds Avinash Studio High-Pitch Closer pitches', () => {
  const pitches = generateLeadPitches({
    businessName: 'UrbanKicks Co',
    contactPerson: 'Aarav',
    niche: 'Streetwear D2C',
    location: 'Delhi',
    matchedSkill: 'E-Commerce & Product Storefront',
    painPoint: 'Taking orders manually in DMs instead of a 2-click website checkout',
    instaHandle: '@urbankicks',
    creatorName: 'Avinash — Avinash Studio',
    creatorPortfolioUrl: 'https://avinashstudio.com/work',
    tone: 'High-Pitch Closer (Free Demo Hook)',
  });

  assert.ok(pitches.emailSubject.includes('UrbanKicks Co'));
  assert.ok(pitches.emailBody.includes('Avinash Studio'));
  assert.ok(pitches.emailBody.includes('DEMO'));
  assert.ok(pitches.smsText.includes('Avinash Studio'));
  assert.ok(pitches.instaDmText.includes('Avinash Studio'));
});

test('parseRawAiLeadsInput parses JSON, cleans placeholders, and ranks by conversion score', () => {
  const rawJson = JSON.stringify([
    {
      businessName: 'Low Info Store',
      niche: 'Retail',
      matchedSkill: 'Social Media Graphics & Posters',
      painPoint: 'Needs posters',
      email: 'Not publicly listed',
      phone: '',
      instaHandle: 'Not publicly listed',
      websiteUrl: 'https://lowinfostore.com',
    },
    {
      businessName: 'Prime Skin Clinic',
      contactPerson: 'Dr. Ritu',
      niche: 'Dermatology',
      location: 'Mumbai',
      matchedSkill: 'Business Website & Landing Page',
      painPoint: 'Running ads with no website',
      email: 'dr@primeskin.in',
      phone: '+91 98201 12233',
      instaHandle: '@primeskin.mumbai',
      websiteUrl: 'No website',
    },
  ]);

  const parsed = parseRawAiLeadsInput(rawJson);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].businessName, 'Prime Skin Clinic');
  assert.equal(parsed[1].email, '');
  assert.equal(parsed[1].instaHandle, '');
  assert.ok(parsed[0].conversionScore > parsed[1].conversionScore);
  assert.ok(parsed[0].pitches.emailBody.includes('Avinash Studio'));
});

test('leadToSupabaseRow and supabaseRowToLead round-trip ClientLead accurately', () => {
  const parsed = parseRawAiLeadsInput(
    JSON.stringify([
      {
        businessName: 'Aura Skin Clinic',
        contactPerson: 'Dr. Neha',
        niche: 'Dermatology',
        location: 'Mumbai',
        matchedSkill: 'Business Website & Landing Page',
        painPoint: 'No booking page in Instagram bio',
        email: 'neha@auraskin.in',
        phone: '+91 98200 11223',
        instaHandle: '@auraskin',
        websiteUrl: 'No website',
        estimatedDealValue: '₹25,000',
      },
    ])
  );
  const original = parsed[0];
  const row = leadToSupabaseRow(original);
  assert.equal(row.business_name, 'Aura Skin Clinic');
  assert.equal(row.insta_handle, '@auraskin');

  const restored = supabaseRowToLead(row);
  assert.equal(restored.businessName, original.businessName);
  assert.equal(restored.phone, original.phone);
  assert.equal(restored.conversionScore, original.conversionScore);
  assert.equal(restored.pitches.emailSubject, original.pitches.emailSubject);
});

test('serializeWorkspaceBackup and parsePortableImportData handle full JSON backup and lead merges', () => {
  const initial = createInitialSeedDatabase();
  const sampleLeadsJson = JSON.stringify([
    {
      businessName: 'Glow Dental Clinic',
      contactPerson: 'Dr. Verma',
      niche: 'Dental',
      location: 'Pune',
      matchedSkill: 'Business Website & Landing Page',
      painPoint: 'No booking landing page on Instagram bio',
      email: 'info@glowdental.in',
      phone: '+91 98111 22333',
      instaHandle: '@glowdental',
      websiteUrl: 'No website',
    },
  ]);

  const mergeRes = parsePortableImportData(sampleLeadsJson, initial);
  assert.ok(!('error' in mergeRes));
  assert.equal(mergeRes.mode, 'leads_merge');
  assert.equal(mergeRes.importedLeadsCount, 1);

  const backupStr = serializeWorkspaceBackup(mergeRes.nextDb);
  const fullRestore = parsePortableImportData(backupStr, createInitialSeedDatabase());
  assert.ok(!('error' in fullRestore));
  assert.equal(fullRestore.mode, 'full_backup');
  assert.equal(fullRestore.importedLeadsCount, 1);
});

test('buildSmsCloudRequest sends ONLY textMessage (no conflicting message field) and normalizes phone numbers', () => {
  assert.equal(normalizePhoneForSmsGate('+91 8920636919'), '+918920636919');
  assert.equal(normalizePhoneForSmsGate('8920636919'), '+918920636919');

  const req = buildSmsCloudRequest(
    {
      enabled: true,
      connectionMode: 'cloud_server',
      serverAddress: 'https://api.sms-gate.app:443',
      username: '0JUV5I',
      password: '8vakfbsi_ftqxj',
      deviceId: 'DwLpHi0cv9sshAQF2sOx6',
      simSlot: 1,
      autoFollowUpSms: true,
    },
    '+91 8920636919',
    'Hello from Avinash Studio!'
  );

  assert.equal(
    req.url,
    'https://api.sms-gate.app:443/3rdparty/v1/messages?skipPhoneValidation=true'
  );
  assert.equal(req.devicesUrl, 'https://api.sms-gate.app:443/3rdparty/v1/devices');
  assert.ok(req.headers['Authorization']?.startsWith('Basic '));

  const parsedBody = JSON.parse(req.body);
  assert.equal(parsedBody.textMessage.text, 'Hello from Avinash Studio!');
  assert.equal(parsedBody.message, undefined);
  assert.deepEqual(parsedBody.phoneNumbers, ['+918920636919']);
  assert.equal(parsedBody.simNumber, 1);
  assert.equal(parsedBody.deviceId, 'DwLpHi0cv9sshAQF2sOx6');

  const snippets = buildWebhookCodeSnippets('https://avinashstudio.app', 'sec_123');
  assert.ok(snippets.curl.includes('/api/external/leads'));
});

test('computeStudioPipelineMetrics computes accurate win score and daily sent metrics', () => {
  const seed = createInitialSeedDatabase();
  const emptyStats = computeStudioPipelineMetrics(seed);
  assert.equal(emptyStats.avgWinScore, 0);
  assert.equal(emptyStats.totalLeads, 0);
  assert.equal(emptyStats.connectedCount, 0);
  assert.equal(emptyStats.dailySentLabel, '0/40');
});
