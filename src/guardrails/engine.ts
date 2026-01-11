/**
 * Guardrails engine for enforcing tier limits and policies
 */

import type { Env, ModelTier, ModelMode, GuardrailsConfig } from '../types';
import { TokenLimitError, GuardrailsError } from '../utils/errors';
import { BudgetManager } from './budget';

export class GuardrailsEngine {
    private budgetManager: BudgetManager;
    private config: GuardrailsConfig = {
        cheap_max_tokens: 2048,
        premium_min_usecase: ['vision', 'tool', 'heavy'],
        enforce_budget: true,
    };

    constructor(private env: Env) {
        this.budgetManager = new BudgetManager(env);
    }

    /**
     * Load guardrails config from KV
     */
    async loadConfig(): Promise<void> {
        const configJson = await this.env.CONFIG.get('guardrails');
        if (configJson) {
            this.config = { ...this.config, ...JSON.parse(configJson) };
        }
    }

    /**
     * Validate request against guardrails
     */
    async validateRequest(
        tier: ModelTier,
        mode: ModelMode,
        maxTokens: number,
        costEstimate: number,
        user?: string,
        project?: string
    ): Promise<void> {
        // Check tier-based token limits
        if (tier === 'cheap' && maxTokens > this.config.cheap_max_tokens) {
            throw new TokenLimitError(
                `Cheap tier limited to ${this.config.cheap_max_tokens} tokens. Requested: ${maxTokens}`
            );
        }

        // Check premium tier use-case requirements
        if (tier === 'premium') {
            const isPremiumUseCase = this.config.premium_min_usecase.includes(mode);
            if (!isPremiumUseCase) {
                throw new GuardrailsError(
                    `Premium tier requires one of: ${this.config.premium_min_usecase.join(', ')}. Got: ${mode}`,
                    'invalid_tier_for_usecase',
                    403
                );
            }
        }

        // Check budget if enabled
        if (this.config.enforce_budget) {
            await this.budgetManager.checkBudget(costEstimate, user, project);
        }
    }

    /**
     * Get recommended tier based on budget
     */
    async getRecommendedTier(
        requestedTier: ModelTier,
        user?: string,
        project?: string
    ): Promise<ModelTier> {
        if (!this.config.enforce_budget) {
            return requestedTier;
        }

        const suggestedDowngrade = await this.budgetManager.suggestTierDowngrade(
            user,
            project
        );

        if (!suggestedDowngrade) {
            return requestedTier;
        }

        // Downgrade if suggested tier is cheaper than requested
        const tierOrder: ModelTier[] = ['cheap', 'standard', 'premium'];
        const requestedIndex = tierOrder.indexOf(requestedTier);
        const suggestedIndex = tierOrder.indexOf(suggestedDowngrade);

        return suggestedIndex < requestedIndex ? suggestedDowngrade : requestedTier;
    }

    /**
     * Record usage after successful request
     */
    async recordUsage(
        cost: number,
        user?: string,
        project?: string
    ): Promise<void> {
        if (this.config.enforce_budget) {
            await this.budgetManager.recordSpend(cost, user, project);
        }
    }

    /**
     * Adjust max_tokens based on tier
     */
    adjustMaxTokens(tier: ModelTier, requestedTokens?: number): number {
        if (!requestedTokens) {
            return tier === 'cheap' ? 512 : 1024;
        }

        if (tier === 'cheap') {
            return Math.min(requestedTokens, this.config.cheap_max_tokens);
        }

        return requestedTokens;
    }
}
