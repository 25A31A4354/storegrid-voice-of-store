import React from 'react';

export default function Button({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  icon: Icon,
  iconPosition = 'left',
  type = 'button',
  className = '',
  id,
  title,
  ariaLabel,
}) {
  const sizeClasses = {
    xs: 'px-2.5 py-1 text-xs rounded-lg',
    sm: 'px-3.5 py-1.5 text-xs rounded-lg',
    md: 'px-4 py-2 text-sm rounded-xl',
    lg: 'px-5 py-2.5 text-sm sm:text-base rounded-xl',
  };

  const variantClasses = {
    primary:
      'bg-[#3478F6] text-white font-semibold hover:bg-[#2563EB] active:bg-[#1D4ED8] shadow-xs hover:shadow-sm border border-transparent focus:ring-2 focus:ring-[#3478F6]/20',
    secondary:
      'bg-white text-[#172033] border border-[#E2E8F0] hover:bg-[#F8FAFC] hover:border-[#CBD5E1] active:bg-[#F1F5F9] shadow-2xs focus:ring-2 focus:ring-[#3478F6]/20',
    outline:
      'bg-transparent text-[#3478F6] border border-[#3478F6]/40 hover:bg-blue-50/70 active:bg-blue-100 focus:ring-2 focus:ring-[#3478F6]/20',
    ghost:
      'bg-transparent text-[#64748B] hover:text-[#172033] hover:bg-[#F1F5F9] active:bg-[#E2E8F0] border border-transparent focus:ring-2 focus:ring-[#CBD5E1]',
    danger:
      'bg-red-50 text-red-600 hover:bg-red-100 active:bg-red-200 border border-red-200 focus:ring-2 focus:ring-red-500/20',
    subtle:
      'bg-blue-50 text-[#3478F6] hover:bg-blue-100 active:bg-blue-200 border border-blue-200/60 focus:ring-2 focus:ring-[#3478F6]/20',
  };

  const chosenSize = sizeClasses[size] || sizeClasses.md;
  const chosenVariant = variantClasses[variant] || variantClasses.primary;

  return (
    <button
      id={id}
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      title={title}
      aria-label={ariaLabel || (typeof children === 'string' ? children : undefined)}
      className={`inline-flex items-center justify-center font-medium transition-all duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none select-none ${chosenSize} ${chosenVariant} ${className}`}
    >
      {loading && (
        <svg
          className="animate-spin -ml-1 mr-2 h-4 w-4 text-current"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      )}
      {!loading && Icon && iconPosition === 'left' && (
        <Icon className={`w-4 h-4 shrink-0 ${children ? 'mr-1.5' : ''}`} />
      )}
      {children}
      {!loading && Icon && iconPosition === 'right' && (
        <Icon className={`w-4 h-4 shrink-0 ${children ? 'ml-1.5' : ''}`} />
      )}
    </button>
  );
}
