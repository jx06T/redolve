import { useEffect } from 'react';

interface SEOProps {
  title?: string;
  description?: string;
  keywords?: string;
  canonical?: string;
  ogType?: 'website' | 'article';
}

const DEFAULT_TITLE = 'Redolve - 心流式 AI 錯題本 | 高中學測・分科・模考手寫訂正 PWA';
const DEFAULT_DESCRIPTION =
  '專為 iPad + Apple Pencil 打造的心流式 AI 錯題本 PWA。支援批次拍照上傳、AI 智慧打標題型、向量手寫筆跡同步、無干擾沉浸式訂正與弱點分析。';
const DEFAULT_KEYWORDS =
  'Redolve, AI錯題本, 學測錯題, 分科測驗, 模擬考, 高中錯題本, iPad錯題本, Apple Pencil, 錯題複習, 智慧題庫, PWA';

export const useSEO = ({
  title,
  description = DEFAULT_DESCRIPTION,
  keywords = DEFAULT_KEYWORDS,
  canonical,
  ogType = 'website',
}: SEOProps = {}) => {
  useEffect(() => {
    // 1. Update Document Title
    const fullTitle = title ? `${title} | Redolve 錯題本` : DEFAULT_TITLE;
    document.title = fullTitle;

    // Helper to update or create a meta tag
    const setMetaTag = (selector: string, attr: string, value: string) => {
      let element = document.querySelector(selector);
      if (!element) {
        element = document.createElement('meta');
        const [attrName, attrVal] = selector.replace(/[\[\]"']/g, '').split('=');
        if (attrName && attrVal) {
          element.setAttribute(attrName, attrVal);
        }
        document.head.appendChild(element);
      }
      element.setAttribute(attr, value);
    };

    // 2. Update Standard SEO Meta
    setMetaTag('meta[name="description"]', 'content', description);
    setMetaTag('meta[name="keywords"]', 'content', keywords);

    // 3. Update Open Graph Meta
    setMetaTag('meta[property="og:title"]', 'content', fullTitle);
    setMetaTag('meta[property="og:description"]', 'content', description);
    setMetaTag('meta[property="og:type"]', 'content', ogType);
    setMetaTag('meta[property="og:url"]', 'content', window.location.href);

    // 4. Update Twitter Card Meta
    setMetaTag('meta[name="twitter:title"]', 'content', fullTitle);
    setMetaTag('meta[name="twitter:description"]', 'content', description);

    // 5. Update Canonical Link
    const currentUrl = canonical || window.location.origin + window.location.pathname;
    let canonicalElement = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonicalElement) {
      canonicalElement = document.createElement('link');
      canonicalElement.setAttribute('rel', 'canonical');
      document.head.appendChild(canonicalElement);
    }
    canonicalElement.setAttribute('href', currentUrl);
  }, [title, description, keywords, canonical, ogType]);
};
