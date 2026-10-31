import React, { useEffect, useMemo, useState } from 'react';
import { CATEGORIES } from '../../constants/categories';
import { getAnalyticsTrends } from '../../services/feedbackService';
import Counter from '../common/Counter';

const NON_ISSUE = new Set(['NI01', 'NI02', 'NI03']);
const TIMEFRAME = { today: '7d', last7: '7d', last30: '30d' };
const SEARCH_DELAY_MS = 300;
const TOP_COMPLAINTS = 6;
const URGENT_SHOWN = 4;
const SPIKES_SHOWN = 3;
const STEPS_SHOWN = 3;
const RECENT_SHOWN = 8;

// Everyday words for the classifier's severity levels.
const LEVEL = {
  critical: { label: 'Urgent', dot: 'bg-danger', text: 'text-danger' },
  high: { label: 'Important', dot: 'bg-warn', text: 'text-warn' },
  medium: { label: 'Minor', dot: 'bg-dim', text: 'text-dim' },
  low: { label: 'Minor', dot: 'bg-dim', text: 'text-dim' },
};
const SEVERITY_RANK = { critical: 3, high: 2, medium: 1, low: 0 };

const issueName = (id) => CATEGORIES[id]?.fullName || id;
const levelOf = (severity) => LEVEL[String(severity || 'low').toLowerCase()] || LEVEL.low;
const stagger = (i) => ({ '--i': i });

