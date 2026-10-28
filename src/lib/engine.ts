import {
  AppDatabase,
  ClientLead,
  CreatorSkill,
  LeadPitches,
  PitchTone,
  SmsCloudConfig,
} from '../types/platform';

/**
 * Normalizes a phone number into clean E.164 format (no spaces, dashes, or brackets)
 * so Android SMS Gateway (api.sms-gate.app) never fails phone validation.
 */
export function normalizePhoneForSmsGate(rawPhone: string): string {
  const digitsAndPlus = (rawPhone || '').trim().replace(/[^\d+]/g, '');
  if (!digitsAndPlus) return '';
  if (digitsAndPlus.startsWith('+')) {
    return digitsAndPlus;
  }
  // If 10-digit Indian mobile number (starts with 6,7,8,9), auto-prefix +91
  if (digitsAndPlus.length === 10 && /^[6-9]\d{9}$/.test(digitsAndPlus)) {
    return `+91${digitsAndPlus}`;
  }
  // If 12-digit starting with 91, prefix +
  if (digitsAndPlus.length === 12 && digitsAndPlus.startsWith('91')) {
    return `+${digitsAndPlus}`;
  }
  return `+${digitsAndPlus}`;
}

/**
 * 1. CONVERSION PROBABILITY SCORING ENGINE
 * Ranks leads by how likely they are to reply & hire Avinash Studio so the highest-converting
 * leads always sit at #1.
 */
export function calculateLeadConversionScore(input: {
  businessName: string;
  niche: string;
  matchedSkill: CreatorSkill;
  painPoint: string;
  email: string;
  phone: string;
  instaHandle: string;
  websiteUrl: string;
}): { score: number; reasons: string[] } {
  let score = 22;
  const reasons: string[] = [];

  const hasEmail = Boolean(input.email && input.email.includes('@'));
  const hasPhone = Boolean(input.phone && input.phone.replace(/\D/g, '').length >= 7);
  const hasInsta = Boolean(input.instaHandle && input.instaHandle.trim().length > 1);
  const hasWebsite = Boolean(
    input.websiteUrl &&
      input.websiteUrl.trim().length > 4 &&
      !input.websiteUrl.toLowerCase().includes('none') &&
      !input.websiteUrl.toLowerCase().includes('no website')
  );

  // Contact reachability (up to +36 points)
  if (hasPhone) {
    score += 13;
    reasons.push('Direct SIM/Mobile number available (+13%)');
  }
  if (hasInsta) {
    score += 12;
    reasons.push(
      `Active Instagram handle ${formatInstaHandle(input.instaHandle)} for instant DM (+12%)`
    );
  }
  if (hasEmail) {
    score += 11;
    reasons.push('Verified business email address (+11%)');
  }

  // Pain point & conversion urgency (up to +32 points)
  const painLower = (input.painPoint || '').toLowerCase();
  if (
    !hasWebsite &&
    (input.matchedSkill === 'Business Website & Landing Page' ||
      input.matchedSkill === 'E-Commerce & Product Storefront')
  ) {
    score += 24;
    reasons.push('High-urgency gap: Active business with NO website / landing page (+24%)');
  } else if (
    painLower.includes('no website') ||
    painLower.includes('broken') ||
    painLower.includes('linktree') ||
    painLower.includes('dm for price') ||
    painLower.includes('outdated') ||
    painLower.includes('low views') ||
    painLower.includes('running ads') ||
    painLower.includes('whatsapp')
  ) {
    score += 22;
    reasons.push(`High buyer intent signal: "${input.painPoint}" (+22%)`);
  } else if (input.painPoint && input.painPoint.trim().length > 12) {
    score += 15;
    reasons.push(`Specific opportunity identified: ${input.painPoint} (+15%)`);
  }

  // Multi-channel bonus (+10 points if reachable on all 3 channels: Email + SMS + Insta)
  if (hasEmail && hasPhone && hasInsta) {
    score += 10;
    reasons.push('Omnichannel reach: Email + SMS + Instagram DM all available (+10%)');
  } else if ((hasPhone && hasInsta) || (hasEmail && hasInsta) || (hasEmail && hasPhone)) {
    score += 5;
    reasons.push('2 direct contact channels available (+5%)');
  }

  const finalScore = Math.min(99, Math.max(15, score));
  return { score: finalScore, reasons };
}

export function cleanContactField(raw: string): string {
  const val = (raw || '').trim();
  if (!val) return '';
  if (
    /^(not\s+publicly\s+listed|not\s+listed|not\s+available|n\/a|na|none|null|undefined|unlisted|no\s+email|no\s+phone|no\s+instagram|-)$/i.test(
      val.replace(/^@+/, '').trim()
    )
  ) {
    return '';
  }
  return val;
}

export function formatInstaHandle(raw: string): string {
  const valid = cleanContactField(raw);
  if (!valid) return '';
  const cleaned = valid
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/\/+$/, '')
    .replace(/^@+/, '')
    .trim();
  if (!cleaned || /\s/.test(cleaned)) return '';
  return `@${cleaned}`;
}

