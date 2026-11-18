import type { NarrationKey } from '@number-island/shared';
import { type ReactNode, useEffect, useRef } from 'react';
import { useNarrationText } from '../preferences/UiProvider';
import { IconButton } from './IconButton';
import { BackIcon } from './icons';

export interface SheetProps {
  open: boolean;
  /** Called on the close button, Escape, or a tap on the backdrop. */
  onClose: () => void;
  /** Narration key naming the sheet (its accessible name). */
  label: NarrationKey;
  children?: ReactNode;
  /** A bottom sheet (default) or a centred card. */
  placement?: 'bottom' | 'center';
  /** Show the round close button (default true). */
  closeButton?: boolean;
  /** Content at the start of the header row, beside the close button. */
  header?: ReactNode;
  className?: string;
}

/**
 * A modal sheet on the native <dialog>: the page behind is inert, focus moves inside and returns
 * when it closes, and Escape closes it. Slides up from the bottom (a fade with reduced motion).
 */
export function Sheet({
  open,
  onClose,
  label,
  children,
  placement = 'bottom',
  closeButton = true,
  header,
  className,
}: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const text = useNarrationText()(label);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={['ni-sheet', className].filter(Boolean).join(' ')}
      data-placement={placement}
      aria-label={text}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // A click on the dialog element itself (not its card) is a click on the backdrop.
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onClose();
        }
      }}
    >
      {open ? (
        <div className="ni-sheet__card">
          {placement === 'bottom' ? <div className="ni-sheet__grip" aria-hidden="true" /> : null}
          {header || closeButton ? (
            <div className="ni-sheet__header">
              <div>{header}</div>
              {closeButton ? (
                <IconButton label="ui.btn.close" icon={<BackIcon />} onPress={onClose} />
              ) : null}
            </div>
          ) : null}
          {children}
        </div>
      ) : null}
    </dialog>
  );
}
