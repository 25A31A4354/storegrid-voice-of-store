import React from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export default function Toast({ toast, onClose }) {
  if (!toast) return null;

  const icons = {
    success: <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />,
    error: <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />,
    info: <Info className="w-5 h-5 text-[#3478F6] shrink-0" />,
  };

  const borderClasses = {
    success: 'border-emerald-200 shadow-emerald-500/10',
    error: 'border-red-200 shadow-red-500/10',
    info: 'border-blue-200 shadow-blue-500/10',
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 max-w-sm w-full transition-all duration-300 ease-out transform translate-y-0">
      <div
        className={`flex items-start gap-3 p-4 rounded-xl border bg-white text-[#172033] shadow-lg ${
          borderClasses[toast.type || 'info']
        }`}
      >
        {icons[toast.type || 'info']}
        <div className="flex-1 pt-0.5">
          {toast.title && <p className="text-sm font-semibold text-[#172033]">{toast.title}</p>}
          <p className="text-xs text-[#64748B] mt-0.5">{toast.message}</p>
        </div>
        <button
          onClick={onClose}
          className="text-[#64748B] hover:text-[#172033] p-1 rounded-md hover:bg-[#F1F5F9] transition-colors cursor-pointer"
          aria-label="Dismiss notification"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