export function getInstaUsernameOnly(raw: string): string {
  return formatInstaHandle(raw).replace(/^@/, '');
}

/**
 * 2. AVINASH STUDIO HIGH-PITCH GENERATOR (EMAIL, SIM SMS & INSTAGRAM DM)
 * Built around high-conversion freelance & studio closing psychology:
 * - Zero-risk "Free Custom Live Demo First" hook
 * - Specific revenue/lead leak observation
 * - Fast 72-hour delivery from Avinash Studio
 */
export function generateLeadPitches(input: {
  businessName: string;
  contactPerson?: string;
  niche: string;
  location?: string;
  matchedSkill: CreatorSkill;
  painPoint: string;
  instaHandle?: string;
  creatorName?: string;
  creatorPortfolioUrl?: string;
  tone?: PitchTone;
  customInstructions?: string;
  pricingNote?: string;
}): LeadPitches {
  const biz = input.businessName.trim() || 'your brand';
  const person = input.contactPerson?.trim() || `${biz} Team`;
  const skill = input.matchedSkill;
  const pain = input.painPoint?.trim() || `growing ${biz} online`;
  const creator = input.creatorName?.trim() || 'Avinash — Avinash Studio';
  const portfolio = input.creatorPortfolioUrl?.trim() || 'https://avinashstudio.com/work';
  const tone = input.tone || 'High-Pitch Closer (Free Demo Hook)';
  const customNote = input.customInstructions?.trim() || '';
  const pricingLine = input.pricingNote?.trim()
    ? `\n• Offer Note: ${input.pricingNote.trim()}`
    : '';

  const skillOfferMap: Record<CreatorSkill, string> = {
    'Business Website & Landing Page':
      'a high-converting mobile-first website & instant WhatsApp/appointment booking landing page',
    'E-Commerce & Product Storefront':
      'a 2-click E-Commerce Storefront where customers pay & order directly instead of dropping off in DMs',
    'Social Media Graphics & Posters':
      'a high-converting pack of scroll-stopping promotional posters & ad creatives',
    'Short-Form Video Ads & Reels':
      'high-retention 30s Reels & video ads with viral hooks that turn viewers into paying clients',
    'Digital Ad Banners & Product Visuals':
      'studio-grade product visuals and high-CTR ad banners ready for Meta & Google campaigns',
    'Complete Brand Kit & Marketing Copy':
      'a complete brand identity kit, sales copy, and 30-day conversion content system',
  };

  const offerPhrase = skillOfferMap[skill] || 'high-converting web and creative assets';

  // MODE 1: HIGH-PITCH CLOSER (FREE DEMO HOOK — DEFAULT FOR AVINASH STUDIO)
  if (tone === 'High-Pitch Closer (Free Demo Hook)') {
    const emailSubject = `Built a custom ${skill} preview for ${biz} (Zero cost to view)`;
    const emailBody = `Hi ${person},

Main Avinash bol raha hu from Avinash Studio. Main abhi ${biz} (${input.niche}${input.location ? `, ${input.location}` : ''}) ka online presence review kar raha tha.

Maine ek direct conversion gap notice kiya jiski wajah se aap daily leads/customers miss kar rahe hain:
→ ${pain}.

Sirf pitch karne ke bajaye, humne Avinash Studio me ${biz} ke liye ${offerPhrase} ka ek 1-Screen Live Concept Demo plan kiya hai:
• Zero Risk: Pehle aap demo dekhein — pasand aaye tabhi hum aage baat karenge.
• Fast Turnaround: 3–4 days me 100% ready-to-launch delivery.${pricingLine}

Recent Studio Work: ${portfolio}

Bas is email par "DEMO" reply karein, aur main 2 minute me aapka custom preview link share karta hu!

Best regards,
${creator}`;

    const smsText = `Hi ${person} (${biz})! Avinash here from Avinash Studio. Noticed: ${pain.toLowerCase()}. Maine ${biz} ke liye ek custom ${skill} demo concept ready kiya hai (free to preview). Reply "DEMO" ya check karein: ${portfolio}`;

    const instaDmText = `Hey ${biz} team! 👋 Avinash here from Avinash Studio. Loved your ${input.niche} page! Quick thing I noticed: ${pain.toLowerCase()}. Maine ${biz} ke liye ${offerPhrase} ka ek custom visual mockup idea ready kiya hai — mind if I drop the free preview link here?`;

    const followUp1Text = `Hi ${person}! Avinash from Avinash Studio here. Bas check kar raha tha — kya main ${biz} ka custom ${skill.toLowerCase()} demo link yaha bhej du? Takes 30 seconds to check out!`;

    const followUp2Text = `Hi ${person}, final check-in from Avinash Studio! Agar abhi ${skill.toLowerCase()} priority nahi hai toh bilkul koi baat nahi. Jab bhi ${biz} ko high-converting website, ads ya creatives chahiye ho, bas "DEMO" reply kar dijiyega. Wishing you massive growth!`;

    return {
      emailSubject,
      emailBody,
      smsText,
      instaDmText,
      followUp1Text,
      followUp2Text,
    };
  }

  // MODE 2: FULLY CUSTOM PERSONA ("Jaisa instruct ho waisa likhe")
  if (tone === 'Fully Custom Persona' && customNote) {
    const emailSubject = `${biz} — ${skill} Idea from Avinash Studio`;
    const emailBody = `Namaste ${person},

${customNote}

Specific observation for ${biz} (${input.niche}): ${pain}.
Hum Avinash Studio me aapke liye ${offerPhrase} ready kar sakte hain.${pricingLine}

Work & Samples: ${portfolio}

Best regards,
${creator}`;

    const smsText = `Namaste ${person} (${biz})! ${pain}. Hum Avinash Studio me ${skill} ready karte hain (${input.pricingNote || 'direct studio rates'}). Sample: ${portfolio} - ${creator}`;
    const instaDmText = `Hey ${biz}! 👋 Avinash Studio here. ${pain}. ${customNote.slice(0, 120)} Sample link: ${portfolio}`;
    const followUp1Text = `Namaste ${person}! Avinash Studio se ek quick follow-up regarding ${biz}'s ${skill.toLowerCase()}. Kya aap free demo preview dekhna chahenge? - ${creator}`;
    const followUp2Text = `Hi ${person}, final check-in from Avinash Studio for ${biz}. Jab bhi ${skill.toLowerCase()} ya creative work ki zaroorat ho, direct reply karein! - ${creator}`;

    return {
      emailSubject,
      emailBody,
      smsText,
      instaDmText,
      followUp1Text,
      followUp2Text,
    };
  }

  // MODE 3: FRIENDLY HINGLISH + ENGLISH
  if (tone === 'Friendly Hinglish + English') {
    const emailSubject = `Quick ${skill} idea for ${biz} — Avinash Studio`;
    const emailBody = `Hi ${person},

Main Avinash hu from Avinash Studio. Abhi ${biz} (${input.niche}) ka page dekh raha tha — great work!

Maine notice kiya: ${pain}.
Agar hum iske liye ${offerPhrase} setup kar dein, toh aapke daily enquiries aur orders kaafi tezi se badh sakte hain.${pricingLine}

Mere recent samples yaha dekhein: ${portfolio}

Kya main ${biz} ke liye 2-minute ka free custom mockup bhejoon? Let me know!

Best,
${creator}`;

    const smsText = `Hi ${person} (${biz})! Avinash from Avinash Studio here. Noticed ${pain.toLowerCase()}. Main aapke liye ${skill.toLowerCase()} ready kar sakta hu jo direct clients laye. Free sample dekhenge? (${portfolio})`;

    const instaDmText = `Hey ${biz}! 👋 Avinash here from Avinash Studio. Loved your ${input.niche} work! Quick observation: ${pain}. Main ${offerPhrase} banata hu. Can I send a quick 1-page mockup idea for ${biz}?`;

    const followUp1Text = `Hey ${person}! Avinash from Avinash Studio — kya aapko ${biz} ke ${skill.toLowerCase()} mockup ka message mila? Happy to share a free preview link whenever convenient!`;
    const followUp2Text = `Hi ${person}, last check-in from Avinash Studio! Jab bhi next website, store ya ad campaign launch karein, just reply here. Wishing ${biz} great growth!`;

    return {
      emailSubject,
      emailBody,
      smsText,
      instaDmText,
      followUp1Text,
      followUp2Text,
    };
  }

  // MODE 4: SHORT 2-LINE VALUE HOOK
  if (tone === 'Short Value Hook') {
    const emailSubject = `2-min ${skill.toLowerCase()} idea for ${biz} (Avinash Studio)`;
    const emailBody = `Hi ${person},

Saw ${biz} while researching top ${input.niche} brands${input.location ? ` in ${input.location}` : ''}.

Noticed one quick win: ${pain}.
At Avinash Studio, I build ${offerPhrase} in 3–5 days.${pricingLine}

Recent samples: ${portfolio}

Open to seeing a free 1-screen mockup tailored to ${biz} today?

— ${creator}`;

    const smsText = `Hi ${person}, Avinash from Avinash Studio. Saw ${biz} (${input.niche}) & noticed ${pain.toLowerCase()} — I can build ${offerPhrase} this week. Want a free mockup link? (${portfolio})`;

    const instaDmText = `Hey ${biz}! 👋 Avinash Studio here. Love your ${input.niche} page! Noticed ${pain.toLowerCase()} — I build ${offerPhrase}. Can I DM you a free visual concept for ${biz}?`;

    const followUp1Text = `Hi ${person}, Avinash from Avinash Studio bumping this — would love to send over that free custom ${skill.toLowerCase()} concept for ${biz} if you're open!`;
    const followUp2Text = `Hi ${person}, closing the loop for now! Reach out to Avinash Studio anytime ${biz} needs ${skill.toLowerCase()} or ad creatives. — ${creator}`;

    return {
      emailSubject,
      emailBody,
      smsText,
      instaDmText,
      followUp1Text,
      followUp2Text,
    };
  }

  // MODE 5: DIRECT & PROFESSIONAL B2B
  const emailSubject = `Custom ${skill} Proposal for ${biz} — Avinash Studio`;
  const emailBody = `Hi ${person},

I came across ${biz} while reviewing leading ${input.niche} businesses${input.location ? ` in ${input.location}` : ''}.

While looking at your current funnel, I noticed: ${pain}.
At Avinash Studio, I help ${input.niche} brands solve this by building ${offerPhrase} engineered to convert visitors into paying clients.${pricingLine}

Portfolio & live work: ${portfolio}

If you are open to it, I would love to share a complimentary, no-obligation preview of how this would look for ${biz}. Would that be helpful?

Best regards,
${creator}`;

  const smsText = `Hi ${person} (${biz}) — Avinash from Avinash Studio. Noticed ${pain.toLowerCase()}. I build ${offerPhrase} for ${input.niche} brands. Open to a quick sample preview? (${portfolio})`;

  const instaDmText = `Hi ${biz} team! 👋 Avinash from Avinash Studio here. Really impressed by your work in ${input.niche}. I noticed ${pain.toLowerCase()} and put together a quick idea for ${offerPhrase}. Mind if I drop the sample link here?`;

  const followUp1Text = `Hi ${person}, following up from Avinash Studio regarding ${biz}'s ${skill.toLowerCase()}. Let me know if you'd like me to send over the 2-minute concept preview this week.`;
  const followUp2Text = `Hi ${person}, final follow-up from Avinash Studio so I don't clutter your inbox. If ${biz} needs websites, landing pages, or ad creatives down the road, feel free to reply anytime. Best, ${creator}`;

  return {
    emailSubject,
    emailBody,
    smsText,
    instaDmText,
    followUp1Text,
    followUp2Text,
  };
}

