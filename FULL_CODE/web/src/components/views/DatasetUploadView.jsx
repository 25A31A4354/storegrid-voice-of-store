import React, { useState, useEffect, useCallback, useRef } from 'react';
import Counter from '../common/Counter';
import {
  UploadCloud,
  FileSpreadsheet,
  FileText,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Database,
  ArrowRight,
  FileCode,
  Info,
  Layers,
  Sparkles,
  Eye,
  Check,
  ChevronRight,
} from 'lucide-react';
import { previewDatasetFile, uploadDatasetFile, listDatasetBatches } from '../../services/feedbackService';

const TARGET_FIELDS = [
  {
    key: 'text',
    label: 'Complaint / Feedback Text',
    required: true,
    description: 'Core feedback narrative or customer remarks',
  },
  {
    key: 'storeId',
    label: 'Store Code / ID',
    required: false,
    description: 'E.g. STR-HYD-001, store-001, or Hyderabad',
  },
  { key: 'timestamp', label: 'Timestamp / Date', required: false, description: 'ISO string or YYYY-MM-DD date' },
  { key: 'rating', label: 'Customer Rating (1-5)', required: false, description: 'Numeric rating between 1 and 5' },
  {
    key: 'customerIdentifier',
    label: 'Customer / Author',
    required: false,
    description: 'Customer ID, phone, email, or pseudonym',
  },
  {
    key: 'itemOrAssetId',
    label: 'Item / Asset ID',
    required: false,
    description: 'E.g. freezer-01, POS-3, milk-500ml',
  },
  { key: 'id', label: 'Explicit Record ID', required: false, description: 'Preserves CMP-001 or source complaint ID' },
];

