import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { Modal } from './Modal';

/**
 * In-app pop-ups instead of the browser's alert/confirm:
 *  - confirm(): a dialog with descriptive buttons ("Delete record" / "Cancel"); resolves true/false
 *  - notify():  a short notification that an action is done; disappears by itself
 */
export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface Toast {
  id: number;
  message: string;
  tone: 'success' | 'error';
}

interface Feedback {
  notify(message: string, tone?: Toast['tone']): void;
  confirm(options: ConfirmOptions): Promise<boolean>;
}

const Ctx = createContext<Feedback | null>(null);

export function useFeedback(): Feedback {
  const v = useContext(Ctx);
  if (!v) throw new Error('useFeedback outside FeedbackProvider');
  return v;
}

export const TOAST_MS = 3500;

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pending, setPending] = useState<(ConfirmOptions & { resolve(ok: boolean): void }) | null>(null);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const notify = useCallback(
    (message: string, tone: Toast['tone'] = 'success') => {
      const id = nextId.current++;
      setToasts((t) => [...t.slice(-2), { id, message, tone }]); // at most three on screen
      setTimeout(() => dismiss(id), TOAST_MS);
    },
    [dismiss],
  );

  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ ...options, resolve })), []);

  const answer = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  const value = useMemo(() => ({ notify, confirm }), [notify, confirm]);
  return (
    <Ctx.Provider value={value}>
      {children}
      {pending && (
        <Modal title={pending.title} onClose={() => answer(false)} role="alertdialog">
          <div className="stack">
            {pending.message && <div className="muted">{pending.message}</div>}
            <div className="form-actions">
              <button type="button" className={pending.danger ? 'btn danger solid' : 'btn primary'} autoFocus onClick={() => answer(true)}>
                {pending.confirmLabel}
              </button>
              <button type="button" className="btn" onClick={() => answer(false)}>
                {pending.cancelLabel ?? 'Cancel'}
              </button>
            </div>
          </div>
        </Modal>
      )}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} role="status" className={`toast ${t.tone}`} onClick={() => dismiss(t.id)}>
            <span className="toast-icon"><Icon name={t.tone === 'success' ? 'check' : 'alert'} size={16} /></span>
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