/**
 * 3. READY-TO-COPY PROMPT GENERATOR FOR EXTERNAL AI AGENTS (ChatGPT / Perplexity / Claude / Gemini)
 */
export function buildAgentResearchPrompt(params: {
  skill: CreatorSkill;
  niche: string;
  location: string;
  count?: number;
}): string {
  const count = params.count || 15;
  const niche = params.niche.trim() || 'Clinics, Gyms, D2C Brands & Local Businesses';
  const loc = params.location.trim() || 'India / US / UK / Dubai';

  return `Act as an expert B2B Lead Researcher for Avinash Studio. Search the live web, Google Maps, and Instagram to find ${count} REAL, GENUINE, active businesses in the "${niche}" niche located in "${loc}" that urgently need "${params.skill}".

STRICT RULES:
1. DO NOT invent fake or mock companies. Only include real businesses with real public contact details (Phone / WhatsApp, Email, or Instagram handle).
2. Prioritize businesses with high conversion probability (e.g., active Instagram page or Google Maps listing with reviews, running ads or taking orders via DM/WhatsApp, but missing a modern conversion website, e-commerce checkout, or high-quality reels/ad posters).

Output ONLY a valid JSON array (no extra text) with these exact keys:
[
  {
    "businessName": "Real Business Name",
    "contactPerson": "Owner / Founder Name or Team",
    "niche": "${niche}",
    "location": "${loc}",
    "matchedSkill": "${params.skill}",
    "painPoint": "Exact 1-line gap observed on their page/site and why they will hire Avinash Studio",
    "email": "real public business email",
    "phone": "real public phone / WhatsApp number with country code",
    "instaHandle": "@real_instagram_handle",
    "websiteUrl": "current website URL or 'No website'",
    "estimatedDealValue": "e.g. ₹25,000 or $500"
  }
]`;
}

