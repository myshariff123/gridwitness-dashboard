'use client'
// components/Toast.tsx + hook — Reusable toast notifications
// Pure frontend. No backend.

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info'
interface Toast { id: number; type: ToastType; text: string }
interface ToastCtx {
  push: (type: ToastType, text: string, ttlMs?: number) => void
}

const Ctx = createContext<ToastCtx | null>(null)
let nextId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const remove = useCallback((id: number) =>
    setToasts(prev => prev.filter(t => t.id !== id)), [])
  const push = useCallback((type: ToastType, text: string, ttlMs = 4000) => {
    const id = nextId++
    setToasts(prev => [...prev, { id, type, text }])
    setTimeout(() => remove(id), ttlMs)
  }, [remove])
  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
        {toasts.map(t => {
          const colors = {
            success: 'bg-gw-green/10 border-gw-green/30 text-gw-green',
            error:   'bg-red-500/10 border-red-500/30 text-red-400',
            info:    'bg-blue-500/10 border-blue-500/30 text-blue-400',
          }[t.type]
          const Icon = { success: CheckCircle, error: AlertCircle, info: Info }[t.type]
          return (
            <div key={t.id}
                 className={`flex items-start gap-2 border rounded-lg p-3 shadow-lg backdrop-blur-sm ${colors}`}>
              <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div className="flex-1 text-sm">{t.text}</div>
              <button onClick={() => remove(t.id)}
                      className="flex-shrink-0 opacity-60 hover:opacity-100">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )
        })}
      </div>
    </Ctx.Provider>
  )
}

export function useToast() {
  const ctx = useContext(Ctx)
  if (!ctx) {
    return {
      push: (type: ToastType, text: string) => {
        if (typeof console !== 'undefined') console.log(`[${type}]`, text)
      },
    }
  }
  return ctx
}
