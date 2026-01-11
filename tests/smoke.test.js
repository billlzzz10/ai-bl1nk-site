/**
 * Smoke test for AI Gateway endpoints
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:8787';

async function test(name, fn) {
    try {
        await fn();
        console.log(`✅ ${name}`);
    } catch (error) {
        console.error(`❌ ${name}`);
        console.error(`   ${error.message}`);
    }
}

async function testModels() {
    const response = await fetch(`${BASE_URL}/v1/models`);
    const data = await response.json();

    if (!response.ok) {
        throw new Error(`Status ${response.status}: ${JSON.stringify(data)}`);
    }

    if (!data.models || !Array.isArray(data.models)) {
        throw new Error('Invalid response format');
    }

    if (data.models.length === 0) {
        throw new Error('No models returned');
    }

    console.log(`   Found ${data.models.length} models`);
}

async function testQuote() {
    const response = await fetch(`${BASE_URL}/v1/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            input: 'Hello, world!',
            tier: 'cheap',
            usecase: 'chat',
        }),
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(`Status ${response.status}: ${JSON.stringify(data)}`);
    }

    if (typeof data.prompt_tokens !== 'number') {
        throw new Error('Missing prompt_tokens');
    }

    if (typeof data.cost_estimate !== 'number') {
        throw new Error('Missing cost_estimate');
    }

    console.log(`   Tokens: ${data.prompt_tokens}, Cost: $${data.cost_estimate.toFixed(6)}`);
}

async function testRoute() {
    const response = await fetch(`${BASE_URL}/v1/route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            input: 'Say hello in one word',
            tier: 'cheap',
            usecase: 'chat',
            constraints: {
                max_tokens: 10,
            },
        }),
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(`Status ${response.status}: ${JSON.stringify(data)}`);
    }

    if (!data.id) {
        throw new Error('Missing id');
    }

    if (!data.output_text) {
        throw new Error('Missing output_text');
    }

    if (!data.usage) {
        throw new Error('Missing usage');
    }

    console.log(`   Provider: ${data.provider}, Model: ${data.model}`);
    console.log(`   Output: ${data.output_text.substring(0, 50)}...`);
    console.log(`   Usage: ${data.usage.total_tokens} tokens, $${data.usage.cost_estimate.toFixed(6)}`);
}

async function testHealth() {
    const response = await fetch(`${BASE_URL}/health`);
    const data = await response.json();

    if (!response.ok) {
        throw new Error(`Status ${response.status}`);
    }

    if (data.status !== 'ok') {
        throw new Error('Health check failed');
    }
}

async function main() {
    console.log('🧪 Running AI Gateway smoke tests...\n');
    console.log(`Base URL: ${BASE_URL}\n`);

    await test('Health check', testHealth);
    await test('GET /v1/models', testModels);
    await test('POST /v1/quote', testQuote);
    await test('POST /v1/route', testRoute);

    console.log('\n✨ Tests complete!');
}

main().catch(console.error);
