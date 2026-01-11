/**
 * OpenAI provider adapter
 */

import { BaseProvider } from './base';
import type { ProviderRequest, ProviderResponse, Env } from '../types';
import { UpstreamError } from '../utils/errors';
import { getErrorMessage, isApiResponse } from '../utils/type-guards';

export class OpenAIProvider extends BaseProvider {
    private readonly baseUrl = 'https://api.openai.com/v1';

    constructor(env: Env) {
        super('openai', env);
    }

    async chat(request: ProviderRequest): Promise<ProviderResponse> {
        const apiKey = this.getApiKey('OPENAI_KEY');

        const body = {
            model: 'gpt-4o', // Default model
            messages: request.messages,
            max_tokens: request.max_tokens || 1024,
            temperature: request.temperature ?? 0.7,
            tools: request.tools,
        };

        const response = await this.fetchWithTimeout(
            `${this.baseUrl}/chat/completions`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify(body),
            }
        );

        if (!response.ok) {
            const error: unknown = await response.json();
            throw new UpstreamError(
                getErrorMessage(error, 'OpenAI request failed'),
                'openai'
            );
        }

        const data: unknown = await response.json();
        if (!isApiResponse(data)) {
            throw new UpstreamError('Invalid response from OpenAI', 'openai');
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
        const apiKey = this.getApiKey('OPENAI_KEY');

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
                    model: 'text-embedding-3-small',
                    input,
                }),
            }
        );

        if (!response.ok) {
            const error: unknown = await response.json();
            throw new UpstreamError(
                getErrorMessage(error, 'OpenAI embedding failed'),
                'openai'
            );
        }

        const data: unknown = await response.json();
        if (!isApiResponse(data)) {
            throw new UpstreamError('Invalid response from OpenAI', 'openai');
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
        throw new Error('OpenAI does not support reranking');
    }
}
