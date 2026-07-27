import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Suppress known Firebase SDK background errors when database is not provisioned or auth internal promise fails
const originalError = console.error;
const originalWarn = console.warn;

const isFirebaseIgnorableError = (arg: any) => {
  if (!arg) return false;
  const str = typeof arg === 'string' ? arg : (arg.message || arg.stack || String(arg));
  return (
    str.includes('INTERNAL ASSERTION FAILED') ||
    str.includes('Pending promise was never set') ||
    str.includes("Database '(default)' not found") ||
    str.includes('Please check your project configuration') ||
    str.includes('@firebase/firestore')
  );
};

console.error = (...args: any[]) => {
  if (args.some(isFirebaseIgnorableError)) {
    return;
  }
  originalError.apply(console, args);
};

console.warn = (...args: any[]) => {
  if (args.some(isFirebaseIgnorableError)) {
    return;
  }
  originalWarn.apply(console, args);
};

window.addEventListener('unhandledrejection', (event) => {
  if (isFirebaseIgnorableError(event.reason)) {
    event.preventDefault();
    event.stopPropagation();
  }
});

window.addEventListener('error', (event) => {
  if (isFirebaseIgnorableError(event.message) || isFirebaseIgnorableError(event.error)) {
    event.preventDefault();
    event.stopPropagation();
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);


