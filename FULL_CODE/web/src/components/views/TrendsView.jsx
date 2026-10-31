import React, { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp,
  AlertTriangle,
  Flame,
  Repeat,
  Calendar,
  Activity,
  RefreshCw,
  Layers,
  Sparkles,
  ShieldAlert,
  Zap,
  CheckCircle2,
} from 'lucide-react';
import { CATEGORIES } from '../../constants/categories';
import Counter from '../common/Counter';
import { getAnalyticsTrends, getPriorityTrendsOverview } from '../../services/feedbackService';

export default function TrendsView({ selectedStore = 'ALL', selectedBatch = 'ALL' }) {
  const [trendsData, setTrendsData] = useState(null);
  const [priorityData, setPriorityData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchTrends = useCallback(
    () =>
      Promise.all([
        getAnalyticsTrends({
          storeId: selectedStore,
          timeframe: '30d',
          fillGaps: true,
          batchId: selectedBatch,
        }),
        getPriorityTrendsOverview({
          storeId: selectedStore,
          timeframe: '30d',
          batchId: selectedBatch,
        }).catch(() => null),
      ])
        .then(([data, prio]) => {
          setTrendsData(data);
          setPriorityData(prio);
          setError(null);
        })
        .catch((err) => {
          console.error('Failed to fetch analytics trends:', err);
          setError(err.message || 'Unable to load real-time analytics trends from StoreGrid API');
        })
        .finally(() => setIsLoading(false)),
    [selectedStore, selectedBatch]
  );

  useEffect(() => {
    fetchTrends();
  }, [fetchTrends]);

  const reloadTrends = () => {
    setIsLoading(true);
    setError(null);
    fetchTrends();
  };

  const timeline = trendsData?.timeline || [];
  const spikes = trendsData?.detectedSpikes || trendsData?.spikes || [];
  const recurringPatterns = trendsData?.recurringPatterns || [];
  const categoryTrends = trendsData?.categoryTrends || [];

  const maxTimelineVolume = timeline.reduce((max, item) => Math.max(max, item.totalVolume ?? item.volume ?? 0), 1);

  const maxCategoryCount = categoryTrends.reduce((max, item) => Math.max(max, item.count || 0), 1);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 text-[#172033]">
      {/* Top Banner */}
      <div className="bg-white p-6 rounded-2xl border border-[#E2E8F0] shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <TrendingUp className="w-5 h-5 text-[#3478F6] shrink-0" />
            <h2 className="text-lg font-bold text-[#172033]">Voice-of-Store Analytics & Anomaly Detection</h2>
            {selectedStore !== 'ALL' && (
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-50 text-[#3478F6] border border-blue-200">
                Store: {selectedStore}
              </span>
            )}
          </div>
          <p className="text-xs text-[#64748B] mt-1">
            Real-time operational trend analysis powered by StoreGrid statistical anomaly engine, spike detection, and
            recurrence clustering.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {trendsData?.summary && (
            <div className="hidden md:flex items-center gap-2 text-xs text-[#64748B] bg-[#F8FAFC] border border-[#E2E8F0] px-3 py-1.5 rounded-xl">
              <span>
                <strong>{spikes.length}</strong> Spikes
              </span>
              <span>•</span>
              <span>
                <strong>{recurringPatterns.length}</strong> Patterns
              </span>
              <span>•</span>
              <span>
                <strong>{timeline.length}</strong> Days
              </span>
            </div>
          )}
          <button
            onClick={reloadTrends}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-blue-50 text-[#3478F6] border border-blue-200 hover:bg-blue-100 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh Trends
          </button>
        </div>
      </div>

      {/* Error state if API fails */}
      {error && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 flex items-start gap-3 shadow-2xs">
          <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-xs font-bold text-red-900">Analytics API Connection Failed</p>
            <p className="text-xs text-red-700 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Priority scoring and spike detection summary */}
      {priorityData?.summary && (
        <div className="bg-white p-6 rounded-2xl border border-[#E2E8F0] shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-[#E2E8F0]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-[#3478F6]">
                <Sparkles className="w-4 h-4 text-[#3478F6]" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-[#172033] flex items-center gap-2">
                  Priority and Spike Detection Engine
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    Engine Active
                  </span>
                </h3>
                <p className="text-xs text-[#64748B]">
                  Weighted multi-factor complaint scoring (hazard escalation, repeat store penalties, rating deficit).
                </p>
              </div>
            </div>
            <div className="text-xs font-mono text-[#64748B] bg-[#F8FAFC] border border-[#E2E8F0] px-3 py-1 rounded-xl">
              Analyzed:{' '}
              <strong>{priorityData.metadata?.totalInputRecords || priorityData.summary.totalComplaints}</strong>{' '}
              complaints
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
            <div className="p-3.5 rounded-xl bg-red-50/70 border border-red-200">
              <div className="flex items-center justify-between text-xs font-semibold text-red-900 mb-1">
                <span>CRITICAL</span>
                <ShieldAlert className="w-4 h-4 text-red-600" />
              </div>
              <span className="text-2xl font-black font-mono text-red-700">
                <Counter value={priorityData.summary.criticalPriorityCount || 0} />
              </span>
              <span className="text-[10px] text-red-800 block mt-0.5">Immediate triage</span>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200">
              <div className="flex items-center justify-between text-xs font-semibold text-amber-900 mb-1">
                <span>HIGH</span>
                <Flame className="w-4 h-4 text-amber-600" />
              </div>
              <span className="text-2xl font-black font-mono text-amber-700">
                <Counter value={priorityData.summary.highPriorityCount || 0} />
              </span>
              <span className="text-[10px] text-amber-800 block mt-0.5">Urgent resolution</span>
            </div>

            <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200">
              <div className="flex items-center justify-between text-xs font-semibold text-blue-900 mb-1">
                <span>MEDIUM</span>
                <Activity className="w-4 h-4 text-blue-600" />
              </div>
              <span className="text-2xl font-black font-mono text-[#3478F6]">
                <Counter value={priorityData.summary.mediumPriorityCount || 0} />
              </span>
              <span className="text-[10px] text-blue-800 block mt-0.5">Standard SLA</span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1">
                <span>LOW</span>
                <CheckCircle2 className="w-4 h-4 text-slate-500" />
              </div>
              <span className="text-2xl font-black font-mono text-slate-800">
                <Counter value={priorityData.summary.lowPriorityCount || 0} />
              </span>
              <span className="text-[10px] text-slate-600 block mt-0.5">Routine feedback</span>
            </div>

            <div className="p-3.5 rounded-xl bg-purple-50/70 border border-purple-200">
              <div className="flex items-center justify-between text-xs font-semibold text-purple-900 mb-1">
                <span>RECURRING</span>
                <Repeat className="w-4 h-4 text-purple-600" />
              </div>
              <span className="text-2xl font-black font-mono text-purple-700">
                <Counter value={priorityData.summary.recurringComplaintsCount || 0} />
              </span>
              <span className="text-[10px] text-purple-800 block mt-0.5">Persistent patterns</span>
            </div>

            <div className="p-3.5 rounded-xl bg-orange-50/70 border border-orange-200">
              <div className="flex items-center justify-between text-xs font-semibold text-orange-900 mb-1">
                <span>SPIKES</span>
                <Zap className="w-4 h-4 text-orange-600" />
              </div>
              <span className="text-2xl font-black font-mono text-orange-700">
                <Counter value={priorityData.summary.activeSpikesCount || 0} />
              </span>
              <span className="text-[10px] text-orange-800 block mt-0.5">Anomaly surges</span>
            </div>
          </div>
        </div>
      )}

      {/* Live Timeline & Spike Indicators Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Timeline Chart */}
        <div className="lg:col-span-7 bg-white p-5 sm:p-6 rounded-2xl border border-[#E2E8F0] shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0]">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-[#172033] flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[#3478F6]" />
                  Daily Feedback Volume Timeline
                </h3>
                <p className="text-xs text-[#64748B] mt-0.5">
                  Daily incoming customer feedback volume across the 30-day analytics window.
                </p>
              </div>
              <span className="text-xs font-mono text-[#64748B] bg-[#F1F5F9] border border-[#E2E8F0] px-2 py-0.5 rounded">
                {timeline.length} Days Tracked
              </span>
            </div>

            <div className="mt-5 space-y-3">
              {isLoading ? (
                <div className="py-12 text-center text-xs text-[#64748B]">Loading timeline from backend...</div>
              ) : timeline.length === 0 ? (
                <div className="py-12 text-center text-xs text-[#64748B]">
                  No timeline volume data available for this store scope.
                </div>
              ) : (
                timeline.slice(-10).map((item, idx) => {
                  const vol = item.totalVolume ?? item.volume ?? 0;
                  const width = Math.max((vol / maxTimelineVolume) * 100, vol > 0 ? 8 : 2);
                  const hasSpike = spikes.some((s) => s.date === item.date);

                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-medium">
                        <span className="font-semibold text-[#172033] flex items-center gap-2">
                          <Calendar className="w-3.5 h-3.5 text-[#64748B]" />
                          {item.date}
                          {hasSpike && (
                            <span className="text-[10px] px-1.5 py-0.5 font-bold rounded-md bg-red-100 text-red-700 border border-red-200">
                              Spike Detected
                            </span>
                          )}
                        </span>
                        <span className={`font-mono font-bold ${hasSpike ? 'text-red-600' : 'text-[#3478F6]'}`}>
                          {vol} {vol === 1 ? 'feedback entry' : 'feedback entries'}
                        </span>
                      </div>

                      <div className="w-full h-2.5 bg-[#F1F5F9] border border-[#E2E8F0] rounded-full overflow-hidden">
                        <div
                          className={`grow-x h-full rounded-full ${hasSpike ? 'bg-red-500' : 'bg-[#3478F6]'}`}
                          style={{ width: `${width}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Detected Volume Spikes */}
        <div className="lg:col-span-5 bg-white p-5 sm:p-6 rounded-2xl border border-[#E2E8F0] shadow-xs flex flex-col justify-between">
          <div>
            <div className="pb-3 border-b border-[#E2E8F0] flex items-center justify-between">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-[#172033] flex items-center gap-2">
                  <Flame className="w-4 h-4 text-red-500" />
                  Detected Operational Spikes
                </h3>
                <p className="text-xs text-[#64748B] mt-0.5">
                  Statistically anomalous complaint volume surges exceeding baseline thresholds.
                </p>
              </div>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 shrink-0">
                {spikes.length} Active
              </span>
            </div>

            <div className="mt-5 space-y-3">
              {isLoading ? (
                <div className="py-8 text-center text-xs text-[#64748B]">Analyzing spike models...</div>
              ) : spikes.length === 0 ? (
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs text-center">
                  ✓ No active complaint spikes detected in this timeframe. Store operations are running within expected
                  baseline limits.
                </div>
              ) : (
                spikes.map((spike, idx) => {
                  const catConfig = CATEGORIES[spike.dominantCategory];
                  return (
                    <div key={idx} className="p-3.5 rounded-xl bg-red-50/60 border border-red-200 shadow-2xs">
                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                        <span className="text-xs font-bold text-red-950 font-mono">
                          {spike.storeCode || 'Store Spike'} • {spike.date}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-md uppercase bg-red-600 text-white">
                            {spike.severity} Severity
                          </span>
                        </div>
                      </div>

                      {spike.dominantCategory && (
                        <div className="mt-2">
                          <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-semibold rounded bg-red-100 text-red-900 border border-red-200">
                            Pillar: {catConfig?.label || spike.dominantCategory}
                          </span>
                        </div>
                      )}

                      <div className="mt-2.5 text-xs text-red-900 grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-[#64748B] block text-[10px]">Spike Volume</span>
                          <strong className="text-sm font-bold font-mono">{spike.volume} complaints</strong>
                        </div>
                        <div>
                          <span className="text-[#64748B] block text-[10px]">Expected Daily Volume</span>
                          <strong className="text-sm font-bold font-mono">
                            {Number(spike.expectedDailyVolume ?? spike.expectedDaily ?? 0).toFixed(1)} entries
                          </strong>
                        </div>
                      </div>

                      <div className="mt-2 pt-2 border-t border-red-200/80 text-[11px] text-red-700 flex justify-between">
                        <span>Spike Ratio: {Number(spike.spikeRatio).toFixed(2)}x expected</span>
                        <span className="font-semibold">Triage Required</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Category Trends & Real Operational Drivers Row */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-[#E2E8F0] shadow-xs">
        <div className="pb-3 border-b border-[#E2E8F0] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-[#172033] flex items-center gap-2">
              <Layers className="w-5 h-5 text-[#3478F6]" />
              Category Trends & Operational Drivers
            </h3>
            <p className="text-xs text-[#64748B] mt-0.5">
              Live category distribution from /api/analytics/trends correlating volume share, anomaly spikes, and
              complaint recurrence.
            </p>
          </div>
          <span className="self-start sm:self-auto text-xs font-mono text-[#64748B] bg-[#F1F5F9] border border-[#E2E8F0] px-2.5 py-0.5 rounded">
            {categoryTrends.length} Active Categories
          </span>
        </div>

        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {isLoading ? (
            <div className="col-span-full py-8 text-center text-xs text-[#64748B]">
              Aggregating category trends from backend...
            </div>
          ) : categoryTrends.length === 0 ? (
            <div className="col-span-full py-8 text-center text-xs text-[#64748B]">
              No category trend data recorded in this timeframe.
            </div>
          ) : (
            categoryTrends.map((catItem) => {
              const config = CATEGORIES[catItem.category] || {
                label: catItem.category,
                barColor: 'bg-slate-500',
                color: '#64748b',
              };
              const barWidthPercent = catItem.count > 0 ? Math.max((catItem.count / maxCategoryCount) * 100, 8) : 0;

              return (
                <div
                  key={catItem.category}
                  className="p-4 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] hover:bg-white hover:border-[#3478F6]/40 transition-all shadow-2xs flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: config.color }} />
                        <span className="font-bold text-sm text-[#172033]">{config.label}</span>
                      </div>
                      <span className="text-xs font-mono font-bold text-[#3478F6] bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md">
                        {catItem.percentage}% share
                      </span>
                    </div>

                    <div className="mt-2 text-2xl font-black font-mono text-[#172033]">
                      <Counter value={catItem.count} />{' '}
                      <span className="text-xs font-normal text-[#64748B]">feedback entries</span>
                    </div>

                    {/* Bar track and fill */}
                    <div className="w-full h-2 bg-[#E2E8F0] rounded-full overflow-hidden mt-3">
                      <div
                        className={`grow-x h-full rounded-full ${config.barColor}`}
                        style={{ width: `${barWidthPercent}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-4 pt-2.5 border-t border-[#E2E8F0] flex items-center justify-between text-[11px] text-[#64748B]">
                    <span>
                      {catItem.spikesCount > 0 ? (
                        <strong className="text-red-600">{catItem.spikesCount} Spikes</strong>
                      ) : (
                        '0 Spikes'
                      )}
                    </span>
                    <span>
                      {catItem.recurringCount > 0 ? (
                        <strong className="text-purple-700">{catItem.recurringCount} Recurring</strong>
                      ) : (
                        '0 Recurring'
                      )}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Recurring Issue Patterns Row */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-[#E2E8F0] shadow-xs">
        <div className="pb-3 border-b border-[#E2E8F0] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-[#172033] flex items-center gap-2">
              <Repeat className="w-5 h-5 text-purple-600" />
              Identified Recurring Operational Issues
            </h3>
            <p className="text-xs text-[#64748B] mt-0.5">
              Automated recurrence detection linking repeated complaints by store and operational pillar.
            </p>
          </div>
          <span className="self-start sm:self-auto text-xs font-mono text-[#64748B] bg-[#F1F5F9] border border-[#E2E8F0] px-2.5 py-0.5 rounded">
            {recurringPatterns.length} Patterns
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {isLoading ? (
            <div className="col-span-full py-8 text-center text-xs text-[#64748B]">
              Scanning database for recurring complaint clusters...
            </div>
          ) : recurringPatterns.length === 0 ? (
            <div className="col-span-full py-8 text-center text-xs text-[#64748B]">
              No persistent recurring patterns detected in this timeframe.
            </div>
          ) : (
            recurringPatterns.map((pat, idx) => {
              const cat = CATEGORIES[pat.category] || { label: pat.category };
              const isCrit = pat.riskLevel === 'CRITICAL';
              const isHigh = pat.riskLevel === 'HIGH';

              return (
                <div
                  key={idx}
                  className="p-4 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] hover:border-[#3478F6]/40 transition-all shadow-2xs flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between pb-2 border-b border-[#E2E8F0]">
                      <span className="text-xs font-bold text-[#172033] font-mono">{pat.storeCode}</span>
                      <span
                        className={`px-2 py-0.5 text-[10px] font-bold rounded-md ${
                          isCrit
                            ? 'bg-red-100 text-red-800 border border-red-300'
                            : isHigh
                              ? 'bg-amber-100 text-amber-800 border border-amber-300'
                              : 'bg-blue-100 text-blue-800 border border-blue-300'
                        }`}
                      >
                        {pat.riskLevel} Risk
                      </span>
                    </div>
                    <div className="mt-2.5">
                      <span className="text-xs font-bold text-[#172033] block">{cat.label}</span>
                      <div className="mt-2 text-2xl font-black font-mono text-[#172033]">
                        <Counter value={pat.recurrenceCount} />{' '}
                        <span className="text-xs font-normal text-[#64748B]">occurrences</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 pt-2 border-t border-[#E2E8F0] text-[11px] text-[#64748B] space-y-1">
                    <div className="flex justify-between">
                      <span>First Seen:</span>
                      <span className="font-mono">
                        {pat.firstOccurrence ? new Date(pat.firstOccurrence).toLocaleDateString() : 'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Latest Seen:</span>
                      <span className="font-mono">
                        {pat.latestOccurrence ? new Date(pat.latestOccurrence).toLocaleDateString() : 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
