import React, { useState, useEffect } from 'react';
import { X, Upload, Trash2, CheckCircle2, Loader2, Image as ImageIcon } from 'lucide-react';
import { uploadProblem } from '../services/api';
import { useStore } from '../store/useStore';
import { EXAM_YEARS, EXAM_TYPES } from '../config/constants';
import { Item } from '../types';

const compressImage = (file: File): Promise<File> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      const canvas = document.createElement('canvas');
      let targetWidth = img.width;
      let targetHeight = img.height;
      if (targetWidth > 1920) {
        const scale = 1920 / targetWidth;
        targetWidth = 1920;
        targetHeight = Math.round(img.height * scale);
      }
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(file);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (blob) {
            const baseName = file.name.replace(/\.[^/.]+$/, '');
            resolve(new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' }));
          } else {
            resolve(file);
          }
        },
        'image/jpeg',
        0.8
      );
    };
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = URL.createObjectURL(file);
  });
};

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess?: () => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({ isOpen, onClose, onUploadSuccess }) => {
  const { setIsLoading, showToast, addOptimisticProblem, removeProblemFromStore, selectedSubjectId } = useStore();

  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [selectedYear, setSelectedYear] = useState<string>('113年');
  const [selectedType, setSelectedType] = useState<string>('全模');
  const [sourceInput, setSourceInput] = useState<string>(() => {
    return sessionStorage.getItem('redolve_last_source') || '113年 全模';
  });
  const [selectedFiles, setSelectedFiles] = useState<{ id: string; file: File; previewUrl: string }[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);

  // Close modal on Escape key press
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isUploading) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, isUploading]);

  // Sync year and type selection into sourceInput
  const handleSelectYear = (year: string) => {
    setSelectedYear(year);
    setSourceInput(`${year} ${selectedType}`);
  };

  const handleSelectType = (type: string) => {
    setSelectedType(type);
    setSourceInput(`${selectedYear} ${type}`);
  };

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newItems = files.map((file) => ({
      id: Math.random().toString(36).substring(2, 9),
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    setSelectedFiles((prev) => [...prev, ...newItems]);
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const files = Array.from(e.dataTransfer.files || []).filter((f) => f.type.startsWith('image/'));
    if (files.length > 0) {
      const newItems = files.map((file) => ({
        id: Math.random().toString(36).substring(2, 9),
        file,
        previewUrl: URL.createObjectURL(file),
      }));
      setSelectedFiles((prev) => [...prev, ...newItems]);
    }
  };

  const handleRemoveFile = (id: string) => {
    if (isUploading) return;
    setSelectedFiles((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((item) => item.id !== id);
    });
  };

  const handleSubmitBatch = async () => {
    if (selectedFiles.length === 0 || isUploading) {
      if (selectedFiles.length === 0) showToast('請先選擇考卷圖檔！', 'error');
      return;
    }

    setIsUploading(true);
    setIsLoading(true);
    setUploadProgress({ current: 0, total: selectedFiles.length });
    sessionStorage.setItem('redolve_last_source', sourceInput);

    try {
      let completedCount = 0;
      const results = await Promise.allSettled(
        selectedFiles.map(async (item) => {
          const compressedFile = await compressImage(item.file);
          const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2)}`;

          const tempItem: Item = {
            id: tempId,
            user_id: 'temp',
            type: 'image',
            topic_id: selectedSubjectId || 'math',
            keywords: null,
            keyword_tokens: null,
            source: sourceInput || null,
            image_url: item.previewUrl,
            draw_data: null,
            status: 'processing',
            review_count: 0,
            vector_clock: null,
            updated_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
          };

          addOptimisticProblem(tempItem);

          try {
            const res = await uploadProblem(compressedFile, sourceInput);
            completedCount += 1;
            setUploadProgress({ current: completedCount, total: selectedFiles.length });
            return res;
          } catch (err) {
            removeProblemFromStore(tempId);
            throw err;
          }
        })
      );

      const fulfilledCount = results.filter((r) => r.status === 'fulfilled').length;
      const rejectedCount = results.filter((r) => r.status === 'rejected').length;

      if (rejectedCount === 0) {
        showToast(`成功批次上傳 ${fulfilledCount} 張錯題！AI 正在背景自動打標中...`, 'success');
      } else if (fulfilledCount > 0) {
        showToast(`已上傳 ${fulfilledCount} 張錯題，有 ${rejectedCount} 張上傳失敗，請檢查網路！`, 'error', 6000);
      } else {
        showToast('錯題上傳失敗！請檢查圖片格式與網路連線後重試。', 'error', 6000);
      }

      // Cleanup
      selectedFiles.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      setSelectedFiles([]);
      onClose();

      if (onUploadSuccess) {
        onUploadSuccess();
      }
    } catch (err) {
      console.error('Batch upload failed:', err);
      showToast('上傳過程發生未知錯誤，請稍後再試！', 'error', 6000);
    } finally {
      setIsUploading(false);
      setIsLoading(false);
      setUploadProgress(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 select-none">
      <div className="bg-white dark:bg-[#202023] border border-[#E5E7EB] dark:border-[#2C2C30] rounded-3xl max-w-xl w-full max-h-[92vh] sm:max-h-[88vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Fixed Header */}
        <div className="shrink-0 px-5 sm:px-6 py-3.5 sm:py-4 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between bg-white dark:bg-[#202023]">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-[#6366F1]/10 text-[#6366F1] rounded-2xl">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-[#374151] dark:text-[#D1D5DB]">
                錯題批次上傳
              </h3>
              <p className="text-[11px] text-[#9CA3AF]">自動前端壓縮並以高效率上傳，支援拖曳多張圖檔</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isUploading}
            className="p-1.5 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 text-[#9CA3AF] transition-colors disabled:opacity-30"
            title="關閉視窗 (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body Content */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-6 py-4 space-y-4">
          {/* 1. Separated Year & Exam Type Selector */}
          <div className="space-y-3 p-3.5 bg-stone-50 dark:bg-[#1a1a1d] rounded-2xl border border-stone-200/60 dark:border-stone-800">
            {/* Year Chips */}
            <div>
              <label className="block text-[11px] font-bold text-[#9CA3AF] mb-1.5">
                1. 考卷年分 (Exam Year)
              </label>
              <div className="flex flex-wrap gap-1.5">
                {EXAM_YEARS.map((year) => (
                  <button
                    key={year}
                    type="button"
                    onClick={() => handleSelectYear(year)}
                    className={`px-2.5 py-1 rounded-xl text-[11px] font-medium transition-all ${
                      selectedYear === year
                        ? 'bg-[#6366F1] text-white font-bold shadow-xs'
                        : 'bg-white dark:bg-stone-800 text-[#9CA3AF] hover:text-[#374151] dark:hover:text-[#D1D5DB] border border-stone-200/50 dark:border-stone-700/50'
                    }`}
                  >
                    {year}
                  </button>
                ))}
              </div>
            </div>

            {/* Exam Type Chips */}
            <div>
              <label className="block text-[11px] font-bold text-[#9CA3AF] mb-1.5">
                2. 考卷卷別 (Exam Type)
              </label>
              <div className="flex flex-wrap gap-1.5">
                {EXAM_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => handleSelectType(type)}
                    className={`px-2.5 py-1 rounded-xl text-[11px] font-medium transition-all ${
                      selectedType === type
                        ? 'bg-[#6366F1] text-white font-bold shadow-xs'
                        : 'bg-white dark:bg-stone-800 text-[#9CA3AF] hover:text-[#374151] dark:hover:text-[#D1D5DB] border border-stone-200/50 dark:border-stone-700/50'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {/* Combined Source Input */}
            <div>
              <label className="block text-[11px] font-bold text-[#9CA3AF] mb-1">
                最終套用來源標籤 (Combined Source Tag)
              </label>
              <input
                type="text"
                value={sourceInput}
                onChange={(e) => setSourceInput(e.target.value)}
                placeholder="例如: 113年 全模 數學"
                className="w-full px-3.5 py-1.5 rounded-xl text-xs bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-[#374151] dark:text-[#D1D5DB] focus:outline-none focus:border-[#6366F1]"
              />
            </div>
          </div>

          {/* File Drag & Drop Box */}
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingOver(true);
            }}
            onDragLeave={() => setIsDraggingOver(false)}
            onDrop={handleDrop}
            className={`flex flex-col items-center justify-center border-2 border-dashed rounded-2xl p-6 cursor-pointer transition-all ${
              isDraggingOver
                ? 'border-[#6366F1] bg-[#6366F1]/10 scale-[1.01]'
                : 'border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800/50'
            }`}
          >
            <ImageIcon className="w-8 h-8 text-[#6366F1] mb-1.5" />
            <span className="text-xs font-bold text-[#374151] dark:text-[#D1D5DB]">
              {isDraggingOver ? '放開以加入待上傳清單' : '點擊或拖曳選擇考卷圖檔 (可多選)'}
            </span>
            <span className="text-[10px] text-[#9CA3AF] mt-0.5">自動進行前端壓縮 (支援 JPG, PNG, WEBP)</span>
            <input
              type="file"
              multiple
              accept="image/*"
              disabled={isUploading}
              onChange={handleFileChange}
              className="hidden"
            />
          </label>

          {/* Thumbnail Preview Queue */}
          {selectedFiles.length > 0 && (
            <div className="space-y-2 p-3 bg-stone-50 dark:bg-[#1a1a1d] rounded-2xl border border-stone-200/60 dark:border-stone-800">
              <div className="flex items-center justify-between text-xs text-[#9CA3AF]">
                <span className="font-semibold text-[#374151] dark:text-[#D1D5DB]">
                  待上傳圖片清單 ({selectedFiles.length} 張)
                </span>
                {!isUploading && (
                  <button
                    type="button"
                    onClick={() => {
                      selectedFiles.forEach((item) => URL.revokeObjectURL(item.previewUrl));
                      setSelectedFiles([]);
                    }}
                    className="text-[11px] text-rose-500 hover:underline"
                  >
                    清空全部
                  </button>
                )}
              </div>
              <div className="flex items-center space-x-2 overflow-x-auto pb-1">
                {selectedFiles.map((item) => (
                  <div
                    key={item.id}
                    className="relative w-14 h-14 rounded-xl overflow-hidden border border-stone-200 dark:border-stone-700 shrink-0 group"
                  >
                    <img src={item.previewUrl} alt="預覽" className="w-full h-full object-cover" />
                    {!isUploading && (
                      <button
                        type="button"
                        onClick={() => handleRemoveFile(item.id)}
                        className="absolute inset-0 bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Guaranteed Sticky / Fixed Footer */}
        <div className="shrink-0 px-5 sm:px-6 py-3.5 bg-stone-50 dark:bg-[#1a1a1d] border-t border-stone-200 dark:border-stone-800 flex items-center justify-between">
          <div>
            {isUploading ? (
              <div className="flex items-center space-x-2 text-xs text-indigo-600 dark:text-indigo-400 font-semibold">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>
                  處理中... {uploadProgress ? `(${uploadProgress.current}/${uploadProgress.total})` : ''}
                </span>
              </div>
            ) : selectedFiles.length > 0 ? (
              <div className="flex items-center space-x-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                <CheckCircle2 className="w-4 h-4" />
                <span>已選取 {selectedFiles.length} 張圖檔</span>
              </div>
            ) : (
              <span className="text-xs text-[#9CA3AF]">尚未加入題目圖片</span>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              disabled={isUploading}
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl text-xs font-medium text-[#374151] dark:text-[#D1D5DB] hover:bg-stone-200 dark:hover:bg-stone-800 transition-colors disabled:opacity-40"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSubmitBatch}
              disabled={selectedFiles.length === 0 || isUploading}
              className={`flex items-center space-x-2 px-5 py-2.5 rounded-2xl text-xs font-bold text-white transition-all shadow-md ${
                selectedFiles.length > 0 && !isUploading
                  ? 'bg-[#6366F1] hover:bg-[#4F46E5] active:scale-95 cursor-pointer'
                  : 'bg-stone-300 dark:bg-stone-700 cursor-not-allowed opacity-60'
              }`}
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>正在壓縮並上傳...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>開始批次上傳 ({selectedFiles.length} 題)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
