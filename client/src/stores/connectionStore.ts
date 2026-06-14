import { create } from 'zustand';

export type SocketStatus = 'connected' | 'disconnected' | 'connecting';

interface ConnectionState {
  socketStatus: SocketStatus;
  error: string | null;
  setConnected: () => void;
  setDisconnected: (error?: string) => void;
  setConnecting: () => void;
  clearError: () => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  socketStatus: 'disconnected',
  error: null,

  setConnected: () => set({ socketStatus: 'connected', error: null }),

  setDisconnected: (error?: string) =>
    set({ socketStatus: 'disconnected', error: error ?? null }),

  setConnecting: () => set({ socketStatus: 'connecting' }),

  clearError: () => set({ error: null }),
}));
