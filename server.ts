import express from 'express';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { isFirebaseAdminConfigured, getAdminAuth, getAdminDb } from './src/server/firebaseAdmin';
import { handleAdminCreateUser } from './src/server/adminUserService';
import { handleGetWorkerRrn, handleSaveWorkerRrn, handleWorkerSubmitRrn } from './src/server/rrnService';
import { executeDeductionWithIdToken, MaternityDeductionError } from './src/server/maternityDeductionTransaction';
import { requireMaternityBranchAccess } from './src/server/branchAuthorization';
import { apiSecurityHeaders, createFixedWindowLimiter, apiNotFound, apiErrorHandler } from './src/server/httpProtection';
import { parseMaternitySkipFlag } from './src/server/maternityRequestValidation';

dotenv.config();

const configuredPort = Number(process.env.PORT ?? 3000);
const PORT = Number.isSafeInteger(configuredPort) && configuredPort > 0 && configuredPort <= 65535 ? configuredPort : 3000;

async function startServer() {
  const app = express();
  // Reject oversized JSON before it reaches privileged business handlers.
  app.disable('x-powered-by');
  app.use('/api', apiSecurityHeaders);
  app.use(express.json({ limit: '256kb', strict: true }));
  // Liveness must not expose configuration or user data.
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  // Readiness is intentionally stricter than liveness; suitable for deployment checks.
  app.get('/api/ready', (_req, res) => {
    const ready = isFirebaseAdminConfigured() && Boolean(process.env.GEMINI_API_KEY?.trim());
    res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready' });
  });
  // Bound expensive Gemini requests per connecting address. Gateway limits are also recommended.
  const aiLimiter = createFixedWindowLimiter({ windowMs: 60_000, max: 15 });
  const privilegedLimiter = createFixedWindowLimiter({ windowMs: 60_000, max: 30 });

  // Real Server-Side Gemini API Proxy Endpoint
  app.post('/api/ai-consult', aiLimiter, async (req, res) => {
    // Fail closed if Firebase Admin is not configured. Never spend AI tokens anonymously.
    if (!isFirebaseAdminConfigured()) {
      return res.status(503).json({ error: 'AUTH_UNAVAILABLE', message: '인증 서버 설정이 필요합니다.' });
    }
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: '로그인이 필요합니다.' });
    }
    const token = authHeader.slice(7).trim();
    if (!token) return res.status(401).json({ error: 'UNAUTHORIZED', message: '로그인이 필요합니다.' });
    let callerUid: string;
    try {
      callerUid = (await getAdminAuth().verifyIdToken(token, true)).uid;
    } catch {
      return res.status(401).json({ error: 'INVALID_TOKEN', message: '다시 로그인해 주세요.' });
    }
    try {
      const userSnap = await getAdminDb().collection('users').doc(callerUid).get();
      const profile = userSnap.data();
      if (!userSnap.exists || !['ADMIN', 'COMPANY', 'WORKER'].includes(profile?.role) ||
          profile?.isActive === false || profile?.status === 'SUSPENDED' || profile?.status === 'DELETED') {
        return res.status(403).json({ error: 'FORBIDDEN', message: '이용 권한이 없습니다.' });
      }
    } catch {
      return res.status(503).json({ error: 'AUTH_BACKEND_UNAVAILABLE', message: '인증 정보를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.' });
    }
    const { prompt } = req.body ?? {};

    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 12000) {
      return res.status(400).json({ error: 'INVALID_PROMPT', message: '질문 내용을 입력해 주세요.' });
    }

    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      return res.status(503).json({
        error: 'AI_SERVICE_UNAVAILABLE',
        message: 'AI 서비스 설정이 필요합니다. (API 키가 등록되지 않았습니다.)',
      });
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
        contents: prompt,
        config: {
          systemInstruction:
            '당신은 노무법인 나인(NINELABOR)의 신뢰할 수 있는 전문 노무 AI 어드바이저입니다. 대한민국 근로기준법, 남녀고용평등법, 산업재해보상보험법, 노동조합법 및 4대보험 등 노동관계 법률에 근거하여 명확하고 정확한 1차 노무 자문을 제공합니다. 답변 시 법적 근거 조항을 함께 언급하고, 구체적인 사업장 분쟁이나 복잡한 사안의 경우 담당 공인노무사의 최종 검토를 요청하도록 안내하십시오.',
        },
      });

      const responseText = response.text || '';
      if (!responseText.trim()) {
        return res.status(502).json({
          error: 'EMPTY_AI_RESPONSE',
          message: 'AI 서비스로부터 응답이 수신되지 않았습니다.',
        });
      }

      return res.json({ text: responseText });
    } catch (error: any) {
      // Avoid logging upstream exception objects: they may contain request contents or credentials.
      console.error('Gemini API request failed');
      return res.status(502).json({
        error: 'GEMINI_CALL_FAILED',
        message: 'AI 서비스 호출에 실패했습니다. 잠시 후 다시 시도해 주세요.',
      });
    }
  });

  // Admin User Creation Endpoint (Strict ADMIN verification, Auth + Firestore + Rollback)
  app.post('/api/admin/create-user', privilegedLimiter, handleAdminCreateUser);

  // Secure Resident Registration Number (RRN) Endpoints (AES-256-GCM server-side encryption/decryption)
  // GET: Automatic retrieval & decryption for ADMIN (Requirement 4, 10)
  app.get('/api/admin/worker-rrn/:workerId', privilegedLimiter, handleGetWorkerRrn);
  // POST: Safe encrypted storage & update by ADMIN (Requirement 6)
  app.post('/api/admin/worker-rrn/:workerId', privilegedLimiter, handleSaveWorkerRrn);
  // POST: Safe encrypted self-submission during worker signup/onboarding
  app.post('/api/worker/submit-rrn', privilegedLimiter, handleWorkerSubmitRrn);

  // [R2-8 2/4-A-⑥-9 & ⑥-10] Maternity Status Transition with Deduction (Server Firestore Transaction)
  app.post('/api/admin/maternity-cases/:caseId/status-transition', privilegedLimiter, requireMaternityBranchAccess, async (req, res) => {
    const { caseId } = req.params;
    const {
      targetCompanyId,
      targetStatus,
      statusChangeHistoryItem,
      extraCaseUpdates,
      allowSkipIfAlreadyDeducted,
      notes,
      assignedAttorneyId,
    } = req.body ?? {};

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: '인증 헤더(Bearer ID 토큰)가 누락되었습니다.',
      });
    }
    const idToken = authHeader.substring(7).trim();

    if (!caseId || !targetCompanyId || (!targetStatus && !assignedAttorneyId && !extraCaseUpdates?.assignedAttorneyId)) {
      return res.status(400).json({
        error: 'INVALID_PARAMS',
        message: '필수 파라미터(caseId, targetCompanyId 및 targetStatus 또는 assignedAttorneyId)가 누락되었습니다.',
      });
    }

    let skipAlreadyDeducted: boolean;
    try {
      skipAlreadyDeducted = parseMaternitySkipFlag(allowSkipIfAlreadyDeducted);
    } catch {
      return res.status(400).json({ error: 'INVALID_SKIP_FLAG', message: '차감 생략 여부는 true 또는 false여야 합니다.' });
    }

    try {
      const result = await executeDeductionWithIdToken({
        idToken,
        targetCompanyId,
        caseId,
        targetStatus,
        statusChangeHistoryItem,
        extraCaseUpdates,
        allowSkipIfAlreadyDeducted: skipAlreadyDeducted,
        notes,
        assignedAttorneyId,
      });

      return res.json(result);
    } catch (err: any) {
      if (err instanceof MaternityDeductionError) {
        return res.status(400).json({
          error: err.code,
          message: err.message,
          details: err.details,
        });
      }
      return res.status(500).json({
        error: 'SERVER_ERROR',
        message: '상태 전이 처리 중 서버 오류가 발생했습니다.',
      });
    }
  });

  // [R2-8 2/4-A-⑥-10] Assign Attorney with Maternity Deduction (Server Firestore Transaction)
  app.post('/api/admin/maternity-cases/:caseId/assign-attorney', privilegedLimiter, requireMaternityBranchAccess, async (req, res) => {
    const { caseId } = req.params;
    const {
      targetCompanyId,
      assignedAttorneyId,
      targetStatus,
      statusChangeHistoryItem,
      extraCaseUpdates,
      allowSkipIfAlreadyDeducted = true,
      notes,
    } = req.body ?? {};

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: '인증 헤더(Bearer ID 토큰)가 누락되었습니다.',
      });
    }
    const idToken = authHeader.substring(7).trim();

    if (!caseId || !targetCompanyId || !assignedAttorneyId) {
      return res.status(400).json({
        error: 'INVALID_PARAMS',
        message: '필수 파라미터(caseId, targetCompanyId, assignedAttorneyId)가 누락되었습니다.',
      });
    }

    let skipAlreadyDeducted: boolean;
    try {
      skipAlreadyDeducted = parseMaternitySkipFlag(allowSkipIfAlreadyDeducted);
    } catch {
      return res.status(400).json({ error: 'INVALID_SKIP_FLAG', message: '차감 생략 여부는 true 또는 false여야 합니다.' });
    }

    try {
      const result = await executeDeductionWithIdToken({
        idToken,
        targetCompanyId,
        caseId,
        targetStatus,
        assignedAttorneyId,
        statusChangeHistoryItem,
        extraCaseUpdates,
        allowSkipIfAlreadyDeducted: skipAlreadyDeducted,
        notes,
      });

      return res.json(result);
    } catch (err: any) {
      if (err instanceof MaternityDeductionError) {
        return res.status(400).json({
          error: err.code,
          message: err.message,
          details: err.details,
        });
      }
      return res.status(500).json({
        error: 'SERVER_ERROR',
        message: '담당 노무사 배정 처리 중 서버 오류가 발생했습니다.',
      });
    }
  });

  // Unknown API routes must return JSON, not the Vite/SPA index page.
  app.use('/api', apiNotFound);
  app.use(apiErrorHandler);

  // Mount Vite middleware in development
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    // Vite is a development-only dependency: production must not load its runtime.
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Fail startup rather than reporting a healthy server without a built site.
    const distPath = path.resolve(process.cwd(), 'dist');
    const indexPath = path.join(distPath, 'index.html');
    if (!fs.existsSync(indexPath)) {
      throw new Error('Production build missing: run npm run build before starting the server.');
    }
    // Hashed Vite assets are immutable; the HTML shell must revalidate on every load.
    app.use(express.static(distPath, {
      index: false,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
        else if (/[/\\]assets[/\\]/.test(filePath)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      },
    }));
    // Missing assets must not return index.html with HTTP 200 (breaks JS/CSS loading).
    app.get('*', (req, res) => {
      if (path.extname(req.path)) return res.status(404).send('Not found');
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(indexPath);
    });
  }

  const server = app.listen(PORT, process.env.HOST || '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
  // Drain connections on container restarts rather than interrupting requests.
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      server.close((error) => {
        if (error) console.error('Server shutdown failed');
        process.exit(error ? 1 : 0);
      });
      // Do not keep a stuck shutdown alive forever.
      setTimeout(() => process.exit(1), 10_000).unref();
    });
  }
}

startServer().catch(() => {
  // Startup exceptions may contain environment configuration; do not dump them into logs.
  console.error('Failed to start server; verify dependencies, environment and production build.');
  process.exit(1);
});
