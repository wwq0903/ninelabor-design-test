import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { POLICY_DOCUMENTS, PolicyDocument } from '../../config/policies';
import { ShieldCheck, X, FileText, CheckCircle, ExternalLink } from 'lucide-react';

interface PolicyModalProps {
  initialPolicyId?: string;
  isOpen: boolean;
  onClose: () => void;
}

export const PolicyModal: React.FC<PolicyModalProps> = ({
  initialPolicyId = 'terms-of-service',
  isOpen,
  onClose,
}) => {
  const [selectedId, setSelectedId] = useState<string>(initialPolicyId);

  if (!isOpen) return null;

  const currentPolicy =
    POLICY_DOCUMENTS.find((p) => p.id === selectedId || p.type === selectedId) ||
    POLICY_DOCUMENTS[0];

  const modalNode = (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-slate-950/75 backdrop-blur-md p-3 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-4xl rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh] my-auto border border-slate-200 animate-fadeIn">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white font-bold text-xs">
              9
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">
                  노무법인 나인 정책 및 약관 센터
                </h3>
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                  {currentPolicy.version}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                투명하고 안전한 기업용 온라인 노무관리 서비스 이용 규정입니다.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Layout */}
        <div className="flex flex-col md:flex-row flex-1 overflow-hidden min-h-0">
          {/* Policy List Sidebar */}
          <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-slate-200 bg-slate-50/50 p-3 overflow-y-auto space-y-1">
            <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              약관 및 정책 목록
            </div>
            {POLICY_DOCUMENTS.map((doc) => {
              const isSelected = doc.id === currentPolicy.id;
              return (
                <button
                  key={doc.id}
                  onClick={() => setSelectedId(doc.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded-xl text-left transition ${
                    isSelected
                      ? 'bg-slate-900 text-white font-semibold shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span className="truncate">{doc.title}</span>
                  {doc.required && (
                    <span
                      className={`text-[9px] px-1 py-0.5 rounded font-bold ${
                        isSelected ? 'bg-slate-800 text-slate-200' : 'bg-rose-50 text-rose-600'
                      }`}
                    >
                      필수
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Policy Text Viewer */}
          <div className="flex-1 p-6 overflow-y-auto space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2">
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                    currentPolicy.required
                      ? 'bg-rose-100 text-rose-700'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {currentPolicy.required ? '필수 동의 규정' : '운영 및 이용 정책'}
                </span>
                <span className="text-xs text-slate-400">
                  최종 개정일: {currentPolicy.lastUpdated}
                </span>
              </div>
              <h2 className="text-xl font-bold text-slate-900 mt-2">{currentPolicy.title}</h2>
              <div className="mt-2 rounded-xl bg-blue-50/70 p-3 text-xs text-blue-900 border border-blue-100 leading-relaxed">
                <strong>요약:</strong> {currentPolicy.summary}
              </div>
            </div>

            {/* Legal Clauses */}
            <div className="space-y-5 text-xs text-slate-700 leading-relaxed font-sans">
              <div>
                <h4 className="font-bold text-slate-900 text-sm mb-1.5">
                  제 1 조 (목적 및 적용 범위)
                </h4>
                <p>
                  본 약관 및 정책은 노무법인 나인(이하 &quot;법인&quot;)이 제공하는 기업용 통합 노무관리
                  웹서비스(이하 &quot;서비스&quot;)의 이용과 관련하여, 법인과 회원(기업 고객, 소속
                  근로자 등) 간의 권리, 의무, 책임사항 및 이용절차를 규정함을 목적으로 합니다.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 text-sm mb-1.5">
                  제 2 조 (용어의 정의)
                </h4>
                <p>
                  1. &quot;회원&quot;이란 본 약관에 동의하고 서비스를 이용하는 기업 회원(대표자/인사담당자),
                  근로자 회원 및 담당 공인노무사를 말합니다.
                  <br />
                  2. &quot;통합 노무실&quot;이란 회원의 노무관리, 급여, 근태, 모성보호, 법률 질의,
                  자료요청 및 문서 수발신을 종합 처리하는 온라인 업무공간을 의미합니다.
                  <br />
                  3. &quot;테넌트 격리&quot;란 회원사별 고유 식별자(companyId)를 기준으로 다른 기업의
                  임직원, 급여, 상담 및 문서 데이터가 상호 열람되거나 누출되지 않도록 하는 기술적·관리적
                  보호조치를 의미합니다.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 text-sm mb-1.5">
                  제 3 조 (개인정보 및 업무 데이터의 보호)
                </h4>
                <p>
                  법인은 개인정보보호법 및 관계 법령에 따라 회원의 개인정보와 노동관계 법률 사무 처리를
                  위해 위탁받은 기업 근로자 인적사항, 임금내역, 출결기록 등을 안전하게 보호하며, 회원사의
                  명시적 위임 범위를 벗어나 제3자에게 제공하거나 목적 외로 이용하지 않습니다.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 text-sm mb-1.5">
                  제 4 조 (오프라인 계약, 플랜 지정 및 이용 종료)
                </h4>
                <p>
                  1. 서비스 이용료는 홈페이지에서 결제하지 않습니다. 법인이 오프라인 계약 및 입금 등을 확인한 후
                  관리자가 이용 플랜과 기간을 지정합니다. 자동결제 또는 카드 등록은 제공하지 않습니다.
                  <br />
                  2. 이용기간 변경, 계약 종료 및 환불 여부는 개별 계약 내용과 관계 법령에 따라 확인하여 안내합니다.
                  홈페이지에서 자동 취소·환불 처리를 제공하지 않습니다.
                  <br />
                  3. 회원탈퇴 시 법정 의무 보관 서류(근로기준법상 근로계약서, 임금대장 등 3년 보존
                  의무)는 관계 법령에 따른 보존 기한 동안 안전하게 분리 보관된 후 파기됩니다.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 text-sm mb-1.5">
                  제 5 조 (준거법 및 관할)
                </h4>
                <p>
                  서비스 이용과 관련하여 분쟁이 발생하는 경우 대한민국 법령을 준거법으로 하며, 법인의
                  주사무소 소재지 관할 법원을 전속관할 법원으로 합니다.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 px-6 py-3 bg-slate-50">
          <span className="text-[11px] text-slate-500">
            노무법인 나인 사업자 등록 및 정책 문의: contact@ninelabor.kr
          </span>
          <button
            onClick={onClose}
            className="rounded-xl bg-slate-900 px-5 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition"
          >
            확인 및 닫기
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalNode, document.body);
};
