import { makeAutoObservable } from 'mobx';

export type ToastKind = 'info' | 'success' | 'error';

export interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  description?: string;
}

/** Tiny queue for transient notifications; rendered by <Toaster />. */
export class ToastStore {
  items: ToastItem[] = [];
  private seq = 0;

  constructor() {
    makeAutoObservable<this, 'seq'>(this, { seq: false }, { autoBind: true });
  }

  show(kind: ToastKind, title: string, description?: string) {
    // An identical toast that is still on screen is never stacked twice.
    const duplicate = this.items.some(
      (t) => t.kind === kind && t.title === title && t.description === description,
    );
    if (duplicate) return;
    const id = ++this.seq;
    this.items = [...this.items, { id, kind, title, description }];
  }

  success(title: string, description?: string) {
    this.show('success', title, description);
  }

  error(title: string, description?: string) {
    this.show('error', title, description);
  }

  info(title: string, description?: string) {
    this.show('info', title, description);
  }

  dismiss(id: number) {
    this.items = this.items.filter((t) => t.id !== id);
  }
}
