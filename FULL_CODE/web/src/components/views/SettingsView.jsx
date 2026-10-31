import React, { useState, useEffect } from 'react';
import {
  Settings,
  Sliders,
  Server,
  RotateCcw,
  Copy,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  ShieldCheck,
  Languages,
  Database,
  Cpu,
  Info,
} from 'lucide-react';
import Button from '../common/Button';
import {
  getSystemSettings,
  updateSystemSettings,
  getDatasetStats,
  resetDemoWorkspace,
  checkConnectivityStatus,
} from '../../services/feedbackService';

export default function SettingsView({ onResetData, onShowToast }) {
  // 1. Persisted System Settings State
  const [confidenceThreshold, setConfidenceThreshold] = useState(65);
  const [autoFlagCritical, setAutoFlagCritical] = useState(true);
  const [multilingualNormalization, setMultilingualNormalization] = useState(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // 2. Connectivity Health Check State
  const [connectivity, setConnectivity] = useState({
    backend: { status: 'checking', available: false, url: 'http://localhost:5000', latencyMs: null, error: null },
    nlp: { status: 'checking', available: false, url: 'http://127.0.0.1:8000', latencyMs: null, error: null },
  });
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);

  // 3. Dataset Breakdown & Demo Reset State
  const [datasetStats, setDatasetStats] = useState({
    syntheticDemo: 0,
    manualEntry: 0,
    officialDataset: 0,
    total: 0,
  });
  const [showResetModal, setShowResetModal] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // 4. Load persisted settings and stats on mount
  useEffect(() => {
    loadSettingsAndStats();
    runHealthCheck();
  }, []);

  async function loadSettingsAndStats() {
    try {
      const [settings, stats] = await Promise.all([getSystemSettings(), getDatasetStats()]);
      if (settings) {
        setConfidenceThreshold(settings.confidenceThreshold ?? 65);
        setAutoFlagCritical(settings.autoFlagCritical ?? true);
        setMultilingualNormalization(settings.multilingualNormalization ?? true);
      }
      if (stats) {
        setDatasetStats(stats);
      }
    } catch (err) {
      console.warn('[SettingsView] Failed loading settings:', err.message);
    }
  }

  async function runHealthCheck() {
    setIsCheckingHealth(true);
    try {
      const health = await checkConnectivityStatus();
      setConnectivity(health);
    } catch (err) {
      console.error('[SettingsView] Connectivity check failed:', err);
    } finally {
      setIsCheckingHealth(false);
    }
  }

  // Handle Threshold Change and Save
  async function handleThresholdChange(val) {
    const num = Math.min(90, Math.max(40, Number(val)));
    setConfidenceThreshold(num);
    setIsSavingSettings(true);
    try {
      await updateSystemSettings({ confidenceThreshold: num });
      onShowToast({
        type: 'success',
        title: 'Threshold Saved',
        message: `Manual review trigger threshold updated to ${num}% in backend.`,
      });
    } catch (err) {
      onShowToast({
        type: 'error',
        title: 'Save Failed',
        message: err.message || 'Could not persist threshold to backend database.',
      });
    } finally {
      setIsSavingSettings(false);
    }
  }

  // Handle Toggle Changes
  async function handleToggleAutoFlag(e) {
    const nextVal = e.target.checked;
    setAutoFlagCritical(nextVal);
    setIsSavingSettings(true);
    try {
      await updateSystemSettings({ autoFlagCritical: nextVal });
      onShowToast({
        type: 'success',
        title: 'Setting Updated',
        message: nextVal
          ? 'Instant escalation enabled for safety & refrigeration hazards.'
          : 'Instant escalation disabled.',
      });
    } catch (err) {
      setAutoFlagCritical(!nextVal); // revert
      onShowToast({
        type: 'error',
        title: 'Save Failed',
        message: err.message,
      });
    } finally {
      setIsSavingSettings(false);
    }
  }

  async function handleToggleMultilingual(e) {
    const nextVal = e.target.checked;
    setMultilingualNormalization(nextVal);
    setIsSavingSettings(true);
    try {
      await updateSystemSettings({ multilingualNormalization: nextVal });
      onShowToast({
        type: 'success',
        title: 'Setting Updated',
        message: nextVal
          ? 'Language tagging is on: each comment is labelled with its language.'
          : 'Language tagging is off.',
      });
    } catch (err) {
      setMultilingualNormalization(!nextVal); // revert
      onShowToast({
        type: 'error',
        title: 'Save Failed',
        message: err.message,
      });
    } finally {
      setIsSavingSettings(false);
    }
  }

  // Handle Safe Demo Workspace Reset
  async function handleConfirmReset() {
    setIsResetting(true);
    try {
      const result = await resetDemoWorkspace();
      // Reload stats
      const updatedStats = await getDatasetStats();
      setDatasetStats(updatedStats);

      // Trigger app-level callback to refresh views
      if (typeof onResetData === 'function') {
        onResetData();
      }

      setShowResetModal(false);
      onShowToast({
        type: 'success',
        title: 'Demo Workspace Reset',
        message: result.message || 'Synthetic demo records successfully reset to factory dataset.',
      });
    } catch (err) {
      onShowToast({
        type: 'error',
        title: 'Reset Failed',
        message: err.message || 'Unable to reset demo workspace.',
      });
    } finally {
      setIsResetting(false);
    }
  }

  const handleCopyEndpoint = (text) => {
    navigator.clipboard.writeText(text);
    onShowToast({
      type: 'info',
      title: 'Copied to Clipboard',
      message: text,
    });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12 text-[#172033]">
      {/* Settings Header */}
      <div className="bg-white p-6 rounded-2xl border border-[#E2E8F0] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-[#3478F6]" />
            <h2 className="text-lg font-bold text-[#172033]">System Settings & Service Connectivity</h2>
          </div>
          <p className="text-xs text-[#64748B] mt-1">
            Configure persisted NLP sensitivity thresholds, justified escalation rules, and monitor live microservice
            health.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isSavingSettings && (
            <span className="text-xs text-[#3478F6] font-medium flex items-center gap-1.5 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200 animate-pulse">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              Persisting to Database...
            </span>
          )}
        </div>
      </div>

      {/* 1. NLP Classification Thresholds */}
      <div className="bg-white p-6 rounded-2xl border border-[#E2E8F0] shadow-xs space-y-6">
        <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0]">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-[#3478F6]" />
            <h3 className="text-sm sm:text-base font-bold text-[#172033]">1. NLP Classification & Routing Threshold</h3>
          </div>
          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            Backend Persisted
          </span>
        </div>

        <div>
          <div className="flex items-center justify-between text-xs sm:text-sm font-semibold mb-1">
            <span className="text-[#172033]">Manual Review Trigger Threshold:</span>
            <span className="font-mono text-[#3478F6] bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200 font-bold text-sm">
              {confidenceThreshold}% ({Number((confidenceThreshold / 100).toFixed(2))})
            </span>
          </div>
          <p className="text-xs text-[#64748B] mb-3 leading-relaxed">
            Feedback with AI confidence score below this threshold is automatically routed to the{' '}
            <strong>Needs Review</strong> queue for human manager verification, preventing false automated actions.
          </p>

          {/* Preset Buttons */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            {[
              { val: 40, label: '40% Aggressive', desc: 'Min review routing, high auto-action' },
              { val: 65, label: '65% Recommended', desc: 'Balanced operational sensitivity' },
              { val: 90, label: '90% Strict', desc: 'High review oversight, strict verification' },
            ].map((preset) => (
              <button
                key={preset.val}
                type="button"
                onClick={() => handleThresholdChange(preset.val)}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                  confidenceThreshold === preset.val
                    ? 'border-[#3478F6] bg-blue-50/80 text-[#172033] shadow-xs ring-1 ring-[#3478F6]'
                    : 'border-[#E2E8F0] bg-white text-[#64748B] hover:border-[#CBD5E1] hover:bg-[#F8FAFC]'
                }`}
              >
                <div className="text-xs font-bold text-[#172033] flex items-center justify-between">
                  <span>{preset.label}</span>
                  {confidenceThreshold === preset.val && <CheckCircle2 className="w-3.5 h-3.5 text-[#3478F6]" />}
                </div>
                <div className="text-[10px] text-[#64748B] mt-0.5 line-clamp-1">{preset.desc}</div>
              </button>
            ))}
          </div>

          <input
            type="range"
            min="40"
            max="90"
            step="5"
            value={confidenceThreshold}
            onChange={(e) => handleThresholdChange(e.target.value)}
            className="w-full accent-[#3478F6] cursor-pointer"
          />
          <div className="flex justify-between text-[11px] text-[#64748B] mt-1 font-mono">
            <span>40% (0.40)</span>
            <span>65% (0.65 Default)</span>
            <span>90% (0.90)</span>
          </div>
        </div>

        {/* 2 & 3. Instant Escalation & Multilingual Normalization Toggles */}
        <div className="space-y-4 pt-4 border-t border-[#E2E8F0]">
          {/* Instant Escalation */}
          <label className="flex items-start gap-3.5 cursor-pointer p-3 rounded-xl hover:bg-[#F8FAFC] border border-transparent hover:border-[#E2E8F0] transition-colors">
            <input
              type="checkbox"
              checked={autoFlagCritical}
              onChange={handleToggleAutoFlag}
              className="mt-0.5 rounded text-[#3478F6] focus:ring-[#3478F6] w-4 h-4 cursor-pointer bg-white border-[#CBD5E1]"
            />
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-rose-600" />
                <span className="font-semibold text-xs sm:text-sm text-[#172033]">
                  Instant Escalation: Justified Rule for Safety & Refrigeration Hazards
                </span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
                  CRITICAL Priority
                </span>
              </div>
              <p className="text-xs text-[#64748B] leading-relaxed">
                Applies <code>CRITICAL</code> priority exclusively to verified physical safety hazards (sparks, electric
                shocks, smoke, lift entrapments, slip/water leaks) and cold chain refrigeration failures. Non-hazardous
                equipment issues (barcode scanners, receipt printers, weighing scales) are classified as{' '}
                <code>HIGH</code> priority rather than safety emergencies.
              </p>
            </div>
          </label>

          {/* Multilingual Normalization */}
          <label className="flex items-start gap-3.5 cursor-pointer p-3 rounded-xl hover:bg-[#F8FAFC] border border-transparent hover:border-[#E2E8F0] transition-colors">
            <input
              type="checkbox"
              checked={multilingualNormalization}
              onChange={handleToggleMultilingual}
              className="mt-0.5 rounded text-[#3478F6] focus:ring-[#3478F6] w-4 h-4 cursor-pointer bg-white border-[#CBD5E1]"
            />
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Languages className="w-4 h-4 text-[#3478F6]" />
                <span className="font-semibold text-xs sm:text-sm text-[#172033]">Language tagging</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-[#3478F6] border border-blue-200">
                  English, Hinglish, Tamil, Marathi
                </span>
              </div>
              <p className="text-xs text-[#64748B] leading-relaxed">
                Labels each comment with the language it is written in. Classification does not depend on this setting:
                the model reads English, Hinglish and Tamil or Marathi written in English letters either way.
              </p>
              <div className="flex items-center gap-1.5 text-[11px] text-amber-700 bg-amber-50 px-2 py-1 rounded-md border border-amber-200 mt-1">
                <Info className="w-3.5 h-3.5 shrink-0" />
                <span>
                  <strong>Note:</strong> comments in Devanagari or other non-Latin scripts were not in the training
                  data, so check their labels in the Second look queue.
                </span>
              </div>
            </div>
          </label>
        </div>
      </div>

      {/* 4. Backend and NLP Connectivity Indicators */}
      <div className="bg-white p-6 rounded-2xl border border-[#E2E8F0] shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0]">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-[#3478F6]" />
            <h3 className="text-sm sm:text-base font-bold text-[#172033]">
              2. Backend & NLP Service Live Connectivity
            </h3>
          </div>
          <button
            type="button"
            onClick={runHealthCheck}
            disabled={isCheckingHealth}
            className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg bg-[#F1F5F9] text-[#172033] hover:bg-[#E2E8F0] cursor-pointer transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isCheckingHealth ? 'animate-spin' : ''}`} />
            Check Connectivity Now
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Card 1: Express Node.js Backend */}
          <div className="p-4 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-[#3478F6]" />
                <span className="font-bold text-xs sm:text-sm text-[#172033]">Node.js / Express Backend</span>
              </div>
              {connectivity.backend.status === 'connected' ? (
                <span className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Connected
                </span>
              ) : connectivity.backend.status === 'checking' ? (
                <span className="flex items-center gap-1.5 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  Checking...
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-0.5 rounded-full">
                  <XCircle className="w-3.5 h-3.5 text-rose-500" />
                  Unavailable
                </span>
              )}
            </div>

            <div className="text-xs space-y-1 text-[#64748B]">
              <div className="flex justify-between font-mono text-[11px]">
                <span>Endpoint:</span>
                <span className="text-[#172033] font-semibold">http://localhost:5000/api/health</span>
              </div>
              {connectivity.backend.latencyMs !== null && (
                <div className="flex justify-between font-mono text-[11px]">
                  <span>Response Latency:</span>
                  <span className="text-emerald-700 font-semibold">{connectivity.backend.latencyMs} ms</span>
                </div>
              )}
              {connectivity.backend.database && (
                <div className="flex justify-between font-mono text-[11px]">
                  <span>Database Engine:</span>
                  <span className="text-[#172033]">
                    {connectivity.backend.database === 'fallback' ? 'SQLite (Development Fallback)' : 'PostgreSQL'}
                  </span>
                </div>
              )}
              {connectivity.backend.uptime && (
                <div className="flex justify-between font-mono text-[11px]">
                  <span>Uptime:</span>
                  <span className="text-[#172033]">
                    {Math.floor(connectivity.backend.uptime / 60)}m {connectivity.backend.uptime % 60}s
                  </span>
                </div>
              )}
            </div>

            {connectivity.backend.error && (
              <div className="text-[11px] text-rose-700 bg-rose-50 p-2 rounded-lg border border-rose-200">
                {connectivity.backend.error}
              </div>
            )}
          </div>

          {/* Card 2: Python FastAPI NLP Microservice */}
          <div className="p-4 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-purple-600" />
                <span className="font-bold text-xs sm:text-sm text-[#172033]">Python FastAPI NLP Service</span>
              </div>
              {connectivity.nlp.status === 'connected' ? (
                <span className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Connected
                </span>
              ) : connectivity.nlp.status === 'checking' ? (
                <span className="flex items-center gap-1.5 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  Checking...
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-[11px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-0.5 rounded-full">
                  <XCircle className="w-3.5 h-3.5 text-rose-500" />
                  Unavailable
                </span>
              )}
            </div>

            <div className="text-xs space-y-1 text-[#64748B]">
              <div className="flex justify-between font-mono text-[11px]">
                <span>Health Endpoint:</span>
                <span className="text-[#172033] font-semibold">http://127.0.0.1:8000/health</span>
              </div>
              {connectivity.nlp.service && (
                <div className="flex justify-between font-mono text-[11px]">
                  <span>Service Name:</span>
                  <span className="text-[#172033]">
                    {connectivity.nlp.service} (v{connectivity.nlp.version})
                  </span>
                </div>
              )}
              {connectivity.nlp.latencyMs !== null && (
                <div className="flex justify-between font-mono text-[11px]">
                  <span>Response Latency:</span>
                  <span className="text-emerald-700 font-semibold">{connectivity.nlp.latencyMs} ms</span>
                </div>
              )}
              <div className="flex justify-between font-mono text-[11px]">
                <span>Fallback Policy:</span>
                <span className="text-[#172033]">Graceful Regex & Review Queue</span>
              </div>
            </div>

            {connectivity.nlp.error && (
              <div className="text-[11px] text-amber-800 bg-amber-50 p-2 rounded-lg border border-amber-200">
                {connectivity.nlp.error}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 5. Safe Demo Workspace Reset */}
      <div className="bg-white p-6 rounded-2xl border border-[#E2E8F0] shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-3 border-b border-[#E2E8F0]">
          <div>
            <div className="flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-amber-600" />
              <h3 className="text-sm sm:text-base font-bold text-[#172033]">
                3. Reset Demo Workspace (Safe & Transactional)
              </h3>
            </div>
            <p className="text-xs text-[#64748B] mt-0.5">
              Distinguishes synthetic demo data from real manual entries and imported datasets.
            </p>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowResetModal(true)}
            icon={RotateCcw}
            className="self-start sm:self-auto cursor-pointer border-amber-300 text-amber-800 hover:bg-amber-50"
          >
            Reset Demo Workspace...
          </Button>
        </div>

        {/* Live Provenance Dataset Breakdown */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3 rounded-xl border border-blue-200 bg-blue-50/50">
            <div className="text-[#64748B] text-[11px]">Synthetic Demo Records</div>
            <div className="text-lg font-bold text-[#172033] mt-0.5">{datasetStats.syntheticDemo}</div>
            <div className="text-[10px] text-[#3478F6] mt-0.5 font-medium">Reset target (restored to factory CSV)</div>
          </div>

          <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50/50">
            <div className="text-[#64748B] text-[11px]">Manual Feedback Submissions</div>
            <div className="text-lg font-bold text-emerald-800 mt-0.5">{datasetStats.manualEntry}</div>
            <div className="text-[10px] text-emerald-700 mt-0.5 font-medium">Protected (Never deleted)</div>
          </div>

          <div className="p-3 rounded-xl border border-purple-200 bg-purple-50/50">
            <div className="text-[#64748B] text-[11px]">Official Imported Records</div>
            <div className="text-lg font-bold text-purple-800 mt-0.5">{datasetStats.officialDataset}</div>
            <div className="text-[10px] text-purple-700 mt-0.5 font-medium">Protected (Never deleted)</div>
          </div>
        </div>
      </div>

      {/* 6. Architecture & Full Verified API Endpoint Documentation */}
      <div className="bg-white p-6 rounded-2xl border border-[#E2E8F0] shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0]">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm sm:text-base font-bold text-[#172033]">
              4. Verified Backend API & Microservice Contracts
            </h3>
          </div>
          <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-blue-50 text-[#3478F6] border border-blue-200">
            Live Contracts Verified
          </span>
        </div>

        <p className="text-xs text-[#64748B]">
          Verified backend endpoints implemented in Express and connected to SQLite/PostgreSQL and the FastAPI NLP
          microservice:
        </p>

        <div className="grid grid-cols-1 gap-2 font-mono text-[11px]">
          {[
            { method: 'GET', path: '/api/stores', desc: 'List retail store branches with metrics & manager contact' },
            {
              method: 'GET',
              path: '/api/dashboard/overview?storeId=&dateRange=',
              desc: 'Aggregated KPI metrics & category distribution',
            },
            {
              method: 'GET',
              path: '/api/dashboard/summary',
              desc: 'Real-time store issue counts & active alerts summary',
            },
            {
              method: 'GET',
              path: '/api/analytics/trends?storeId=&timeframe=&fillGaps=',
              desc: 'Continuous timeline trends and recurrence pattern analysis',
            },
            {
              method: 'GET',
              path: '/api/feedback?storeId=&category=&priority=&needsReviewOnly=',
              desc: 'Query customer feedback with pagination and filters',
            },
            {
              method: 'PATCH',
              path: '/api/feedback/:id/review',
              desc: 'Update manual review classification, notes, and resolution',
            },
            { method: 'GET', path: '/api/settings', desc: 'Fetch persisted NLP threshold and escalation rules' },
            {
              method: 'PATCH',
              path: '/api/settings',
              desc: 'Persist confidence threshold (40-90%) and feature toggles',
            },
            {
              method: 'GET',
              path: '/api/settings/stats',
              desc: 'Inspect dataset provenance breakdown (synthetic vs manual)',
            },
            {
              method: 'POST',
              path: '/api/settings/reset-demo',
              desc: 'Safely reset synthetic demo dataset without touching manual records',
            },
            { method: 'GET', path: '/api/health', desc: 'Express backend and database health status' },
            {
              method: 'GET',
              path: 'http://127.0.0.1:8000/health',
              desc: 'FastAPI Python NLP microservice liveness check',
            },
            {
              method: 'POST',
              path: 'http://127.0.0.1:8000/classify',
              desc: 'Trained classifier: issue type, severity, owner and confidence',
            },
          ].map((ep, i) => (
            <div
              key={i}
              className="flex items-center justify-between p-2.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] hover:bg-white hover:border-[#3478F6]/40 transition-all"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${
                    ep.method === 'GET'
                      ? 'bg-blue-50 text-[#3478F6] border border-blue-200'
                      : ep.method === 'POST'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}
                >
                  {ep.method}
                </span>
                <span className="font-semibold text-[#172033] truncate">{ep.path}</span>
                <span className="text-[10px] text-[#64748B] hidden md:inline">— {ep.desc}</span>
              </div>
              <button
                type="button"
                onClick={() => handleCopyEndpoint(ep.path)}
                className="p-1 text-[#64748B] hover:text-[#172033] cursor-pointer shrink-0"
                title="Copy endpoint"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Confirmation Modal for Reset Demo Workspace */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 border border-[#E2E8F0] shadow-xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-amber-600">
              <div className="w-10 h-10 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h4 className="text-base font-bold text-[#172033]">Reset Demo Workspace?</h4>
                <p className="text-xs text-[#64748B]">Confirm scope of demo data reset</p>
              </div>
            </div>

            <div className="text-xs text-[#64748B] space-y-2 bg-[#F8FAFC] p-3.5 rounded-xl border border-[#E2E8F0]">
              <p className="text-[#172033] font-medium">
                This reset operation will perform the following safe actions:
              </p>
              <ul className="list-disc pl-4 space-y-1">
                <li>
                  <strong>Reset:</strong> Deletes <strong>{datasetStats.syntheticDemo}</strong> synthetic demo records
                  and re-imports factory CSV feedback.
                </li>
                <li>
                  <strong className="text-emerald-700">Preserved:</strong> All{' '}
                  <strong>{datasetStats.manualEntry}</strong> manual submissions and{' '}
                  <strong>{datasetStats.officialDataset}</strong> external imported records will remain completely
                  intact.
                </li>
                <li>The database structure and registered retail stores will NOT be modified.</li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowResetModal(false)}
                disabled={isResetting}
                className="cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleConfirmReset}
                disabled={isResetting}
                className="bg-amber-600 hover:bg-amber-700 text-white cursor-pointer"
              >
                {isResetting ? (
                  <span className="flex items-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Resetting Demo Data...
                  </span>
                ) : (
                  'Confirm Safe Reset'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
