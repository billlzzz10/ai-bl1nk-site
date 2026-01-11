/**
 * Base provider interface
 */

import type {
    ProviderRequest,
    ProviderResponse,
    ProviderName,
    Env,
} from '../types';

export interface IProvider {
    name: ProviderName;

    /**
     * Execute chat/LLM request
     */
    chat(request: ProviderRequest): Promise<ProviderResponse>;

    /**
     * Execute embedding request
     */
    embed(request: ProviderRequest): Promise<ProviderResponse>;

    /**
     * Execute reranking request
     */
    rerank(request: ProviderRequest): Promise<ProviderResponse>;

    /**
     * Health check
     */
    healthCheck(): Promise<boolean>;
}

/**
 * Base provider class with common functionality
 */
export abstract class BaseProvider implements IProvider {
    constructor(
        public name: ProviderName,
        protected env: Env,
        protected endpoint?: string
    ) { }

    abstract chat(request: ProviderRequest): Promise<ProviderResponse>;
    abstract embed(request: ProviderRequest): Promise<ProviderResponse>;
    abstract rerank(request: ProviderRequest): Promise<ProviderResponse>;

    /**
     * Default health check - can be overridden
     */
    async healthCheck(): Promise<boolean> {
        try {
            // Simple ping with minimal request
            const response = await this.chat({
                mode: 'chat',
                messages: [{ role: 'user', content: 'ping' }],
                max_tokens: 1,
            });
            return !!response;
        } catch {
            return false;
        }
    }

    /**
     * Helper to make HTTP requests with timeout
     */
    protected async fetchWithTimeout(
        url: string,
        options: RequestInit,
        timeoutMs: number = 30000
    ): Promise<Response> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal,
            });
            clearTimeout(timeout);
            return response;
        } catch (error) {
            clearTimeout(timeout);
            throw error;
        }
    }

    /**
     * Helper to get API key from environment
     */
    protected getApiKey(keyName: keyof Env): string {
        const key = this.env[keyName] as string | undefined;
        if (!key) {
            throw new Error(`Missing API key: ${keyName}`);
        }
        return key;
    }
}
