import React, { useEffect, useState } from 'react';
import { AIConsultation, AIConsultationStatus, UserRole } from '../../../types';
import { aiConsultationService } from '../../../services/aiConsultationService';
import { useAuth } from '../../../contexts/AuthContext';
import {
  Bot,
  Send,
  Plus,
  UserCheck,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Printer,
  FileText,
  Paperclip,
  X,
  MessageSquare,
  Sparkles,
} from 'lucide-react';

interface AIConsultingViewProps {
  role: UserRole;
  companyId?: string;
}

const STATUS_MAP: Record<
  AIConsultationStatus,
  { label: string; bg: string; text: string; border: string }
> = {
  AI_ANSWERED: {
    label: 'AI 1차 답변완료',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
  },
  ATTORNEY_REVIEW_PENDING: {
    label: '노무사 검토 요청중',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
  },
  ATTORNEY_REVIEWING: {
    label: '노무사 법률 검토중',
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    border: 'border-purple-200',
  },
  ANSWERED: {
    label: '전문가 최종 답변완료',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
  },
};

export const AIConsultingView: React.FC<AIConsultingViewProps> = ({ role, companyId }) => {
  const { currentUser, userProfile } = useAuth();
  const [consultations, setConsultations] = useState<AIConsultation[]>([]);
  const [loading, setLoading] = useState(true);

  // Active Conversation State
  const [activeConversationId, setActiveConversationId] = useState<string>(
    `conv_${Date.now()}`
  );
  const [selectedConsultation, setSelectedConsultation] = useState<AIConsultation | null>(null);

  // Chat Form State
  const [questionInput, setQuestionInput] = useState('');
  const [isCallingAI, setIsCallingAI] = useState(false);
  const [aiErrorMessage, setAiErrorMessage] = useState('');

  // Attorney Review Answer Modal State
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [attorneyAnswerInput, setAttorneyAnswerInput] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  // File Attachment State (Prepared structure)
  const [attachedFileName, setAttachedFileName] = useState('');

  // Filter tab for Admin
  const [filterMode, setFilterMode] = useState<'all' | 'pending_review'>('all');

  const fetchConsultations = async () => {
    try {
      setLoading(true);
      let list: AIConsultation[] = [];
      if (role === 'ADMIN') {
        list = await aiConsultationService.getAllConsultations();
      } else if (companyId) {
        list = await aiConsultationService.getConsultationsByCompany(companyId);
      } else if (currentUser) {
        list = await aiConsultationService.getConsultationsByUser(currentUser.uid);
      }
      setConsultations(list || []);

      if (list.length > 0 && !selectedConsultation) {
        setSelectedConsultation(list[0]);
        setActiveConversationId(list[0].conversationId);
      }
    } catch (err) {
      console.error('Failed to fetch consultations', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConsultations();
  }, [currentUser, role, companyId]);

  // Requirement 14: [새 대화] button creates a new conversation; does NOT delete past history!
  const handleStartNewConversation = () => {
    const newId = `conv_${Date.now()}`;
    setActiveConversationId(newId);
    setSelectedConsultation(null);
    setQuestionInput('');
    setAiErrorMessage('');
  };

  // Requirement 12: Real AI integration principle (No fake responses)
  const handleSendQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !questionInput.trim() || isCallingAI) return;

    const currentPrompt = questionInput.trim();
    setAiErrorMessage('');
    setIsCallingAI(true);

    try {
      // Call real backend Gemini endpoint
      const aiResponseText = await aiConsultationService.askGemini(currentPrompt);

      // Save consultation to Firestore with real Gemini answer
      const newConsultation = await aiConsultationService.createConsultation({
        conversationId: activeConversationId,
        companyId: companyId || userProfile?.companyId || 'general',
        userId: currentUser.uid,
        userName: userProfile?.displayName || currentUser.email || '사용자',
        userRole: role,
        question: currentPrompt,
        aiAnswer: aiResponseText,
        status: 'AI_ANSWERED',
        attachments: attachedFileName
          ? [{ name: attachedFileName, fileType: 'document' }]
          : undefined,
      });

      setQuestionInput('');
      setAttachedFileName('');
      setSelectedConsultation(newConsultation);
      await fetchConsultations();
    } catch (err: any) {
      console.error('AI Consultation error', err);
      // Requirement 12: Clear failure state, no fake answers
      setAiErrorMessage(
        err.message ||
          'AI 서비스 연결에 실패하였습니다. (AI 서비스 설정이 필요하거나 잠시 후 다시 시도해 주세요.)'
      );
    } finally {
      setIsCallingAI(false);
    }
  };

  // Requirement 11: Request Attorney Review
  const handleRequestAttorneyReview = async (consultation: AIConsultation) => {
    if (!window.confirm('담당 공인노무사에게 이 상담 건에 대한 전문가 검토를 요청하시겠습니까?'))
      return;
    try {
      await aiConsultationService.requestAttorneyReview(consultation.id);
      await fetchConsultations();
      alert('공인노무사 전문가 검토가 접수되었습니다.');
    } catch (err) {
      console.error('Failed to request review', err);
    }
  };

  // Attorney submits formal response
  const handleSubmitAttorneyReview = async () => {
    if (!selectedConsultation || !currentUser || !attorneyAnswerInput.trim()) return;
    try {
      setIsSubmittingReview(true);
      await aiConsultationService.submitAttorneyAnswer(
        selectedConsultation.id,
        attorneyAnswerInput.trim(),
        currentUser.uid,
        userProfile?.displayName || '공인노무사'
      );
      setIsReviewModalOpen(false);
      setAttorneyAnswerInput('');
      await fetchConsultations();
      alert('전문가 검토 답변이 성공적으로 등록되었습니다.');
    } catch (err) {
      console.error('Failed to submit attorney review', err);
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const filteredConsultations = consultations.filter((c) => {
    if (filterMode === 'pending_review') {
      return c.status === 'ATTORNEY_REVIEW_PENDING' || c.status === 'ATTORNEY_REVIEWING';
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              통합 노무실
            </span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 border border-slate-200">
              AI 법률 질의 &amp; 감수 파이프라인
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <Bot className="h-6 w-6 text-slate-700" />
            AI 상담관리
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            노동법령 기반 AI 1차 상담과 공인노무사의 전문 감수를 연결하는 올인원 법률 자문
            창구입니다.
          </p>
        </div>

        <button
          onClick={handleStartNewConversation}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs sm:text-sm font-medium text-white shadow-sm hover:bg-slate-800 transition"
        >
          <Plus className="h-4 w-4" />
          새 대화 시작
        </button>
      </div>

      {/* Main Workspace Layout */}
      <div className="flex flex-col lg:flex-row gap-6 items-start min-h-[550px]">
        {/* Left Column: History & Queue */}
        <div className="w-full lg:w-72 shrink-0 space-y-3">
          {role === 'ADMIN' && (
            <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-200">
              <button
                onClick={() => setFilterMode('all')}
                className={`flex-1 py-1.5 text-[11px] rounded-lg font-medium transition ${
                  filterMode === 'all'
                    ? 'bg-white text-slate-900 font-bold shadow-xs'
                    : 'text-slate-600'
                }`}
              >
                전체 상담 ({consultations.length})
              </button>
              <button
                onClick={() => setFilterMode('pending_review')}
                className={`flex-1 py-1.5 text-[11px] rounded-lg font-medium transition ${
                  filterMode === 'pending_review'
                    ? 'bg-white text-rose-700 font-bold shadow-xs'
                    : 'text-slate-600'
                }`}
              >
                검토 대기 (
                {
                  consultations.filter(
                    (c) =>
                      c.status === 'ATTORNEY_REVIEW_PENDING' || c.status === 'ATTORNEY_REVIEWING'
                  ).length
                }
                )
              </button>
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-xs space-y-2">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-2">
              상담 이력 목록
            </span>
            <div className="max-h-[460px] overflow-y-auto space-y-1.5 pr-1">
              {loading ? (
                <div className="p-4 text-center text-xs text-slate-400">목록 로딩 중...</div>
              ) : filteredConsultations.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  기록된 상담 내역이 없습니다.
                </div>
              ) : (
                filteredConsultations.map((c) => {
                  const isSelected = selectedConsultation?.id === c.id;
                  const st = STATUS_MAP[c.status] || STATUS_MAP.AI_ANSWERED;
                  return (
                    <button
                      key={c.id}
                      onClick={() => {
                        setSelectedConsultation(c);
                        setActiveConversationId(c.conversationId);
                      }}
                      className={`w-full text-left p-3 rounded-xl transition flex flex-col gap-1 border ${
                        isSelected
                          ? 'border-slate-800 bg-slate-900 text-white shadow-xs'
                          : 'border-slate-100 bg-slate-50/70 hover:bg-slate-100 text-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 w-full">
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full border ${
                            isSelected
                              ? 'bg-slate-800 text-slate-200 border-slate-700'
                              : `${st.bg} ${st.text} ${st.border}`
                          }`}
                        >
                          {st.label}
                        </span>
                        <span
                          className={`text-[10px] ${
                            isSelected ? 'text-slate-400' : 'text-slate-400'
                          }`}
                        >
                          {new Date(c.createdAt).toLocaleDateString('ko-KR')}
                        </span>
                      </div>
                      <div className="text-xs font-semibold line-clamp-2 mt-0.5">{c.question}</div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Active Conversation / Chat Area */}
        <div className="flex-1 w-full rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between min-h-[550px]">
          {/* Top Info Bar */}
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-blue-600" />
              <span className="text-xs font-bold text-slate-900">
                {selectedConsultation ? '노무 상담 상세 대화' : '새 노무 질의 작성'}
              </span>
              {selectedConsultation && (
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    STATUS_MAP[selectedConsultation.status]?.bg
                  } ${STATUS_MAP[selectedConsultation.status]?.text} ${
                    STATUS_MAP[selectedConsultation.status]?.border
                  }`}
                >
                  {STATUS_MAP[selectedConsultation.status]?.label}
                </span>
              )}
            </div>

            {selectedConsultation && (
              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 font-medium"
                title="상담 대화기록 인쇄"
              >
                <Printer className="h-3.5 w-3.5" />
                인쇄 / PDF
              </button>
            )}
          </div>

          {/* Chat Messages Display */}
          <div className="my-4 flex-1 overflow-y-auto space-y-4 max-h-[380px] pr-2">
            {selectedConsultation ? (
              <>
                {/* 1. User Question */}
                <div className="flex flex-col items-end space-y-1">
                  <div className="text-[11px] text-slate-400">
                    {selectedConsultation.userName} •{' '}
                    {new Date(selectedConsultation.createdAt).toLocaleTimeString('ko-KR')}
                  </div>
                  <div className="rounded-2xl rounded-tr-xs bg-slate-900 text-white p-4 max-w-lg text-xs leading-relaxed whitespace-pre-wrap shadow-xs">
                    {selectedConsultation.question}
                  </div>
                </div>

                {/* 2. AI Response */}
                {selectedConsultation.aiAnswer && (
                  <div className="flex flex-col items-start space-y-1">
                    <div className="text-[11px] text-blue-600 font-semibold flex items-center gap-1">
                      <Bot className="h-3.5 w-3.5" />
                      노무법인 나인 AI 법률 어드바이저
                    </div>
                    <div className="rounded-2xl rounded-tl-xs bg-blue-50/70 border border-blue-100 text-slate-800 p-4 max-w-xl text-xs leading-relaxed whitespace-pre-wrap">
                      {selectedConsultation.aiAnswer}
                    </div>

                    {/* Attorney Review CTA */}
                    {selectedConsultation.status === 'AI_ANSWERED' && (
                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={() => handleRequestAttorneyReview(selectedConsultation)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition shadow-xs"
                        >
                          <UserCheck className="h-3.5 w-3.5" />
                          담당 공인노무사 전문가 검토 요청
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* 3. Attorney Final Response */}
                {selectedConsultation.attorneyAnswer && (
                  <div className="flex flex-col items-start space-y-1 pt-2">
                    <div className="text-[11px] text-emerald-700 font-bold flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {selectedConsultation.assignedAttorneyName || '담당 공인노무사'} 최종 법률 검토
                    </div>
                    <div className="rounded-2xl rounded-tl-xs bg-emerald-50/80 border border-emerald-200 text-slate-900 p-4 max-w-xl text-xs leading-relaxed whitespace-pre-wrap font-sans">
                      {selectedConsultation.attorneyAnswer}
                    </div>
                  </div>
                )}

                {/* Admin action button if pending review and viewer is Admin */}
                {role === 'ADMIN' &&
                  (selectedConsultation.status === 'ATTORNEY_REVIEW_PENDING' ||
                    selectedConsultation.status === 'ATTORNEY_REVIEWING') && (
                    <div className="rounded-xl border border-purple-200 bg-purple-50 p-4 flex items-center justify-between">
                      <div className="text-xs text-purple-900 font-semibold">
                        전문가 법률 검토가 요청된 상담 건입니다.
                      </div>
                      <button
                        onClick={() => setIsReviewModalOpen(true)}
                        className="rounded-xl bg-purple-700 px-4 py-2 text-xs font-semibold text-white hover:bg-purple-600 transition shadow-xs"
                      >
                        전문가 답변 작성
                      </button>
                    </div>
                  )}
              </>
            ) : (
              <div className="py-16 text-center space-y-3">
                <Bot className="mx-auto h-10 w-10 text-slate-300" />
                <h4 className="text-sm font-bold text-slate-800">새 노무 상담을 시작하세요</h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                  근로계약, 취업규칙, 주휴수당, 퇴직금, 모성보호 등 노동관계 법률 질문을 남기시면 AI가
                  1차 분석을 제공하고, 필요시 전담 공인노무사에게 정식 검토를 요청할 수 있습니다.
                </p>
              </div>
            )}
          </div>

          {/* AI Error banner if real call failed */}
          {aiErrorMessage && (
            <div className="mb-3 rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{aiErrorMessage}</span>
            </div>
          )}

          {/* File attachment preview */}
          {attachedFileName && (
            <div className="mb-2 flex items-center justify-between bg-slate-100 px-3 py-1.5 rounded-lg text-xs text-slate-700">
              <span className="flex items-center gap-1.5">
                <Paperclip className="h-3.5 w-3.5 text-slate-500" />
                첨부 서류: {attachedFileName}
              </span>
              <button
                onClick={() => setAttachedFileName('')}
                className="text-slate-400 hover:text-slate-600"
              >
                &times;
              </button>
            </div>
          )}

          {/* Input Form */}
          <form onSubmit={handleSendQuestion} className="space-y-2 pt-2 border-t border-slate-100">
            <div className="relative">
              <textarea
                rows={3}
                placeholder="궁금하신 노무 법률 질의를 입력하세요 (예: 5인 미만 사업장 연장근로수당 지급 의무가 있나요?)"
                value={questionInput}
                onChange={(e) => setQuestionInput(e.target.value)}
                disabled={isCallingAI}
                className="w-full rounded-2xl border border-slate-200 p-3 pr-24 text-xs focus:border-slate-800 focus:outline-none resize-none leading-relaxed disabled:opacity-60"
              />

              <div className="absolute right-3 bottom-3 flex items-center gap-1.5">
                {/* File Attachment simulator (Requirement 13) */}
                <button
                  type="button"
                  onClick={() => {
                    const sampleName = prompt('첨부할 문서 파일명을 입력하세요 (PDF, DOCX, XLSX 등):');
                    if (sampleName) setAttachedFileName(sampleName);
                  }}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
                  title="문서/파일 첨부"
                >
                  <Paperclip className="h-4 w-4" />
                </button>

                <button
                  type="submit"
                  disabled={isCallingAI || !questionInput.trim()}
                  className="flex items-center gap-1 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 transition disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  {isCallingAI ? 'AI 분석중...' : '전송'}
                </button>
              </div>
            </div>
            <div className="text-[11px] text-slate-400 flex items-center justify-between px-1">
              <span>노무법인 나인 AI 어드바이저 질의응답 (정식 법률 자문은 노무사 최종 검토 요청)</span>
              <span>Gemini 2.5 Flash 연동</span>
            </div>
          </form>
        </div>
      </div>

      {/* Attorney Review Answer Modal */}
      {isReviewModalOpen && selectedConsultation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-purple-700" />
                공인노무사 전문가 최종 답변 등록
              </h3>
              <button
                onClick={() => setIsReviewModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-1">
              <div>
                <strong>질문:</strong> {selectedConsultation.question}
              </div>
              <div>
                <strong>AI 1차 답변:</strong> {selectedConsultation.aiAnswer?.substring(0, 100)}...
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                전문가 검토 의견 및 최종 법률 회신 <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={6}
                required
                placeholder="공인노무사 자격에 근거한 정확한 법률 검토 의견 및 실무 지침을 작성해 주세요."
                value={attorneyAnswerInput}
                onChange={(e) => setAttorneyAnswerInput(e.target.value)}
                className="w-full rounded-xl border border-slate-200 p-3 text-xs focus:border-slate-900 focus:outline-none leading-relaxed"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsReviewModalOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
              >
                취소
              </button>
              <button
                type="button"
                disabled={isSubmittingReview || !attorneyAnswerInput.trim()}
                onClick={handleSubmitAttorneyReview}
                className="rounded-xl bg-purple-700 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-purple-600 transition disabled:opacity-50"
              >
                {isSubmittingReview ? '등록 중...' : '최종 답변 확정 등록'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
