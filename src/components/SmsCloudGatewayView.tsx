import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  Smartphone,
  Server,
  KeyRound,
  Cpu,
  CheckCircle2,
  Send,
  RefreshCw,
  Radio,
  ShieldCheck,
  AlertCircle,
  Activity,
  PhoneCall,
} from 'lucide-react';
import { AppDatabase, SmsCloudConfig } from '../types/platform';
import { apiSaveConfig, apiDispatchSms, apiVerifySmsConnection } from '../lib/apiClient';

interface Props {
  db: AppDatabase;
  onUpdateDb?: (next: AppDatabase) => void;
  onRefreshDb?: (next: AppDatabase) => void;
  showToast?: (msg: string) => void;
  notify?: (msg: string, type?: 'success' | 'error') => void;
}

export const SmsCloudGatewayView: React.FC<Props> = ({
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

  const [form, setForm] = useState<SmsCloudConfig>(db.smsConfig);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);

  // Live Test SMS state
  const [testPhone, setTestPhone] = useState('+91 8920636919');
  const [testMessage, setTestMessage] = useState(
    'Hi! Avinash here from Avinash Studio. Testing our direct SIM 1 Cloud Gateway dispatch.'
  );
  const [testingSms, setTestingSms] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const handleSave = async () => {
    setSaving(true);
    try {
      const next = await apiSaveConfig(db, { smsConfig: form });
      triggerRefresh(next);
      triggerToast('Android Cloud Server settings saved', 'success');
    } catch (e: any) {
      triggerToast(`Failed to save: ${e.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleVerifyPhone = async () => {
    setVerifying(true);
    setTestResult(null);
    try {
      const res = await apiVerifySmsConnection(db, form);
      triggerRefresh(res.db);
      setForm(res.db.smsConfig);
      setTestResult({ ok: res.connected, msg: res.message });
      triggerToast(res.message, res.connected ? 'success' : 'error');
    } catch (e: any) {
      setTestResult({ ok: false, msg: e.message || 'Verification failed' });
      triggerToast(`Phone check failed: ${e.message}`, 'error');
    } finally {
      setVerifying(false);
    }
  };

  const handleSendTestSms = async () => {
    if (!testPhone.trim()) {
      triggerToast('Enter a destination phone number first', 'error');
      return;
    }
    setTestingSms(true);
    setTestResult(null);
    try {
      const savedDb = await apiSaveConfig(db, { smsConfig: form });
      const res = await apiDispatchSms(savedDb, {
        phone: testPhone.trim(),
        message: testMessage.trim(),
      });
      triggerRefresh(res.db);
      setForm(res.db.smsConfig);
      setTestResult({
        ok: res.ok,
        msg: res.gatewayNote,
      });
      triggerToast(res.gatewayNote, res.ok ? 'success' : 'error');
    } catch (e: any) {
      setTestResult({
        ok: false,
        msg: `Cloud Dispatch Error: ${e.message}`,
      });
      triggerToast(`Cloud Dispatch Error: ${e.message}`, 'error');
    } finally {
      setTestingSms(false);
    }
  };

  const smsLogs = (db.activityLogs || []).filter((l) => l.channel === 'SMS Cloud');
  const connectedDevices = db.smsConfig.connectedDevices || [];
  const isPhoneConnected = db.smsConfig.connectionStatus === 'connected';

  return (
    <div className="space-y-6">
      {/* Top Status Banner */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bento-card rounded-3xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
      >
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 text-red-400 text-xs font-bold tracking-wide">
            <Radio className="w-3.5 h-3.5" />
            Direct Android SIM {form.simSlot} Cloud Relay
          </div>
          <h1 className="text-xl md:text-2xl font-extrabold text-white tracking-tight">
            SMS Cloud Gateway & Live Phone Status
          </h1>
          <p className="text-xs text-zinc-400 max-w-2xl leading-relaxed">
            Connect your Android phone directly via{' '}
            <span className="text-zinc-200 font-semibold">api.sms-gate.app</span> (SMS Gateway for Android™). Verify
            your paired device and send real SIM {form.simSlot} text messages directly from Avinash Studio.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleVerifyPhone}
            disabled={verifying}
            className="px-4 py-2.5 rounded-2xl backdrop-blur-md bg-white/5 hover:bg-white/10 text-zinc-100 border border-white/10 font-bold text-xs flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-red-400 ${verifying ? 'animate-spin' : ''}`} />
            {verifying ? 'Checking Phone...' : 'Check Live Phone Connection'}
          </motion.button>
          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleSave}
            disabled={saving}
            className="crimson-btn px-5 py-2.5 rounded-2xl text-white font-bold text-xs flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
          >
            {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            Save Gateway Config
          </motion.button>
        </div>
      </motion.div>

      {/* Live Connected Phone Status Card */}
      <div
        className={`rounded-3xl p-5 backdrop-blur-md border flex flex-col md:flex-row md:items-center justify-between gap-4 ${
          isPhoneConnected
            ? 'bg-emerald-500/10 border-emerald-500/30 shadow-[0_0_25px_rgba(16,185,129,0.12)]'
            : db.smsConfig.connectionStatus === 'disconnected'
            ? 'bg-red-500/10 border-red-500/30'
            : 'bg-amber-500/10 border-amber-500/30 shadow-[0_0_25px_rgba(245,158,11,0.12)]'
        }`}
      >
        <div className="flex items-start gap-3.5">
          <div
            className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border ${
              isPhoneConnected
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                : 'bg-amber-500/20 border-amber-500/40 text-amber-300'
            }`}
          >
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-sm font-extrabold text-white">
                {isPhoneConnected
                  ? `Android Phone Connected (${connectedDevices[0]?.name || 'Nothing/TetrisIND'})`
                  : 'Phone Connection Status'}
              </span>
              <span
                className={`text-[10px] font-extrabold uppercase px-3 py-0.5 rounded-full border ${
                  isPhoneConnected
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.25)]'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                }`}
              >
                {isPhoneConnected
                  ? `CONNECTED · SIM ${form.simSlot}`
                  : (db.smsConfig.connectionStatus || 'UNVERIFIED').toUpperCase()}
              </span>
            </div>
            <p className="text-xs text-zinc-300 mt-1">
              {db.smsConfig.connectionError
                ? db.smsConfig.connectionError
                : isPhoneConnected
                ? `Verified with api.sms-gate.app (${db.smsConfig.lastVerifiedAt || 'Just now'}). Device ID: ${form.deviceId}`
                : 'Click "Check Live Phone Connection" to query api.sms-gate.app for your paired Android phone.'}
            </p>
            {connectedDevices.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mt-2.5">
                {connectedDevices.map((dev) => (
                  <div
                    key={dev.id}
                    onClick={() => setForm({ ...form, deviceId: dev.id })}
                    className={`px-3 py-1.5 rounded-xl border text-[11px] flex items-center gap-2 cursor-pointer transition-all ${
                      form.deviceId === dev.id
                        ? 'bg-white/10 border-red-500/50 text-white font-bold'
                        : 'bg-white/5 border-white/10 text-zinc-400'
                    }`}
                  >
                    <PhoneCall className="w-3.5 h-3.5 text-red-400" />
                    <span>{dev.name}</span>
                    <span className="font-mono text-[10px] text-zinc-400">ID: {dev.id}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main 12-Col Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 7 Cols: Server Address, Username, Password, Device */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-7 bento-card rounded-3xl p-6 space-y-5"
        >
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center">
                <Server className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">Android Cloud Server Credentials</h2>
                <p className="text-xs text-zinc-400">
                  Copy these 4 values from your Android SMS Gateway app (Cloud Server mode ON)
                </p>
              </div>
            </div>

            {/* SIM Slot Switcher */}
            <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/10">
              <button
                type="button"
                onClick={() => setForm({ ...form, simSlot: 1 })}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                  form.simSlot === 1
                    ? 'crimson-btn text-white'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                SIM 1
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, simSlot: 2 })}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                  form.simSlot === 2
                    ? 'crimson-btn text-white'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                SIM 2
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                1. Cloud Server Address
              </label>
              <div className="relative">
                <Server className="w-4 h-4 text-red-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={form.serverAddress}
                  onChange={(e) => setForm({ ...form, serverAddress: e.target.value })}
                  placeholder="https://api.sms-gate.app"
                  className="w-full bg-black/40 border border-white/10 focus:border-red-500/50 rounded-2xl pl-10 pr-3.5 py-2.5 text-xs text-white font-mono focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                2. Cloud Username
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-red-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  placeholder="e.g. 0JUV5I"
                  className="w-full bg-black/40 border border-white/10 focus:border-red-500/50 rounded-2xl pl-10 pr-3.5 py-2.5 text-xs text-white font-mono focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                3. Cloud Password
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-red-400 absolute left-3.5 top-3" />
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="••••••••••••"
                  className="w-full bg-black/40 border border-white/10 focus:border-red-500/50 rounded-2xl pl-10 pr-3.5 py-2.5 text-xs text-white font-mono focus:outline-none"
                />
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-zinc-300 mb-1.5">
                4. Paired Device ID (Auto-discovered from your Android Phone)
              </label>
              <div className="relative">
                <Cpu className="w-4 h-4 text-red-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={form.deviceId}
                  onChange={(e) => setForm({ ...form, deviceId: e.target.value })}
                  placeholder="DwLpHi0cv9sshAQF2sOx6"
                  className="w-full bg-black/40 border border-white/10 focus:border-red-500/50 rounded-2xl pl-10 pr-3.5 py-2.5 text-xs text-white font-mono focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                Strict schema active:{' '}
                <code className="text-zinc-200 font-mono">
                  &#123; textMessage: &#123; text &#125;, phoneNumbers, simNumber: {form.simSlot} &#125;
                </code>
              </span>
            </div>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="crimson-btn px-5 py-2.5 rounded-2xl text-white font-bold text-xs flex items-center gap-2 transition-all cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              Save Cloud Settings
            </button>
          </div>
        </motion.div>

        {/* Right 5 Cols: Live Test SMS Dispatch */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="lg:col-span-5 bento-card rounded-3xl p-6 space-y-4"
        >
          <div className="flex items-center gap-3 border-b border-white/10 pb-3.5">
            <div className="w-10 h-10 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center">
              <Smartphone className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Test Direct SIM {form.simSlot} SMS</h2>
              <p className="text-xs text-zinc-400">
                Send a real test SMS right now through your paired Android phone
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1">
                Destination Mobile Number (With Country Code)
              </label>
              <input
                type="text"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="+91 8920636919"
                className="w-full bg-black/40 border border-white/10 focus:border-red-500/50 rounded-2xl px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1">
                Test SMS Message
              </label>
              <textarea
                rows={3}
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                className="w-full bg-black/40 border border-white/10 focus:border-red-500/50 rounded-2xl p-3 text-xs text-white focus:outline-none"
              />
            </div>

            <motion.button
              type="button"
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={handleSendTestSms}
              disabled={testingSms}
              className="crimson-btn w-full py-3 rounded-2xl text-white font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              {testingSms ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {testingSms ? `Dispatching to Android SIM ${form.simSlot}...` : 'Send Live Test SMS Now'}
            </motion.button>

            {testResult && (
              <div
                className={`p-3.5 rounded-2xl border text-xs flex items-start gap-2.5 ${
                  testResult.ok
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                    : 'bg-red-500/10 border-red-500/30 text-red-200'
                }`}
              >
                {testResult.ok ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                )}
                <div className="space-y-1 break-all">
                  <div className="font-bold">
                    {testResult.ok ? 'SMS Dispatched to Android Phone' : 'Gateway Response'}
                  </div>
                  <div className="text-[11px] leading-relaxed">{testResult.msg}</div>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Recent SMS Gateway Logs */}
      <div className="bento-card rounded-3xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-red-400" />
            <h3 className="text-sm font-bold text-white">Recent SMS Dispatch Activity</h3>
          </div>
          <span className="text-xs text-zinc-400 tabular-nums">{smsLogs.length} total SMS events</span>
        </div>

        {smsLogs.length === 0 ? (
          <p className="text-xs text-zinc-400 py-4 text-center">
            No SMS messages dispatched yet. Send a test SMS above or trigger an SMS from Lead List & Pitch Studio.
          </p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {smsLogs.slice(0, 12).map((log) => (
              <div
                key={log.id}
                className="bg-black/30 border border-white/10 rounded-2xl px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div className="flex items-center gap-2.5">
                  <span className="font-bold text-white">{log.title}</span>
                  <span className="text-zinc-400 font-mono text-[11px] tabular-nums">
                    {log.timestamp}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[11px]">
                  <span className="text-zinc-300 truncate max-w-md">{log.detail}</span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full font-bold shrink-0 ${
                      log.status === 'Success'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    }`}
                  >
                    {log.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
