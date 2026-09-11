'use client';

import { useEffect } from 'react';

const DEV_CHROME =
  'nextjs-portal, [data-next-badge-root], [data-nextjs-toast], [data-nextjs-dialog], [data-nextjs-dialog-overlay], [data-nextjs-dev-overlay], script[data-nextjs-dev-overlay], #__next-build-watcher, #eruda, .eruda-container, .eruda-entry-btn, #vercel-live-feedback, vercel-live-feedback, [data-vercel-toolbar], [data-vercel-toolbar-container]';

function stripDevChrome() {
  document.querySelectorAll(DEV_CHROME).forEach((node) => {
    node.remove();
  });
}

export function DevChromeKiller() {
  useEffect(() => {
    stripDevChrome();
    const observer = new MutationObserver(() => {
      stripDevChrome();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    const interval = window.setInterval(stripDevChrome, 400);
    const stop = window.setTimeout(() => {
      window.clearInterval(interval);
      observer.disconnect();
      stripDevChrome();
    }, 12000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(stop);
      observer.disconnect();
    };
  }, []);

  return null;
}
