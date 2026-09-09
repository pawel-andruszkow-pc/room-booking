import * as ToastPrimitive from '@radix-ui/react-toast';
import { observer } from 'mobx-react-lite';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useStores } from '@/stores/StoreContext';
import { cn } from '@/lib/utils';
import type { ToastKind } from '@/stores/ToastStore';

const ICONS: Record<ToastKind, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  error: AlertCircle,
};

const COLORS: Record<ToastKind, string> = {
  info: 'border-sky-400/40 text-sky-200',
  success: 'border-emerald-400/40 text-emerald-200',
  error: 'border-red-400/40 text-red-200',
};

/** Renders the ToastStore queue with Radix Toast (swipe to dismiss, auto-close). */
export const Toaster = observer(function Toaster() {
  const { toast } = useStores();
  return (
    <ToastPrimitive.Provider swipeDirection="right" duration={5000}>
      {toast.items.map((item) => {
        const Icon = ICONS[item.kind];
        return (
          <ToastPrimitive.Root
            key={item.id}
            onOpenChange={(open) => !open && toast.dismiss(item.id)}
            className={cn(
              'pointer-events-auto flex w-[26rem] items-start gap-4 rounded-2xl border bg-ink-2/95 p-5 shadow-2xl backdrop-blur',
              'data-[state=open]:animate-[toast-in_220ms_ease-out] data-[state=closed]:animate-[toast-out_160ms_ease-in]',
              'data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=end]:animate-[toast-out_160ms_ease-in]',
              COLORS[item.kind],
            )}
          >
            <Icon className="mt-0.5 h-6 w-6 shrink-0" />
            <div className="min-w-0 flex-1">
              <ToastPrimitive.Title className="text-lg font-bold text-white">
                {item.title}
              </ToastPrimitive.Title>
              {item.description && (
                <ToastPrimitive.Description className="mt-1 text-base text-white/70">
                  {item.description}
                </ToastPrimitive.Description>
              )}
            </div>
            <ToastPrimitive.Close className="rounded-lg p-1 text-white/50 hover:bg-white/10 hover:text-white">
              <X className="h-5 w-5" />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        );
      })}
      <ToastPrimitive.Viewport className="pointer-events-none fixed right-8 top-8 z-[100] flex flex-col gap-3 outline-none" />
      <style>{`
        @keyframes toast-in { from { opacity: 0; transform: translateX(24px); } to { opacity: 1; transform: none; } }
        @keyframes toast-out { to { opacity: 0; transform: translateX(24px); } }
      `}</style>
    </ToastPrimitive.Provider>
  );
});
