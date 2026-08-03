import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, AlertTriangle, BookOpen } from 'lucide-react';
import { fetchSharedProblem, getSharedImageUrl } from '../services/api';
import { DrawCanvas } from '../components/DrawCanvas';
import { Item } from '../types';

export const ShareView: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<{ item: Partial<Item>; share: { token: string; allow_ink: boolean } } | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (token) {
      fetchSharedProblem(token)
        .then((res) => setData(res))
        .catch((err) => setErrorMsg(err.message || '無法載入分享連結'))
        .finally(() => setLoading(false));
    }
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-[#161618] flex items-center justify-center p-4">
        <Loader2 className="w-8 h-8 animate-spin text-[#6366F1]" />
      </div>
    );
  }

  if (errorMsg || !data) {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-[#161618] flex items-center justify-center p-4">
        <div className="bg-white dark:bg-[#202023] border border-[#E5E7EB] dark:border-[#2C2C30] rounded-3xl p-8 max-w-md w-full text-center space-y-4">
          <div className="p-3 bg-amber-500/10 text-amber-500 rounded-2xl w-fit mx-auto">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h2 className="text-base font-bold text-[#374151] dark:text-[#D1D5DB]">連結不可用</h2>
          <p className="text-xs text-[#9CA3AF]">{errorMsg || '分享連結不存在或已被建立者撤銷'}</p>
        </div>
      </div>
    );
  }

  const { item, share } = data;
  const imageUrl = getSharedImageUrl(token!);

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-[#161618] py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header Bar */}
        <div className="bg-white dark:bg-[#202023] border border-[#E5E7EB] dark:border-[#2C2C30] rounded-3xl p-6 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-[#6366F1]/10 text-[#6366F1] rounded-2xl">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-[#374151] dark:text-[#D1D5DB]">
                Redolve 公開唯讀錯題分享
              </h1>
              <p className="text-xs text-[#9CA3AF]">唯讀檢視模式</p>
            </div>
          </div>
          <span className="px-3 py-1 rounded-xl text-xs bg-stone-100 dark:bg-stone-800 text-[#374151] dark:text-[#D1D5DB]">
            {share.allow_ink ? '包含作者筆跡' : '無筆跡原圖'}
          </span>
        </div>

        {/* Card View */}
        <div className="bg-white dark:bg-[#202023] border border-[#E5E7EB] dark:border-[#2C2C30] rounded-3xl p-6 space-y-4">
          <div className="relative rounded-2xl overflow-hidden bg-stone-50 dark:bg-[#161618] border border-stone-200/60 dark:border-stone-800">
            <img
              src={imageUrl}
              alt="分享題目圖片"
              className="exam-paper-image w-full h-auto object-contain block select-none"
            />
            {share.allow_ink && item.draw_data && (
              <div className="absolute inset-0 pointer-events-none">
                <DrawCanvas initialDrawData={item.draw_data} readOnly={true} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
