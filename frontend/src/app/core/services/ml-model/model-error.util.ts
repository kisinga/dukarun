/**
 * Error handling utilities for ML model operations
 */

export enum ModelErrorType {
  NOT_FOUND = 'NOT_FOUND',
  NETWORK_ERROR = 'NETWORK_ERROR',
  LOAD_ERROR = 'LOAD_ERROR',
  PREDICTION_ERROR = 'PREDICTION_ERROR',
  PERMISSION_ERROR = 'PERMISSION_ERROR',
}

export interface ModelError {
  type: ModelErrorType;
  message: string;
  technicalDetails?: string;
}

/**
 * Parse error into user-friendly ModelError
 */
export function parseError(error: any): ModelError {
  const message = error.message || 'Unknown error';

  if (message.includes('not found') || message.includes('404')) {
    return {
      type: ModelErrorType.NOT_FOUND,
      message: 'ML model files not found. Please train a model for your store first.',
      technicalDetails: message,
    };
  }

  if (
    message.includes('fetch') ||
    message.includes('network') ||
    message.includes('Failed to fetch')
  ) {
    return {
      type: ModelErrorType.NETWORK_ERROR,
      message: 'Network error while loading model. Check your internet connection.',
      technicalDetails: message,
    };
  }

  if (message.includes('TensorFlow') || message.includes('model') || message.includes('load')) {
    return {
      type: ModelErrorType.LOAD_ERROR,
      message: 'Failed to load ML model. The model may be corrupted or incompatible.',
      technicalDetails: message,
    };
  }

  return {
    type: ModelErrorType.LOAD_ERROR,
    message: 'Failed to load ML model. Please try again or contact support.',
    technicalDetails: message,
  };
}
