import { CompanyDocumentCategory } from '../types';

export interface CategoryConfig {
  id: CompanyDocumentCategory;
  label: string;
  color: string;
  badgeBg: string;
}

export const COMPANY_DOCUMENT_CATEGORIES: CategoryConfig[] = [
  {
    id: 'LABOR_CONTRACT',
    label: '근로계약서',
    color: 'text-blue-700 bg-blue-50 border-blue-200',
    badgeBg: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  {
    id: 'PAYROLL',
    label: '급여자료',
    color: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  {
    id: 'WORK_RULES',
    label: '취업규칙',
    color: 'text-indigo-700 bg-indigo-50 border-indigo-200',
    badgeBg: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  {
    id: 'HR',
    label: '인사자료',
    color: 'text-slate-700 bg-slate-100 border-slate-200',
    badgeBg: 'bg-slate-100 text-slate-700 border-slate-200',
  },
  {
    id: 'FOUR_INSURANCES',
    label: '4대보험',
    color: 'text-purple-700 bg-purple-50 border-purple-200',
    badgeBg: 'bg-purple-50 text-purple-700 border-purple-200',
  },
  {
    id: 'MATERNITY',
    label: '모성보호',
    color: 'text-pink-700 bg-pink-50 border-pink-200',
    badgeBg: 'bg-pink-50 text-pink-700 border-pink-200',
  },
  {
    id: 'OTHER',
    label: '기타',
    color: 'text-amber-700 bg-amber-50 border-amber-200',
    badgeBg: 'bg-amber-50 text-amber-700 border-amber-200',
  },
];

export const COMPANY_DOCUMENT_CATEGORY_MAP: Record<CompanyDocumentCategory, CategoryConfig> =
  COMPANY_DOCUMENT_CATEGORIES.reduce(
    (acc, item) => {
      acc[item.id] = item;
      return acc;
    },
    {} as Record<CompanyDocumentCategory, CategoryConfig>
  );

export function getCompanyDocumentCategoryLabel(category?: CompanyDocumentCategory | string): string {
  if (!category) return '기타';
  const found = COMPANY_DOCUMENT_CATEGORY_MAP[category as CompanyDocumentCategory];
  return found ? found.label : '기타';
}

export function getCompanyDocumentCategoryConfig(category?: CompanyDocumentCategory | string): CategoryConfig {
  if (!category) return COMPANY_DOCUMENT_CATEGORY_MAP.OTHER;
  return COMPANY_DOCUMENT_CATEGORY_MAP[category as CompanyDocumentCategory] || COMPANY_DOCUMENT_CATEGORY_MAP.OTHER;
}
