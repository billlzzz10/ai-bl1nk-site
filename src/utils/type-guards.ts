/**
 * Type guards and helpers for provider responses
 */

/**
 * Type guard for error responses
 */
export function isErrorWithMessage(error: unknown): error is { error?: { message?: string } } {
    return (
        typeof error === 'object' &&
        error !== null &&
        'error' in error
    );
}

/**
 * Type guard for error with message property
 */
export function hasMessage(error: unknown): error is { message?: string } {
    return (
        typeof error === 'object' &&
        error !== null &&
        'message' in error
    );
}

/**
 * Extract error message safely
 */
export function getErrorMessage(error: unknown, fallback: string): string {
    if (isErrorWithMessage(error) && error.error?.message) {
        return error.error.message;
    }
    if (hasMessage(error) && error.message) {
        return error.message;
    }
    return fallback;
}

/**
 * Type guard for API response data
 */
export function isApiResponse(data: unknown): data is Record<string, any> {
    return typeof data === 'object' && data !== null;
}
