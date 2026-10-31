import React from 'react';

export default function Badge({
  children,
  variant = 'default',
  size = 'sm',
  className = '',
  dot = false,
  dotColor = 'bg-[#64748B]',
}) {
  const sizeClasses = {
    xs: 'px-2 py-0.5 text-[11px]',
    sm: 'px-2.5 py-1 text-xs',
    md: 'px-3 py-1.5 text-xs sm:text-sm',
  };

  const variantClasses = {
    default: 'bg-[#F1F5F9] text-[#64748B] border-[#E2E8F0]',
    primary: 'bg-blue-50 text-[#3478F6] border-blue-200',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
    danger: 'bg-red-50 text-red-700 border-red-200',
    neutral: 'bg-slate-100 text-slate-700 border-slate-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    cyan: 'bg-sky-50 text-sky-700 border-sky-200',
  };

  const chosenVariant = variantClasses[variant] || variantClasses.default;
  const chosenSize = sizeClasses[size] || sizeClasses.sm;

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-full border transition-colors ${chosenSize} ${chosenVariant} ${className}`}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} aria-hidden="true" />}
      <span>{children}</span>
    </span>
  );
}
