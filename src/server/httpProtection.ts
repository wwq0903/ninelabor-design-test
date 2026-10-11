/** Small, dependency-free HTTP guards for the Express API. */
import type { Request, Response, NextFunction } from 'express';

export function apiSecurityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
}

/** An in-memory guard only: for multi-instance production, use a shared gateway limiter. */
export function createFixedWindowLimiter(options: { windowMs: number; max: number; maxEntries?: number }) {
  const windows = new Map<string, { count: number; resetAt: number }>();
  const maxEntries = options.maxEntries ?? 10000;
  if (!Number.isSafeInteger(options.windowMs) || options.windowMs <= 0 ||
      !Number.isSafeInteger(options.max) || options.max <= 0 ||
      !Number.isSafeInteger(maxEntries) || maxEntries <= 0) {
    throw new Error('Invalid rate-limit configuration');
  }
  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    // Use the socket address only. Untrusted forwarding headers cannot choose a new bucket.
    const key = req.socket.remoteAddress || 'unknown';
    let current = windows.get(key);
    if (current && current.resetAt <= now) {
      windows.delete(key);
      current = undefined;
    }
    if (!current) {
      // Reclaim expired entries before admitting a new address. Never evict an active
      // entry: doing so resets its quota and permits a rate-limit bypass under churn.
      if (windows.size >= maxEntries) {
        for (const [address, entry] of windows) {
          if (entry.resetAt <= now) windows.delete(address);
        }
      }
      if (windows.size >= maxEntries) {
        res.setHeader('Retry-After', String(Math.max(1, Math.ceil(options.windowMs / 1000))));
        res.status(429).json({ error: 'RATE_LIMITED', message: '요청이 많습니다. 잠시 후 다시 시도해 주세요.' });
        return;
      }
      windows.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }
    if (current.count >= options.max) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((current.resetAt - now) / 1000))));
      res.status(429).json({ error: 'RATE_LIMITED', message: '요청이 많습니다. 잠시 후 다시 시도해 주세요.' });
      return;
    }
    current.count++;
    next();
  };
}

export function apiNotFound(_req: Request, res: Response): void {
  res.status(404).json({ error: 'API_NOT_FOUND', message: '요청한 API가 없습니다.' });
}

export function apiErrorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) return;
  const err = error as { status?: number; statusCode?: number; type?: string } | null;
  const status = err?.status ?? err?.statusCode;
  if (status === 413 || err?.type === 'entity.too.large') {
    res.status(413).json({ error: 'PAYLOAD_TOO_LARGE', message: '요청 크기 제한을 초과했습니다.' });
    return;
  }
  if (status === 400 || err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'INVALID_JSON', message: '요청 형식이 올바르지 않습니다.' });
    return;
  }
  console.error('Unhandled API error', { status: typeof status === 'number' ? status : 500 });
  res.status(500).json({ error: 'SERVER_ERROR', message: '요청 처리 중 오류가 발생했습니다.' });
}
