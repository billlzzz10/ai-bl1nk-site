/**
 * Error utilities for unified error handling
 * 
 * ENHANCEMENTS:
 * 1. Separated quota_exceeded from rate_limit patterns
 * 2. Recursive error message extraction
 * 3. Logging for unknown errors
 * 4. Merged generic patterns with provider-specific
 * 5. Retry-After header parsing
 * 6. Custom error mapper support
 */

import type { ErrorResponse } from '../types';
import { logWarning } from './logger';

export class APIError extends Error {
    constructor(
        message: string,
        public status: number,
        public type: string,
        public code?: string
    ) {
        super(message);
        this.name = 'APIError';
    }

    toJSON(): ErrorResponse {
        return {
            error: {
                message: this.message,
                type: this.type,
                code: this.code,
                status: this.status,
            },
        };
    }
}

/**
 * Validation errors (4xx)
 */
export class ValidationError extends APIError {
    constructor(message: string, code?: string) {
        super(message, 400, 'validation_error', code);
    }
}

export class AuthenticationError extends APIError {
    constructor(message: string = 'Invalid or missing API key') {
        super(message, 401, 'authentication_error', 'invalid_api_key');
    }
}

export class PermissionError extends APIError {
    constructor(message: string = 'Insufficient permissions') {
        super(message, 403, 'permission_error', 'insufficient_permissions');
    }
}

export class NotFoundError extends APIError {
    constructor(message: string = 'Resource not found') {
        super(message, 404, 'not_found_error', 'resource_not_found');
    }
}

export class RateLimitError extends APIError {
    constructor(message: string = 'Rate limit exceeded') {
        super(message, 429, 'rate_limit_error', 'rate_limit_exceeded');
    }
}

/**
 * Server/upstream errors (5xx)
 */
export class UpstreamError extends APIError {
    constructor(message: string, provider?: string) {
        super(
            provider ? `${provider}: ${message}` : message,
            502,
            'upstream_error',
            'provider_error'
        );
    }
}

export class TimeoutError extends APIError {
    constructor(message: string = 'Request timeout') {
        super(message, 504, 'timeout_error', 'gateway_timeout');
    }
}

export class InternalError extends APIError {
    constructor(message: string = 'Internal server error') {
        super(message, 500, 'internal_error', 'internal_server_error');
    }
}

/**
 * Guardrails errors
 */
export class GuardrailsError extends APIError {
    constructor(message: string, code: string, status: number = 403) {
        super(message, status, 'guardrails_error', code);
    }
}

export class BudgetExceededError extends GuardrailsError {
    constructor(message: string = 'Budget limit exceeded') {
        super(message, 'budget_exceeded', 429);
    }
}

export class TokenLimitError extends GuardrailsError {
    constructor(message: string = 'Token limit exceeded for tier') {
        super(message, 'token_limit_exceeded', 403);
    }
}

/**
 * Create error response
 */
export function createErrorResponse(error: unknown): Response {
    if (error instanceof APIError) {
        return new Response(JSON.stringify(error.toJSON()), {
            status: error.status,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // Unknown error (hide details from client)
    const internalError = new InternalError();
    return new Response(JSON.stringify(internalError.toJSON()), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
    });
}

/**
 * Enhanced provider error parsing
 */

export interface ParsedError {
    provider: string;
    originalStatus: number;
    originalMessage: string;
    category: ErrorCategory;
    isRetryable: boolean;
    suggestedAction: string;
    retryAfter?: number;
    details?: Record<string, any>;
}

export type ErrorCategory =
    | 'authentication'
    | 'rate_limit'
    | 'quota_exceeded'
    | 'permission_denied'
    | 'validation'
    | 'timeout'
    | 'server_error'
    | 'not_found'
    | 'unknown';

type ErrorPatterns = Record<string, Record<string, RegExp[]>>;

const customMappers: Map<string, (error: any) => Partial<ParsedError> | null> = new Map();

export function registerErrorMapper(
    provider: string,
    mapper: (error: any) => Partial<ParsedError> | null
): void {
    customMappers.set(provider, mapper);
}

const PROVIDER_PATTERNS: ErrorPatterns = {
    openai: {
        authentication: [/invalid.*api.*key/i, /incorrect.*api.*key/i],
        rate_limit: [/rate.*limit.*exceeded/i, /too.*many.*requests/i],
        quota_exceeded: [/insufficient.*quota/i, /exceeded.*your.*current.*quota/i, /billing.*hard.*limit/i],
        validation: [/invalid.*request/i, /invalid.*model/i],
        not_found: [/model.*not.*found/i],
    },
    gemini: {
        authentication: [/api.*key.*not.*valid/i, /unauthenticated/i],
        rate_limit: [/resource.*exhausted/i, /rate.*limit/i],
        quota_exceeded: [/quota.*exceeded/i, /billing.*not.*enabled/i],
        permission_denied: [/permission.*denied/i, /api.*not.*enabled/i],
    },
    bedrock: {
        authentication: [/invalid.*credentials/i, /signature.*does.*not.*match/i],
        rate_limit: [/throttling/i, /throttlingexception/i],
        quota_exceeded: [/service.*quota.*exceeded/i],
        validation: [/validation.*error/i],
    },
};

const GENERIC_PATTERNS: Record<string, RegExp[]> = {
    authentication: [/401/, /unauthorized/i, /invalid.*key/i],
    rate_limit: [/429/, /rate.*limit/i, /too.*many.*requests/i],
    quota_exceeded: [/402/, /payment.*required/i, /insufficient.*funds/i, /billing/i],
    permission_denied: [/403/, /forbidden/i],
    validation: [/400/, /bad.*request/i],
    not_found: [/404/, /not.*found/i],
    timeout: [/timeout/i, /timed.*out/i, /ETIMEDOUT/i],
    server_error: [/50[0-4]/, /internal.*error/i, /server.*error/i],
};

function extractErrorMessage(error: any, maxDepth: number = 5): string {
    if (maxDepth === 0) return String(error);
    if (typeof error === 'string') return error;
    if (error instanceof Error) return error.message;

    const paths = ['message', 'error.message', 'response.data.error.message', 'response.data.message'];
    for (const path of paths) {
        const parts = path.split('.');
        let current = error;
        for (const part of parts) {
            if (current && typeof current === 'object' && part in current) {
                current = current[part];
            } else {
                current = null;
                break;
            }
        }
        if (current && typeof current === 'string') return current;
    }
    return JSON.stringify(error);
}

function extractRetryAfter(error: any): number | undefined {
    const headers = error.headers || error.response?.headers;
    if (!headers) return undefined;
    const retryAfter = headers['retry-after'] || headers['Retry-After'];
    if (!retryAfter) return undefined;
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds)) return seconds;
    const date = new Date(retryAfter);
    if (!isNaN(date.getTime())) {
        return Math.max(0, Math.floor((date.getTime() - Date.now()) / 1000));
    }
    return undefined;
}

