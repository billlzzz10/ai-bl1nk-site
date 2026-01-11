/**
 * Cloudflare Worker entry point for AI Gateway
 */

import type { Env } from './src/types';
import { createErrorResponse } from './src/utils/errors';
import { logError } from './src/utils/logger';
import { handleModels } from './src/handlers/models';
import { handleQuote } from './src/handlers/quote';
import { handleRoute } from './src/handlers/route';

/**
 * CORS headers
 */
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/**
 * Handle CORS preflight
 */
function handleOptions(): Response {
    return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
    });
}

/**
 * Add CORS headers to response
 */
function addCorsHeaders(response: Response): Response {
    const newHeaders = new Headers(response.headers);
    Object.entries(CORS_HEADERS).forEach(([key, value]) => {
        newHeaders.set(key, value);
    });

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
    });
}

/**
 * Main request handler
 */
export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        try {
            const url = new URL(request.url);
            const path = url.pathname;

            // Handle CORS preflight
            if (request.method === 'OPTIONS') {
                return handleOptions();
            }

            // Route requests
            let response: Response;

            switch (path) {
                case '/v1/models':
                    if (request.method !== 'GET') {
                        response = new Response('Method not allowed', { status: 405 });
                    } else {
                        response = await handleModels(env);
                    }
                    break;

                case '/v1/quote':
                    if (request.method !== 'POST') {
                        response = new Response('Method not allowed', { status: 405 });
                    } else {
                        response = await handleQuote(request, env);
                    }
                    break;

                case '/v1/route':
                    if (request.method !== 'POST') {
                        response = new Response('Method not allowed', { status: 405 });
                    } else {
                        response = await handleRoute(request, env);
                    }
                    break;

                case '/health':
                    response = new Response(
                        JSON.stringify({ status: 'ok', timestamp: Date.now() }),
                        {
                            status: 200,
                            headers: { 'Content-Type': 'application/json' },
                        }
                    );
                    break;

                default:
                    response = new Response(
                        JSON.stringify({
                            error: {
                                message: 'Not found',
                                type: 'not_found_error',
                                status: 404,
                            },
                        }),
                        {
                            status: 404,
                            headers: { 'Content-Type': 'application/json' },
                        }
                    );
            }

            return addCorsHeaders(response);
        } catch (error) {
            logError(
                error instanceof Error ? error : new Error(String(error)),
                { url: request.url, method: request.method }
            );
            const errorResponse = createErrorResponse(error);
            return addCorsHeaders(errorResponse);
        }
    },
};
