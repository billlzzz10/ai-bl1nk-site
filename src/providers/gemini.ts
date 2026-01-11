/**
 * Google Gemini provider adapter
 */

import { BaseProvider } from './base';
import type { ProviderRequest, ProviderResponse, Env, ChatMessage } from '../types';
import { UpstreamError } from '../utils/errors';
import { getErrorMessage, isApiResponse } from '../utils/type-guards';

export class GeminiProvider extends BaseProvider {
    private readonly baseUrl = 'https://generativelanguage.googleapis.com/v1beta';

    constructor(env: Env) {
        super('gemini', env);
    }

    private convertMessages(messages: ChatMessage[]): any[] {
        return messages.map((msg) => ({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: typeof msg.content === 'string'
                ? [{ text: msg.content }]
                : msg.content.map((c) => {
                    if (c.type === 'text') {
                        return { text: c.text };
                    }
                    return {
                        inline_data: {
                            mime_type: 'image/jpeg',
                            data: c.image_url?.url.split(',')[1] || '',
                        },
                    };
                }),
        }));
    }

    async chat(request: ProviderRequest): Promise<ProviderResponse> {
        const apiKey = this.getApiKey('GEMINI_KEY');
        const model = 'gemini-1.5-pro';

        const contents = this.convertMessages(request.messages || []);

        const response = await this.fetchWithTimeout(
            `${this.baseUrl}/models/${model}:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents,
                    generationConfig: {
                        maxOutputTokens: request.max_tokens || 1024,
                        temperature: request.temperature ?? 0.7,
                    },
                }),
            }
        );

        if (!response.ok) {
            const error: unknown = await response.json();
            throw new UpstreamError(
                getErrorMessage(error, 'Gemini request failed'),
                'gemini'
            );
        }

        const data: unknown = await response.json();
        if (!isApiResponse(data)) {
            throw new UpstreamError('Invalid response from gemini', 'gemini');
        }
        
        const candidate = data.candidates?.[0];
        const text = candidate?.content?.parts?.[0]?.text || '';

        return {
            text,
            usage: {
                prompt_tokens: data.usageMetadata?.promptTokenCount || 0,
                completion_tokens: data.usageMetadata?.candidatesTokenCount || 0,
                total_tokens: data.usageMetadata?.totalTokenCount || 0,
            },
            raw: data,
        };
    }

    async embed(request: ProviderRequest): Promise<ProviderResponse> {
        const apiKey = this.getApiKey('GEMINI_KEY');
        const model = 'text-embedding-004';

        const texts = Array.isArray(request.input)
            ? request.input
            : [request.input as string];

        const embeddings: number[][] = [];
        let totalTokens = 0;

        // Gemini embedding API processes one text at a time
        for (const text of texts) {
            const response = await this.fetchWithTimeout(
                `${this.baseUrl}/models/${model}:embedContent?key=${apiKey}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        content: {
                            parts: [{ text }],
                        },
                    }),
                }
            );

            if (!response.ok) {
                const error: unknown = await response.json();
                throw new UpstreamError(
                    getErrorMessage(error, 'Gemini embedding failed'),
                'gemini'
            );
            }

            const data: unknown = await response.json();
        if (!isApiResponse(data)) {
            throw new UpstreamError('Invalid response from gemini', 'gemini');
        }
        
            embeddings.push(data.embedding?.values || []);
            totalTokens += Math.ceil(text.length / 4); // Estimate
        }

        return {
            embeddings,
            usage: {
                prompt_tokens: totalTokens,
                completion_tokens: 0,
                total_tokens: totalTokens,
            },
        };
    }

    async rerank(_request: ProviderRequest): Promise<ProviderResponse> {
        throw new Error('Gemini does not support reranking');
    }
}