/**
 * 4. UNIVERSAL AI OUTPUT, JSON & CSV/TEXT PARSER
 */
export function parseRawAiLeadsInput(
  rawText: string,
  defaults: {
    defaultSkill?: CreatorSkill;
    creatorName?: string;
    creatorPortfolioUrl?: string;
    tone?: PitchTone;
    customInstructions?: string;
    pricingNote?: string;
    sourceLabel?: ClientLead['source'];
  } = {}
): ClientLead[] {
  const trimmed = (rawText || '').trim();
  if (!trimmed) return [];

  const defaultSkill = defaults.defaultSkill || 'Business Website & Landing Page';
  const rawRecords: Partial<{
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
    estimatedDealValue: string;
  }>[] = [];

  // Strategy A: JSON array or JSON object with .leads
  try {
    const jsonCandidate = trimmed.match(/\[[\s\S]*\]/)?.[0] || trimmed;
    const parsed = JSON.parse(jsonCandidate);
    const arr = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.leads)
      ? parsed.leads
      : Array.isArray(parsed?.db?.leads)
      ? parsed.db.leads
      : null;

    if (arr) {
      for (const item of arr) {
        if (
          item &&
          typeof item === 'object' &&
          (item.businessName || item.company_name || item.name || item.company || item.Business_Name)
        ) {
          rawRecords.push({
            businessName: String(
              item.businessName ||
                item.Business_Name ||
                item.company_name ||
                item.name ||
                item.company ||
                ''
            ).trim(),
            contactPerson: String(
              item.contactPerson ||
                item.Contact_Person ||
                item.contact_person ||
                item.owner ||
                item.contact ||
                ''
            ).trim(),
            niche: String(
              item.niche || item.Niche || item.category || item.industry || 'Business'
            ).trim(),
            location: String(
              item.location || item.Location || item.city || item.route_area || ''
            ).trim(),
            matchedSkill:
              (item.matchedSkill as CreatorSkill) ||
              (item.Matched_Skill as CreatorSkill) ||
              defaultSkill,
            painPoint: String(
              item.painPoint ||
                item.Pain_Point ||
                item.reason ||
                item.gap ||
                `High conversion fit for ${defaultSkill}`
            ).trim(),
            email: String(item.email || item.Email || '').trim(),
            phone: String(
              item.phone || item.Phone || item.mobile || item.phoneNumber || ''
            ).trim(),
            instaHandle: String(
              item.instaHandle || item.Instagram || item.instagram || item.insta || ''
            ).trim(),
            websiteUrl: String(
              item.websiteUrl || item.website || item.Website || 'No website'
            ).trim(),
            estimatedDealValue: String(item.estimatedDealValue || item.dealValue || '').trim(),
          });
        }
      }
    }
  } catch {
    // Fall through to CSV / Markdown Table / Line parser
  }

  // Strategy B: Markdown Tables, CSV lines, or freeform line blocks
  if (rawRecords.length === 0) {
    const lines = trimmed
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !/^[-|:\s]+$/.test(l));

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (
        i === 0 &&
        /business[\s_]*name|company|conversion[\s_]*score|email|phone|instagram/i.test(line) &&
        (line.includes(',') || line.includes('|'))
      ) {
        continue;
      }

      const emailMatch = line.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      const phoneMatch = line.match(
        /(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{3,5}\)?[\s-]?)?\d{3,5}[\s-]?\d{4,5}/
      );
      const instaMatch =
        line.match(/@([a-zA-Z0-9._]{2,30})/) ||
        line.match(/instagram\.com\/([a-zA-Z0-9._]{2,30})/i);

      const delimiter = line.includes('|') ? '|' : line.includes(',') ? ',' : null;
      if (delimiter) {
        const parts = line
          .split(delimiter)
          .map((p) => p.replace(/^["'\s]+|["'\s]+$/g, '').trim())
          .filter(Boolean);
        if (parts.length >= 2) {
          const startIdx = /^\d+%$/.test(parts[0]) ? 1 : 0;
          const bizName = parts[startIdx];
          if (!bizName || bizName.toLowerCase() === 'businessname') continue;
          rawRecords.push({
            businessName: bizName,
            niche:
              parts[startIdx + 1] && !parts[startIdx + 1].includes('@')
                ? parts[startIdx + 1]
                : 'Target Business',
            email: emailMatch ? emailMatch[0] : '',
            phone: phoneMatch ? phoneMatch[0].trim() : '',
            instaHandle: instaMatch ? `@${instaMatch[1].replace(/^@/, '')}` : '',
            painPoint:
              parts.find((p) => p.length > 22 && !p.includes('@') && !p.startsWith('http')) ||
              `Needs ${defaultSkill} to convert more clients`,
            matchedSkill: defaultSkill,
            websiteUrl: 'No website',
          });
          continue;
        }
      }

      if (emailMatch || phoneMatch || instaMatch) {
        const cleanedTitle = line
          .replace(emailMatch?.[0] || '', '')
          .replace(phoneMatch?.[0] || '', '')
          .replace(instaMatch?.[0] || '', '')
          .replace(/[-|,;:]+/g, ' ')
          .trim();
        const words = cleanedTitle.split(/\s+/).slice(0, 4).join(' ');
        rawRecords.push({
          businessName: words || `Client Prospect #${i + 1}`,
          niche: 'Business',
          email: emailMatch ? emailMatch[0] : '',
          phone: phoneMatch ? phoneMatch[0].trim() : '',
          instaHandle: instaMatch ? `@${instaMatch[1].replace(/^@/, '')}` : '',
          painPoint: `Direct contact extracted — ready for Avinash Studio ${defaultSkill} pitch`,
          matchedSkill: defaultSkill,
          websiteUrl: 'No website',
        });
      }
    }
  }

  const now = new Date();
  const followUpDate = new Date(now.getTime() + 2 * 86400000).toISOString().slice(0, 10);

  const leads: ClientLead[] = rawRecords
    .filter((r) => Boolean(r.businessName))
    .map((r, idx) => {
      const businessName = r.businessName || `Lead ${idx + 1}`;
      const niche = r.niche || 'Business';
      const location = r.location || '';
      const matchedSkill = r.matchedSkill || defaultSkill;
      const painPoint =
        r.painPoint || `Active in ${niche} — high conversion fit for ${matchedSkill}`;
      const email = cleanContactField(r.email || '');
      const phone = cleanContactField(r.phone || '');
      const instaHandle = formatInstaHandle(r.instaHandle || '');
      const websiteUrl = cleanContactField(r.websiteUrl || '') || 'No website';

      const { score, reasons } = calculateLeadConversionScore({
        businessName,
        niche,
        matchedSkill,
        painPoint,
        email,
        phone,
        instaHandle,
        websiteUrl,
      });

      const pitches = generateLeadPitches({
        businessName,
        contactPerson: r.contactPerson,
        niche,
        location,
        matchedSkill,
        painPoint,
        instaHandle,
        creatorName: defaults.creatorName || 'Avinash — Avinash Studio',
        creatorPortfolioUrl: defaults.creatorPortfolioUrl || 'https://avinashstudio.com/work',
        tone: defaults.tone || 'High-Pitch Closer (Free Demo Hook)',
        customInstructions: defaults.customInstructions,
        pricingNote: defaults.pricingNote,
      });

      return {
        id: `lead-${Date.now()}-${idx}`,
        businessName,
        contactPerson: r.contactPerson || `${businessName} Owner`,
        niche,
        location,
        matchedSkill,
        painPoint,
        email,
        phone,
        instaHandle,
        websiteUrl,
        estimatedDealValue: r.estimatedDealValue || undefined,
        conversionScore: score,
        conversionReasons: reasons,
        status: 'New — High Priority',
        lastContactedAt: null,
        nextFollowUpDate: followUpDate,
        pitches,
        outreachHistory: [],
        source: defaults.sourceLabel || 'Pasted from AI Agent',
        createdAt: now.toISOString().slice(0, 10),
      };
    });

  return leads.sort((a, b) => b.conversionScore - a.conversionScore);
}

