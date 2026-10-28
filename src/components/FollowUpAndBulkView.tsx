import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  Send,
  Smartphone,
  Mail,
  Instagram,
  Clock,
  RefreshCw,
  Zap,
  Activity,
} from 'lucide-react';
import { AppDatabase, ClientLead } from '../types/platform';
import { apiDispatchSms, apiDispatchEmail, apiDispatchInsta, apiUpdateLead } from '../lib/apiClient';

interface Props {
  db: AppDatabase;
  onUpdateDb?: (next: AppDatabase) => void;
  onRefreshDb?: (next: AppDatabase) => void;
  showToast?: (msg: string) => void;
  notify?: (msg: string, type?: 'success' | 'error') => void;
}

export const FollowUpAndBulkView: React.FC<Props> = ({
  db,
  onUpdateDb,
  onRefreshDb,
  showToast,
  notify,
}) => {
  const triggerRefresh = (next: AppDatabase) => {
    if (onRefreshDb) onRefreshDb(next);
    if (onUpdateDb) onUpdateDb(next);
  };

  const triggerToast = (msg: string, type?: 'success' | 'error') => {
    if (notify) notify(msg, type);
    else if (showToast) showToast(msg);
  };
  const [runningBulk, setRunningBulk] = useState(false);
  const [bulkChannel, setBulkChannel] = useState<'SMS' | 'Email'>('SMS');
  const [followUpStage, setFollowUpStage] = useState<'followUp1' | 'followUp2'>('followUp1');

  const sortedLeads = [...db.leads].sort((a, b) => b.conversionScore - a.conversionScore);
  const uncontactedHighPriority = sortedLeads.filter(
    (l) => l.status === 'New — High Priority' || l.status === 'Ready for Review'
  );
  const followUpCandidates = sortedLeads.filter(
    (l) =>
      l.status === 'Contacted' ||
      l.status === 'Follow-Up 1 Due' ||
      l.status === 'Follow-Up 2 Due'
  );

  const getFollowUpText = (lead: ClientLead) => {
    if (followUpStage === 'followUp2' && lead.pitches?.followUp2Text) {
      return lead.pitches.followUp2Text;
    }
    if (lead.pitches?.followUp1Text) {
      return lead.pitches.followUp1Text;
    }
    return `Hi ${lead.businessName} team! Avinash here from Avinash Studio — just following up on the custom ${lead.matchedSkill} preview concept I shared for you. Would love to send over the live link if you have 2 minutes today! — ${db.personaConfig.signatureName} (${db.personaConfig.portfolioUrl})`;
  };

  const handleSendFollowUp = async (lead: ClientLead, channel: 'SMS' | 'Email' | 'Instagram') => {
    const text = getFollowUpText(lead);
    try {
      if (channel === 'SMS') {
        if (!lead.phone) {
          triggerToast('Lead has no phone number', 'error');
          return;
        }
        const res = await apiDispatchSms(db, {
          leadId: lead.id,
          phone: lead.phone,
          message: text,
        });
        const next = await apiUpdateLead(res.db, lead.id, {
          status: followUpStage === 'followUp1' ? 'Follow-Up 1 Due' : 'Follow-Up 2 Due',
        });
        triggerRefresh(next);
        triggerToast(res.gatewayNote, res.ok ? 'success' : 'error');
      } else if (channel === 'Email') {
        if (!lead.email) {
          triggerToast('Lead has no email address', 'error');
          return;
        }
        const res = await apiDispatchEmail(db, {
          leadId: lead.id,
          toEmail: lead.email,
          subject: `Quick follow-up: Custom ${lead.matchedSkill} concept for ${lead.businessName}`,
          body: text,
        });
        const next = await apiUpdateLead(res.db, lead.id, {
          status: followUpStage === 'followUp1' ? 'Follow-Up 1 Due' : 'Follow-Up 2 Due',
        });
        triggerRefresh(next);
        triggerToast(res.statusNote, res.ok ? 'success' : 'error');
      } else {
        await navigator.clipboard.writeText(text);
        const cleanHandle = (lead.instaHandle || '').replace(/^@/, '').trim();
        const res = await apiDispatchInsta(db, {
          leadId: lead.id,
          instaHandle: cleanHandle,
          message: text,
        });
        triggerRefresh(res.db);
        triggerToast(`Copied Avinash Studio follow-up DM for @${cleanHandle}`, 'success');
      }
    } catch (e: any) {
      triggerToast(`Follow-up error: ${e.message}`, 'error');
    }
  };

  const handleRunTopBatch = async () => {
    const targets = uncontactedHighPriority.slice(0, 5);
    if (targets.length === 0) {
      triggerToast('No uncontacted high-priority leads in queue.', 'error');
      return;
    }
    setRunningBulk(true);
    let sentCount = 0;
    try {
      let latestDb = db;
      for (const lead of targets) {
        if (bulkChannel === 'SMS' && lead.phone) {
          const res = await apiDispatchSms(latestDb, {
            leadId: lead.id,
            phone: lead.phone,
            message: lead.pitches.smsText,
          });
          latestDb = res.db;
          if (res.ok) sentCount++;
        } else if (bulkChannel === 'Email' && lead.email) {
          const res = await apiDispatchEmail(latestDb, {
            leadId: lead.id,
            toEmail: lead.email,
            subject: lead.pitches.emailSubject,
            body: lead.pitches.emailBody,
          });
          latestDb = res.db;
          if (res.ok) sentCount++;
        }
      }
      triggerRefresh(latestDb);
      triggerToast(
        `Batch complete: ${sentCount}/${targets.length} ${bulkChannel} pitches dispatched.`,
        'success'
      );
    } catch (e: any) {
      triggerToast(`Batch dispatch error: ${e.message}`, 'error');
    } finally {
      setRunningBulk(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Batch Launcher */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bento-card rounded-3xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5"
      >
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-red-400 text-xs font-bold tracking-wide">
            <Zap className="w-3.5 h-3.5" />
            Avinash Studio • Batch Closer
          </div>
          <h1 className="text-xl md:text-2xl font-extrabold text-white">
            Smart Follow-Ups & Priority Batch Outreach
          </h1>
          <p className="text-xs text-zinc-400 max-w-2xl">
            Automatically pitch your top uncontacted prospects sorted by conversion probability, or send 1-click
            follow-up nudges via SIM {db.smsConfig.simSlot} SMS, Gmail, or Instagram DM.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 bg-black/30 p-3 rounded-2xl border border-white/10">
          <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/10">
            <button
              type="button"
              onClick={() => setBulkChannel('SMS')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                bulkChannel === 'SMS'
                  ? 'crimson-btn text-white'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              SIM {db.smsConfig.simSlot} SMS
            </button>
            <button
              type="button"
              onClick={() => setBulkChannel('Email')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                bulkChannel === 'Email'
                  ? 'crimson-btn text-white'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Gmail SMTP
            </button>
          </div>

          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleRunTopBatch}
            disabled={runningBulk || uncontactedHighPriority.length === 0}
            className="crimson-btn px-4 py-2.5 rounded-xl disabled:opacity-50 text-white font-bold text-xs flex items-center gap-2 transition-all cursor-pointer"
          >
            {runningBulk ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Pitch Top {Math.min(5, uncontactedHighPriority.length)} New Leads ({bulkChannel})
          </motion.button>
        </div>
      </motion.div>

      {/* Follow-Up Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-7 bento-card rounded-3xl p-6 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3.5">
            <div className="flex items-center gap-2.5">
              <Clock className="w-4 h-4 text-red-400" />
              <h2 className="text-base font-bold text-white">
                Follow-Up Queue ({followUpCandidates.length} Contacted Leads)
              </h2>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-zinc-400">
              <span>Template:</span>
              <select
                value={followUpStage}
                onChange={(e) => setFollowUpStage(e.target.value as any)}
                className="bg-black/40 border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-white font-semibold"
              >
                <option value="followUp1">Follow-Up #1 (48h Demo Reminder)</option>
                <option value="followUp2">Follow-Up #2 (Final Slot Check)</option>
              </select>
            </div>
          </div>

          {followUpCandidates.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <p className="text-xs font-semibold text-zinc-200">
                No contacted leads waiting for follow-up yet
              </p>
              <p className="text-xs text-zinc-400">
                Once you send an initial SMS, Email, or Instagram DM from the Lead List, those leads appear here for
                1-click follow-up nudges.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {followUpCandidates.map((lead) => (
                <div
                  key={lead.id}
                  className="p-4 rounded-2xl bg-black/30 border border-white/10 space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">{lead.businessName}</span>
                        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-red-500/15 text-red-300 border border-red-500/30">
                          {lead.conversionScore}% Match
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-400 mt-0.5">
                        {lead.matchedSkill} · Last contacted: {lead.lastContactedAt || 'Recently'}
                      </p>
                    </div>
                    <span className="text-[10px] font-bold px-2.5 py-1 rounded-xl bg-white/5 border border-white/10 text-zinc-200">
                      {lead.status}
                    </span>
                  </div>

                  <p className="text-xs text-zinc-300 bg-black/40 p-3 rounded-xl border border-white/10">
                    {getFollowUpText(lead)}
                  </p>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleSendFollowUp(lead, 'SMS')}
                      className="crimson-btn px-3 py-1.5 rounded-xl text-white text-[11px] font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Smartphone className="w-3.5 h-3.5" /> Follow-Up SMS
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSendFollowUp(lead, 'Email')}
                      className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-200 border border-white/10 text-[11px] font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Mail className="w-3.5 h-3.5 text-red-400" /> Follow-Up Email
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSendFollowUp(lead, 'Instagram')}
                      className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-200 border border-white/10 text-[11px] font-bold flex items-center gap-1.5 cursor-pointer"
                    >
                      <Instagram className="w-3.5 h-3.5 text-red-400" /> Copy IG Follow-Up
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Right 5 Cols: Full Dispatch Log */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="lg:col-span-5 bento-card rounded-3xl p-6 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-white/10 pb-3.5">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-red-400" />
              <h2 className="text-base font-bold text-white">All Multi-Channel Dispatch Logs</h2>
            </div>
            <span className="text-xs text-zinc-400 tabular-nums">
              {(db.activityLogs || []).length} events
            </span>
          </div>

          {!db.activityLogs || db.activityLogs.length === 0 ? (
            <p className="text-xs text-zinc-400 py-8 text-center">
              No outreach dispatches logged yet.
            </p>
          ) : (
            <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
              {db.activityLogs.slice(0, 25).map((log) => (
                <div
                  key={log.id}
                  className="p-3.5 rounded-2xl bg-black/30 border border-white/10 space-y-1 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">{log.title}</span>
                    <span
                      className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                        log.status === 'Success'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      }`}
                    >
                      {log.channel} · {log.status}
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-400 font-mono tabular-nums">
                    {log.timestamp}
                  </div>
                  <div className="text-[11px] text-zinc-300">{log.detail}</div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};
