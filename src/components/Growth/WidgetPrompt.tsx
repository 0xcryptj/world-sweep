'use client';

import { ForagerButton } from '@/components/ForagerButton';
import { WIDGET_PROMPT_DISMISSED_KEY } from '@/lib/growth';
import { useEffect, useState } from 'react';

type WidgetPromptProps = {
  force?: boolean;
  onDone?: () => void;
};

/**
 * World has no MiniKit "add widget" command — users pin from World App UI.
 * Prompt after value delivery per growth docs.
 */
export function WidgetPrompt({ force = false, onDone }: WidgetPromptProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (force) {
      setVisible(true);
      return;
    }
    try {
      if (localStorage.getItem(WIDGET_PROMPT_DISMISSED_KEY) === '1') {
        return;
      }
    } catch {
      // ignore
    }
    setVisible(true);
  }, [force]);

  if (!visible) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(WIDGET_PROMPT_DISMISSED_KEY, '1');
    } catch {
      // ignore
    }
    setVisible(false);
    onDone?.();
  };

  return (
    <div className="forager-group p-4">
      <p className="text-[17px] font-semibold">Pin Forager to home</p>
      <p className="mt-3 text-[15px] leading-snug text-forager-text-muted">
        In World App, long-press Forager (or use Add to Home Screen) so the next
        dusty airdrop is one tap away.
      </p>
      <ol className="mt-4 list-decimal space-y-2 pl-5 text-[15px] text-forager-text-muted">
        <li>Close this mini app back to World App home</li>
        <li>Find Forager in Mini Apps</li>
        <li>Add it as a home-screen widget</li>
      </ol>
      <ForagerButton
        variant="secondary"
        size="md"
        className="mt-4 w-full"
        onClick={dismiss}
      >
        Got it
      </ForagerButton>
    </div>
  );
}