/**
 * 4.5 SUPABASE RELATIONAL ROW <-> CLIENT LEAD SERIALIZERS
 * Converts ClientLead objects cleanly to/from the `public.avinash_leads` PostgreSQL table.
 */
export interface SupabaseLeadRow {
  id: string;
  business_name: string;
  contact_person: string;
  niche: string;
  location: string;
  matched_skill: string;
  pain_point: string;
  email: string;
  phone: string;
  insta_handle: string;
  website_url: string;
  estimated_deal_value: string | null;
  conversion_score: number;
  conversion_reasons: string[];
  status: string;
  last_contacted_at: string | null;
  next_follow_up_date: string;
  pitches: LeadPitches;
  outreach_history: ClientLead['outreachHistory'];
  source: string;
  created_at: string;
  updated_at?: string;
}

export function leadToSupabaseRow(lead: ClientLead): SupabaseLeadRow {
  return {
    id: lead.id,
    business_name: lead.businessName,
    contact_person: lead.contactPerson || '',
    niche: lead.niche || '',
    location: lead.location || '',
    matched_skill: lead.matchedSkill || 'Business Website & Landing Page',
    pain_point: lead.painPoint || '',
    email: cleanContactField(lead.email || ''),
    phone: cleanContactField(lead.phone || ''),
    insta_handle: formatInstaHandle(lead.instaHandle || ''),
    website_url: lead.websiteUrl || 'No website',
    estimated_deal_value: lead.estimatedDealValue || null,
    conversion_score: Number(lead.conversionScore) || 50,
    conversion_reasons: Array.isArray(lead.conversionReasons) ? lead.conversionReasons : [],
    status: lead.status || 'New — High Priority',
    last_contacted_at: lead.lastContactedAt || null,
    next_follow_up_date: lead.nextFollowUpDate || '',
    pitches: lead.pitches,
    outreach_history: Array.isArray(lead.outreachHistory) ? lead.outreachHistory : [],
    source: lead.source || 'Manual Entry',
    created_at: lead.createdAt || new Date().toISOString().slice(0, 10),
    updated_at: new Date().toISOString(),
  };
}

