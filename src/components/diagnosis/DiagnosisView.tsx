// AI 진단 화면 컨테이너 (헤더 + 3탭)

import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useUiStore, setActiveMainView } from '../../store/uiStore';
import { useLogStore } from '../../store/logStore';
import { useDiagnosis } from '../../hooks/useDiagnosis';
import { DiagnosisHeader } from './DiagnosisHeader';
import { UnidirectionalTab } from './UnidirectionalTab';
import { ConversationalTab } from './ConversationalTab';
import { DiagnosisHistoryTab } from './DiagnosisHistoryTab';
import type { DiagnosisHistory } from '../../types/diagnosis';

type TabType = 'unidirectional' | 'conversational' | 'history';

export function DiagnosisView() {
  const { t } = useTranslation();
  const activeFileId = useLogStore((s) => s.activeFileId);
  const diagnosisInput = useUiStore((s) =>
    activeFileId ? s.diagnoses[activeFileId]?.input ?? null : null,
  );
  const diagnosisEntrySource = useUiStore((s) =>
    activeFileId ? s.diagnoses[activeFileId]?.entrySource ?? null : null,
  );
  const closeDiagnosisAction = useUiStore((s) => s.closeDiagnosis);
  const setActiveToolTab = useUiStore((s) => s.setActiveToolTab);

  const [activeTab, setActiveTab] = useState<TabType>('unidirectional');

  const diagnosis = useDiagnosis(diagnosisInput);

  // 히스토리 탭 진입 시 자동 로드
  useEffect(() => {
    if (activeTab === 'history') {
      diagnosis.loadHistories();
    }
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // 대화형으로 이어서 분석
  const handleContinueChat = useCallback(() => {
    diagnosis.continueToChat();
    setActiveTab('conversational');
  }, [diagnosis]);

  // 히스토리 보기 → 단방향 탭으로 이동 (향후 결과 복원)
  const handleViewHistory = useCallback((_history: DiagnosisHistory) => {
    setActiveTab('unidirectional');
  }, []);

  // 뒤로가기: 진입 경로에 따라 복귀
  const handleBack = useCallback(() => {
    closeDiagnosisAction();

    switch (diagnosisEntrySource) {
      case 'stacktrace':
        setActiveMainView('stacktrace');
        break;
      case 'errorPattern':
        setActiveMainView('errorPattern');
        break;
      case 'landing':
        setActiveToolTab('ai');
        break;
      default:
        break;
    }
  }, [closeDiagnosisAction, diagnosisEntrySource, setActiveToolTab]);

  if (!diagnosisInput) return null;

  const tabs: { key: TabType; label: string }[] = [
    { key: 'unidirectional', label: t('aiDiagnosis.tabUnidirectional') },
    { key: 'conversational', label: t('aiDiagnosis.tabConversational') },
    { key: 'history', label: t('aiDiagnosis.tabHistory') },
  ];

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* 헤더 */}
      <DiagnosisHeader input={diagnosisInput} onBack={handleBack} />

      {/* 탭 바 */}
      <div className="flex items-center border-b border-[var(--color-border-default)] bg-[var(--color-bg-surface)] flex-shrink-0 px-4">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm border-b-2 transition-all duration-200 ${
              activeTab === tab.key
                ? 'border-[var(--color-accent-primary)] text-[var(--color-accent-primary)]'
                : 'border-transparent text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
            }`}
            aria-label={t('aiDiagnosis.tabAria', { label: tab.label })}
          >
            {tab.label}
            {tab.key === 'history' && diagnosis.histories.length > 0 && (
              <span className="ml-1.5 bg-[var(--color-bg-elevated)] text-[var(--color-text-tertiary)] text-[10px] rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center">
                {diagnosis.histories.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 탭 콘텐츠 (display: none 방식으로 상태 유지) */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {/* 단방향 탭 */}
        <div
          className="flex-1 min-h-0 flex flex-col overflow-hidden"
          style={{ display: activeTab === 'unidirectional' ? 'flex' : 'none' }}
        >
          <UnidirectionalTab
            phase={diagnosis.phase}
            progress={diagnosis.progress}
            result={diagnosis.result}
            rawResponse={diagnosis.rawResponse}
            error={diagnosis.error}
            isAnalyzing={diagnosis.isAnalyzing}
            canStartDiagnosis={diagnosis.canStartDiagnosis}
            payloadSize={diagnosis.payloadSize}
            estimatedCost={diagnosis.estimatedCost}
            isPayloadTooLarge={diagnosis.isPayloadTooLarge}
            relatedHistoryCount={diagnosis.relatedHistoryCount}
            includeHistory={diagnosis.includeHistory}
            onToggleHistory={diagnosis.setIncludeHistory}
            onStartDiagnosis={diagnosis.startDiagnosis}
            onCancelDiagnosis={diagnosis.cancelDiagnosis}
            onRetryDiagnosis={diagnosis.retryDiagnosis}
            onContinueChat={handleContinueChat}
            onSave={diagnosis.saveToHistory}
          />
        </div>

        {/* 대화형 탭 */}
        <div
          className="flex-1 min-h-0 flex flex-col overflow-hidden"
          style={{ display: activeTab === 'conversational' ? 'flex' : 'none' }}
        >
          <ConversationalTab
            input={diagnosisInput}
            messages={diagnosis.messages}
            isStreaming={diagnosis.isStreaming}
            streamingContent={diagnosis.streamingContent}
            onSendMessage={diagnosis.sendMessage}
            onCancelStreaming={diagnosis.cancelStreaming}
          />
        </div>

        {/* 히스토리 탭 */}
        <div
          className="flex-1 min-h-0 flex flex-col overflow-hidden"
          style={{ display: activeTab === 'history' ? 'flex' : 'none' }}
        >
          <DiagnosisHistoryTab
            histories={diagnosis.histories}
            onView={handleViewHistory}
            onDelete={diagnosis.deleteHistory}
            onClearAll={diagnosis.clearAllHistory}
          />
        </div>
      </div>
    </div>
  );
}
