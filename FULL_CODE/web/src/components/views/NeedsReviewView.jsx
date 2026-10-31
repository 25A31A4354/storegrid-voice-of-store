import React, { useState } from 'react';
import { ClipboardCheck, CheckCircle, AlertTriangle } from 'lucide-react';
import Button from '../common/Button';
import { CATEGORIES, OPERATIONAL_CATEGORIES } from '../../constants/categories';

export default function NeedsReviewView({ reviewFeedbackList = [], onUpdateClassification, onShowToast }) {
  const [pendingSelections, setPendingSelections] = useState({});
  const [submittingId, setSubmittingId] = useState(null);

  const handleCategoryPick = (feedbackId, category) => {
    setPendingSelections((prev) => ({
      ...prev,
      [feedbackId]: category,
    }));
  };

  const handleConfirmReview = async (item) => {
    const chosenCategory =
      pendingSelections[item.feedbackId] || (item.category !== 'NEEDS_REVIEW' ? item.category : 'OTHER');

    setSubmittingId(item.feedbackId);
    try {
      await onUpdateClassification(item.feedbackId, {
        category: chosenCategory,
        needsReview: false,
      });
      onShowToast({
        type: 'success',
        title: 'Classification Confirmed',
        message: `${item.feedbackId} assigned to "${CATEGORIES[chosenCategory]?.label || chosenCategory}".`,
      });
    } catch {
      onShowToast({
        type: 'error',
        title: 'Error',
        message: 'Could not update classification.',
      });
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12 text-[#172033]">
      {/* Intro Header */}
      {reviewFeedbackList.length > 0 ? (
        <div className="bg-gradient-to-r from-amber-50/90 via-orange-50/60 to-amber-50/90 p-6 rounded-2xl border border-amber-200 shadow-2xs">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-700 shrink-0 shadow-2xs">
              <ClipboardCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-xl font-bold text-[#172033]">Manual Feedback Review Queue</h2>
                <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-amber-200 text-amber-900 border border-amber-300">
                  {reviewFeedbackList.length} {reviewFeedbackList.length === 1 ? 'Item' : 'Items'} Pending Verification
                </span>
              </div>
              <p className="text-sm text-[#64748B] mt-1 max-w-2xl leading-relaxed">
                Some feedback needs a quick manual check because its meaning is unclear or the NLP system is not
                confident about the category. Review each statement and assign the correct operational pillar with one
                click.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white p-6 rounded-2xl border border-[#E2E8F0] shadow-xs">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shrink-0">
              <ClipboardCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-xl font-bold text-[#172033]">Manual Feedback Review Queue</h2>
                <span className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  0 Items Pending Verification
                </span>
              </div>
              <p className="text-sm text-[#64748B] mt-1 max-w-2xl leading-relaxed">
                All customer responses are currently classified with high confidence. When new ambiguous feedback or
                low-confidence NLP transcripts arrive, they will appear here for review.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Review Queue Items */}
      {reviewFeedbackList.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E2E8F0] p-12 text-center shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-[#172033]">Review Queue is Clear!</h3>
          <p className="text-xs sm:text-sm text-[#64748B] mt-1 max-w-md mx-auto">
            All customer feedback has been verified and classified with high confidence. New ambiguous items will appear
            here automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {reviewFeedbackList.map((item) => {
            const currentSelected =
              pendingSelections[item.feedbackId] || (item.category !== 'NEEDS_REVIEW' ? item.category : null);
            const isSubmitting = submittingId === item.feedbackId;
            const confidencePercent = Math.round((item.confidence || 0.5) * 100);

            return (
              <div
                key={item.feedbackId}
                className="bg-white rounded-2xl border border-[#E2E8F0] hover:border-[#3478F6]/40 p-5 sm:p-6 shadow-xs hover:shadow-sm transition-all"
              >
                {/* Item Top Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#E2E8F0] text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-[#172033] bg-[#F1F5F9] border border-[#E2E8F0] px-2 py-0.5 rounded">
                      {item.feedbackId}
                    </span>
                    <span className="text-[#64748B]">•</span>
                    <span className="text-[#64748B]">{item.timestamp}</span>
                    <span className="text-[#64748B]">•</span>
                    <span className="text-[#64748B]">{item.channel}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                      Confidence: {confidencePercent}%
                    </span>
                  </div>
                </div>

                {/* Original Feedback Speech / Text */}
                <div className="mt-4">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
                    Customer Feedback (Verbatim Voice / Text)
                  </label>
                  <p className="text-base font-semibold text-[#172033] mt-1 italic">"{item.originalText}"</p>
                  {item.cleanedText && item.cleanedText !== item.originalText && (
                    <p className="text-xs text-[#64748B] mt-1.5">
                      <strong className="text-[#172033]">AI Cleaned / Normalized:</strong> {item.cleanedText}
                    </p>
                  )}
                </div>

                {/* Matched entity keywords */}
                {item.matchedTerms && item.matchedTerms.length > 0 && (
                  <div className="mt-3 flex items-center gap-1.5">
                    <span className="text-[11px] font-medium text-[#64748B]">Detected Keywords:</span>
                    <div className="flex flex-wrap gap-1">
                      {item.matchedTerms.map((t, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 text-[11px] font-mono rounded bg-[#F1F5F9] text-[#64748B] border border-[#E2E8F0]"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Classification Options */}
                <div className="mt-5 pt-4 border-t border-[#E2E8F0]">
                  <label className="text-xs font-bold text-[#172033] block mb-2.5">
                    Select the Correct Operational Category:
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                    {OPERATIONAL_CATEGORIES.map((catKey) => {
                      const cat = CATEGORIES[catKey];
                      const isSelected = currentSelected === catKey;

                      return (
                        <button
                          key={catKey}
                          type="button"
                          onClick={() => handleCategoryPick(item.feedbackId, catKey)}
                          className={`p-2 rounded-xl text-xs font-semibold border text-center transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-[#3478F6] text-white border-[#3478F6] shadow-xs'
                              : 'bg-[#F8FAFC] text-[#172033] border-[#E2E8F0] hover:border-[#CBD5E1] hover:bg-white'
                          }`}
                        >
                          {cat.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Confirmation Action Row */}
                <div className="mt-5 flex items-center justify-between gap-3 pt-3 border-t border-[#E2E8F0]">
                  <span className="text-xs text-[#64748B]">
                    {currentSelected
                      ? `Selected: ${CATEGORIES[currentSelected]?.label}`
                      : 'Choose category above to verify'}
                  </span>

                  <Button
                    variant="primary"
                    size="sm"
                    loading={isSubmitting}
                    disabled={!currentSelected}
                    onClick={() => handleConfirmReview(item)}
                    icon={CheckCircle}
                    iconPosition="left"
                    className="cursor-pointer"
                  >
                    Confirm & Complete Review
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
