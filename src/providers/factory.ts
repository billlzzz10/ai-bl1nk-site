/**
 * Provider factory for instantiating providers
 */

import type { IProvider } from './base';
import type { ProviderName, Env, ProviderConfig } from '../types';
import { OpenAIProvider } from './openai';
import { GeminiProvider } from './gemini';
import { VoyageProvider } from './voyage';
import { CohereProvider } from './cohere';
import { MistralProvider } from './mistral';
import { BedrockProvider } from './bedrock';
import { XAIProvider, ZAIProvider, OpencodeProvider } from './generic';
import { LocalProvider } from './local';

export class ProviderFactory {
    private providers: Map<ProviderName, IProvider> = new Map();

    constructor(private env: Env) { }

    /**
     * Get or create a provider instance
     */
    getProvider(name: ProviderName, config?: ProviderConfig): IProvider {
        if (this.providers.has(name)) {
            return this.providers.get(name)!;
        }

        let provider: IProvider;

        switch (name) {
            case 'openai':
                provider = new OpenAIProvider(this.env);
                break;
            case 'gemini':
                provider = new GeminiProvider(this.env);
                break;
            case 'voyage':
                provider = new VoyageProvider(this.env);
                break;
            case 'cohere':
                provider = new CohereProvider(this.env);
                break;
            case 'mistral':
                provider = new MistralProvider(this.env);
                break;
            case 'bedrock':
                provider = new BedrockProvider(this.env);
                break;
            case 'xai':
                provider = new XAIProvider(this.env);
                break;
            case 'zai':
                provider = new ZAIProvider(this.env, config?.endpoint);
                break;
            case 'opencode':
                provider = new OpencodeProvider(this.env, config?.endpoint);
                break;
            case 'local':
                provider = new LocalProvider(this.env, config?.endpoint);
                break;
            default:
                throw new Error(`Unknown provider: ${name}`);
        }

        this.providers.set(name, provider);
        return provider;
    }

    /**
     * Check if a provider is available (has API key)
     */
    isProviderAvailable(name: ProviderName): boolean {
        const keyMap: Record<ProviderName, keyof Env> = {
            openai: 'OPENAI_KEY',
            gemini: 'GEMINI_KEY',
            voyage: 'VOYAGE_KEY',
            cohere: 'COHERE_KEY',
            mistral: 'MISTRAL_KEY',
            bedrock: 'BEDROCK_KEY',
            xai: 'XAI_KEY',
            zai: 'ZAI_KEY',
            opencode: 'OPENCODE_KEY',
            local: 'OPENAI_KEY', // Local doesn't need a key, always available
        };

        const key = keyMap[name];
        if (name === 'local') return true; // Local is always available
        return !!this.env[key];
    }

    /**
     * Get all available providers
     */
    getAvailableProviders(): ProviderName[] {
        const allProviders: ProviderName[] = [
            'openai',
            'gemini',
            'voyage',
            'cohere',
            'mistral',
            'bedrock',
            'xai',
            'zai',
            'opencode',
            'local',
        ];

        return allProviders.filter((p) => this.isProviderAvailable(p));
    }
}
