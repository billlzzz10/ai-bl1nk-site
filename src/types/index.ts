/**
 * Core types for AI Gateway
 */

export type ModelMode = 'chat' | 'vision' | 'tool' | 'embed' | 'rerank';
export type ModelTier = 'cheap' | 'standard' | 'premium';
export type ProviderName = 'bedrock' | 'openai' | 'gemini' | 'voyage' | 'cohere' | 'mistral' | 'xai' | 'zai' | 'opencode' | 'local';

/**
 * Model definition in CONFIG KV
 */
export interface ModelConfig {
    provider: ProviderName;
    model: string;
    tier: ModelTier;
    modes: ModelMode[];
    displayName?: string;
    contextWindow?: number;
    maxOutputTokens?: number;
}

/**
 * Provider configuration
 */
export interface ProviderConfig {
    name: ProviderName;
    endpoint?: string;
    healthCheckEndpoint?: string;
    timeout?: number;
    fallback?: {
        on_timeout?: string; // provider:model
        on_rate_limit?: string; // provider:model
    };
}

/**
 * Guardrails configuration
 */
export interface GuardrailsConfig {
    cheap_max_tokens: number;
    premium_min_usecase: string[];
    enforce_budget: boolean;
}

/**
 * Budget policy
 */
export interface BudgetPolicy {
    user?: string;
    project?: string;
    daily_limit_usd: number;
    current_spend_usd: number;
    reset_at: string; // ISO timestamp
}

/**
 * Rate sheet entry
 */
export interface RateEntry {
    provider: ProviderName;
    model: string;
    input_price_per_1k?: number; // USD per 1k tokens
    output_price_per_1k?: number; // USD per 1k tokens
    request_price?: number; // USD per request (for embed/rerank)
    unit?: 'token' | 'request' | 'image';
}

/**
 * Request constraints
 */
export interface RequestConstraints {
    max_tokens?: number;
    temperature?: number;
    latency_target?: number; // ms
}

/**
 * GET /v1/models response
 */
export interface ModelsResponse {
    models: ModelConfig[];
}

/**
 * POST /v1/quote request
 */
export interface QuoteRequest {
    provider?: ProviderName;
    model?: string;
    usecase?: ModelMode;
    tier?: ModelTier;
    input: string | string[] | { text: string; image?: string }[];
    constraints?: RequestConstraints;
}

/**
 * POST /v1/quote response
 */
export interface QuoteResponse {
    prompt_tokens: number;
    completion_tokens: number;
    cost_estimate: number; // USD
    model_used?: string;
    provider_used?: ProviderName;
}

/**
 * POST /v1/route request
 */
export interface RouteRequest {
    provider?: ProviderName;
    model?: string;
    usecase?: ModelMode;
    tier?: ModelTier;
    input: string | string[] | { text: string; image?: string }[];
    constraints?: RequestConstraints;
    meta?: {
        user?: string;
        project?: string;
        session_id?: string;
    };
}

/**
 * POST /v1/route response
 */
export interface RouteResponse {
    id: string;
    provider: ProviderName;
    model: string;
    created: number; // Unix timestamp
    output_text?: string;
    output_embeddings?: number[][];
    output_rerank?: Array<{ index: number; score: number }>;
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
        cost_estimate: number;
    };
}

/**
 * Normalized chat message
 */
export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string | Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string } }>;
}

/**
 * Normalized provider request
 */
export interface ProviderRequest {
    mode: ModelMode;
    messages?: ChatMessage[];
    input?: string | string[];
    documents?: string[]; // for rerank
    query?: string; // for rerank
    max_tokens?: number;
    temperature?: number;
    tools?: any[];
}

/**
 * Normalized provider response
 */
export interface ProviderResponse {
    provider?: ProviderName;
    model?: string;
    text?: string;
    embeddings?: number[][];
    rerank_results?: Array<{ index: number; score: number }>;
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
    raw?: any; // original response for debugging
    fallback_used?: boolean;
    original_provider?: ProviderName;
}

/**
 * Error response
 */
export interface ErrorResponse {
    error: {
        message: string;
        type: string;
        code?: string;
        status: number;
    };
}

/**
 * Environment bindings
 */
export interface Env {
    // KV Namespaces
    CONFIG: KVNamespace;
    RATES: KVNamespace;
    POLICY: KVNamespace;

    // Secrets
    OPENAI_KEY?: string;
    BEDROCK_KEY?: string;
    BEDROCK_SECRET?: string;
    BEDROCK_REGION?: string;
    GEMINI_KEY?: string;
    VOYAGE_KEY?: string;
    COHERE_KEY?: string;
    MISTRAL_KEY?: string;
    XAI_KEY?: string;
    ZAI_KEY?: string;
    OPENCODE_KEY?: string;
}

/**
 * Health check result
 */
export interface HealthCheckResult {
    provider: ProviderName;
    healthy: boolean;
    latency_ms?: number;
    last_check: number; // Unix timestamp
    error?: string;
}
