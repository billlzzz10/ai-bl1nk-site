/**
 * Mistral AI provider adapter
 */

import { BaseProvider } from './base';
import type { ProviderRequest, ProviderResponse, Env } from '../types';
import { UpstreamError } from '../utils/errors';
import { getErrorMessage, isApiResponse } from '../utils/type-guards';

export class MistralProvider extends BaseProvider {
    private readonly baseUrl = 'https://api.mistral.ai/v1';

    constructor(env: Env) {
        super('mistral', env);
    }

    async chat(request: ProviderRequest): Promise<ProviderResponse> {
        const apiKey = this.getApiKey('MISTRAL_KEY');

        const response = await this.fetchWithTimeout(
            `${this.baseUrl}/chat/completions`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: 'mistral-large-latest',
                    messages: request.messages,
                    max_tokens: request.max_tokens || 1024,
                    temperature: request.temperature ?? 0.7,
                }),
            }
        );

        if (!response.ok) {
            const error: unknown = await response.json();
            throw new UpstreamError(
                getErrorMessage(error, 'Mistral request failed'),
                'mistral'
            );
        }

        const data: unknown = await response.json();
        if (!isApiResponse(data)) {
            throw new UpstreamError('Invalid response from Mistral', 'mistral');
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
        const apiKey = this.getApiKey('MISTRAL_KEY');

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
                    model: 'mistral-embed',
                    input,
                }),
            }
        );

        if (!response.ok) {
            const error: unknown = await response.json();
            throw new UpstreamError(
                getErrorMessage(error, 'Mistral embedding failed'),
                'mistral'
            );
        }

        const data: unknown = await response.json();
        if (!isApiResponse(data)) {
            throw new UpstreamError('Invalid response from Mistral', 'mistral');
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
        throw new Error('Mistral does not support reranking');
    }
}
