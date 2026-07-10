import { create } from "zustand";

export type ToastTone = "success" | "warning" | "error" | "info";

export interface ToastMessage {
  id: string;
  tone: ToastTone;
  title: string;
  detail?: string;
  durationMs: number;
}

interface ToastState {
  toasts: ToastMessage[];
  push: (message: Omit<ToastMessage, "id">) => void;
  dismiss: (id: string) => void;
}

let toastSequence = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (message) => {
    toastSequence += 1;
    const toast: ToastMessage = {
      ...message,
      id: `toast-${Date.now()}-${toastSequence}`,
    };

    set((state) => ({ toasts: [...state.toasts.slice(-3), toast] }));
  },
  dismiss: (id) => {
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }));
  },
}));