function getMergedPatterns(provider: string): Record<string, RegExp[]> {
    const providerPatterns = PROVIDER_PATTERNS[provider] || {};
    const merged: Record<string, RegExp[]> = {};
    for (const [category, patterns] of Object.entries(GENERIC_PATTERNS)) {
        merged[category] = [...patterns];
    }
    for (const [category, patterns] of Object.entries(providerPatterns)) {
        if (merged[category]) {
            merged[category] = [...patterns, ...merged[category]];
        } else {
            merged[category] = [...patterns];
        }
    }
    return merged;
}

export function parseProviderError(error: any, provider: string): ParsedError {
    const customMapper = customMappers.get(provider);
    if (customMapper) {
        const customResult = customMapper(error);
        if (customResult) {
            const defaultParsed = parseProviderErrorInternal(error, provider);
            return { ...defaultParsed, ...customResult };
        }
    }
    return parseProviderErrorInternal(error, provider);
}

function parseProviderErrorInternal(error: any, provider: string): ParsedError {
    const status = error.status || error.statusCode || error.response?.status || 500;
    const message = extractErrorMessage(error);
    const retryAfter = extractRetryAfter(error);
    const patterns = getMergedPatterns(provider);

    let category: ErrorCategory = 'unknown';

    if (status === 401) category = 'authentication';
    else if (status === 402) category = 'quota_exceeded';
    else if (status === 403) category = 'permission_denied';
    else if (status === 404) category = 'not_found';
    else if (status === 429) category = 'rate_limit';
    else if (status === 400) category = 'validation';
    else if (status === 504 || status === 408) category = 'timeout';
    else if (status >= 500) category = 'server_error';

    for (const [cat, regexList] of Object.entries(patterns)) {
        for (const regex of regexList) {
            if (regex.test(message) || regex.test(String(status))) {
                category = cat as ErrorCategory;
                break;
            }
        }
        if (category !== 'unknown') break;
    }

    if (category === 'unknown') {
        logWarning('Unknown error category detected', {
            provider, status,
            message: message.substring(0, 200),
            fullError: JSON.stringify(error).substring(0, 500),
        });
    }

    const isRetryable = category === 'rate_limit' || category === 'timeout' || category === 'server_error';
    const suggestedAction = getSuggestedAction(category, provider);

    return {
        provider,
        originalStatus: status,
        originalMessage: message,
        category,
        isRetryable,
        suggestedAction,
        retryAfter,
        details: error.error || error.data || error.response?.data,
    };
}

function getSuggestedAction(category: ErrorCategory, provider: string): string {
    const providerUpper = provider.toUpperCase();
    const actions: Record<ErrorCategory, string> = {
        authentication: `Check your ${providerUpper}_KEY environment variable.`,
        rate_limit: `Rate limit exceeded. Will retry with fallback if available.`,
        quota_exceeded: `Insufficient credits. Please add credits to your ${provider} account.`,
        permission_denied: `Insufficient permissions for this model or feature.`,
        validation: `Invalid request parameters. Check model name and input format.`,
        timeout: `Request timeout. Will retry with fallback if available.`,
        server_error: `${provider} server error. Will retry with fallback if available.`,
        not_found: `Model not found. Check model name and region.`,
        unknown: `Unknown error from ${provider}.`,
    };
    return actions[category];
}

export function shouldTriggerFallback(parsedError: ParsedError): boolean {
    return parsedError.category === 'rate_limit' ||
        parsedError.category === 'timeout' ||
        parsedError.category === 'server_error';
}

export function formatErrorResponse(parsedError: ParsedError): {
    error: {
        message: string;
        type: string;
        code: string;
        provider: string;
        status: number;
        retryable: boolean;
        suggestion: string;
        retryAfter?: number;
    };
} {
    const response: any = {
        error: {
            message: parsedError.originalMessage,
            type: parsedError.category,
            code: `${parsedError.category}_error`,
            provider: parsedError.provider,
            status: parsedError.originalStatus,
            retryable: parsedError.isRetryable,
            suggestion: parsedError.suggestedAction,
        },
    };
    if (parsedError.retryAfter !== undefined) {
        response.error.retryAfter = parsedError.retryAfter;
    }
    return response;
}
