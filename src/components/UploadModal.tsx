import React, { useState, useRef, useEffect } from 'react';
import { X, Upload, Camera, Trash2, CheckCircle2, RefreshCw, Layers } from 'lucide-react';
import { uploadProblem } from '../services/api';
import { useStore } from '../store/useStore';
import { EXAM_YEARS, EXAM_TYPES } from '../config/constants';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess?: () => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({ isOpen, onClose, onUploadSuccess }) => {
  const { setIsLoading, showToast } = useStore();

  const [mode, setMode] = useState<'files' | 'camera'>('files');
  const [selectedYear, setSelectedYear] = useState<string>('113年');
  const [selectedType, setSelectedType] = useState<string>('全模');
  const [sourceInput, setSourceInput] = useState<string>(() => {
    return sessionStorage.getItem('redolve_last_source') || '113年 全模';
  });
  const [selectedFiles, setSelectedFiles] = useState<{ id: string; file: File; previewUrl: string }[]>([]);

  // Camera stream states
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Sync year and type selection into sourceInput
  const handleSelectYear = (year: string) => {
    setSelectedYear(year);
    setSourceInput(`${year} ${selectedType}`);
  };

  const handleSelectType = (type: string) => {
    setSelectedType(type);
    setSourceInput(`${selectedYear} ${type}`);
  };

  // Handle Camera Stream Start/Stop
  const startCamera = async (facing: 'environment' | 'user') => {
    try {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error('Failed to access webcamera:', err);
      showToast('無法存取視訊鏡頭，請確認瀏覽器相機權限！', 'error');
    }
  };

  const stopCamera = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  };

  useEffect(() => {
    if (isOpen && mode === 'camera') {
      startCamera(facingMode);
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [isOpen, mode, facingMode]);

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

  const handleRemoveFile = (id: string) => {
    setSelectedFiles((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((item) => item.id !== id);
    });
  };

  const handleCaptureSnapshot = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;

    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `camera_${Date.now()}.jpg`, { type: 'image/jpeg' });
        const newItem = {
          id: Math.random().toString(36).substring(2, 9),
          file,
          previewUrl: URL.createObjectURL(blob),
        };
        setSelectedFiles((prev) => [...prev, newItem]);
        showToast('完成相機快拍！已加入待上傳清單', 'info', 2000);
      },
      'image/jpeg',
      0.85
    );
  };

  const handleSubmitBatch = async () => {
    if (selectedFiles.length === 0) {
      showToast('請先選擇圖檔或拍攝題目照片！', 'error');
      return;
    }

    setIsLoading(true);
    // Save active source into sessionStorage
    sessionStorage.setItem('redolve_last_source', sourceInput);

    try {
      const results = await Promise.allSettled(
        selectedFiles.map((item) => uploadProblem(item.file, sourceInput))
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

      // Reset state
      selectedFiles.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      setSelectedFiles([]);
      stopCamera();
      onClose();

      if (onUploadSuccess) {
        onUploadSuccess();
      }
    } catch (err) {
      console.error('Batch upload failed:', err);
      showToast('上傳過程發生未知錯誤，請稍後再試！', 'error', 6000);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 select-none">
      <div className="bg-white dark:bg-[#202023] border border-[#E5E7EB] dark:border-[#2C2C30] rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-200 dark:border-stone-800 pb-3">
          <div className="flex items-center space-x-2">
            <div className="p-2 bg-[#6366F1]/10 text-[#6366F1] rounded-2xl">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#374151] dark:text-[#D1D5DB]">
                錯題批次上傳 & Webcamera 快拍
              </h3>
              <p className="text-[11px] text-[#9CA3AF]">選擇年分與卷別後即可批次上傳多張題目照片</p>
            </div>
          </div>
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-1.5 rounded-xl hover:bg-stone-100 dark:hover:bg-stone-800 text-[#9CA3AF]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 1. Separated Year & Exam Type Selector */}
        <div className="space-y-3">
          {/* Year Chips */}
          <div>
            <label className="block text-[11px] font-bold text-[#9CA3AF] mb-1">
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
                      : 'bg-stone-100 dark:bg-stone-800 text-[#9CA3AF] hover:text-[#374151] dark:hover:text-[#D1D5DB]'
                  }`}
                >
                  {year}
                </button>
              ))}
            </div>
          </div>

          {/* Exam Type Chips */}
          <div>
            <label className="block text-[11px] font-bold text-[#9CA3AF] mb-1">
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
                      : 'bg-stone-100 dark:bg-stone-800 text-[#9CA3AF] hover:text-[#374151] dark:hover:text-[#D1D5DB]'
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
              最終套用來源標籤 (Combinated Source Tag)
            </label>
            <input
              type="text"
              value={sourceInput}
              onChange={(e) => setSourceInput(e.target.value)}
              placeholder="例如: 113年 全模 數學"
              className="w-full px-3.5 py-2 rounded-2xl text-xs bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-[#374151] dark:text-[#D1D5DB] focus:outline-none focus:border-[#6366F1]"
            />
          </div>
        </div>

        {/* 2. Mode Switcher Tabs */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-stone-100 dark:bg-stone-800/60 rounded-2xl text-xs font-medium">
          <button
            onClick={() => setMode('files')}
            className={`flex items-center justify-center space-x-2 py-2 rounded-xl transition-all ${
              mode === 'files'
                ? 'bg-white dark:bg-[#2C2C30] text-[#6366F1] dark:text-indigo-400 font-bold shadow-xs'
                : 'text-[#9CA3AF] hover:text-[#374151] dark:hover:text-[#D1D5DB]'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>批次選檔 ({selectedFiles.length})</span>
          </button>

          <button
            onClick={() => setMode('camera')}
            className={`flex items-center justify-center space-x-2 py-2 rounded-xl transition-all ${
              mode === 'camera'
                ? 'bg-white dark:bg-[#2C2C30] text-[#6366F1] dark:text-indigo-400 font-bold shadow-xs'
                : 'text-[#9CA3AF] hover:text-[#374151] dark:hover:text-[#D1D5DB]'
            }`}
          >
            <Camera className="w-4 h-4" />
            <span>Webcamera 快拍</span>
          </button>
        </div>

        {/* Tab 1: File Upload Mode */}
        {mode === 'files' && (
          <div className="space-y-3">
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-stone-200 dark:border-stone-700 rounded-3xl p-6 cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors">
              <Upload className="w-8 h-8 text-[#6366F1] mb-2" />
              <span className="text-xs font-bold text-[#374151] dark:text-[#D1D5DB]">
                點擊或拖曳選擇考卷圖檔 (可多選)
              </span>
              <span className="text-[10px] text-[#9CA3AF] mt-1">支援 JPG, PNG, WEBP</span>
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
          </div>
        )}

        {/* Tab 2: Webcamera Live Capture Mode */}
        {mode === 'camera' && (
          <div className="space-y-3">
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-video flex items-center justify-center">
              <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
              <canvas ref={canvasRef} className="hidden" />

              {/* Facing Mode Toggle */}
              <button
                onClick={() => setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))}
                className="absolute top-3 right-3 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
                title="切換前後鏡頭"
              >
                <RefreshCw className="w-4 h-4" />
              </button>

              {/* Shutter Button */}
              <button
                onClick={handleCaptureSnapshot}
                className="absolute bottom-3 left-1/2 -translate-x-1/2 w-12 h-12 rounded-full bg-white text-[#6366F1] border-4 border-indigo-200 flex items-center justify-center shadow-lg active:scale-90 transition-transform"
                title="即時拍攝題目"
              >
                <Camera className="w-6 h-6" />
              </button>
            </div>
          </div>
        )}

        {/* Thumbnail Preview Queue */}
        {selectedFiles.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-[#9CA3AF]">
              <span>待上傳圖片清單 ({selectedFiles.length} 張)</span>
              <button onClick={() => setSelectedFiles([])} className="text-rose-500 hover:underline">
                清空清單
              </button>
            </div>
            <div className="flex items-center space-x-2 overflow-x-auto pb-2">
              {selectedFiles.map((item) => (
                <div
                  key={item.id}
                  className="relative w-16 h-16 rounded-xl overflow-hidden border border-stone-200 dark:border-stone-700 shrink-0 group"
                >
                  <img src={item.previewUrl} alt="預覽" className="w-full h-full object-cover" />
                  <button
                    onClick={() => handleRemoveFile(item.id)}
                    className="absolute inset-0 bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-end space-x-2 pt-2 border-t border-stone-200 dark:border-stone-800">
          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="px-4 py-2 rounded-2xl text-xs font-medium text-[#374151] dark:text-[#D1D5DB] hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            取消
          </button>
          <button
            onClick={handleSubmitBatch}
            disabled={selectedFiles.length === 0}
            className={`flex items-center space-x-2 px-5 py-2.5 rounded-2xl text-xs font-bold text-white transition-all shadow-md ${
              selectedFiles.length > 0
                ? 'bg-[#6366F1] hover:bg-[#4F46E5] active:scale-95'
                : 'bg-stone-300 dark:bg-stone-700 cursor-not-allowed'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>開始批次上傳 ({selectedFiles.length} 題)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
