// 시스템 폰트 선택 드롭다운 (검색 가능)

import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

interface FontPickerProps {
  value: string;
  onChange: (fontFamily: string) => void;
}

// 모노스페이스 추천 폰트 (상단 고정)
const RECOMMENDED = [
  'JetBrains Mono',
  'Fira Code',
  'Source Code Pro',
  'D2Coding',
  'Consolas',
  'Menlo',
  'Monaco',
];

let cachedFonts: string[] | null = null;

export function FontPicker({ value, onChange }: FontPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [fonts, setFonts] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  // 시스템 폰트 로드 (캐시)
  useEffect(() => {
    if (cachedFonts) {
      setFonts(cachedFonts);
      return;
    }
    setLoading(true);
    invoke<string[]>('list_system_fonts')
      .then((result) => {
        cachedFonts = result;
        setFonts(result);
      })
      .catch(() => {
        // fallback: 추천 폰트만 표시
        setFonts([]);
      })
      .finally(() => setLoading(false));
  }, []);

  // 외부 클릭 닫기
  useEffect(() => {
    if (!isOpen) return;
    const handle = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [isOpen]);

  // 드롭다운 열릴 때 검색 입력에 포커스
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  // 추천 폰트 중 시스템에 있는 것만 필터
  const availableRecommended = RECOMMENDED.filter(
    (f) => fonts.length === 0 || fonts.some((sf) => sf.toLowerCase() === f.toLowerCase())
  );

  // 검색 필터
  const query = search.toLowerCase().trim();
  const filteredFonts = query
    ? fonts.filter((f) => f.toLowerCase().includes(query))
    : fonts;

  // 추천에 없는 일반 폰트만
  const recommendedSet = new Set(RECOMMENDED.map((f) => f.toLowerCase()));
  const otherFonts = filteredFonts.filter((f) => !recommendedSet.has(f.toLowerCase()));

  // 검색 시 추천도 필터
  const filteredRecommended = query
    ? availableRecommended.filter((f) => f.toLowerCase().includes(query))
    : availableRecommended;

  const handleSelect = (font: string) => {
    onChange(font);
    setIsOpen(false);
    setSearch('');
  };

  return (
    <div ref={containerRef} className="relative">
      <label htmlFor="settings-font-family" className="block text-xs text-[var(--color-text-tertiary)] mb-1.5">
        폰트
      </label>

      {/* 선택된 폰트 표시 버튼 */}
      <button
        id="settings-font-family"
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] rounded-lg px-3 py-2 text-sm text-[var(--color-text-primary)] hover:border-[var(--color-text-tertiary)] focus:border-[var(--color-accent-primary)] focus:ring-2 focus:ring-[var(--color-border-focus)] focus:outline-none transition-colors"
      >
        <span className="truncate" style={{ fontFamily: value }}>
          {value || '폰트 선택'}
        </span>
        <ChevronDown className={`w-4 h-4 text-[var(--color-text-tertiary)] shrink-0 ml-2 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* 드롭다운 */}
      {isOpen && (
        <div className="absolute z-[70] mt-1 w-full bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] rounded-lg shadow-xl overflow-hidden">
          {/* 검색 */}
          <div className="p-2 border-b border-[var(--color-border-default)]">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-text-tertiary)]" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="폰트 검색..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] rounded-md text-[var(--color-text-primary)] placeholder-[var(--color-text-disabled)] focus:outline-none focus:border-[var(--color-accent-primary)] focus:ring-2 focus:ring-[var(--color-border-focus)]/30"
              />
            </div>
          </div>

          {/* 폰트 목록 */}
          <div
            ref={listRef}
            role="listbox"
            id={listboxId}
            aria-label="시스템 폰트 목록"
            className="max-h-[240px] overflow-y-auto"
          >
            {loading ? (
              <div className="px-3 py-4 text-xs text-[var(--color-text-tertiary)] text-center">
                폰트 목록 로드 중...
              </div>
            ) : (
              <>
                {/* 추천 폰트 */}
                {filteredRecommended.length > 0 && (
                  <>
                    <div className="px-3 py-1.5 text-[10px] font-semibold text-[var(--color-text-disabled)] uppercase tracking-wider">
                      추천 (모노스페이스)
                    </div>
                    {filteredRecommended.map((f) => (
                      <button
                        key={`rec-${f}`}
                        type="button"
                        role="option"
                        aria-selected={value === f}
                        onClick={() => handleSelect(f)}
                        className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                          value === f
                            ? 'bg-[var(--color-button-primary-bg)]/15 text-[var(--color-accent-primary)]'
                            : 'text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]'
                        }`}
                        style={{ fontFamily: f }}
                      >
                        {f}
                      </button>
                    ))}
                  </>
                )}

                {/* 구분선 */}
                {filteredRecommended.length > 0 && otherFonts.length > 0 && (
                  <div className="border-t border-[var(--color-border-default)] my-1" />
                )}

                {/* 전체 시스템 폰트 */}
                {otherFonts.length > 0 && (
                  <>
                    <div className="px-3 py-1.5 text-[10px] font-semibold text-[var(--color-text-disabled)] uppercase tracking-wider">
                      시스템 폰트 ({otherFonts.length})
                    </div>
                    {otherFonts.map((f) => (
                      <button
                        key={f}
                        type="button"
                        role="option"
                        aria-selected={value === f}
                        onClick={() => handleSelect(f)}
                        className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                          value === f
                            ? 'bg-[var(--color-button-primary-bg)]/15 text-[var(--color-accent-primary)]'
                            : 'text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]'
                        }`}
                        style={{ fontFamily: f }}
                      >
                        {f}
                      </button>
                    ))}
                  </>
                )}

                {/* 검색 결과 없음 */}
                {filteredRecommended.length === 0 && otherFonts.length === 0 && (
                  <div className="px-3 py-4 text-xs text-[var(--color-text-tertiary)] text-center">
                    {query ? `"${search}" 검색 결과 없음` : '폰트를 찾을 수 없습니다'}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
