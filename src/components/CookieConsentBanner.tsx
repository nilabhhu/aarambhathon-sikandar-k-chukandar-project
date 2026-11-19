import React, { useEffect, useState } from 'react';
import { Cookie } from 'lucide-react';
import { AppRoute } from '../auth/authLogic';

interface CookieConsentBannerProps {
  onNavigate: (route: AppRoute) => void;
}

const CONSENT_STORAGE_KEY = 'mixlearn_cookie_consent_v1';

export const CookieConsentBanner: React.FC<CookieConsentBannerProps> = ({ onNavigate }) => {
  const [visible, setVisible] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(CONSENT_STORAGE_KEY) !== 'accepted';
    } catch {
      return true;
    }
  });

  const handleAccept = () => {
    try {
      window.localStorage.setItem(CONSENT_STORAGE_KEY, 'accepted');
    } catch {
      // ignore storage errors
    }
    setVisible(false);
  };

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleAccept();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible]);

  if (!visible) return null;

  return (
    <aside
      role="region"
      aria-label="Cookie Notice"
      data-testid="cookie-consent-banner"
      className="fixed bottom-0 inset-x-0 z-50 border-t-2 border-[var(--border-ink)] bg-[var(--bg-canvas)] text-[var(--ink)]"
    >
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-2.5 text-xs leading-relaxed">
          <Cookie className="w-4 h-4 shrink-0 mt-0.5 sm:mt-0 text-[var(--ink)]" aria-hidden="true" />
          <p>
            MixLearn Studio uses strictly essential cookies and local storage for authentication sessions and Light/Dark theme preferences. Zero ad or third-party tracking.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <a
            href="/cookies"
            onClick={(e) => {
              e.preventDefault();
              onNavigate('/cookies');
            }}
            className="px-3 py-1.5 border-[1.5px] border-[var(--border-ink)] font-mono text-[11px] font-bold uppercase tracking-wider text-[var(--ink)] hover:bg-[var(--bg-surface)]"
          >
            COOKIE POLICY
          </a>
          <button
            type="button"
            data-testid="cookie-accept-btn"
            onClick={handleAccept}
            className="px-4 py-1.5 border-2 border-[#0A0A0A] bg-[#FFD600] text-[#0A0A0A] hover:bg-[#0A0A0A] hover:text-[#FFD600] dark:border-white font-mono text-[11px] font-bold uppercase tracking-wider cursor-pointer"
          >
            ACCEPT ESSENTIAL
          </button>
        </div>
      </div>
    </aside>
  );
};
