/**
 * AWS Signature V4 utilities for Bedrock authentication
 */

import { Env } from '../types';

/**
 * Create AWS Signature V4 for Bedrock requests
 */
export async function signBedrockRequest(
    method: string,
    url: string,
    body: string,
    env: Env
): Promise<Headers> {
    const accessKeyId = env.BEDROCK_KEY || '';
    const secretAccessKey = env.BEDROCK_SECRET || '';
    const region = env.BEDROCK_REGION || 'us-east-1';

    if (!accessKeyId || !secretAccessKey) {
        throw new Error('Missing AWS credentials');
    }

    const urlObj = new URL(url);
    const host = urlObj.hostname;
    const path = urlObj.pathname;

    const service = 'bedrock';
    const algorithm = 'AWS4-HMAC-SHA256';

    // Create timestamp
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.substring(0, 8);

    // Create canonical request
    const payloadHash = await sha256(body);
    const canonicalHeaders = `host:${host}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'host;x-amz-date';

    const canonicalRequest = [
        method,
        path,
        '', // query string (empty for POST)
        canonicalHeaders,
        signedHeaders,
        payloadHash,
    ].join('\n');

    // Create string to sign
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const canonicalRequestHash = await sha256(canonicalRequest);

    const stringToSign = [
        algorithm,
        amzDate,
        credentialScope,
        canonicalRequestHash,
    ].join('\n');

    // Calculate signature
    const signingKey = await getSignatureKey(secretAccessKey, dateStamp, region, service);
    const signature = await hmacSha256(signingKey, stringToSign);

    // Create authorization header
    const authorizationHeader = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    // Return headers
    const headers = new Headers();
    headers.set('Host', host);
    headers.set('X-Amz-Date', amzDate);
    headers.set('Authorization', authorizationHeader);
    headers.set('Content-Type', 'application/json');

    return headers;
}

/**
 * SHA256 hash
 */
async function sha256(message: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return bufferToHex(hashBuffer);
}

/**
 * HMAC-SHA256
 */
async function hmacSha256(key: ArrayBuffer, message: string): Promise<string> {
    const encoder = new TextEncoder();
    const messageData = encoder.encode(message);

    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        key,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );

    const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
    return bufferToHex(signature);
}

/**
 * Get signing key
 */
async function getSignatureKey(
    key: string,
    dateStamp: string,
    region: string,
    service: string
): Promise<ArrayBuffer> {
    const kDate = await hmacSha256Raw(stringToBuffer('AWS4' + key), dateStamp);
    const kRegion = await hmacSha256Raw(kDate, region);
    const kService = await hmacSha256Raw(kRegion, service);
    const kSigning = await hmacSha256Raw(kService, 'aws4_request');
    return kSigning;
}

/**
 * HMAC-SHA256 returning raw buffer
 */
async function hmacSha256Raw(key: ArrayBuffer, message: string): Promise<ArrayBuffer> {
    const encoder = new TextEncoder();
    const messageData = encoder.encode(message);

    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        key,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );

    return await crypto.subtle.sign('HMAC', cryptoKey, messageData);
}

/**
 * Convert string to ArrayBuffer
 */
function stringToBuffer(str: string): ArrayBuffer {
    const encoder = new TextEncoder();
    const uint8Array = encoder.encode(str);
    // Create a new ArrayBuffer to avoid SharedArrayBuffer type
    const buffer = new ArrayBuffer(uint8Array.length);
    new Uint8Array(buffer).set(uint8Array);
    return buffer;
}

/**
 * Convert ArrayBuffer to hex string
 */
function bufferToHex(buffer: ArrayBuffer): string {
    const byteArray = new Uint8Array(buffer);
    return Array.from(byteArray)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}
