/**
 * Voyage AI provider adapter
 */

import { BaseProvider } from './base';
import type { ProviderRequest, ProviderResponse, Env } from '../types';
import { UpstreamError } from '../utils/errors';
import { getErrorMessage, isApiResponse } from '../utils/type-guards';

export class VoyageProvider extends BaseProvider {
    private readonly baseUrl = 'https://api.voyageai.com/v1';

    constructor(env: Env) {
        super('voyage', env);
    }

    async chat(_request: ProviderRequest): Promise<ProviderResponse> {
        throw new Error('Voyage AI does not support chat');
    }

    async embed(request: ProviderRequest): Promise<ProviderResponse> {
        const apiKey = this.getApiKey('VOYAGE_KEY');

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
                    model: 'voyage-2',
                    input,
                }),
            }
        );

        if (!response.ok) {
            const error: unknown = await response.json();
            throw new UpstreamError(
                getErrorMessage(error, 'Voyage embedding failed'),
                'voyage'
            );
        }

        const data: unknown = await response.json();
        if (!isApiResponse(data)) {
            throw new UpstreamError('Invalid response from voyage', 'voyage');
        }
        
        const embeddings = data.data?.map((item: any) => item.embedding) || [];

        return {
            embeddings,
            usage: {
                prompt_tokens: data.usage?.total_tokens || 0,
                completion_tokens: 0,
                total_tokens: data.usage?.total_tokens || 0,
            },
            raw: data,
        };
    }

    async rerank(request: ProviderRequest): Promise<ProviderResponse> {
        const apiKey = this.getApiKey('VOYAGE_KEY');

        const response = await this.fetchWithTimeout(
            `${this.baseUrl}/rerank`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: 'rerank-lite-1',
                    query: request.query,
                    documents: request.documents,
                }),
            }
        );

        if (!response.ok) {
            const error: unknown = await response.json();
            throw new UpstreamError(
                getErrorMessage(error, 'Voyage rerank failed'),
                'voyage'
            );
        }

        const data: unknown = await response.json();
        if (!isApiResponse(data)) {
            throw new UpstreamError('Invalid response from voyage', 'voyage');
        }
        
        const results = data.data?.map((item: any) => ({
            index: item.index,
            score: item.relevance_score,
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