export function supabaseRowToLead(row: any): ClientLead {
  const matchedSkill: CreatorSkill =
    row.matched_skill || 'Business Website & Landing Page';
  const businessName = String(row.business_name || 'Client Business');
  const niche = String(row.niche || 'Business');
  const location = String(row.location || '');
  const painPoint = String(row.pain_point || '');
  const instaHandle = formatInstaHandle(String(row.insta_handle || ''));

  const fallbackPitches = generateLeadPitches({
    businessName,
    contactPerson: row.contact_person,
    niche,
    location,
    matchedSkill,
    painPoint,
    instaHandle,
  });

  const pitches: LeadPitches =
    row.pitches && typeof row.pitches === 'object' && row.pitches.emailSubject
      ? {
          emailSubject: String(row.pitches.emailSubject || fallbackPitches.emailSubject),
          emailBody: String(row.pitches.emailBody || fallbackPitches.emailBody),
          smsText: String(row.pitches.smsText || fallbackPitches.smsText),
          instaDmText: String(row.pitches.instaDmText || fallbackPitches.instaDmText),
          followUp1Text: String(row.pitches.followUp1Text || fallbackPitches.followUp1Text),
          followUp2Text: String(row.pitches.followUp2Text || fallbackPitches.followUp2Text),
        }
      : fallbackPitches;

  return {
    id: String(row.id),
    businessName,
    contactPerson: String(row.contact_person || `${businessName} Owner`),
    niche,
    location,
    matchedSkill,
    painPoint,
    email: cleanContactField(String(row.email || '')),
    phone: cleanContactField(String(row.phone || '')),
    instaHandle,
    websiteUrl: String(row.website_url || 'No website'),
    estimatedDealValue: row.estimated_deal_value ? String(row.estimated_deal_value) : undefined,
    conversionScore: Number(row.conversion_score) || 50,
    conversionReasons: Array.isArray(row.conversion_reasons) ? row.conversion_reasons : [],
    status: (row.status as ClientLead['status']) || 'New — High Priority',
    lastContactedAt: row.last_contacted_at ? String(row.last_contacted_at) : null,
    nextFollowUpDate: String(
      row.next_follow_up_date || new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10)
    ),
    pitches,
    outreachHistory: Array.isArray(row.outreach_history) ? row.outreach_history : [],
    source: (row.source as ClientLead['source']) || 'Manual Entry',
    createdAt: String(row.created_at || new Date().toISOString().slice(0, 10)),
  };
}

