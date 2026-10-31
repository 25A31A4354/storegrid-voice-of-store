import React, { useCallback, useEffect, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';

const BRIEFS_URL = '/briefs/briefs.json';
const LEVEL = {
  critical: { label: 'Urgent', text: 'text-urgent' },
  high: { label: 'Important', text: 'text-amber' },
  medium: { label: 'Minor', text: 'text-muted' },
  low: { label: 'Minor', text: 'text-muted' },
};

const formatDay = (iso, options) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, options);

function trendText(item) {
  if (item.trend === '↑') return `Up from ${item.previous} last week`;
  if (item.trend === '↓') return `Down from ${item.previous} last week`;
  return `Steady at ${item.count} (was ${item.previous})`;
}

function Notice({ title, children, action }) {
  return (
    <div className="rounded-xl bg-white p-6 ring-1 ring-line" role="status">
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      <p className="mt-1 text-sm text-muted">{children}</p>
      {action}
    </div>
  );
}

export default function BriefsView() {
  const [state, setState] = useState({ status: 'loading', data: null, error: null });
  const [regionName, setRegionName] = useState(null);

  const load = useCallback(() => {
    fetch(BRIEFS_URL)
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 404 ? 'not-generated' : `HTTP ${res.status}`);
        // A static host may answer a missing file with its HTML shell, which is not JSON.
        return res.json().catch(() => {
          throw new Error('not-generated');
        });
      })
      .then((data) => {
        setState({ status: 'ready', data, error: null });
        setRegionName((current) => current || data.regions?.[0]?.region || null);
      })
      .catch((err) => setState({ status: 'error', data: null, error: err.message }));
  }, []);

  useEffect(load, [load]);

  if (state.status === 'loading') {
    return (
      <div className="mx-auto max-w-[900px] space-y-4" aria-busy="true" aria-label="Loading weekly briefs">
        <div className="h-10 w-72 animate-pulse rounded-lg bg-line" />
        <div className="h-72 animate-pulse rounded-2xl bg-line" />
      </div>
    );
  }

  const retry = (
    <button
      type="button"
      onClick={() => {
        setState({ status: 'loading', data: null, error: null });
        load();
      }}
      className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-medium text-ink hover:border-muted"
    >
      <RefreshCw className="h-4 w-4" />
      Try again
    </button>
  );

  if (state.status === 'error') {
    return (
      <div className="mx-auto max-w-[900px]">
        <Notice
          title={state.error === 'not-generated' ? 'No weekly briefs yet' : 'The weekly briefs could not be loaded'}
          action={retry}
        >
          {state.error === 'not-generated'
            ? 'Briefs are created from the latest classified feedback. Generate them with the brief script described in the README, then try again.'
            : `Something went wrong while loading them (${state.error}).`}
        </Notice>
      </div>
    );
  }

  const { data } = state;
  const region = data.regions?.find((r) => r.region === regionName) || data.regions?.[0];
  if (!region) {
    return (
      <div className="mx-auto max-w-[900px]">
        <Notice title="No weekly briefs yet" action={retry}>
          The brief file was found but it has no regions.
        </Notice>
      </div>
    );
  }

  const weekStart = formatDay(data.week, { day: 'numeric', month: 'short' });
  const weekEnd = formatDay(
    new Date(new Date(`${data.week}T00:00:00`).getTime() + 6 * 86400000).toISOString().slice(0, 10),
    {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }
  );

  return (
    <div className="mx-auto max-w-[900px] space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Region" className="inline-flex rounded-lg bg-white p-0.5 ring-1 ring-line">
          {data.regions.map((r) => {
            const active = r.region === region.region;
            return (
              <button
                key={r.region}
                role="tab"
                aria-selected={active}
                type="button"
                onClick={() => setRegionName(r.region)}
                className={`rounded-md px-3.5 py-1.5 text-sm transition-colors duration-150 ${
                  active ? 'bg-page font-semibold text-ink' : 'text-muted hover:text-ink'
                }`}
              >
                {r.region}
              </button>
            );
          })}
        </div>
        <a
          href={`/briefs/${region.file}`}
          download={`StoreGrid-weekly-brief-${region.region}-${data.week}.html`}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-accent-hover"
        >
          <Download className="h-4 w-4" />
          Download brief
        </a>
      </div>

      <article className="rounded-2xl bg-white p-6 ring-1 ring-line" aria-labelledby="brief-title">
        <h2 id="brief-title" className="text-[22px] font-semibold tracking-tight text-ink">
          {region.region} region · weekly brief
        </h2>
        <p className="mt-0.5 text-sm text-muted">
          {weekStart} to {weekEnd} · {region.total} comments about a problem this week
        </p>

        <h3 className="mt-6 text-[17px] font-semibold text-ink">Top problems this week</h3>
        {region.issues.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No problems were reported in this region this week.</p>
        ) : (
          <ol className="mt-2 divide-y divide-line border-t border-line">
            {region.issues.map((item, i) => {
              const level = LEVEL[item.severity] || LEVEL.low;
              return (
                <li key={item.issue} className="flex gap-4 py-4">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-page text-[13px] font-semibold text-ink">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold text-ink">{item.name}</p>
                    <p className="text-sm text-muted">
                      <span className={`font-medium ${level.text}`}>{level.label}</span> · {item.count} reports ·{' '}
                      {trendText(item)} · send to {item.owner}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      Most affected: {item.stores.join(', ')}
                      {item.n_stores > item.stores.length && ` and ${item.n_stores - item.stores.length} more`}
                    </p>
                    <ul className="mt-2 space-y-1">
                      {item.quotes.map((q) => (
                        <li key={q.id} className="border-l-2 border-line pl-3 text-sm text-ink">
                          “{q.text}”
                        </li>
                      ))}
                    </ul>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        <h3 className="mt-6 text-[17px] font-semibold text-ink">Rising at a single store</h3>
        {region.flags.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No store showed an early warning this week.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line border-t border-line">
            {region.flags.map((f) => (
              <li key={`${f.store}-${f.issue}`} className="py-3 text-sm">
                <span className="font-medium text-ink">{f.store}</span>
                <span className="text-muted">
                  {' '}
                  · {f.name} · {f.reports} reports this week
                </span>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-6 rounded-lg bg-page px-4 py-3 text-sm text-muted">
          <span className="font-semibold text-ink">When to escalate.</span> {data.escalationRule}
        </p>
      </article>
    </div>
  );
}
