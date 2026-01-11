/**
 * Cohere provider adapter
 */

import { BaseProvider } from './base';
import type { ProviderRequest, ProviderResponse, Env } from '../types';
import { UpstreamError } from '../utils/errors';
import { getErrorMessage, isApiResponse } from '../utils/type-guards';
import { extractTextFromMessages } from '../utils/normalize';

export class CohereProvider extends BaseProvider {
    private readonly baseUrl = 'https://api.cohere.ai/v1';

    constructor(env: Env) {
        super('cohere', env);
    }

    async chat(request: ProviderRequest): Promise<ProviderResponse> {
        const apiKey = this.getApiKey('COHERE_KEY');

        // Convert messages to Cohere format
        const message = extractTextFromMessages(request.messages || []);

        const response = await this.fetchWithTimeout(
            `${this.baseUrl}/chat`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: 'command-r',
                    message,
                    max_tokens: request.max_tokens || 1024,
                    temperature: request.temperature ?? 0.7,
                }),
            }
        );

        if (!response.ok) {
            const error: unknown = await response.json();
            throw new UpstreamError(
                getErrorMessage(error, 'Cohere request failed'),
                'cohere'
            );
        }

        const data: unknown = await response.json();
        if (!isApiResponse(data)) {
            throw new UpstreamError('Invalid response from cohere', 'cohere');
        }
        

        return {
            text: data.text || '',
            usage: {
                prompt_tokens: data.meta?.tokens?.input_tokens || 0,
                completion_tokens: data.meta?.tokens?.output_tokens || 0,
                total_tokens: (data.meta?.tokens?.input_tokens || 0) + (data.meta?.tokens?.output_tokens || 0),
            },
            raw: data,
        };
    }

    async embed(request: ProviderRequest): Promise<ProviderResponse> {
        const apiKey = this.getApiKey('COHERE_KEY');

        const texts = Array.isArray(request.input)
            ? request.input
            : [request.input as string];

        const response = await this.fetchWithTimeout(
            `${this.baseUrl}/embed`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: 'embed-english-v3.0',
                    texts,
                    input_type: 'search_document',
                }),
            }
        );

        if (!response.ok) {
            const error: unknown = await response.json();
            throw new UpstreamError(
                getErrorMessage(error, 'Cohere embedding failed'),
                'cohere'
            );
        }

        const data: unknown = await response.json();
        if (!isApiResponse(data)) {
            throw new UpstreamError('Invalid response from cohere', 'cohere');
        }
        

        return {
            embeddings: data.embeddings || [],
            usage: {
                prompt_tokens: data.meta?.billed_units?.input_tokens || 0,
                completion_tokens: 0,
                total_tokens: data.meta?.billed_units?.input_tokens || 0,
            },
            raw: data,
        };
    }

    async rerank(request: ProviderRequest): Promise<ProviderResponse> {
        const apiKey = this.getApiKey('COHERE_KEY');

        const response = await this.fetchWithTimeout(
            `${this.baseUrl}/rerank`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: 'rerank-english-v3.0',
                    query: request.query,
                    documents: request.documents,
                }),
            }
        );

        if (!response.ok) {
            const error: unknown = await response.json();
            throw new UpstreamError(
                getErrorMessage(error, 'Cohere rerank failed'),
                'cohere'
            );
        }

        const data: unknown = await response.json();
        if (!isApiResponse(data)) {
            throw new UpstreamError('Invalid response from cohere', 'cohere');
        }
        
        const results = data.results?.map((item: any) => ({
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
