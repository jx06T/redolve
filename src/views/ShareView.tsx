import React, { useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, AlertTriangle, BookOpen, Download, FileText, CheckCircle2, PenLine } from 'lucide-react';
import { fetchSharedProblem, getSharedImageUrl } from '../services/api';
import { useSEO } from '../hooks/useSEO';
import { DrawCanvas } from '../components/DrawCanvas';
import { StatusBadge } from '../components/StatusBadge';
import { exportProblemAsImage } from '../utils/exportImage';
import { Item, DrawData } from '../types';

export const ShareView: React.FC = () => {
  const { token } = useParams<{ token: string }>();

  useSEO({
    title: '公開錯題分享檢視',
    description: 'Redolve 公開唯讀錯題分享，支援原圖、手寫推導與作者文字筆記同步展示。',
    ogType: 'article',
  });

  const [data, setData] = useState<{ item: Partial<Item>; share: { token: string; allow_ink: boolean } } | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  useEffect(() => {
    if (token) {
      fetchSharedProblem(token)
        .then((res) => setData(res))
        .catch((err) => setErrorMsg(err.message || '無法載入分享連結'))
        .finally(() => setLoading(false));
    }
  }, [token]);

  // Compute calculation workspace height from draw_data (matching ProblemCard 140px baseline)
  const calcSpaceHeight = useMemo(() => {
    if (!data?.item?.draw_data) return 140;
    try {
      const parsed: DrawData =
        typeof data.item.draw_data === 'string'
          ? JSON.parse(data.item.draw_data)
          : data.item.draw_data;
      if (typeof parsed.calcSpaceHeight === 'number') {
        return parsed.calcSpaceHeight;
      }
      if (parsed.expansions && parsed.expansions.length > 0) {
        const lastExp = parsed.expansions[parsed.expansions.length - 1];
        if (lastExp && typeof lastExp.addedHeight === 'number') {
          return Math.max(80, lastExp.addedHeight);
        }
      }
    } catch {
      // safe fallback
    }
    return 140;
  }, [data]);

  const keywordsArray = useMemo(() => {
    if (!data?.item?.keywords) return [];
    try {
      if (data.item.keywords.startsWith('[')) {
        const parsed = JSON.parse(data.item.keywords);
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch {
      // fallback
    }
    return data.item.keywords.split(',').map((k) => k.trim()).filter(Boolean);
  }, [data?.item?.keywords]);

  const handleExport = async () => {
    if (!data || !token) return;
    try {
      setIsExporting(true);
      const filename = `redolve_shared_${token.substring(0, 8)}.png`;
      const currentImageUrl = getSharedImageUrl(token);
      await exportProblemAsImage(
        currentImageUrl,
        data.share.allow_ink ? data.item.draw_data || null : null,
        filename
      );
    } catch (err) {
      console.error('Failed to export shared problem:', err);
    } finally {
      setIsExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (errorMsg || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="bg-surface border border-border-subtle rounded-3xl p-8 max-w-md w-full text-center space-y-4 shadow-sm">
          <div className="p-3 bg-status-warning/10 text-status-warning rounded-2xl w-fit mx-auto">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h2 className="text-base font-bold text-text-main">連結不可用</h2>
          <p className="text-xs text-text-muted">{errorMsg || '分享連結不存在或已被建立者撤銷'}</p>
        </div>
      </div>
    );
  }

  const { item, share } = data;
  const isInkAllowed = Boolean(share?.allow_ink);
  const imageUrl = getSharedImageUrl(token!);

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header Bar */}
        <div className="bg-surface border border-border-subtle rounded-3xl p-6 flex flex-wrap items-center justify-between gap-4 shadow-xs">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-primary-50 text-primary rounded-2xl">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <a href="/" className="text-base font-bold text-text-main">
                Redolve
              </a>
              <p className="text-xs text-text-muted">公開錯題分享</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <span className="px-3 py-1.5 rounded-xl text-xs font-medium bg-neutral-100 text-text-main">
              {share.allow_ink ? '包含作者手寫推導' : '無筆跡原圖'}
            </span>
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-primary text-white text-xs font-medium hover:bg-primary-hover active:scale-95 transition-all shadow-xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isExporting ? '下載中...' : '下載全幅圖檔'}</span>
            </button>
          </div>
        </div>

        {/* Card View */}
        <div className="bg-surface border border-border-subtle rounded-3xl p-6 space-y-4 shadow-xs">
          {/* Metadata Top Bar */}
          <div className="flex items-center justify-between pb-2 border-b border-border-subtle">
            <StatusBadge
              status={item.status as any || 'unsolved'}
              topicId={item.topic_id || null}
            />
            {item.status === 'resolved' && (
              <span className="inline-flex items-center space-x-1 text-xs font-medium text-status-resolved bg-status-resolved/10 px-2.5 py-1 rounded-xl border border-status-resolved/20">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>已完成訂正</span>
              </span>
            )}
          </div>

          {/* Keywords Chips */}
          {keywordsArray.length > 0 && (
            <div className="flex flex-wrap gap-1.5 py-1">
              {keywordsArray.map((kw, idx) => (
                <span
                  key={idx}
                  className="px-2.5 py-1 text-xs rounded-xl bg-neutral-100 text-text-main font-medium"
                >
                  #{kw}
                </span>
              ))}
            </div>
          )}

          {/* Unified Exam Image & Scratchpad Canvas Workspace */}
          <div className="relative rounded-2xl overflow-hidden bg-neutral-50 border border-border-subtle flex flex-col">
            <div className="w-full relative select-none">
              <img
                src={imageUrl}
                alt="分享題目圖片"
                className="exam-paper-image w-full h-auto object-contain block select-none pointer-events-none"
              />
            </div>

            {/* Extended Calculation Workspace Area */}
            {isInkAllowed && (
              <div
                style={{ height: `${calcSpaceHeight}px` }}
                className="w-full relative border-t border-dashed border-border-subtle bg-neutral-50 select-none"
              >
                <div className="absolute inset-0 opacity-35 dark:opacity-20 pointer-events-none bg-[radial-gradient(#9CA3AF_1.2px,transparent_1.2px)] [background-size:18px_18px]" />
                <div className="absolute top-2 left-3 z-10 flex items-center space-x-1.5 text-[11px] text-text-muted select-none pointer-events-none bg-surface px-2 py-0.5 rounded-md border border-border-subtle">
                  <PenLine className="w-3 h-3 text-primary" />
                  <span>延伸推導草稿區</span>
                </div>
              </div>
            )}

            {/* Read-only DrawCanvas Layer */}
            {isInkAllowed && (
              <div className="absolute inset-0 pointer-events-none">
                <DrawCanvas
                  initialDrawData={item.draw_data}
                  calcSpaceHeight={calcSpaceHeight}
                  readOnly={true}
                  inkVisible={true}
                />
              </div>
            )}
          </div>

          {/* Typed Notes & Summary Section */}
          {item.typed_notes && (
            <div className="mt-4 rounded-2xl bg-neutral-50/80 border border-border-subtle p-4">
              <div className="flex items-center space-x-2 text-xs font-semibold text-text-main mb-2">
                <FileText className="w-4 h-4 text-primary" />
                <span>作者文字筆記 / 解題思路與觀念總結</span>
              </div>
              <p className="text-xs text-text-main leading-relaxed whitespace-pre-wrap">
                {item.typed_notes}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

