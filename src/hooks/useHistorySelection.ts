// 히스토리 비교 선택 훅
// 최대 2개 항목 선택, A/B 순서 관리

import { useCallback, useState } from "react";

export interface HistorySelection {
  selectedIds: string[]; // 최대 2개, [0]=A, [1]=B
  getOrder: (id: string) => "A" | "B" | null;
  toggle: (id: string) => void;
  clear: () => void;
  canSelect: (id: string) => boolean;
  canCompare: boolean; // selectedIds.length === 2
}

export function useHistorySelection(): HistorySelection {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const getOrder = useCallback(
    (id: string): "A" | "B" | null => {
      const idx = selectedIds.indexOf(id);
      if (idx === 0) return "A";
      if (idx === 1) return "B";
      return null;
    },
    [selectedIds]
  );

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const idx = prev.indexOf(id);
      if (idx !== -1) {
        // 이미 선택됨 → 해제
        return prev.filter((i) => i !== id);
      }
      // 2개 이상 선택 불가
      if (prev.length >= 2) return prev;
      return [...prev, id];
    });
  }, []);

  const clear = useCallback(() => setSelectedIds([]), []);

  const canSelect = useCallback(
    (id: string): boolean => {
      // 이미 선택된 항목은 해제 가능
      if (selectedIds.includes(id)) return true;
      // 2개 선택 시 추가 선택 불가
      return selectedIds.length < 2;
    },
    [selectedIds]
  );

  const canCompare = selectedIds.length === 2;

  return { selectedIds, getOrder, toggle, clear, canSelect, canCompare };
}
