import React, { useState } from 'react';
import { Send, Sparkles, Store, Star, AlertCircle } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import { submitFeedback } from '../../services/feedbackService';

const SAMPLE_PROMPTS = [
  { label: 'Allergen (Hinglish)', text: 'biscuit pack me allergen label nahi tha, bachche ko reaction ho gaya' },
  { label: 'Freezer (staff note)', text: 'frzr not cooling at Gariahat, ice cream melted again, 3rd day' },
  { label: 'Out of stock (Tamil)', text: 'Velachery la atta stock illa, rendu naal aa shelf empty ah irukku' },
  { label: 'Slow billing (Marathi)', text: 'billing la khup vel lagla, ekach counter chalu hota' },
  { label: 'Expired product', text: 'Purchased bread pack yesterday, noticed green fungal mold inside. Expired item!' },
];

export default function SubmitFeedbackModal({ isOpen, onClose, stores = [], onSuccess, onShowToast }) {
  const [storeCode, setStoreCode] = useState('STR-HYD-001');
  const [sourceType, setSourceType] = useState('CUSTOMER_REVIEW');
  const [text, setText] = useState('');
  const [rating, setRating] = useState('1');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim()) {
      setErrorMessage('Please enter feedback text');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const result = await submitFeedback({
        storeCode,
        text: text.trim(),
        sourceType,
        rating: rating ? parseInt(rating, 10) : undefined,
        provenance: 'SYNTHETIC_DEMO',
      });

      const detectedCat =
        result?.data?.detectedCategory || result?.data?.category || result?.category || 'NEEDS_REVIEW';
      const confidence = result?.data?.confidence || result?.confidence || 0.9;

      if (onShowToast) {
        onShowToast({
          type: 'success',
          title: 'Feedback Processed & Classified',
          message: `Categorized as ${detectedCat} (Confidence: ${Math.round(confidence * 100)}%)`,
        });
      }

      setText('');
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error('Feedback submission failed:', err);
      setErrorMessage(err.message || 'Failed to submit feedback');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Submit Voice-of-Store Feedback" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        {errorMessage && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Store Selector */}
        <div>
          <label htmlFor="submit-store" className="block text-xs font-semibold text-[#172033] mb-1">
            Store Location
          </label>
          <div className="relative">
            <Store className="w-4 h-4 absolute left-3 top-2.5 text-[#64748B] pointer-events-none" />
            <select
              id="submit-store"
              value={storeCode}
              onChange={(e) => setStoreCode(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-[#E2E8F0] rounded-xl text-xs sm:text-sm text-[#172033] focus:ring-2 focus:ring-[#3478F6]/20 focus:border-[#3478F6]"
            >
              {stores && stores.length > 0 ? (
                stores.map((s) => (
                  <option key={s.id || s.code} value={s.code}>
                    {s.name} ({s.code})
                  </option>
                ))
              ) : (
                <>
                  <option value="STR-HYD-001">StoreGrid Banjara Hills (STR-HYD-001)</option>
                  <option value="STR-VIZ-002">StoreGrid Beach Road (STR-VIZ-002)</option>
                  <option value="STR-VJA-003">StoreGrid Benz Circle (STR-VJA-003)</option>
                  <option value="STR-GNT-004">StoreGrid Brodipet (STR-GNT-004)</option>
                  <option value="STR-TPT-005">StoreGrid Alipiri Road (STR-TPT-005)</option>
                </>
              )}
            </select>
          </div>
        </div>

        {/* Source & Rating Row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="submit-source" className="block text-xs font-semibold text-[#172033] mb-1">
              Source Channel
            </label>
            <select
              id="submit-source"
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-[#E2E8F0] rounded-xl text-xs sm:text-sm text-[#172033] focus:ring-2 focus:ring-[#3478F6]/20 focus:border-[#3478F6]"
            >
              <option value="CUSTOMER_REVIEW">Customer Review</option>
              <option value="STAFF_NOTE">Staff Note</option>
              <option value="KIOSK_FEEDBACK">Kiosk Feedback</option>
              <option value="WHATSAPP_CHAT">WhatsApp Audio/Chat</option>
              <option value="CALL_TRANSCRIPT">Call Transcript</option>
              <option value="CUSTOMER_SURVEY">Customer Survey</option>
            </select>
          </div>

          <div>
            <label htmlFor="submit-rating" className="block text-xs font-semibold text-[#172033] mb-1">
              Rating (1 - 5)
            </label>
            <div className="relative">
              <Star className="w-4 h-4 absolute left-3 top-2.5 text-amber-500 pointer-events-none" />
              <select
                id="submit-rating"
                value={rating}
                onChange={(e) => setRating(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white border border-[#E2E8F0] rounded-xl text-xs sm:text-sm text-[#172033] focus:ring-2 focus:ring-[#3478F6]/20 focus:border-[#3478F6]"
              >
                <option value="1">1 Star (Critical Complaint)</option>
                <option value="2">2 Stars (Poor Experience)</option>
                <option value="3">3 Stars (Average / Neutral)</option>
                <option value="4">4 Stars (Good)</option>
                <option value="5">5 Stars (Excellent Compliment)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Fast Template Prompts */}
        <div>
          <label className="block text-[11px] font-semibold text-[#64748B] mb-1.5 flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-[#3478F6]" /> Example comments
          </label>
          <div className="flex flex-wrap gap-1.5">
            {SAMPLE_PROMPTS.map((sample, idx) => (
              <button
                type="button"
                key={idx}
                onClick={() => setText(sample.text)}
                className="text-[11px] px-2.5 py-1 bg-[#F1F5F9] hover:bg-blue-50 hover:text-[#3478F6] text-[#475569] rounded-lg border border-[#E2E8F0] transition-colors cursor-pointer"
              >
                {sample.label}
              </button>
            ))}
          </div>
        </div>

        {/* Feedback Text Input */}
        <div>
          <label htmlFor="submit-text" className="block text-xs font-semibold text-[#172033] mb-1">
            Comment
          </label>
          <textarea
            id="submit-text"
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type or paste retail feedback here (English, Hinglish, Tamil or Marathi in English letters)..."
            className="w-full p-3 bg-white border border-[#E2E8F0] rounded-xl text-xs sm:text-sm text-[#172033] focus:ring-2 focus:ring-[#3478F6]/20 focus:border-[#3478F6]"
          />
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E2E8F0]">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm" icon={Send} disabled={isSubmitting || !text.trim()}>
            {isSubmitting ? 'Classifying via NLP...' : 'Submit to StoreGrid'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
