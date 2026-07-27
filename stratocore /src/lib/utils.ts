import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Error Logging & Centralized Notification System ---

type ErrorListener = (message: string, error?: any) => void;
const errorListeners: Set<ErrorListener> = new Set();

/**
 * Subscribes to the global error notification stream.
 * @returns A function to unsubscribe.
 */
export function subscribeToErrors(listener: ErrorListener) {
  errorListeners.add(listener);
  return () => {
    errorListeners.delete(listener);
  };
}

/**
 * Dispatches an error message to the UI (e.g. a Toast component).
 * @param message The user-facing message to display.
 * @param error Optional error object for deeper logging.
 */
export function notifyError(message: string, error?: any) {
  logError('Notification', error || message);
  errorListeners.forEach((listener) => listener(message, error));
}

/**
 * Unified error logging utility. Use this instead of raw console.error 
 * to centralize logging and easily add remote telemetry later.
 */
export function logError(context: string, error: any) {
  const errMessage = error instanceof Error ? error.message : String(error);
  console.error(`[${context}] Error:`, errMessage, error);
}
