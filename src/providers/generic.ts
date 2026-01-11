/**
 * Generic provider adapters for XAI, ZAI, and Opencode
 * These providers follow OpenAI-compatible API formats
 */

import { BaseProvider } from './base';
import type { ProviderRequest, ProviderResponse, Env } from '../types';
import { UpstreamError } from '../utils/errors';
import { getErrorMessage, isApiResponse } from '../utils/type-guards';

/**
 * XAI provider adapter
 */
export class XAIProvider extends BaseProvider {
    private readonly baseUrl = 'https://api.x.ai/v1';

    constructor(env: Env) {
        super('xai', env);
    }

    async chat(request: ProviderRequest): Promise<ProviderResponse> {
        const apiKey = this.getApiKey('XAI_KEY');

        const response = await this.fetchWithTimeout(
            `${this.baseUrl}/chat/completions`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: 'grok-beta',
                    messages: request.messages,
                    max_tokens: request.max_tokens || 1024,
                    temperature: request.temperature ?? 0.7,
                }),
            }
        );

        if (!response.ok) {
            const error: unknown = await response.json();
            throw new UpstreamError(
                getErrorMessage(error, 'XAI request failed'),
                'xai'
            );
        }

        const data: unknown = await response.json();
        if (!isApiResponse(data)) {
            throw new UpstreamError('Invalid response from generic', 'generic');
        }
        
        const choice = data.choices?.[0];

        return {
            text: choice?.message?.content || '',
            usage: {
                prompt_tokens: data.usage?.prompt_tokens || 0,
                completion_tokens: data.usage?.completion_tokens || 0,
                total_tokens: data.usage?.total_tokens || 0,
            },
            raw: data,
        };
    }

    async embed(request: ProviderRequest): Promise<ProviderResponse> {
        const apiKey = this.getApiKey('XAI_KEY');

        const input = Array.isArray(request.input)
            ? request.input
            : [request.input as string];

        const response = await this.fetchWithTimeout(
            `${this.baseUrl}/embeddings`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: 'text-embedding-ada-002',
                    input,
                }),
            }
        );

        if (!response.ok) {
            const error: unknown = await response.json();
            throw new UpstreamError(
                getErrorMessage(error, 'XAI embedding failed'),
                'xai'
            );
        }

        const data: unknown = await response.json();
        if (!isApiResponse(data)) {
            throw new UpstreamError('Invalid response from generic', 'generic');
        }
        
        const embeddings = data.data?.map((item: any) => item.embedding) || [];

        return {
            embeddings,
            usage: {
                prompt_tokens: data.usage?.prompt_tokens || 0,
                completion_tokens: 0,
                total_tokens: data.usage?.total_tokens || 0,
            },
            raw: data,
        };
    }

    async rerank(_request: ProviderRequest): Promise<ProviderResponse> {
        throw new Error('XAI does not support reranking');
    }
}

/**
 * ZAI provider adapter
 */
export class ZAIProvider extends BaseProvider {
    private readonly baseUrl: string;

    constructor(env: Env, endpoint?: string) {
        super('zai', env, endpoint);
        this.baseUrl = endpoint || 'https://api.zai.com/v1';
    }

    async chat(request: ProviderRequest): Promise<ProviderResponse> {
        const apiKey = this.getApiKey('ZAI_KEY');

        const response = await this.fetchWithTimeout(
            `${this.baseUrl}/chat/completions`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: 'zai-chat',
                    messages: request.messages,
                    max_tokens: request.max_tokens || 1024,
                    temperature: request.temperature ?? 0.7,
                }),
            }
        );

        if (!response.ok) {
            const error: unknown = await response.json();
            throw new UpstreamError(
                getErrorMessage(error, 'ZAI request failed'),
                'zai'
            );
        }

        const data: unknown = await response.json();
        if (!isApiResponse(data)) {
            throw new UpstreamError('Invalid response from generic', 'generic');
        }
        
        const choice = data.choices?.[0];

        return {
            text: choice?.message?.content || '',
            usage: {
                prompt_tokens: data.usage?.prompt_tokens || 0,
                completion_tokens: data.usage?.completion_tokens || 0,
                total_tokens: data.usage?.total_tokens || 0,
            },
            raw: data,
        };
    }

    async embed(request: ProviderRequest): Promise<ProviderResponse> {
        const apiKey = this.getApiKey('ZAI_KEY');

        const input = Array.isArray(request.input)
            ? request.input
            : [request.input as string];

        const response = await this.fetchWithTimeout(
            `${this.baseUrl}/embeddings`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: 'zai-embed',
                    input,
                }),
            }
        );

        if (!response.ok) {
            const error: unknown = await response.json();
            throw new UpstreamError(
                getErrorMessage(error, 'ZAI embedding failed'),
                'zai'
            );
        }

        const data: unknown = await response.json();
        if (!isApiResponse(data)) {
            throw new UpstreamError('Invalid response from generic', 'generic');
        }
        
        const embeddings = data.data?.map((item: any) => item.embedding) || [];

        return {
            embeddings,
            usage: {
                prompt_tokens: data.usage?.prompt_tokens || 0,
                completion_tokens: 0,
                total_tokens: data.usage?.total_tokens || 0,
            },
            raw: data,
        };
    }

    async rerank(request: ProviderRequest): Promise<ProviderResponse> {
        const apiKey = this.getApiKey('ZAI_KEY');

        const response = await this.fetchWithTimeout(
            `${this.baseUrl}/rerank`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: 'zai-rerank',
                    query: request.query,
                    documents: request.documents,
                }),
            }
        );

        if (!response.ok) {
            const error: unknown = await response.json();
            throw new UpstreamError(
                getErrorMessage(error, 'ZAI rerank failed'),
                'zai'
            );
        }

        const data: unknown = await response.json();
        if (!isApiResponse(data)) {
            throw new UpstreamError('Invalid response from generic', 'generic');
        }
        
        const results = data.results?.map((item: any) => ({
            index: item.index,
            score: item.score,
        })) || [];

        return {
            rerank_results: results,
            usage: {
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0,
            },
            raw: data,
        };
    }
}