/**
 * 5. PORTABLE JSON / CSV WORKSPACE BACKUP & RESTORE (ZERO DATABASE HASSLE)
 */
export function serializeWorkspaceBackup(db: AppDatabase): string {
  return JSON.stringify(
    {
      studio: 'Avinash Studio',
      version: '4.0',
      exportedAt: new Date().toISOString(),
      leadsCount: db.leads.length,
      db,
    },
    null,
    2
  );
}

export function parsePortableImportData(
  rawContent: string,
  currentDb: AppDatabase
):
  | {
      mode: 'full_backup' | 'leads_merge';
      importedLeadsCount: number;
      nextDb: AppDatabase;
    }
  | { error: string } {
  const trimmed = (rawContent || '').trim();
  if (!trimmed) {
    return { error: 'File or input is empty.' };
  }

  // Check if it's a full JSON workspace backup
  try {
    const parsed = JSON.parse(trimmed);
    const candidateDb = (parsed?.db || parsed) as Partial<AppDatabase>;
    if (
      candidateDb &&
      Array.isArray(candidateDb.leads) &&
      candidateDb.smsConfig &&
      candidateDb.personaConfig
    ) {
      const mergedDb: AppDatabase = {
        ...currentDb,
        ...candidateDb,
        leads: [...candidateDb.leads].sort((a, b) => b.conversionScore - a.conversionScore),
      };
      return {
        mode: 'full_backup',
        importedLeadsCount: mergedDb.leads.length,
        nextDb: mergedDb,
      };
    }
  } catch {
    // Not a full AppDatabase JSON object; try parsing as leads array / CSV / Markdown
  }

  const extractedLeads = parseRawAiLeadsInput(trimmed, {
    defaultSkill: 'Business Website & Landing Page',
    creatorName: currentDb.personaConfig.signatureName,
    creatorPortfolioUrl: currentDb.personaConfig.portfolioUrl,
    tone: currentDb.personaConfig.defaultTone,
    customInstructions: currentDb.personaConfig.customInstructions,
    pricingNote: currentDb.personaConfig.pricingNote,
    sourceLabel: 'JSON / CSV Import',
  });

  if (extractedLeads.length === 0) {
    return {
      error:
        'Could not find valid leads or backup JSON. Upload a valid .json backup, .json leads array, or .csv file.',
    };
  }

  const nextDb: AppDatabase = {
    ...currentDb,
    leads: [...extractedLeads, ...currentDb.leads].sort(
      (a, b) => b.conversionScore - a.conversionScore
    ),
  };

  return {
    mode: 'leads_merge',
    importedLeadsCount: extractedLeads.length,
    nextDb,
  };
}

/**
 * 6. DIRECT ANDROID SMS GATEWAY CLOUD SERVER REQUEST BUILDER
 * Fixes the `api.sms-gate.app` schema validation error:
 * `{"message":"failed to validate: conflict fields: must specify exactly one of: textMessage, dataMessage or mmsMessage"}`
 * by sending ONLY `textMessage: { text }` (never both `textMessage` and `message`),
 * normalizing phone numbers to E.164 without spaces, and ignoring placeholder deviceIds.
 */
