import React, { useState, useEffect, useCallback } from 'react';
import Header from './components/layout/Header';
import Sidebar from './components/layout/Sidebar';
import Toast from './components/common/Toast';
import FeedbackDetailModal from './components/dashboard/FeedbackDetailModal';
import SubmitFeedbackModal from './components/dashboard/SubmitFeedbackModal';
import OverviewView from './components/views/OverviewView';
import FeedbackView from './components/views/FeedbackView';
import NeedsReviewView from './components/views/NeedsReviewView';
import TrendsView from './components/views/TrendsView';
import SettingsView from './components/views/SettingsView';
import BriefsView from './components/views/BriefsView';
import DatasetUploadView from './components/views/DatasetUploadView';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import {
  getStores,
  getDashboardOverview,
  getFeedbackList,
  listDatasetBatches,
  updateFeedbackReview,
  resetFeedbackData,
  ApiError,
} from './services/feedbackService';

function normalizeError(err) {
  if (err instanceof ApiError) return err;
  const isNet =
    !err?.status &&
    (err?.name === 'TypeError' ||
      String(err?.message || '')
        .toLowerCase()
        .includes('fetch'));
  return new ApiError(err?.message || 'Unknown error occurred', err?.status || null, isNet);
}

export default function App() {
  // Navigation & Page State
  const [activeDashboardTab, setActiveDashboardTab] = useState('overview');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Global Scope Filters
  const [selectedStore, setSelectedStore] = useState('ALL');
  const [selectedDateRange, setSelectedDateRange] = useState('last30');
  const [selectedBatch, setSelectedBatch] = useState('ALL');
  const [stores, setStores] = useState([]);
  const [batches, setBatches] = useState([]);

  // Table Search and Category/Priority Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedPriority, setSelectedPriority] = useState('ALL');

  // Data States
  const [overviewData, setOverviewData] = useState(null);
  const [feedbackList, setFeedbackList] = useState([]);
  const [reviewList, setReviewList] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [apiError, setApiError] = useState(null);

  // Modal & Toast State
  const [activeFeedbackModal, setActiveFeedbackModal] = useState(null);
  const [isSubmitFeedbackOpen, setIsSubmitFeedbackOpen] = useState(false);
  const [toast, setToast] = useState(null);

  // Show Toast Helper
  const showToast = useCallback(({ type = 'info', title, message }) => {
    setToast({ type, title, message });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  }, []);

  // Fetch registered stores on mount
  useEffect(() => {
    let mounted = true;
    getStores()
      .then((data) => {
        if (mounted && data && Array.isArray(data) && data.length > 0) {
          setStores(data);
        }
      })
      .catch((err) => console.warn('Failed to pre-fetch stores:', err));
    return () => {
      mounted = false;
    };
  }, []);

  // Fetch dashboard data reactively with cleanup
  useEffect(() => {
    let isCurrent = true;

    async function loadData() {
      setIsLoading(true);
      try {
        const [batchData, overview, list, reviews] = await Promise.all([
          listDatasetBatches().catch(() => []),
          getDashboardOverview({
            storeId: selectedStore,
            dateRange: selectedDateRange,
            batchId: selectedBatch,
          }),
          getFeedbackList({
            storeId: selectedStore,
            dateRange: selectedDateRange,
            category: selectedCategory,
            priority: selectedPriority,
            batchId: selectedBatch,
            search: searchQuery,
          }),
          getFeedbackList({
            storeId: selectedStore,
            dateRange: selectedDateRange,
            batchId: selectedBatch,
            needsReviewOnly: true,
          }),
        ]);

        if (isCurrent) {
          if (batchData && Array.isArray(batchData)) {
            setBatches(batchData);
          }
          setOverviewData(overview);
          setFeedbackList(Array.isArray(list) ? list : []);
          setReviewList(Array.isArray(reviews) ? reviews : []);
          setApiError(null);
          setIsLoading(false);
        }
      } catch (err) {
        if (isCurrent) {
          console.error('Failed to load dashboard data:', err);
          setApiError(normalizeError(err));
          setIsLoading(false);
        }
      }
    }

    loadData();

    return () => {
      isCurrent = false;
    };
  }, [selectedStore, selectedDateRange, selectedBatch, selectedCategory, selectedPriority, searchQuery, refreshToken]);

  // Explicit user-triggered refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const [storeData, batchData, overview, list, reviews] = await Promise.all([
        getStores(),
        listDatasetBatches().catch(() => []),
        getDashboardOverview({
          storeId: selectedStore,
          dateRange: selectedDateRange,
          batchId: selectedBatch,
        }),
        getFeedbackList({
          storeId: selectedStore,
          dateRange: selectedDateRange,
          category: selectedCategory,
          priority: selectedPriority,
          batchId: selectedBatch,
          search: searchQuery,
        }),
        getFeedbackList({
          storeId: selectedStore,
          dateRange: selectedDateRange,
          batchId: selectedBatch,
          needsReviewOnly: true,
        }),
      ]);

      if (storeData && Array.isArray(storeData) && storeData.length > 0) {
        setStores(storeData);
      }
      if (batchData && Array.isArray(batchData)) {
        setBatches(batchData);
      }
      setOverviewData(overview);
      setFeedbackList(Array.isArray(list) ? list : []);
      setReviewList(Array.isArray(reviews) ? reviews : []);
      setApiError(null);

      const storeObj = stores.find((s) => s.id === selectedStore || s.code === selectedStore);
      showToast({
        type: 'success',
        title: 'Data Refreshed',
        message: `Live metrics updated for ${selectedStore === 'ALL' ? 'all stores' : storeObj?.name || selectedStore}.`,
      });
    } catch (err) {
      console.error('Refresh error:', err);
      const normErr = normalizeError(err);
      setApiError(normErr);
      showToast({
        type: 'error',
        title: normErr.isNetwork ? 'Connection Error' : `API Error (${normErr.status || 400})`,
        message: normErr.message || 'Could not refresh feedback records from backend.',
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  // Handle Manual Classification Update
  const handleUpdateClassification = async (feedbackId, updates) => {
    try {
      await updateFeedbackReview(feedbackId, updates);
      showToast({
        type: 'success',
        title: 'Review Saved',
        message: `Feedback ${feedbackId} classification updated.`,
      });
      // Trigger state reload
      setRefreshToken((prev) => prev + 1);
    } catch (err) {
      console.error('Failed to update classification:', err);
      showToast({
        type: 'error',
        title: 'Update Failed',
        message: err.message || 'Could not save feedback review.',
      });
    }
  };

  // Handle Mock Data Reset
  const handleResetData = () => {
    resetFeedbackData();
    setSelectedCategory('ALL');
    setSelectedPriority('ALL');
    setSearchQuery('');
    setRefreshToken((prev) => prev + 1);
  };

  const pageTitles = {
    overview: { title: 'Overview', subtitle: 'How your stores are doing and what needs you first' },
    'dataset-upload': { title: 'Import data', subtitle: 'Upload a feedback file and map its columns' },
    feedback: { title: 'Feedback', subtitle: 'Every comment with its category, owner and confidence' },
    briefs: { title: 'Weekly briefs', subtitle: 'One page per region: top problems, quotes and what to do' },
    trends: { title: 'Trends', subtitle: 'Volume over time, store spikes and repeat issues' },
    'needs-review': {
      title: 'Second look',
      subtitle: 'Comments we were not sure about. A quick check keeps the numbers right',
    },
    settings: { title: 'Settings', subtitle: 'Review threshold and system status' },
  };
  const currentTitleInfo = pageTitles[activeDashboardTab] || pageTitles.overview;

  const selectedStoreObj = stores.find((s) => s.id === selectedStore || s.code === selectedStore);
  const batchLabel =
    selectedBatch === 'ALL'
      ? 'All sources'
      : selectedBatch === 'DEMO_ONLY'
        ? 'Seed demo data'
        : selectedBatch === 'IMPORTED_ONLY'
          ? 'Uploaded datasets'
          : batches.find((b) => b.id === selectedBatch)?.filename || selectedBatch;
  const periodLabel =
    { today: 'Today', last7: 'Last 7 days', last30: 'Last 30 days' }[selectedDateRange] || selectedDateRange;
  const scope = {
    storeName: selectedStoreObj
      ? `${selectedStoreObj.name}${selectedStoreObj.city ? `, ${selectedStoreObj.city}` : ''}`
      : `All stores (${stores.length})`,
    periodLabel,
    batchLabel,
  };

  return (
    <div className="relative flex min-h-screen bg-night text-fg antialiased">
      <div className="aurora" aria-hidden="true" />
      <Sidebar
        embedded={true}
        activePage={activeDashboardTab}
        onSelectPage={setActiveDashboardTab}
        reviewQueueCount={overviewData?.metrics?.needsReview ?? reviewList.length}
      />

      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <Header
          pageTitle={currentTitleInfo.title}
          pageSubtitle={currentTitleInfo.subtitle}
          stores={stores}
          selectedStore={selectedStore}
          onSelectStore={setSelectedStore}
          selectedDateRange={selectedDateRange}
          onSelectDateRange={setSelectedDateRange}
          batches={batches}
          selectedBatch={selectedBatch}
          onSelectBatch={setSelectedBatch}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
          onOpenMobileMenu={() => setIsMobileSidebarOpen(true)}
          onOpenSubmit={() => setIsSubmitFeedbackOpen(true)}
          hideFilters={activeDashboardTab === 'briefs'}
        />

        {apiError && (
          <div
            role="alert"
            className="mx-4 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 lg:mx-6"
          >
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">
                  {apiError.isNetwork
                    ? 'Cannot reach the StoreGrid API'
                    : `The API returned an error${apiError.status ? ` (HTTP ${apiError.status})` : ''}`}
                </p>
                <p className="text-red-800">{apiError.message}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-red-300 bg-white px-3 text-sm font-medium text-red-800 hover:bg-red-100"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              Retry
            </button>
          </div>
        )}

        <main key={activeDashboardTab} className="rise flex-1 p-4 lg:p-8" id="main">
          <div className="live text-ink">
            {activeDashboardTab === 'overview' && (
              <OverviewView
                overviewData={overviewData}
                feedbackList={feedbackList}
                isLoading={isLoading}
                scope={scope}
                selectedStore={selectedStore}
                selectedBatch={selectedBatch}
                selectedDateRange={selectedDateRange}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                selectedCategory={selectedCategory}
                onCategoryChange={setSelectedCategory}
                selectedPriority={selectedPriority}
                onPriorityChange={setSelectedPriority}
                onSelectFeedback={(item) => setActiveFeedbackModal(item)}
                onViewAllFeedback={() => setActiveDashboardTab('feedback')}
                onNavigateToReviews={() => setActiveDashboardTab('needs-review')}
              />
            )}

            {activeDashboardTab === 'dataset-upload' && (
              <DatasetUploadView
                onSelectBatch={(batchId) => {
                  setSelectedBatch(batchId);
                  setRefreshToken((prev) => prev + 1);
                }}
                onNavigateToDashboard={(tab) => setActiveDashboardTab(tab || 'overview')}
                onBatchImported={async () => {
                  const freshBatches = await listDatasetBatches().catch(() => []);
                  setBatches(freshBatches);
                }}
                onShowToast={showToast}
              />
            )}

            {activeDashboardTab === 'feedback' && (
              <FeedbackView
                feedbackList={feedbackList}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                selectedCategory={selectedCategory}
                onCategoryChange={setSelectedCategory}
                selectedPriority={selectedPriority}
                onPriorityChange={setSelectedPriority}
                onSelectFeedback={(item) => setActiveFeedbackModal(item)}
                isLoading={isLoading}
                onShowToast={showToast}
                onOpenSubmitModal={() => setIsSubmitFeedbackOpen(true)}
              />
            )}

            {activeDashboardTab === 'briefs' && <BriefsView />}

            {activeDashboardTab === 'trends' && (
              <TrendsView selectedStore={selectedStore} selectedBatch={selectedBatch} />
            )}

            {activeDashboardTab === 'needs-review' && (
              <NeedsReviewView
                reviewFeedbackList={reviewList}
                onUpdateClassification={handleUpdateClassification}
                onShowToast={showToast}
              />
            )}

            {activeDashboardTab === 'settings' && (
              <SettingsView onResetData={handleResetData} onShowToast={showToast} />
            )}
          </div>
        </main>
      </div>

      <FeedbackDetailModal
        key={activeFeedbackModal?.feedbackId || activeFeedbackModal?.id || 'none'}
        feedback={activeFeedbackModal}
        isOpen={Boolean(activeFeedbackModal)}
        onClose={() => setActiveFeedbackModal(null)}
        onUpdateClassification={handleUpdateClassification}
      />

      <SubmitFeedbackModal
        isOpen={isSubmitFeedbackOpen}
        onClose={() => setIsSubmitFeedbackOpen(false)}
        stores={stores}
        onSuccess={() => setRefreshToken((t) => t + 1)}
        onShowToast={showToast}
      />

      <Toast toast={toast} onClose={() => setToast(null)} />

      <Sidebar
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        activePage={activeDashboardTab}
        onSelectPage={setActiveDashboardTab}
        reviewQueueCount={overviewData?.metrics?.needsReview ?? reviewList.length}
      />
    </div>
  );
}