/**
 * Opencode provider adapter
 */
export class OpencodeProvider extends BaseProvider {
    private readonly baseUrl: string;

    constructor(env: Env, endpoint?: string) {
        super('opencode', env, endpoint);
        this.baseUrl = endpoint || 'https://api.opencode.com/v1';
    }

    async chat(request: ProviderRequest): Promise<ProviderResponse> {
        const apiKey = this.getApiKey('OPENCODE_KEY');

        const response = await this.fetchWithTimeout(
            `${this.baseUrl}/chat/completions`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: 'opencode-chat',
                    messages: request.messages,
                    max_tokens: request.max_tokens || 1024,
                    temperature: request.temperature ?? 0.7,
                }),
            }
        );

        if (!response.ok) {
            const error: unknown = await response.json();
            throw new UpstreamError(
                getErrorMessage(error, 'Opencode request failed'),
                'opencode'
            );
        }

        const data: unknown = await response.json();
        if (!isApiResponse(data)) {
            throw new UpstreamError('Invalid response from generic', 'generic');
        }
        
        const choice = data.choices?.[0];

        return {
            text: choice?.message?.content || '',
            usage: {
                prompt_tokens: data.usage?.prompt_tokens || 0,
                completion_tokens: data.usage?.completion_tokens || 0,
                total_tokens: data.usage?.total_tokens || 0,
            },
            raw: data,
        };
    }

    async embed(request: ProviderRequest): Promise<ProviderResponse> {
        const apiKey = this.getApiKey('OPENCODE_KEY');

        const input = Array.isArray(request.input)
            ? request.input
            : [request.input as string];

        const response = await this.fetchWithTimeout(
            `${this.baseUrl}/embeddings`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: 'opencode-embed',
                    input,
                }),
            }
        );

        if (!response.ok) {
            const error: unknown = await response.json();
            throw new UpstreamError(
                getErrorMessage(error, 'Opencode embedding failed'),
                'opencode'
            );
        }

        const data: unknown = await response.json();
        if (!isApiResponse(data)) {
            throw new UpstreamError('Invalid response from generic', 'generic');
        }
        
        const embeddings = data.data?.map((item: any) => item.embedding) || [];

        return {
            embeddings,
            usage: {
                prompt_tokens: data.usage?.prompt_tokens || 0,
                completion_tokens: 0,
                total_tokens: data.usage?.total_tokens || 0,
            },
            raw: data,
        };
    }

    async rerank(request: ProviderRequest): Promise<ProviderResponse> {
        const apiKey = this.getApiKey('OPENCODE_KEY');

        const response = await this.fetchWithTimeout(
            `${this.baseUrl}/rerank`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: 'opencode-rerank',
                    query: request.query,
                    documents: request.documents,
                }),
            }
        );

        if (!response.ok) {
            const error: unknown = await response.json();
            throw new UpstreamError(
                getErrorMessage(error, 'Opencode rerank failed'),
                'opencode'
            );
        }

        const data: unknown = await response.json();
        if (!isApiResponse(data)) {
            throw new UpstreamError('Invalid response from generic', 'generic');
        }
        
        const results = data.results?.map((item: any) => ({
            index: item.index,
            score: item.score,
        })) || [];

        return {
            rerank_results: results,
            usage: {
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0,
            },
            raw: data,
        };
    }
}