export function buildSmsCloudRequest(
  config: SmsCloudConfig,
  phone: string,
  message: string
): {
  url: string;
  devicesUrl: string;
  method: 'POST';
  headers: Record<string, string>;
  body: string;
} {
  const normalizedPhone = normalizePhoneForSmsGate(phone);
  const baseServer = (config.serverAddress || 'https://api.sms-gate.app')
    .trim()
    .replace(/\/+$/, '');

  const endpointUrl =
    baseServer.includes('/3rdparty/') || baseServer.includes('/message')
      ? baseServer
      : `${baseServer}/3rdparty/v1/messages?skipPhoneValidation=true`;

  const cleanRoot = baseServer
    .replace(/\/3rdparty\/v1\/.*$/i, '')
    .replace(/\/message.*$/i, '');
  const devicesUrl = `${cleanRoot}/3rdparty/v1/devices`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (config.username && config.password) {
    const rawCreds = `${config.username.trim()}:${config.password.trim()}`;
    const base64Creds =
      typeof Buffer !== 'undefined'
        ? Buffer.from(rawCreds).toString('base64')
        : btoa(rawCreds);
    headers['Authorization'] = `Basic ${base64Creds}`;
  }

  // IMPORTANT: api.sms-gate.app strictly requires ONLY `textMessage: { text }`
  // and rejects requests that include both `textMessage` and `message`.
  const payload: Record<string, unknown> = {
    textMessage: {
      text: message,
    },
    phoneNumbers: [normalizedPhone],
    simNumber: Number(config.simSlot) === 2 ? 2 : 1,
  };

  const cleanDeviceId = (config.deviceId || '').trim();
  if (
    cleanDeviceId &&
    cleanDeviceId !== 'android-sim1-primary' &&
    cleanDeviceId !== 'default'
  ) {
    payload.deviceId = cleanDeviceId;
  }

  return {
    url: endpointUrl,
    devicesUrl,
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  };
}

/**
 * 7. EXTERNAL BOT / SCRAPER WEBHOOK SNIPPET GENERATOR (cURL, Python, Markdown Table)
 */
export function buildWebhookCodeSnippets(
  baseUrl: string,
  secretToken: string
): {
  curl: string;
  python: string;
  markdown: string;
} {
  const cleanUrl = (baseUrl || 'http://localhost:3000').replace(/\/+$/, '');
  const endpoint = `${cleanUrl}/api/external/leads`;

  const curl = `curl -X POST "${endpoint}" \\
  -H "Authorization: Bearer ${secretToken}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "businessName": "Real Client Business Name",
    "contactPerson": "Founder / Manager",
    "niche": "Business Category",
    "location": "City, Country",
    "matchedSkill": "Business Website & Landing Page",
    "painPoint": "Exact conversion gap observed on their page",
    "phone": "+919800000000",
    "email": "contact@business.com",
    "instaHandle": "@business_handle"
  }'`;

  const python = `import requests

url = "${endpoint}"
headers = {
    "Authorization": "Bearer ${secretToken}",
    "Content-Type": "application/json"
}
leads = [
    {
        "businessName": "Real Business Name",
        "niche": "D2C / Clinic / Agency",
        "location": "Mumbai",
        "matchedSkill": "E-Commerce & Product Storefront",
        "painPoint": "Taking orders manually in Instagram DMs instead of a 2-click storefront",
        "phone": "+919800000000",
        "email": "hello@business.in",
        "instaHandle": "@business.in"
    }
]

res = requests.post(url, json={"leads": leads}, headers=headers)
print(res.json())`;

  const markdown = `| Business Name | Niche | Phone | Email | Instagram | Why They Need Avinash Studio |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Real Business Name | Niche | +91 98000 00000 | info@domain.com | @insta_handle | Specific reason why they need a website, store, ad banner or reel |`;

  return { curl, python, markdown };
}

/**
 * 8. STUDIO PIPELINE METRICS CALCULATOR
 */
export function computeStudioPipelineMetrics(db: AppDatabase): {
  avgWinScore: number;
  totalLeads: number;
  hotLeadsCount: number;
  connectedCount: number;
  dailySentLabel: string;
} {
  const leads = Array.isArray(db.leads) ? db.leads : [];
  const totalLeads = leads.length;
  const avgWinScore =
    totalLeads > 0
      ? Math.round(leads.reduce((sum, l) => sum + (Number(l.conversionScore) || 0), 0) / totalLeads)
      : 0;
  const hotLeadsCount = leads.filter((l) => (Number(l.conversionScore) || 0) >= 85).length;
  const connectedCount = leads.filter((l) => l.status !== 'New — High Priority').length;
  const sentToday = db.emailConfig?.sentTodayCount ?? 0;
  const dailyLimit = db.emailConfig?.dailySendLimit ?? 40;

  return {
    avgWinScore,
    totalLeads,
    hotLeadsCount,
    connectedCount,
    dailySentLabel: `${sentToday}/${dailyLimit}`,
  };
}

