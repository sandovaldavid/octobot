export interface ValidationError extends Error {
    name: 'ValidationError';
    errors: Record<string, any>;
}

export const isValidationError = (error: unknown): error is ValidationError => {
    return error instanceof Error && error.name === 'ValidationError';
};