export default function DatasetUploadView({ onSelectBatch, onNavigateToDashboard, onShowToast, onBatchImported }) {
  const [file, setFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [columnMapping, setColumnMapping] = useState({});
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [batches, setBatches] = useState([]);
  const [isLoadingBatches, setIsLoadingBatches] = useState(true);
  const [error, setError] = useState(null);

  const fileInputRef = useRef(null);

  // Load past batches
  const loadBatches = useCallback(
    () =>
      listDatasetBatches()
        .then((data) => setBatches(data || []))
        .catch((err) => console.warn('Failed to load past batches:', err))
        .finally(() => setIsLoadingBatches(false)),
    []
  );

  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  const reloadBatches = () => {
    setIsLoadingBatches(true);
    loadBatches();
  };

  const handleFileChange = async (selectedFile) => {
    if (!selectedFile) return;

    const validExts = ['.csv', '.xlsx', '.json', '.txt'];
    const nameLower = selectedFile.name.toLowerCase();
    const isValid = validExts.some((ext) => nameLower.endsWith(ext));

    if (!isValid) {
      setError('Please upload a CSV, Excel (.xlsx) or JSON file.');
      return;
    }

    setFile(selectedFile);
    setError(null);
    setImportResult(null);
    setIsPreviewLoading(true);

    try {
      const preview = await previewDatasetFile(selectedFile);
      setPreviewData(preview);
      setColumnMapping(preview.suggestedMapping || {});
      if (onShowToast) {
        onShowToast({
          type: 'success',
          title: 'File Parsed Successfully',
          message: `Detected ${preview.totalRows} rows across ${preview.headers.length} columns.`,
        });
      }
    } catch (err) {
      console.error('Preview error:', err);
      setError(err.message || 'Failed to parse file preview.');
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleMappingChange = (targetKey, sourceCol) => {
    setColumnMapping((prev) => {
      const next = { ...prev };
      if (!sourceCol) {
        delete next[targetKey];
      } else {
        next[targetKey] = sourceCol;
      }
      return next;
    });
  };

  const handleImport = async () => {
    if (!file) return;

    if (!columnMapping.text) {
      setError('You must map the "Complaint / Feedback Text" column before importing.');
      return;
    }

    setIsImporting(true);
    setError(null);

    try {
      const result = await uploadDatasetFile(file, columnMapping);
      setImportResult(result);
      loadBatches();
      if (onBatchImported) onBatchImported(result);

      if (onShowToast) {
        onShowToast({
          type: 'success',
          title: 'Dataset Imported Successfully',
          message: `Imported ${result.importedRecords} records (${result.duplicateRecords} duplicates skipped).`,
        });
      }
    } catch (err) {
      console.error('Import error:', err);
      setError(err.message || 'Dataset import failed.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleLoadSample = (sampleType) => {
    let content = '';
    let sampleFilename = '';

    if (sampleType === 'csv') {
      sampleFilename = 'retail_complaints_sample.csv';
      content = `id,store,timestamp,rating,details,asset
CMP-501,STR-HYD-001,2026-10-15T10:30:00Z,1,Deep freezer unit in dairy aisle is completely off and milk packs are spoiling,freezer-04
CMP-502,STR-VIZ-002,2026-10-15T11:15:00Z,2,Billing counter #3 barcode scanner keeps lagging causing 25 min queue,pos-terminal-03
CMP-503,STR-HYD-001,2026-10-15T12:00:00Z,1,Cold storage temperature warning alarm is beeping continuously,cold-storage-01
CMP-504,STR-VJA-003,2026-10-15T13:45:00Z,2,Organic brown rice 5kg pack completely out of stock on shelf,shelf-b12
CMP-505,STR-HYD-001,2026-10-16T09:10:00Z,1,Severe billing error customer charged twice for cooking oil,pos-terminal-01
CMP-506,STR-GNT-004,2026-10-16T14:20:00Z,2,Attendant at returns counter was very unhelpful and dismissive,staff-desk
CMP-507,STR-HYD-001,2026-10-16T15:30:00Z,1,Ice cream tubs in freezer #2 are completely melted and leaking,freezer-02
CMP-508,STR-TPT-005,2026-10-16T16:00:00Z,3,Card payment machine declined 3 customer debit cards consecutively,pos-terminal-02`;
    } else {
      sampleFilename = 'feedback_stream_sample.json';
      content = JSON.stringify(
        [
          {
            id: 'JSON-101',
            storeId: 'STR-HYD-001',
            createdAt: '2026-10-16T08:00:00Z',
            rating: 1,
            text: 'Walk-in freezer temperature is at 18 degrees Celsius, raw meat is warm!',
            item: 'freezer-01',
          },
          {
            id: 'JSON-102',
            storeId: 'STR-HYD-001',
            createdAt: '2026-10-16T08:30:00Z',
            rating: 1,
            text: 'Ice cream freezer leaking water onto aisle floor hazard for shoppers',
            item: 'freezer-02',
          },
          {
            id: 'JSON-103',
            storeId: 'STR-HYD-001',
            createdAt: '2026-10-16T09:00:00Z',
            rating: 1,
            text: 'Dairy chiller power tripping again milk cartons getting sour',
            item: 'freezer-03',
          },
          {
            id: 'JSON-104',
            storeId: 'STR-VIZ-002',
            createdAt: '2026-10-16T10:15:00Z',
            rating: 2,
            text: 'Long line at billing counter only 1 of 4 counters operational',
            item: 'checkout-zone',
          },
          {
            id: 'JSON-105',
            storeId: 'STR-VJA-003',
            createdAt: '2026-10-16T11:45:00Z',
            rating: 3,
            text: 'Fresh bread shelf was empty at 11am on Saturday',
            item: 'bakery-shelf',
          },
        ],
        null,
        2
      );
    }

    const blob = new Blob([content], { type: sampleType === 'csv' ? 'text/csv' : 'application/json' });
    const sampleFileObj = new File([blob], sampleFilename, { type: blob.type });
    handleFileChange(sampleFileObj);
  };

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 text-[#172033]">
      {/* Top Banner */}
      <div className="bg-white p-6 rounded-2xl border border-[#E2E8F0] shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-[#3478F6]">
              <UploadCloud className="w-4 h-4" />
            </div>
            <h2 className="text-lg font-bold text-[#172033]">Dataset Ingestion & Batch Triage</h2>
          </div>
          <p className="text-xs text-[#64748B] mt-1">
            Upload retail complaints and Voice-of-Store data in CSV, XLSX, or JSON format. StoreGrid normalizes headers,
            routes NLP triage, runs spike detection, and stores batches persistently.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => handleLoadSample('csv')}
            className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-blue-50 text-[#3478F6] border border-blue-200 hover:bg-blue-100 transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Load Sample CSV
          </button>
          <button
            type="button"
            onClick={() => handleLoadSample('json')}
            className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Load Sample JSON
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 flex items-start gap-3 shadow-2xs">
          <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-xs font-bold text-red-900">Upload Issue</p>
            <p className="text-xs text-red-700 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* File Dropzone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center transition-all cursor-pointer ${
          isDragging
            ? 'border-[#3478F6] bg-blue-50/50 scale-[1.005]'
            : 'border-[#CBD5E1] bg-white hover:border-[#3478F6]/60 hover:bg-[#F8FAFC]'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.json,.txt"
          onChange={(e) => {
            if (e.target.files?.[0]) handleFileChange(e.target.files[0]);
          }}
          className="hidden"
        />

        <div className="max-w-md mx-auto space-y-3">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-50 border border-blue-100 text-[#3478F6] flex items-center justify-center shadow-xs">
            {isPreviewLoading ? (
              <RefreshCw className="w-7 h-7 animate-spin text-[#3478F6]" />
            ) : (
              <UploadCloud className="w-7 h-7 text-[#3478F6]" />
            )}
          </div>

          <div>
            <p className="text-sm font-bold text-[#172033]">
              {file ? file.name : 'Click to select or drag and drop feedback datasets'}
            </p>
            <p className="text-xs text-[#64748B] mt-1">
              Supports <strong className="text-[#172033]">.CSV</strong>,{' '}
              <strong className="text-[#172033]">.XLSX</strong>, and <strong className="text-[#172033]">.JSON</strong>{' '}
              files up to 5 MB
            </p>
          </div>

          {file && (
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 border border-blue-200 rounded-full text-xs font-semibold text-[#3478F6]">
              <span>{file.name}</span>
              <span>•</span>
              <span>{formatBytes(file.size)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Preview & Column Mapping Section */}
      {previewData && (
        <div className="space-y-6">
          {/* Metadata Card */}
          <div className="bg-white p-5 rounded-2xl border border-[#E2E8F0] shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#E2E8F0]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-[#3478F6]">
                  {previewData.format === 'EXCEL' ? (
                    <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                  ) : previewData.format === 'JSON' ? (
                    <FileCode className="w-5 h-5 text-purple-600" />
                  ) : (
                    <FileText className="w-5 h-5 text-blue-600" />
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#172033] flex items-center gap-2">
                    {previewData.filename}
                    <span className="text-[10px] px-2 py-0.5 rounded-full uppercase font-bold bg-blue-50 text-[#3478F6] border border-blue-200">
                      {previewData.format}
                    </span>
                  </h3>
                  <p className="text-xs text-[#64748B] mt-0.5">
                    {formatBytes(previewData.fileSizeBytes)} • {previewData.totalRows} detected records •{' '}
                    {previewData.headers.length} columns
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={isImporting || !columnMapping.text}
                  className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold shadow-xs transition-all cursor-pointer ${
                    isImporting || !columnMapping.text
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                      : 'bg-[#3478F6] text-white hover:bg-blue-600 active:scale-98'
                  }`}
                >
                  {isImporting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Importing & Analyzing...
                    </>
                  ) : (
                    <>
                      <Database className="w-4 h-4" />
                      Import {previewData.totalRows} Records to StoreGrid
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Validation Warnings */}
            {previewData.warnings && previewData.warnings.length > 0 && (
              <div className="mt-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
                <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-bold">Data Ingestion Notices:</p>
                  {previewData.warnings.map((w, idx) => (
                    <p key={idx} className="text-amber-800">
                      • {w}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Interactive Column Mapping Panel */}
          <div className="bg-white p-5 sm:p-6 rounded-2xl border border-[#E2E8F0] shadow-xs">
            <div className="pb-3 border-b border-[#E2E8F0]">
              <h3 className="text-base font-bold text-[#172033] flex items-center gap-2">
                <Layers className="w-5 h-5 text-[#3478F6]" />
                Column Header Mapping
              </h3>
              <p className="text-xs text-[#64748B] mt-0.5">
                Confirm or adjust which column from your file corresponds to each StoreGrid target field. Auto-detected
                matches are pre-selected.
              </p>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {TARGET_FIELDS.map((target) => {
                const currentVal = columnMapping[target.key] || '';
                const isMapped = Boolean(currentVal);

                return (
                  <div
                    key={target.key}
                    className={`p-3.5 rounded-xl border transition-all ${
                      target.required && !isMapped
                        ? 'border-red-300 bg-red-50/50'
                        : isMapped
                          ? 'border-blue-200 bg-blue-50/20'
                          : 'border-[#E2E8F0] bg-[#F8FAFC]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold text-[#172033] flex items-center gap-1.5">
                        {target.label}
                        {target.required && <span className="text-[10px] text-red-600 font-bold">*Required</span>}
                      </span>
                      {isMapped ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : target.required ? (
                        <span className="text-[10px] font-semibold text-red-600">Unmapped</span>
                      ) : (
                        <span className="text-[10px] text-[#64748B]">Optional</span>
                      )}
                    </div>

                    <p className="text-[11px] text-[#64748B] mb-2 leading-tight">{target.description}</p>

                    <select
                      value={currentVal}
                      onChange={(e) => handleMappingChange(target.key, e.target.value)}
                      className="w-full text-xs font-semibold py-1.5 px-2.5 rounded-lg border border-[#CBD5E1] bg-white text-[#172033] focus:ring-2 focus:ring-[#3478F6]/20 focus:border-[#3478F6] cursor-pointer"
                    >
                      <option value="">-- Ignore / Not in file --</option>
                      {previewData.headers.map((hdr) => (
                        <option key={hdr} value={hdr}>
                          Column: {hdr}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sample Rows Preview Table */}
          <div className="bg-white p-5 sm:p-6 rounded-2xl border border-[#E2E8F0] shadow-xs">
            <div className="pb-3 border-b border-[#E2E8F0] flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[#172033] flex items-center gap-2">
                  <Eye className="w-5 h-5 text-[#3478F6]" />
                  Raw Row Preview (First {previewData.previewRows.length} Rows)
                </h3>
                <p className="text-xs text-[#64748B] mt-0.5">
                  Verify how your file data parses before committing it to the database.
                </p>
              </div>
              <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-[#F1F5F9] text-[#64748B] border border-[#E2E8F0]">
                {previewData.previewRows.length} of {previewData.totalRows} Rows
              </span>
            </div>

            <div className="mt-4 overflow-x-auto max-h-96 border border-[#E2E8F0] rounded-xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] sticky top-0 z-10">
                    <th className="py-2.5 px-3 font-bold text-[#64748B] uppercase tracking-wider text-[10px] w-12 border-r border-[#E2E8F0]">
                      #
                    </th>
                    {previewData.headers.map((hdr) => {
                      // Check if mapped to a target field
                      const mappedTarget = Object.entries(columnMapping).find(([, col]) => col === hdr);
                      return (
                        <th
                          key={hdr}
                          className="py-2.5 px-3 font-bold text-[#172033] border-r border-[#E2E8F0] whitespace-nowrap"
                        >
                          <div className="flex flex-col">
                            <span>{hdr}</span>
                            {mappedTarget && (
                              <span className="text-[10px] font-semibold text-[#3478F6]">
                                → {TARGET_FIELDS.find((t) => t.key === mappedTarget[0])?.label || mappedTarget[0]}
                              </span>
                            )}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {previewData.previewRows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-[#F8FAFC]/80 transition-colors">
                      <td className="py-2 px-3 font-mono text-[11px] text-[#64748B] bg-[#F8FAFC] border-r border-[#E2E8F0]">
                        {idx + 1}
                      </td>
                      {previewData.headers.map((hdr) => (
                        <td
                          key={hdr}
                          className="py-2 px-3 text-[#172033] border-r border-[#E2E8F0] max-w-xs truncate"
                          title={String(row[hdr] ?? '')}
                        >
                          {row[hdr] !== undefined && row[hdr] !== null ? String(row[hdr]) : '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Import Result Summary Card */}
      {importResult && (
        <div className="bg-white p-6 rounded-2xl border-2 border-emerald-300 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-[#E2E8F0]">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
                <CheckCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#172033] flex items-center gap-2">
                  Dataset Batch Ingestion Complete
                  <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                    BATCH: {importResult.batchId.slice(0, 8)}
                  </span>
                </h3>
                <p className="text-xs text-[#64748B] mt-0.5">
                  All records have been parsed, classified via StoreGrid NLP, analyzed by the priority engine, and
                  indexed.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  if (onSelectBatch) onSelectBatch(importResult.batchId);
                  if (onNavigateToDashboard) onNavigateToDashboard('overview');
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-[#3478F6] text-white hover:bg-blue-600 transition-colors shadow-xs cursor-pointer"
              >
                <span>View Batch in Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
              <span className="text-[11px] text-[#64748B] block font-medium">Total Rows</span>
              <span className="text-2xl font-black font-mono text-[#172033]">
                <Counter value={importResult.totalRecords || 0} />
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200">
              <span className="text-[11px] text-emerald-800 block font-medium">Imported</span>
              <span className="text-2xl font-black font-mono text-emerald-700">
                <Counter value={importResult.importedRecords || 0} />
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200">
              <span className="text-[11px] text-amber-800 block font-medium">Duplicates Skipped</span>
              <span className="text-2xl font-black font-mono text-amber-700">
                <Counter value={importResult.duplicateRecords || 0} />
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[11px] text-[#64748B] block font-medium">Warnings / Errors</span>
              <span className="text-2xl font-black font-mono text-slate-700">
                <Counter value={importResult.errorCount || 0} />
              </span>
            </div>
          </div>

          {/* Priority and spike insight for this batch */}
          {importResult.analysis && (
            <div className="mt-4 p-4 rounded-xl bg-blue-50/50 border border-blue-200 text-xs">
              <p className="font-bold text-[#172033] flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-[#3478F6]" />
                Priority and Spike Insights for this Batch:
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div>
                  <span className="text-[#64748B]">Critical Priority:</span>{' '}
                  <strong className="text-red-600">{importResult.analysis.summary?.criticalPriorityCount || 0}</strong>
                </div>
                <div>
                  <span className="text-[#64748B]">High Priority:</span>{' '}
                  <strong className="text-amber-600">{importResult.analysis.summary?.highPriorityCount || 0}</strong>
                </div>
                <div>
                  <span className="text-[#64748B]">Active Spikes:</span>{' '}
                  <strong className="text-red-700">{importResult.analysis.spikes?.length || 0}</strong>
                </div>
                <div>
                  <span className="text-[#64748B]">Recurring Issues:</span>{' '}
                  <strong className="text-purple-700">{importResult.analysis.recurringIssues?.length || 0}</strong>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Ingested Batches History */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-[#E2E8F0] shadow-xs">
        <div className="pb-3 border-b border-[#E2E8F0] flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-[#172033] flex items-center gap-2">
              <Database className="w-5 h-5 text-[#3478F6]" />
              Persistent Dataset Batches History
            </h3>
            <p className="text-xs text-[#64748B] mt-0.5">
              Previously imported datasets stored in SQLite/PostgreSQL with batch identifiers.
            </p>
          </div>
          <button
            type="button"
            onClick={reloadBatches}
            disabled={isLoadingBatches}
            className="p-1.5 text-[#64748B] hover:text-[#172033] hover:bg-[#F1F5F9] rounded-lg transition-colors cursor-pointer"
            title="Refresh batches list"
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingBatches ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="mt-4 overflow-x-auto">
          {batches.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#64748B]">
              No custom datasets imported yet. Upload a CSV, XLSX, or JSON file above to see persistent batches.
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
                  <th className="py-2.5 px-3 font-bold text-[#64748B]">Filename</th>
                  <th className="py-2.5 px-3 font-bold text-[#64748B]">Format</th>
                  <th className="py-2.5 px-3 font-bold text-[#64748B]">Imported Rows</th>
                  <th className="py-2.5 px-3 font-bold text-[#64748B]">Duplicates</th>
                  <th className="py-2.5 px-3 font-bold text-[#64748B]">Status</th>
                  <th className="py-2.5 px-3 font-bold text-[#64748B]">Uploaded At</th>
                  <th className="py-2.5 px-3 font-bold text-[#64748B] text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {batches.map((batch) => (
                  <tr key={batch.id} className="hover:bg-[#F8FAFC] transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-[#172033] flex items-center gap-2">
                      <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>{batch.filename}</span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 uppercase">
                        {batch.format}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-emerald-700">{batch.importedRecords}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-600">{batch.duplicateRecords || 0}</td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {batch.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-[#64748B] text-[11px]">
                      {new Date(batch.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          if (onSelectBatch) onSelectBatch(batch.id);
                          if (onNavigateToDashboard) onNavigateToDashboard('overview');
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-blue-50 text-[#3478F6] border border-blue-200 hover:bg-blue-100 transition-colors cursor-pointer"
                      >
                        <span>Filter Dashboard</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
