import Modal from './Modal';

export default function ConfirmDialog({
  open,
  title,
  message,
  danger,
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
}) {
  return (
    <Modal open={open} title={title} onClose={onCancel} size="sm">
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-mist">{message}</p>

      <div className="mt-6 flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 rounded-xl border border-hairline bg-white px-4 py-2.5 font-medium text-ink transition-colors hover:bg-cyan-wash"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className={`flex-1 rounded-xl px-4 py-2.5 font-medium text-white transition-all hover:brightness-110 ${
            danger ? 'bg-rose' : 'bg-cyan-deep'
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
