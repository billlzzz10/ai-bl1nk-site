/**
 * Health check system with caching and fallback
 */

import type { Env, ProviderName, HealthCheckResult, ProviderConfig } from '../types';
import { ProviderFactory } from '../providers/factory';

export class HealthChecker {
    private cache: Map<ProviderName, HealthCheckResult> = new Map();
    private readonly cacheTTL = 60000; // 1 minute

    constructor(
        private env: Env,
        private providerFactory: ProviderFactory
    ) { }

    /**
     * Check provider health with caching
     */
    async checkHealth(provider: ProviderName): Promise<HealthCheckResult> {
        // Check cache first
        const cached = this.cache.get(provider);
        if (cached && Date.now() - cached.last_check < this.cacheTTL) {
            return cached;
        }

        // Perform health check
        const startTime = Date.now();
        let healthy = false;
        let error: string | undefined;

        try {
            const providerInstance = this.providerFactory.getProvider(provider);
            healthy = await providerInstance.healthCheck();
        } catch (e) {
            error = e instanceof Error ? e.message : 'Unknown error';
        }

        const result: HealthCheckResult = {
            provider,
            healthy,
            latency_ms: Date.now() - startTime,
            last_check: Date.now(),
            error,
        };

        this.cache.set(provider, result);
        return result;
    }

    /**
     * Get fallback provider from config
     */
    async getFallback(
        provider: ProviderName,
        _model: string,
        reason: 'timeout' | 'rate_limit'
    ): Promise<{ provider: ProviderName; model: string } | null> {
        const configKey = `provider:${provider}`;
        const configJson = await this.env.CONFIG.get(configKey);

        if (!configJson) {
            return null;
        }

        const config: ProviderConfig = JSON.parse(configJson);
        const fallbackKey = reason === 'timeout' ? 'on_timeout' : 'on_rate_limit';
        const fallback = config.fallback?.[fallbackKey];

        if (!fallback) {
            return null;
        }

        // Parse "provider:model" format
        const [fallbackProvider, fallbackModel] = fallback.split(':');
        return {
            provider: fallbackProvider as ProviderName,
            model: fallbackModel,
        };
    }

    /**
     * Get all healthy providers
     */
    async getHealthyProviders(providers: ProviderName[]): Promise<ProviderName[]> {
        const results = await Promise.all(
            providers.map((p) => this.checkHealth(p))
        );

        return results.filter((r) => r.healthy).map((r) => r.provider);
    }

    /**
     * Clear cache for a provider
     */
    clearCache(provider?: ProviderName): void {
        if (provider) {
            this.cache.delete(provider);
        } else {
            this.cache.clear();
        }
    }
}
