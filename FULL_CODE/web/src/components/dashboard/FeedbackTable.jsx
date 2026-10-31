import React from 'react';
import { Search, ArrowRight, Clock, AlertCircle, CheckCircle } from 'lucide-react';
import { CATEGORIES, PRIORITY_CONFIG, OPERATIONAL_CATEGORIES } from '../../constants/categories';
import Badge from '../common/Badge';
import Button from '../common/Button';

export default function FeedbackTable({
  feedbackList = [],
  searchQuery = '',
  onSearchChange,
  selectedCategory = 'ALL',
  onCategoryChange,
  selectedPriority = 'ALL',
  onPriorityChange,
  onSelectFeedback,
  onViewAllFeedback,
  isLoading = false,
  compact = false,
  maxItems = 6,
}) {
  const displayedItems = compact ? feedbackList.slice(0, maxItems) : feedbackList;

  return (
    <div className="bg-white rounded-2xl border border-[#E2E8F0] shadow-xs overflow-hidden text-[#172033]">
      {/* Top Header & Search / Filters Toolbar */}
      <div className="p-5 sm:p-6 border-b border-[#E2E8F0]">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-[#172033] tracking-tight">
                {compact ? 'Recent Feedback' : 'All Customer Feedback'}
              </h2>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#F1F5F9] border border-[#E2E8F0] text-[#64748B]">
                {feedbackList.length} total
              </span>
            </div>
            <p className="text-xs text-[#64748B] mt-0.5">
              Live Voice-of-Store transcripts processed through NLP classification.
            </p>
          </div>

          {compact && onViewAllFeedback && (
            <Button
              id="view-all-feedback-btn"
              variant="secondary"
              size="sm"
              onClick={onViewAllFeedback}
              icon={ArrowRight}
              iconPosition="right"
              className="self-start lg:self-auto cursor-pointer"
            >
              View all feedback
            </Button>
          )}
        </div>

        {/* Filter Bar */}
        <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          {/* Search Box */}
          <div className="relative flex-1">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B] pointer-events-none">
              <Search className="w-4 h-4" />
            </div>
            <input
              id="feedback-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search feedback text, terms, or ID (e.g. 'billing', 'milk', 'FB-1001')..."
              className="w-full pl-9 pr-4 py-2 text-xs sm:text-sm text-[#172033] placeholder-[#94A3B8] bg-[#F8FAFC] focus:bg-white border border-[#E2E8F0] rounded-xl focus:ring-2 focus:ring-[#3478F6]/20 focus:border-[#3478F6] transition-all outline-hidden"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-[#64748B] hover:text-[#172033] cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>

          {/* Category Dropdown */}
          <div className="relative">
            <select
              id="filter-category-select"
              value={selectedCategory}
              onChange={(e) => onCategoryChange(e.target.value)}
              aria-label="Filter feedback by category"
              className="w-full sm:w-auto px-3 py-2 text-xs sm:text-sm font-medium text-[#172033] bg-white border border-[#E2E8F0] hover:border-[#3478F6]/40 rounded-xl focus:ring-2 focus:ring-[#3478F6]/20 focus:border-[#3478F6] transition-all cursor-pointer"
            >
              <option value="ALL">All Categories</option>
              {OPERATIONAL_CATEGORIES.map((catKey) => (
                <option key={catKey} value={catKey}>
                  {CATEGORIES[catKey]?.label || catKey}
                </option>
              ))}
              <option value="NEEDS_REVIEW">Needs Review</option>
            </select>
          </div>

          {/* Priority Dropdown */}
          <div className="relative">
            <select
              id="filter-priority-select"
              value={selectedPriority}
              onChange={(e) => onPriorityChange(e.target.value)}
              aria-label="Filter feedback by priority"
              className="w-full sm:w-auto px-3 py-2 text-xs sm:text-sm font-medium text-[#172033] bg-white border border-[#E2E8F0] hover:border-[#3478F6]/40 rounded-xl focus:ring-2 focus:ring-[#3478F6]/20 focus:border-[#3478F6] transition-all cursor-pointer"
            >
              <option value="ALL">All Priorities</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {isLoading ? (
        <div className="p-12 text-center">
          <div className="inline-block animate-spin w-8 h-8 border-2 border-[#3478F6] border-t-transparent rounded-full mb-3" />
          <p className="text-sm font-medium text-[#64748B]">Fetching feedback records...</p>
        </div>
      ) : displayedItems.length === 0 ? (
        /* Empty State */
        <div className="p-12 text-center">
          <div className="w-12 h-12 rounded-2xl bg-[#F8FAFC] border border-[#E2E8F0] text-[#64748B] flex items-center justify-center mx-auto mb-3">
            <Search className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-[#172033]">No matching feedback found</h3>
          <p className="text-xs text-[#64748B] mt-1 max-w-sm mx-auto">
            Try adjusting your search keywords, clearing the category filter, or resetting priority criteria.
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <Button
              variant="secondary"
              size="xs"
              onClick={() => {
                onSearchChange('');
                onCategoryChange('ALL');
                onPriorityChange('ALL');
              }}
            >
              Reset All Filters
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">
                  <th scope="col" className="py-3 px-4 w-24">
                    ID
                  </th>
                  <th scope="col" className="py-3 px-4">
                    Customer Feedback Text
                  </th>
                  <th scope="col" className="py-3 px-4 w-40">
                    Category
                  </th>
                  <th scope="col" className="py-3 px-4 w-28">
                    Priority
                  </th>
                  <th scope="col" className="py-3 px-4 w-28">
                    Received
                  </th>
                  <th scope="col" className="py-3 px-4 w-32">
                    Review Status
                  </th>
                  <th scope="col" className="py-3 px-4 text-right w-20">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {displayedItems.map((item) => {
                  const catConfig = CATEGORIES[item.category] || {
                    label: item.category,
                    badgeClass: 'bg-[#F1F5F9] text-[#64748B] border-[#E2E8F0]',
                  };
                  const priConfig = PRIORITY_CONFIG[item.priority] || {
                    label: item.priority,
                    badgeClass: 'bg-[#F1F5F9] text-[#64748B]',
                  };
                  const isNeedsReview = item.needsReview || item.category === 'NEEDS_REVIEW';

                  return (
                    <tr
                      key={item.feedbackId}
                      onClick={() => onSelectFeedback(item)}
                      className="group hover:bg-blue-50/40 cursor-pointer transition-colors"
                    >
                      <td className="py-3.5 px-4 font-mono font-medium text-[#64748B] text-[11px]">
                        {item.feedbackId}
                      </td>
                      <td className="py-3.5 px-4 max-w-md">
                        <div className="font-medium text-[#172033] group-hover:text-[#3478F6] transition-colors line-clamp-1">
                          "{item.originalText}"
                        </div>
                        {item.originalText !== item.cleanedText && (
                          <div className="text-[11px] text-[#64748B] truncate mt-0.5">{item.cleanedText}</div>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${catConfig.badgeClass}`}
                        >
                          {catConfig.label}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <Badge
                          variant={
                            item.priority === 'CRITICAL'
                              ? 'danger'
                              : item.priority === 'HIGH'
                                ? 'warning'
                                : item.priority === 'MEDIUM'
                                  ? 'primary'
                                  : 'success'
                          }
                          size="xs"
                          dot
                          dotColor={priConfig.dotColor}
                        >
                          {priConfig.label}
                        </Badge>
                      </td>
                      <td className="py-3.5 px-4 text-[#64748B] text-[11px] whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-[#64748B]" />
                          <span>{item.timestamp}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        {isNeedsReview ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                            <AlertCircle className="w-3 h-3 text-amber-500" />
                            Needs Review
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle className="w-3 h-3 text-emerald-500" />
                            Verified ({Math.round((item.confidence || 0.95) * 100)}%)
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <span className="inline-flex items-center gap-0.5 text-[#3478F6] font-semibold group-hover:underline text-xs">
                          Details
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Stacked Cards View */}
          <div className="md:hidden divide-y divide-[#E2E8F0]">
            {displayedItems.map((item) => {
              const catConfig = CATEGORIES[item.category] || {
                label: item.category,
                badgeClass: 'bg-[#F1F5F9] text-[#64748B]',
              };
              const priConfig = PRIORITY_CONFIG[item.priority] || {
                label: item.priority,
              };
              const isNeedsReview = item.needsReview || item.category === 'NEEDS_REVIEW';

              return (
                <div
                  key={item.feedbackId}
                  onClick={() => onSelectFeedback(item)}
                  className="p-4 hover:bg-blue-50/40 active:bg-blue-50/70 transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-[11px] font-mono font-semibold text-[#64748B]">{item.feedbackId}</span>
                    <div className="flex items-center gap-1.5">
                      <Badge
                        variant={
                          item.priority === 'CRITICAL' ? 'danger' : item.priority === 'HIGH' ? 'warning' : 'neutral'
                        }
                        size="xs"
                        dot
                        dotColor={priConfig.dotColor}
                      >
                        {priConfig.label}
                      </Badge>
                      <span className="text-[10px] text-[#64748B]">{item.timestamp}</span>
                    </div>
                  </div>

                  <p className="text-sm font-semibold text-[#172033] leading-snug">"{item.originalText}"</p>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${catConfig.badgeClass}`}
                    >
                      {catConfig.label}
                    </span>

                    {isNeedsReview ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                        <AlertCircle className="w-3 h-3 text-amber-500" />
                        Needs Review
                      </span>
                    ) : (
                      <span className="text-xs text-[#64748B] font-medium">
                        Confidence: {Math.round((item.confidence || 0.95) * 100)}%
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Footer count indicator */}
      {!isLoading && displayedItems.length > 0 && (
        <div className="px-5 py-3 bg-[#F8FAFC] border-t border-[#E2E8F0] flex items-center justify-between text-xs text-[#64748B]">
          <span>
            Showing {displayedItems.length} of {feedbackList.length} feedback records
          </span>
          {compact && feedbackList.length > maxItems && (
            <button
              type="button"
              onClick={onViewAllFeedback}
              className="font-semibold text-[#3478F6] hover:text-[#2563EB] cursor-pointer"
            >
              View all →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