function timeAgo(iso) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} h ago`;
  return `${Math.round(minutes / 1440)} days ago`;
}

function Panel({ title, hint, children, index = 0, className = '' }) {
  return (
    <section className={`glass rise rounded-2xl ${className}`} style={stagger(index)}>
      <header className="px-5 pt-4">
        <h2 className="text-[15px] font-semibold text-fg">{title}</h2>
        {hint && <p className="text-[13px] text-dim">{hint}</p>}
      </header>
      {children}
    </section>
  );
}

function Empty({ children }) {
  return <p className="px-5 py-8 text-sm text-dim">{children}</p>;
}

function FunnelStep({ index, value, label, hint, tone, share, onClick }) {
  const body = (
    <>
      <p className={`text-[34px] font-semibold leading-none tracking-tight ${tone}`}>
        <Counter value={value} />
      </p>
      <p className="mt-2 text-sm font-medium text-fg">{label}</p>
      <p className="text-[13px] text-dim">{hint}</p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/[0.07]">
        <div
          className="grow-x h-full rounded-full bg-gradient-to-r from-cyan to-teal"
          style={{ ...stagger(index + 3), width: `${Math.max(share, 2)}%` }}
        />
      </div>
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="text-left transition hover:opacity-80">
      {body}
    </button>
  ) : (
    <div>{body}</div>
  );
}

function VolumeChart({ timeline }) {
  const max = Math.max(...timeline.map((d) => d.totalVolume), 1);
  const busiest = timeline.reduce((a, b) => (b.totalVolume > a.totalVolume ? b : a), timeline[0]);
  const label = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return (
    <figure className="px-5 pb-4">
      <div
        role="img"
        aria-label={`Comments per day, ${label(timeline[0].date)} to ${label(timeline[timeline.length - 1].date)}. Busiest day ${label(busiest.date)} with ${busiest.totalVolume}.`}
        className="mt-4 flex h-32 items-end gap-1.5"
      >
        {timeline.map((d, i) => (
          <div
            key={d.date}
            title={`${label(d.date)}: ${d.totalVolume}`}
            style={{ ...stagger(i), height: `${Math.max(4, (d.totalVolume / max) * 100)}%` }}
            className={`grow-y flex-1 rounded-t ${
              d === busiest ? 'bg-gradient-to-t from-cyan to-teal glow-cyan' : 'bg-cyan/25'
            }`}
          />
        ))}
      </div>
      <figcaption className="mt-2 flex justify-between text-[13px] text-dim">
        <span>{label(timeline[0].date)}</span>
        <span>
          Busiest: {label(busiest.date)} ({busiest.totalVolume})
        </span>
        <span>{label(timeline[timeline.length - 1].date)}</span>
      </figcaption>
    </figure>
  );
}

export default function OverviewView({
  overviewData,
  feedbackList,
  isLoading,
  scope,
  selectedStore,
  selectedBatch,
  selectedDateRange,
  searchQuery,
  onSearchChange,
  selectedCategory,
  onCategoryChange,
  onSelectFeedback,
  onViewAllFeedback,
  onNavigateToReviews,
}) {
  const metrics = overviewData?.metrics || { totalFeedback: 0, needsAttention: 0, criticalIssues: 0, needsReview: 0 };
  const [trends, setTrends] = useState(null);
  const [trendsError, setTrendsError] = useState(null);
  const [searchText, setSearchText] = useState(searchQuery || '');

  useEffect(() => {
    let live = true;
    getAnalyticsTrends({
      storeId: selectedStore,
      batchId: selectedBatch,
      timeframe: TIMEFRAME[selectedDateRange] || '30d',
    })
      .then((data) => live && (setTrends(data), setTrendsError(null)))
      .catch((err) => live && setTrendsError(err.message || 'Could not load the trend data'));
    return () => {
      live = false;
    };
  }, [selectedStore, selectedBatch, selectedDateRange]);

  useEffect(() => {
    const timer = setTimeout(() => onSearchChange(searchText), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [searchText, onSearchChange]);

  const complaints = useMemo(() => {
    const issues = (overviewData?.categoryBreakdown || []).filter((c) => c.count > 0 && !NON_ISSUE.has(c.categoryId));
    const total = issues.reduce((sum, c) => sum + c.count, 0);
    const top = [...issues].sort((a, b) => b.count - a.count).slice(0, TOP_COMPLAINTS);
    const biggest = top[0]?.count || 1;
    return top.map((c) => ({
      ...c,
      share: total ? Math.round((c.count / total) * 100) : 0,
      bar: (c.count / biggest) * 100,
    }));
  }, [overviewData]);

  const urgent = useMemo(
    () =>
      [...(feedbackList || [])]
        .filter((f) => ['critical', 'high'].includes(String(f.severity).toLowerCase()) && !f.resolved && f.actionable)
        .sort(
          (a, b) =>
            SEVERITY_RANK[String(b.severity).toLowerCase()] - SEVERITY_RANK[String(a.severity).toLowerCase()] ||
            new Date(b.timestamp) - new Date(a.timestamp)
        )
        .slice(0, URGENT_SHOWN),
    [feedbackList]
  );

  const spikes = useMemo(
    () => [...(trends?.detectedSpikes || [])].sort((a, b) => b.spikeRatio - a.spikeRatio).slice(0, SPIKES_SHOWN),
    [trends]
  );

  const steps = useMemo(() => {
    const repeats = trends?.recurringPatterns || [];
    return complaints.slice(0, STEPS_SHOWN).map((c) => ({
      ...c,
      owner: CATEGORIES[c.categoryId]?.owner || 'Store Ops',
      stores: repeats
        .filter((r) => r.category === c.categoryId)
        .sort((a, b) => b.recurrenceCount - a.recurrenceCount)
        .slice(0, 2),
    }));
  }, [complaints, trends]);

  const recent = (feedbackList || []).slice(0, RECENT_SHOWN);

  if (isLoading && !overviewData) {
    return (
      <div className="mx-auto max-w-[1180px] space-y-5" aria-busy="true" aria-label="Loading overview">
        <div className="h-64 animate-pulse rounded-3xl bg-black/[0.04]" />
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="h-64 animate-pulse rounded-2xl bg-black/[0.04]" />
          <div className="h-64 animate-pulse rounded-2xl bg-black/[0.04]" />
        </div>
      </div>
    );
  }

  const total = metrics.totalFeedback || 1;
  const urgentCount = metrics.criticalIssues;

  return (
    <div className="mx-auto max-w-[1180px] space-y-5">
      <p className="rise text-sm text-dim">
        {scope.storeName} · {scope.periodLabel} · {scope.batchLabel}
      </p>

      {/* Hero: the decision, then the path from raw comments to it */}
      <section
        aria-labelledby="focus-heading"
        className="glass glow-cyan rise overflow-hidden rounded-3xl p-6 lg:p-8"
        style={stagger(1)}
      >
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-2xl">
            <p
              className={`flex items-center gap-2 text-[13px] font-semibold ${urgentCount > 0 ? 'text-danger' : 'text-teal'}`}
            >
              <span
                className={`h-2.5 w-2.5 rounded-full ${urgentCount > 0 ? 'alert-dot bg-danger' : 'bg-teal'}`}
                aria-hidden="true"
              />
              {urgentCount > 0 ? 'Needs your attention first' : 'All clear'}
            </p>
            <h2
              id="focus-heading"
              className="mt-2 text-[34px] font-semibold leading-[1.1] tracking-tight text-fg lg:text-[44px]"
            >
              {urgentCount > 0 ? (
                <>
                  <Counter
                    value={urgentCount}
                    className="bg-gradient-to-r from-cyan to-teal bg-clip-text text-transparent"
                  />{' '}
                  urgent {urgentCount === 1 ? 'comment' : 'comments'} about safety or health
                </>
              ) : (
                'No urgent comments in this view'
              )}
            </h2>
            <p className="mt-3 text-[15px] text-dim">
              Allergies, illness, injury or expired food. These come first whatever the volume.
            </p>
          </div>
        </div>

        <div className="mt-7 grid gap-6 border-t border-edge pt-6 sm:grid-cols-2 lg:grid-cols-4">
          <FunnelStep
            index={0}
            value={metrics.totalFeedback}
            label="Comments received"
            hint="Every channel, this period"
            tone="text-fg"
            share={100}
          />
          <FunnelStep
            index={1}
            value={metrics.needsAttention}
            label="Open problems"
            hint="Urgent or important, unresolved"
            tone="text-warn"
            share={(metrics.needsAttention / total) * 100}
          />
          <FunnelStep
            index={2}
            value={urgentCount}
            label="Urgent"
            hint="Safety, allergen, health, harm"
            tone="text-danger"
            share={(urgentCount / total) * 100}
          />
          <FunnelStep
            index={3}
            value={metrics.needsReview}
            label="Need a second look"
            hint="We were unsure. Check them →"
            tone="text-cyan"
            share={(metrics.needsReview / total) * 100}
            onClick={onNavigateToReviews}
          />
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-5">
        <Panel
          title="Priority alerts"
          hint="Unresolved urgent and important comments"
          index={2}
          className="pb-2 lg:col-span-3"
        >
          {urgent.length === 0 ? (
            <Empty>No unresolved urgent or important comments in view.</Empty>
          ) : (
            <ul className="mt-3 divide-y divide-edge">
              {urgent.map((f) => {
                const level = levelOf(f.severity);
                return (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => onSelectFeedback(f)}
                      className="flex w-full items-start gap-3 px-5 py-3 text-left transition hover:bg-black/[0.04]"
                    >
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${level.dot}`} aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 text-[15px] text-fg">{f.text}</span>
                        <span className="mt-0.5 block text-[13px] text-dim">
                          <span className={`font-semibold ${level.text}`}>{level.label}</span> · {f.storeName} ·{' '}
                          {issueName(f.category)} · send to {f.department} · {timeAgo(f.timestamp)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel
          title="How it is changing"
          hint="Comments per day, and stores with an unusual jump"
          index={3}
          className="pb-2 lg:col-span-2"
        >
          {trendsError ? (
            <Empty>The trend data could not be loaded: {trendsError}</Empty>
          ) : trends?.timeline?.length > 1 ? (
            <VolumeChart timeline={trends.timeline} />
          ) : (
            <Empty>Not enough days of data to show a trend.</Empty>
          )}
          {spikes.length > 0 && (
            <ul className="divide-y divide-edge border-t border-edge">
              {spikes.map((s) => (
                <li key={`${s.storeCode}-${s.date}-${s.dominantCategory}`} className="px-5 py-2.5 text-[13px]">
                  <span className="font-semibold text-fg">{s.storeName}</span>
                  <span className="text-dim">
                    {' '}
                    {s.volume} comments about “{issueName(s.dominantCategory)}”, about{' '}
                    {Math.round(s.expectedDailyVolume)} is normal
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          title="What customers are unhappy about"
          hint="Most reported problems. Pick one to filter the comments below."
          index={4}
          className="pb-3"
        >
          {complaints.length === 0 ? (
            <Empty>No problems were reported in this period. Try a longer period.</Empty>
          ) : (
            <ul className="mt-3 space-y-0.5 px-2">
              {complaints.map((c, i) => {
                const active = selectedCategory === c.categoryId;
                return (
                  <li key={c.categoryId}>
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => onCategoryChange(active ? 'ALL' : c.categoryId)}
                      className={`w-full rounded-xl px-3 py-2.5 text-left transition hover:bg-black/[0.04] ${active ? 'bg-cyan/10' : ''}`}
                    >
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="text-[15px] font-medium text-fg">{issueName(c.categoryId)}</span>
                        <span className="text-[15px] font-semibold text-cyan tabular-nums">{c.count}</span>
                      </span>
                      <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-black/[0.07]">
                        <span
                          className="grow-x block h-full rounded-full bg-gradient-to-r from-cyan to-teal"
                          style={{ ...stagger(i), width: `${c.bar}%` }}
                        />
                      </span>
                      <span className="mt-1 block text-[13px] text-dim">
                        {c.share}% of problems · handled by {CATEGORIES[c.categoryId]?.owner}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel title="What to do next" hint="Worked out from the counts, not written by AI" index={5} className="pb-2">
          {steps.length === 0 ? (
            <Empty>Nothing needs action in this period.</Empty>
          ) : (
            <ol className="mt-3 divide-y divide-edge">
              {steps.map((s, i) => (
                <li key={s.categoryId} className="flex gap-4 px-5 py-4">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan/15 text-[13px] font-semibold text-cyan">
                    {i + 1}
                  </span>
                  <p className="text-[15px] text-fg">
                    Ask <span className="font-semibold text-cyan">{s.owner}</span> to look into{' '}
                    <span className="font-semibold">{issueName(s.categoryId).toLowerCase()}</span>.
                    <span className="text-dim">
                      {' '}
                      {s.count} customers reported it
                      {s.stores.length > 0 &&
                        `, most often at ${s.stores.map((r) => `${r.storeName} (${r.recurrenceCount})`).join(' and ')}`}
                      .
                    </span>
                  </p>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>

      <Panel title="Recent comments" index={6} className="pb-2" hint="Search every comment, or pick a problem above">
        <div className="flex flex-wrap gap-2 px-5 pt-3">
          <label className="sr-only" htmlFor="comment-search">
            Search comments
          </label>
          <input
            id="comment-search"
            type="search"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search comments"
            className="h-9 min-w-52 flex-1 rounded-lg border border-edge bg-black/[0.04] px-3 text-sm text-fg placeholder:text-dim"
          />
          <button
            type="button"
            onClick={onViewAllFeedback}
            className="h-9 rounded-lg border border-edge px-3 text-sm font-medium text-cyan transition hover:bg-black/[0.04]"
          >
            See all comments
          </button>
        </div>
        {recent.length === 0 ? (
          <Empty>No comments match. Clear the search or pick another problem.</Empty>
        ) : (
          <ul className="mt-2 divide-y divide-edge">
            {recent.map((f) => {
              const level = levelOf(f.severity);
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => onSelectFeedback(f)}
                    className="flex w-full items-start gap-3 px-5 py-3 text-left transition hover:bg-black/[0.04]"
                  >
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${level.dot}`} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-[15px] text-fg">{f.text}</span>
                      <span className="mt-0.5 block text-[13px] text-dim">
                        {f.storeName} · {f.actionable ? issueName(f.category) : 'Not a problem report'} ·{' '}
                        {timeAgo(f.timestamp)}
                        {f.needsReview && ' · needs a second look'}
                      </span>
                    </span>
                    <span className={`shrink-0 text-[13px] font-semibold ${level.text}`}>
                      {f.actionable ? level.label : ''}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
