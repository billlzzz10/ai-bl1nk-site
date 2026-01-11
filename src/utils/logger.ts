/**
 * Structured logging utilities
 */

import type { RouteRequest, RouteResponse } from '../types';

export interface LogEntry {
    timestamp: number;
    level: 'info' | 'warn' | 'error';
    message: string;
    data?: Record<string, any>;
}

/**
 * Log request/response for analytics
 */
export function logRequest(req: RouteRequest, res: RouteResponse): void {
    const entry: LogEntry = {
        timestamp: Date.now(),
        level: 'info',
        message: 'Request completed',
        data: {
            provider: res.provider,
            model: res.model,
            tier: req.tier,
            mode: req.usecase,
            tokens: res.usage.total_tokens,
            cost: res.usage.cost_estimate,
            user: req.meta?.user,
            project: req.meta?.project,
            latency_ms: 0, // Can be calculated if we track start time
        },
    };

    console.log(JSON.stringify(entry));
}

/**
 * Log error with context
 */
export function logError(
    error: Error,
    context?: Record<string, any>
): void {
    const entry: LogEntry = {
        timestamp: Date.now(),
        level: 'error',
        message: error.message,
        data: {
            error_type: error.name,
            stack: error.stack,
            ...context,
        },
    };

    console.error(JSON.stringify(entry));
}

/**
 * Log warning
 */
export function logWarning(message: string, data?: Record<string, any>): void {
    const entry: LogEntry = {
        timestamp: Date.now(),
        level: 'warn',
        message,
        data,
    };

    console.warn(JSON.stringify(entry));
}

/**
 * Log info
 */
export function logInfo(message: string, data?: Record<string, any>): void {
    const entry: LogEntry = {
        timestamp: Date.now(),
        level: 'info',
        message,
        data,
    };

    console.log(JSON.stringify(entry));
}
