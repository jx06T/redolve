import React, { useEffect, useState, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Loader2, AlertTriangle, BookOpen, Download, FileText, PenLine } from 'lucide-react';
import { fetchSharedProblem, getSharedImageUrl } from '../services/api';
import { useSEO } from '../hooks/useSEO';
import { DrawCanvas } from '../components/DrawCanvas';
import { AuthModal } from '../components/AuthModal';
import { useStore } from '../store/useStore';
import type { SharedProblemData } from '../services/api';
import { exportProblemAsImage } from '../utils/exportImage';
import { DrawData } from '../types';

import { DEFAULT_CALC_SPACE_HEIGHT } from '../config/constants';

export const ShareView: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const account=useStore(s=>s.currentUser?.id),openAuth=useStore(s=>s.setAuthModalOpen);

  useSEO({
    title: '單題分享檢視',
    description: 'Redolve 唯讀單題分享，支援題圖、分享者筆跡與文字筆記。',
    ogType: 'article',
  });

  const [data, setData] = useState<SharedProblemData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  useEffect(() => {
    const abort=new AbortController();setData(null);setLoading(true);setErrorMsg(null);
    const load=()=>{if(!token){setErrorMsg('缺少分享連結');setLoading(false);return;}
      void fetchSharedProblem(token,abort.signal).then(res=>{if(!abort.signal.aborted){setData(res);setErrorMsg(null);}})
        .catch(err=>{if(!abort.signal.aborted){setData(null);setErrorMsg(err.message||'無法載入分享連結');}})
        .finally(()=>{if(!abort.signal.aborted)setLoading(false);});};
    load();window.addEventListener('focus',load);
    return()=>{abort.abort();window.removeEventListener('focus',load);};
  },[token,account]);

  // Compute calculation workspace height from draw_data (matching ProblemCard baseline)
  const calcSpaceHeight = useMemo(() => {
    if (!data?.item?.draw_data) return DEFAULT_CALC_SPACE_HEIGHT;
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
    return DEFAULT_CALC_SPACE_HEIGHT;
  }, [data]);

  const keywordsArray = useMemo(() => {
    if (!data?.item?.keywords) return [];
    try {
      if (data.item.keywords.startsWith('[')) {
        const parsed = JSON.parse(data.item.keywords);
        return Array.isArray(parsed) ? parsed.filter((value):value is string=>typeof value==='string') : [];
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
      <div className="h-full overflow-y-auto bg-page-bg flex items-center justify-center p-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (errorMsg || !data) {
    return (
      <div className="h-full overflow-y-auto bg-page-bg flex items-center justify-center p-4">
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

  const { item, share, origin } = data;
  const isInkAllowed = Boolean(share?.allow_ink);
  const imageUrl = getSharedImageUrl(token!);

  return (
    <div className="h-full overflow-y-auto bg-page-bg py-8 px-4">
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
              <p className="text-xs text-text-muted">單題分享 · {share.fixed_version?'建立連結時的版本':'原題目前版本'}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <span className="px-3 py-1.5 rounded-xl text-xs font-medium bg-neutral-100 text-text-main">
              {share.allow_ink ? '包含分享者筆跡' : '無筆跡原圖'}
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
          <div className="space-y-2 border-b border-border-subtle pb-3 text-sm">
            <p>來源：{item.source||'題目'}{origin?.provider_name ? ' · '+origin.provider_name : ''}</p>
            {item.topic_label&&<p className="text-xs text-text-muted">分類：{item.topic_label}</p>}
            {origin?.kind==='personal'&&<p className="text-xs text-text-muted">私人題目；此連結僅分享單題。</p>}
            {origin?.can_visit&&origin.url ? <Link to={origin.url} className="text-text-muted underline">前往{origin.visibility==='public'?'公開':'共用'}集合 · {origin.title}</Link> : origin?.kind==='collection'&&<p className="text-xs text-text-muted">
              {origin.access_hint==='source_unavailable'?'來源集合或原題目前無法存取，此分享版本仍可觀看。':<>來源集合另有存取權限。<button onClick={()=>openAuth(true)} className="ml-2 underline">{origin.access_hint==='login'?'登入以查看來源':'切換帳號以查看來源'}</button></>}
            </p>}
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
                <div className="absolute inset-0 opacity-25 pointer-events-none bg-[radial-gradient(#9CA3AF_1.2px,transparent_1.2px)] [background-size:18px_18px]" />
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
                <span>分享者的文字筆記</span>
              </div>
              <p className="text-xs text-text-main leading-relaxed whitespace-pre-wrap">
                {item.typed_notes}
              </p>
            </div>
          )}
        </div>
      </div>
      <AuthModal/>
    </div>
  );
};

