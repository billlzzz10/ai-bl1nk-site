/**
 * Normalization utilities for converting between provider-specific and unified formats
 */

import type {
    ChatMessage,
    ProviderRequest,
    ModelMode,
} from '../types';

/**
 * Count tokens (simple approximation)
 */
export function estimateTokens(text: string): number {
    // Simple approximation: ~4 chars per token
    return Math.ceil(text.length / 4);
}

/**
 * Normalize input to chat messages
 */
export function normalizeToMessages(
    input: string | string[] | Array<{ text: string; image?: string }>
): ChatMessage[] {
    if (typeof input === 'string') {
        return [{ role: 'user', content: input }];
    }

    if (Array.isArray(input)) {
        if (typeof input[0] === 'string') {
            // Array of strings - join as single message
            return [{ role: 'user', content: (input as string[]).join('\n') }];
        }

        // Array of content objects (vision)
        const content = (input as Array<{ text: string; image?: string }>).map(
            (item) => {
                if (item.image) {
                    return [
                        { type: 'text' as const, text: item.text },
                        { type: 'image_url' as const, image_url: { url: item.image } },
                    ];
                }
                return { type: 'text' as const, text: item.text };
            }
        ).flat();

        return [{ role: 'user', content }];
    }

    return [{ role: 'user', content: String(input) }];
}

/**
 * Extract text from chat messages
 */
export function extractTextFromMessages(messages: ChatMessage[]): string {
    return messages
        .map((msg) => {
            if (typeof msg.content === 'string') {
                return msg.content;
            }
            return msg.content
                .filter((c) => c.type === 'text')
                .map((c) => c.text)
                .join(' ');
        })
        .join('\n');
}

/**
 * Normalize provider request
 */
export function normalizeRequest(
    mode: ModelMode,
    input: string | string[] | Array<{ text: string; image?: string }>,
    constraints?: {
        max_tokens?: number;
        temperature?: number;
    }
): ProviderRequest {
    const request: ProviderRequest = {
        mode,
        max_tokens: constraints?.max_tokens,
        temperature: constraints?.temperature,
    };

    switch (mode) {
        case 'chat':
        case 'vision':
        case 'tool':
            request.messages = normalizeToMessages(input);
            break;

        case 'embed':
            if (typeof input === 'string') {
                request.input = input;
            } else if (Array.isArray(input) && typeof input[0] === 'string') {
                request.input = input as string[];
            } else {
                request.input = extractTextFromMessages(normalizeToMessages(input));
            }
            break;

        case 'rerank':
            // For rerank, expect input to be { query, documents }
            // This is a simplified version - actual implementation may vary
            if (typeof input === 'string') {
                throw new Error('Rerank requires query and documents');
            }
            break;
    }

    return request;
}

/**
 * Calculate cost estimate
 */
export function calculateCost(
    promptTokens: number,
    completionTokens: number,
    inputPricePer1k: number = 0,
    outputPricePer1k: number = 0
): number {
    const inputCost = (promptTokens / 1000) * inputPricePer1k;
    const outputCost = (completionTokens / 1000) * outputPricePer1k;
    return inputCost + outputCost;
}

/**
 * Generate unique request ID
 */
export function generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Enhanced error parsing with comprehensive detection
 */

import { logWarning } from './logger';

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

