/**
 * Local/Docker provider adapter for open-source models
 */

import { BaseProvider } from './base';
import type { ProviderRequest, ProviderResponse, Env } from '../types';
import { UpstreamError } from '../utils/errors';
import { getErrorMessage, isApiResponse } from '../utils/type-guards';

export class LocalProvider extends BaseProvider {
    private readonly baseUrl: string;

    constructor(env: Env, endpoint: string = 'http://localhost:8080') {
        super('local', env, endpoint);
        this.baseUrl = endpoint;
    }

    async chat(request: ProviderRequest): Promise<ProviderResponse> {
        // Assumes OpenAI-compatible API (e.g., llama.cpp server, vLLM, etc.)
        const response = await this.fetchWithTimeout(
            `${this.baseUrl}/v1/chat/completions`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    messages: request.messages,
                    max_tokens: request.max_tokens || 1024,
                    temperature: request.temperature ?? 0.7,
                }),
            }
        );

        if (!response.ok) {
            const error: unknown = await response.json();
            throw new UpstreamError(
                getErrorMessage(error, 'Local model request failed'),
                'local'
            );
        }

        const data: unknown = await response.json();
        if (!isApiResponse(data)) {
            throw new UpstreamError('Invalid response from local', 'local');
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
        const input = Array.isArray(request.input)
            ? request.input
            : [request.input as string];

        const response = await this.fetchWithTimeout(
            `${this.baseUrl}/v1/embeddings`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    input,
                }),
            }
        );

        if (!response.ok) {
            const error: unknown = await response.json();
            throw new UpstreamError(
                getErrorMessage(error, 'Local embedding failed'),
                'local'
            );
        }

        const data: unknown = await response.json();
        if (!isApiResponse(data)) {
            throw new UpstreamError('Invalid response from local', 'local');
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
        throw new Error('Local provider does not support reranking by default');
    }

    async healthCheck(): Promise<boolean> {
        try {
            const response = await this.fetchWithTimeout(
                `${this.baseUrl}/health`,
                { method: 'GET' },
                5000
            );
            return response.ok;
        } catch {
            return false;
        }
    }
}
