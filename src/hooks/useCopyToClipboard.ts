import { useState, useCallback } from 'react';

export function useCopyToClipboard(timeout = 2000) {
  const [isCopied, setIsCopied] = useState(false);

  const unsecuredCopyToClipboard = (text: string) => {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
    } catch (error) {
      throw error;
    } finally {
      textArea.remove();
    }
  };

  const copy = useCallback(async (content: string | Promise<string>) => {
    try {
      if (typeof content === 'string') {
        if (navigator?.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(content);
        } else {
          unsecuredCopyToClipboard(content);
        }
      } else {
        // Handle Promise (essential for Safari when copy is delayed by network request)
        let resolvedText = '';
        if (navigator?.clipboard && window.ClipboardItem) {
          try {
            // Safari supports Promise inside ClipboardItem, and REQUIRES it to be created synchronously in the click event
            const item = new ClipboardItem({
              'text/plain': content.then((text) => {
                resolvedText = text;
                return new Blob([text], { type: 'text/plain' });
              }),
            });
            await navigator.clipboard.write([item]);
          } catch (err) {
            // Chrome might throw if it doesn't support Promises in ClipboardItem yet.
            // But Chrome allows writeText after an async await.
            resolvedText = await content;
            if (navigator.clipboard && window.isSecureContext) {
              await navigator.clipboard.writeText(resolvedText);
            } else {
              unsecuredCopyToClipboard(resolvedText);
            }
          }
        } else {
          resolvedText = await content;
          if (navigator?.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(resolvedText);
          } else {
            unsecuredCopyToClipboard(resolvedText);
          }
        }
      }

      setIsCopied(true);
      setTimeout(() => {
        setIsCopied(false);
      }, timeout);
      return true;
    } catch (error: any) {
      if (error?.message === 'EMPTY_TEXT') {
        throw error;
      }
      console.warn('Copy failed', error);
      setIsCopied(false);
      return false;
    }
  }, [timeout]);

  return { isCopied, copy };
}
