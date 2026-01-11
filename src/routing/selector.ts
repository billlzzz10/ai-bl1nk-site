/**
 * Intelligent model selection and routing
 */

import type {
    Env,
    ModelConfig,
    ModelTier,
    ModelMode,
    ProviderName,
} from '../types';
import { NotFoundError } from '../utils/errors';
import { HealthChecker } from '../health/checker';

export class ModelSelector {
    constructor(
        private env: Env,
        private healthChecker: HealthChecker
    ) { }

    /**
     * Get all available models from CONFIG
     */
    async getAllModels(): Promise<ModelConfig[]> {
        const modelsJson = await this.env.CONFIG.get('models');
        if (!modelsJson) {
            return [];
        }

        return JSON.parse(modelsJson);
    }

    /**
     * Select best model based on criteria
     */
    async selectModel(
        provider?: ProviderName,
        model?: string,
        tier?: ModelTier,
        mode?: ModelMode
    ): Promise<ModelConfig> {
        const allModels = await this.getAllModels();

        // Filter by criteria
        let candidates = allModels;

        if (provider) {
            candidates = candidates.filter((m) => m.provider === provider);
        }

        if (model) {
            candidates = candidates.filter((m) => m.model === model);
        }

        if (tier) {
            candidates = candidates.filter((m) => m.tier === tier);
        }

        if (mode) {
            candidates = candidates.filter((m) => m.modes.includes(mode));
        }

        if (candidates.length === 0) {
            throw new NotFoundError(
                `No models found matching criteria: provider=${provider}, model=${model}, tier=${tier}, mode=${mode}`
            );
        }

        // If multiple candidates, prefer healthy providers
        if (candidates.length > 1) {
            const healthyProviders = await this.healthChecker.getHealthyProviders(
                [...new Set(candidates.map((c) => c.provider))]
            );

            const healthyCandidates = candidates.filter((c) =>
                healthyProviders.includes(c.provider)
            );

            if (healthyCandidates.length > 0) {
                candidates = healthyCandidates;
            }
        }

        // Return first candidate (or implement more sophisticated selection)
        return candidates[0];
    }

    /**
     * Get models by tier
     */
    async getModelsByTier(tier: ModelTier): Promise<ModelConfig[]> {
        const allModels = await this.getAllModels();
        return allModels.filter((m) => m.tier === tier);
    }

    /**
     * Get models by mode
     */
    async getModelsByMode(mode: ModelMode): Promise<ModelConfig[]> {
        const allModels = await this.getAllModels();
        return allModels.filter((m) => m.modes.includes(mode));
    }

    /**
     * Get model by provider and name
     */
    async getModel(provider: ProviderName, model: string): Promise<ModelConfig | null> {
        const allModels = await this.getAllModels();
        return allModels.find((m) => m.provider === provider && m.model === model) || null;
    }
}
