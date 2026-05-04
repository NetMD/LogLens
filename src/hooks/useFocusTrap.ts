// 일반화된 Tab 트랩 훅 (ConfirmDialog의 하드코딩 방식을 querySelectorAll 기반으로 확장)

import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"]), [role="radio"], [role="switch"]';

interface UseFocusTrapOptions {
  /** 트랩 활성 여부 */
  enabled: boolean;
  /** ESC 키 콜백 */
  onEscape?: () => void;
  /** 마운트 시 포커스할 요소 ref (없으면 첫 focusable 요소) */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  /** 닫힐 때 포커스를 복귀할 요소 ref */
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}

export function useFocusTrap(
  containerRef: React.RefObject<HTMLElement | null>,
  options: UseFocusTrapOptions
) {
  const { enabled, onEscape, initialFocusRef, returnFocusRef } = options;

  // 모달 오픈 시 현재 포커스 요소를 자동 캡처 (returnFocusRef가 없을 때 사용)
  const capturedFocusRef = useRef<HTMLElement | null>(null);

  // 마운트 시 초기 포커스 (+ 오픈 시 activeElement 캡처)
  useEffect(() => {
    if (!enabled || !containerRef.current) return;
    // 모달 오픈 시점의 activeElement를 캡처
    capturedFocusRef.current = document.activeElement as HTMLElement | null;
    const target = initialFocusRef?.current
      ?? containerRef.current.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    if (target) {
      const t = setTimeout(() => target.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [enabled, containerRef, initialFocusRef]);

  // Tab 트랩 + ESC 처리
  useEffect(() => {
    if (!enabled || !containerRef.current) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onEscape?.();
        return;
      }
      if (e.key !== 'Tab') return;

      const container = containerRef.current;
      if (!container) return;

      const focusables = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      );
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement;

      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [enabled, containerRef, onEscape]);

  // 비활성화 시 포커스 복귀 (returnFocusRef 우선, 없으면 캡처한 요소로 복귀)
  useEffect(() => {
    if (enabled) return;
    const target = returnFocusRef?.current ?? capturedFocusRef.current;
    if (target) {
      const t = setTimeout(() => target.focus(), 0);
      return () => {
        clearTimeout(t);
        capturedFocusRef.current = null;
      };
    }
  }, [enabled, returnFocusRef]);
}
