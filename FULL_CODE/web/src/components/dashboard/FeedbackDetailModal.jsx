import React, { useState } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Badge from '../common/Badge';
import { CATEGORIES, PRIORITY_CONFIG, OPERATIONAL_CATEGORIES } from '../../constants/categories';
import { CheckCircle2, AlertTriangle, Hash, Check } from 'lucide-react';

export default function FeedbackDetailModal({ feedback, isOpen, onClose, onUpdateClassification }) {
  const [selectedCategory, setSelectedCategory] = useState(feedback?.category || 'OTHER');
  const [managerNotes, setManagerNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!feedback) return null;

  const priConfig = PRIORITY_CONFIG[feedback.priority] || {
    label: feedback.priority,
  };
  const isNeedsReview = feedback.needsReview || feedback.category === 'NEEDS_REVIEW';
  const confidencePercent = Math.round((feedback.confidence || 0.8) * 100);

  const handleSave = async (markResolved = false) => {
    setIsSubmitting(true);
    try {
      await onUpdateClassification(feedback.feedbackId, {
        category: selectedCategory,
        notes: managerNotes,
        resolved: markResolved ? true : feedback.resolved,
      });
      onClose();
    } catch (err) {
      console.error('Error saving classification:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Feedback Details: ${feedback.feedbackId}`}
      subtitle={`Received ${feedback.timestamp} • Store ID: ${feedback.storeId}`}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-5 text-sm text-[#172033]">
        {/* Review Status Banner if manual triage needed */}
        {isNeedsReview ? (
          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-bold text-amber-900">Action Required: Manual NLP Verification</p>
              <p className="text-xs text-amber-700 mt-0.5">
                The AI classification confidence ({confidencePercent}%) is below the automated approval threshold.
                Please verify or reclassify below.
              </p>
            </div>
          </div>
        ) : (
          <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-semibold text-emerald-900">
                Rule Match Score: {confidencePercent}% (Rule-based Heuristic)
              </span>
            </div>
            <span className="text-[11px] text-emerald-700 font-medium">Verified by StoreGrid NLP (R5 Taxonomy)</span>
          </div>
        )}

        {/* Customer Original Statement */}
        <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
          <label className="text-[11px] font-bold uppercase tracking-wider text-[#64748B] block mb-1">
            Customer Statement (Original Voice/Transcript)
          </label>
          <blockquote className="text-base font-semibold text-[#172033] italic">"{feedback.originalText}"</blockquote>

          {feedback.originalText !== feedback.cleanedText && (
            <div className="mt-3 pt-3 border-t border-[#E2E8F0]">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B] block mb-1">
                Normalized NLP Interpretation / Translation
              </span>
              <p className="text-xs text-[#64748B]">{feedback.cleanedText}</p>
            </div>
          )}
        </div>

        {/* Metadata Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
            <span className="text-[11px] text-[#64748B] font-medium block">Priority</span>
            <div className="mt-1">
              <Badge
                variant={
                  feedback.priority === 'CRITICAL' ? 'danger' : feedback.priority === 'HIGH' ? 'warning' : 'primary'
                }
                size="xs"
                dot
                dotColor={priConfig.dotColor}
              >
                {priConfig.label} Priority
              </Badge>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
            <span className="text-[11px] text-[#64748B] font-medium block">Channel Source</span>
            <span className="text-xs font-semibold text-[#172033] mt-1 block">
              {feedback.channel || 'QR Code at POS'}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] col-span-2 sm:col-span-1">
            <span className="text-[11px] text-[#64748B] font-medium block">Assigned Department</span>
            <span className="text-xs font-semibold text-[#172033] mt-1 block truncate">
              {feedback.department ||
                feedback.metadata?.nlp?.ownerFunction ||
                CATEGORIES[feedback.category]?.owner ||
                'Store Ops'}
            </span>
          </div>
        </div>

        {/* Matched NLP Terms */}
        <div>
          <span className="text-xs font-bold text-[#172033] block mb-2">NLP Matched Keywords & Trigger Terms:</span>
          <div className="flex flex-wrap gap-1.5">
            {(feedback.matchedTerms && feedback.matchedTerms.length > 0
              ? feedback.matchedTerms
              : feedback.metadata?.nlp?.matchedTerms && feedback.metadata.nlp.matchedTerms.length > 0
                ? feedback.metadata.nlp.matchedTerms
                : []
            ).length > 0 ? (
              (feedback.matchedTerms && feedback.matchedTerms.length > 0
                ? feedback.matchedTerms
                : feedback.metadata.nlp.matchedTerms
              ).map((term, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-mono font-medium rounded-md bg-blue-50 text-[#3478F6] border border-blue-200"
                >
                  <Hash className="w-3 h-3 text-[#3478F6]" />
                  {term}
                </span>
              ))
            ) : (
              <span className="text-xs text-[#64748B]">No specific entity terms extracted</span>
            )}
          </div>
        </div>

        {/* Manager Classification Assignment */}
        <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
          <label className="text-xs font-bold text-[#172033] block mb-2">
            Assign / Reclassify Operational Category:
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {OPERATIONAL_CATEGORIES.map((catKey) => {
              const opt = CATEGORIES[catKey];
              const isSelected = selectedCategory === catKey;
              return (
                <button
                  key={catKey}
                  type="button"
                  onClick={() => setSelectedCategory(catKey)}
                  className={`p-2.5 text-left rounded-lg text-xs font-semibold border transition-all cursor-pointer flex items-center justify-between ${
                    isSelected
                      ? 'bg-[#3478F6] text-white border-[#3478F6] shadow-xs'
                      : 'bg-white text-[#172033] border-[#E2E8F0] hover:border-[#CBD5E1]'
                  }`}
                >
                  <span className="truncate">{opt.label}</span>
                  {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                </button>
              );
            })}
          </div>

          {/* Internal notes input */}
          <div className="mt-3">
            <label className="text-[11px] font-semibold text-[#64748B] block mb-1">
              Store Manager Operational Note (Optional):
            </label>
            <input
              type="text"
              value={managerNotes}
              onChange={(e) => setManagerNotes(e.target.value)}
              placeholder="e.g. Discussed with cashier on counter 3, recalibrated scanner..."
              className="w-full px-3 py-1.5 text-xs text-[#172033] placeholder-[#94A3B8] bg-white border border-[#E2E8F0] rounded-xl focus:ring-2 focus:ring-[#3478F6]/20 focus:border-[#3478F6] outline-hidden"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-[#E2E8F0]">
          <div className="text-xs text-[#64748B]">
            {feedback.resolved ? (
              <span className="text-emerald-600 font-medium">✓ Currently marked as Resolved</span>
            ) : (
              <span>Status: Open / In Progress</span>
            )}
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button variant="secondary" size="sm" onClick={onClose} className="flex-1 sm:flex-none cursor-pointer">
              Cancel
            </Button>
            {!feedback.resolved && (
              <Button
                variant="subtle"
                size="sm"
                loading={isSubmitting}
                onClick={() => handleSave(true)}
                className="flex-1 sm:flex-none cursor-pointer"
              >
                Mark Resolved
              </Button>
            )}
            <Button
              variant="primary"
              size="sm"
              loading={isSubmitting}
              onClick={() => handleSave(false)}
              className="flex-1 sm:flex-none cursor-pointer"
            >
              Confirm Category
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
