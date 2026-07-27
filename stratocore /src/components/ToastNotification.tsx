import React, { useEffect, useState } from 'react';
import { subscribeToErrors } from '../lib/utils';
import { X, AlertCircle } from 'lucide-react';

interface Toast {
  id: string;
  message: string;
}

export function ToastNotification() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const unsubscribe = subscribeToErrors((message) => {
      const id = Math.random().toString(36).substring(7);
      setToasts((prev) => [...prev, { id, message }]);

      // Auto-dismiss after 5 seconds
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 5000);
    });

    return () => unsubscribe();
  }, []);

  const dismiss = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full">
      {toasts.map((toast) => (
        <div 
          key={toast.id} 
          className="bg-white border-l-4 border-red-500 shadow-xl rounded-lg p-4 flex items-start justify-between animate-in slide-in-from-bottom-5 fade-in duration-300"
        >
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-slate-700 font-medium">{toast.message}</p>
          </div>
          <button 
            onClick={() => dismiss(toast.id)}
            className="text-slate-400 hover:text-slate-600 transition-colors p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
