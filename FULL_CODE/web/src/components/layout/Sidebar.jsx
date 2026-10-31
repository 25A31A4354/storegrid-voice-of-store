import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  MessageSquare,
  TrendingUp,
  ClipboardCheck,
  Settings,
  UploadCloud,
  FileText,
  X,
} from 'lucide-react';
import { checkConnectivityStatus } from '../../services/feedbackService';

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'feedback', label: 'Feedback', icon: MessageSquare },
  { id: 'needs-review', label: 'Second look', icon: ClipboardCheck, showCount: true },
  { id: 'trends', label: 'Trends', icon: TrendingUp },
  { id: 'briefs', label: 'Weekly briefs', icon: FileText },
  { id: 'dataset-upload', label: 'Import data', icon: UploadCloud },
  { id: 'settings', label: 'Settings', icon: Settings },
];

function useSystemStatus() {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    let live = true;
    checkConnectivityStatus()
      .then((s) => live && setStatus(s))
      .catch(() => live && setStatus(null));
    return () => {
      live = false;
    };
  }, []);
  return status;
}

function SystemStatus() {
  const status = useSystemStatus();
  const rows = [
    ['API', status?.backend?.available],
    ['Comment reader', status?.nlp?.available],
  ];
  return (
    <div className="border-t border-edge px-4 py-3 text-[13px] text-dim">
      {rows.map(([name, ok]) => (
        <div key={name} className="flex items-center justify-between py-0.5">
          <span>{name}</span>
          <span className={`inline-flex items-center gap-1.5 font-medium ${ok ? 'text-emerald-700' : 'text-dim'}`}>
            <span
              className={`h-1.5 w-1.5 rounded-full ${ok ? 'status-pulse' : ''} ${ok ? 'bg-emerald-600' : 'bg-muted'}`}
            />
            {status === null ? 'Checking' : ok ? 'Online' : 'Offline'}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function Sidebar({
  activePage = 'overview',
  onSelectPage,
  reviewQueueCount = 0,
  isMobileOpen = false,
  onCloseMobile,
  embedded = false,
}) {
  const content = (
    <div className="flex h-full flex-col bg-white">
      <div className="flex h-16 items-center justify-between border-b border-edge px-4">
        <span className="flex items-center gap-2 text-[17px] font-semibold tracking-tight text-fg">
          <span aria-hidden="true" className="grid grid-cols-2 gap-[3px]">
            <span className="h-2 w-2 rounded-[2px] bg-cyan" />
            <span className="h-2 w-2 rounded-[2px] bg-cyan/60" />
            <span className="h-2 w-2 rounded-[2px] bg-cyan/60" />
            <span className="h-2 w-2 rounded-[2px] bg-cyan/30" />
          </span>
          StoreGrid
        </span>
        <button
          type="button"
          onClick={onCloseMobile}
          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden"
          aria-label="Close navigation"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4" aria-label="Main">
        {NAV_ITEMS.map(({ id, label, icon: Icon, showCount }) => {
          const active = activePage === id;
          return (
            <button
              key={id}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => {
                onSelectPage(id);
                onCloseMobile?.();
              }}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-[15px] transition-colors duration-150 ${
                active ? 'bg-black/[0.07] font-semibold text-fg' : 'text-dim hover:bg-black/[0.04] hover:text-fg'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Icon className={`h-4 w-4 ${active ? 'text-cyan' : 'text-dim'}`} />
                {label}
              </span>
              {showCount && reviewQueueCount > 0 && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                  {reviewQueueCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <SystemStatus />
    </div>
  );

  if (embedded) {
    return (
      <aside className="sticky top-0 z-10 hidden h-screen w-60 shrink-0 border-r border-edge lg:block">{content}</aside>
    );
  }

  return (
    <>
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 lg:hidden" onClick={onCloseMobile} aria-hidden="true" />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 border-r border-edge transition-transform lg:hidden ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {content}
      </aside>
    </>
  );
}
