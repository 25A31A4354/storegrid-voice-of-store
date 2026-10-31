import React, { useState } from 'react';
import FeedbackTable from '../dashboard/FeedbackTable';
import Button from '../common/Button';
import { Download, Plus } from 'lucide-react';

export default function FeedbackView({
  feedbackList = [],
  searchQuery,
  onSearchChange,
  selectedCategory,
  onCategoryChange,
  selectedPriority,
  onPriorityChange,
  onSelectFeedback,
  isLoading,
  onShowToast,
  onOpenSubmitModal,
}) {
  const [statusFilter, setStatusFilter] = useState('ALL');

  const filteredList = feedbackList.filter((item) => {
    if (statusFilter === 'RESOLVED') return item.resolved;
    if (statusFilter === 'OPEN') return !item.resolved;
    return true;
  });

  const handleExportCSV = () => {
    if (filteredList.length === 0) {
      onShowToast({
        type: 'info',
        title: 'Export Empty',
        message: 'No feedback entries match current filters.',
      });
      return;
    }

    const headers = [
      'Feedback ID',
      'Store ID',
      'Original Text',
      'Category',
      'Priority',
      'Confidence',
      'Needs Review',
      'Status',
    ];
    const rows = filteredList.map((item) => [
      item.feedbackId,
      item.storeId,
      `"${item.originalText.replace(/"/g, '""')}"`,
      item.category,
      item.priority,
      item.confidence,
      item.needsReview ? 'Yes' : 'No',
      item.resolved ? 'Resolved' : 'Open',
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `storegrid-feedback-export.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    onShowToast({
      type: 'success',
      title: 'CSV Exported',
      message: `Exported ${filteredList.length} feedback records successfully.`,
    });
  };

  return (
    <div className="space-y-5 max-w-7xl mx-auto pb-12 text-[#172033]">
      {/* Top Banner Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-5 rounded-2xl border border-[#E2E8F0] shadow-xs">
        <div>
          <h2 className="text-lg font-bold text-[#172033]">Voice-of-Store Feedback Explorer</h2>
          <p className="text-xs text-[#64748B] mt-0.5">
            Examine customer transcripts, trigger keywords, and classification certainty.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Status filter toggle */}
          <div className="inline-flex rounded-xl border border-[#E2E8F0] bg-[#F1F5F9] p-1 text-xs font-medium">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                statusFilter === 'ALL'
                  ? 'bg-white text-[#172033] font-semibold shadow-2xs'
                  : 'text-[#64748B] hover:text-[#172033]'
              }`}
            >
              All ({feedbackList.length})
            </button>
            <button
              onClick={() => setStatusFilter('OPEN')}
              className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                statusFilter === 'OPEN'
                  ? 'bg-white text-[#172033] font-semibold shadow-2xs'
                  : 'text-[#64748B] hover:text-[#172033]'
              }`}
            >
              Open
            </button>
            <button
              onClick={() => setStatusFilter('RESOLVED')}
              className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                statusFilter === 'RESOLVED'
                  ? 'bg-white text-[#172033] font-semibold shadow-2xs'
                  : 'text-[#64748B] hover:text-[#172033]'
              }`}
            >
              Resolved
            </button>
          </div>

          <Button variant="secondary" size="sm" onClick={handleExportCSV} icon={Download} className="cursor-pointer">
            Export CSV
          </Button>

          {onOpenSubmitModal && (
            <Button variant="primary" size="sm" onClick={onOpenSubmitModal} icon={Plus} className="cursor-pointer">
              + New Feedback
            </Button>
          )}
        </div>
      </div>

      {/* Main Feedback Table with Full Height */}
      <FeedbackTable
        feedbackList={filteredList}
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        selectedCategory={selectedCategory}
        onCategoryChange={onCategoryChange}
        selectedPriority={selectedPriority}
        onPriorityChange={onPriorityChange}
        onSelectFeedback={onSelectFeedback}
        isLoading={isLoading}
        compact={false}
      />
    </div>
  );
}
