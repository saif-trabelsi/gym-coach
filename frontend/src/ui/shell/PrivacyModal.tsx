import React, { useState } from 'react';
import { ShieldCheck, Download, Trash2, Key, AlertTriangle, Check } from 'lucide-react';
import { Dialog } from '../kit/Dialog';
import { Button } from '../kit/Button';
import { useToast } from '../kit/Toast';
import { getDeviceId, resetDeviceId } from '../../api/device';
import { exportDeviceData, deleteDeviceData } from '../../api/client';

export interface PrivacyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PrivacyModal: React.FC<PrivacyModalProps> = ({ isOpen, onClose }) => {
  const { showToast } = useToast();
  const [isExporting, setIsExporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  const deviceId = getDeviceId();

  const handleCopyId = () => {
    navigator.clipboard?.writeText(deviceId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
    showToast('Device token copied to clipboard', 'info', 2000);
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const data = await exportDeviceData();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `gymcoach-data-${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Data exported successfully', 'success');
    } catch (err: any) {
      showToast(err?.message || 'Failed to export data', 'danger');
    } finally {
      setIsExporting(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteDeviceData();
      resetDeviceId();
      setConfirmDelete(false);
      showToast('All device data deleted and token reset', 'success');
      onClose();
      // Reload hash to reset session views cleanly
      if (window.location.hash.startsWith('#session/')) {
        window.location.hash = '#coach';
      } else {
        window.dispatchEvent(new Event('hashchange'));
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to delete data', 'danger');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={() => {
        setConfirmDelete(false);
        onClose();
      }}
      title="Privacy & Device Data"
      description="Manage your anonymous device token and stored workouts"
      className="max-w-lg"
    >
      <div className="space-y-5 text-xs text-[var(--text-secondary)]">
        {/* Privacy Guarantees */}
        <div className="p-3.5 rounded-[var(--radius-lg)] bg-[var(--bg-surface-elevated)] border border-[var(--border-subtle)] space-y-2">
          <div className="flex items-center gap-2 font-semibold text-[var(--text-primary)]">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Private by Design</span>
          </div>
          <p className="leading-relaxed">
            All pose estimation runs locally in your browser. Video streams never leave your device.
            Only numerical rep metrics and 33-point skeleton coordinates for rep replays are stored.
          </p>
        </div>

        {/* Anonymous Device Token */}
        <div className="space-y-1.5">
          <label className="font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
            <Key className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <span>Anonymous Device Token</span>
          </label>
          <div className="flex items-center gap-2 p-2 rounded-[var(--radius-md)] bg-[var(--bg-app)] border border-[var(--border-subtle)] font-mono text-[11px]">
            <span className="truncate flex-1 select-all">{deviceId}</span>
            <button
              type="button"
              onClick={handleCopyId}
              className="p-1 px-2 rounded bg-[var(--bg-surface-elevated)] hover:bg-[var(--bg-surface)] text-[var(--text-primary)] transition-colors flex items-center gap-1 text-[10px]"
              title="Copy device token"
            >
              {copiedId ? (
                <>
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span>Copied</span>
                </>
              ) : (
                <span>Copy</span>
              )}
            </button>
          </div>
          <p className="text-[10px] text-[var(--text-muted)]">
            Used as a bearer token to isolate your workouts without requiring an account or email.
          </p>
        </div>

        {/* Export Data */}
        <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between gap-3">
          <div>
            <h4 className="font-semibold text-[var(--text-primary)]">Export My Data</h4>
            <p className="text-[11px] text-[var(--text-muted)]">
              Download all your sessions, reps, and coaching reports as a JSON file.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExport}
            isLoading={isExporting}
            className="shrink-0"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Export JSON
          </Button>
        </div>

        {/* Delete All Data */}
        <div className="pt-2 border-t border-[var(--border-subtle)] space-y-3">
          {!confirmDelete ? (
            <div className="flex items-center justify-between gap-3">
              <div>
                <h4 className="font-semibold text-[var(--status-danger)]">Delete All My Data</h4>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Permanently remove all workouts and reset your device ID.
                </p>
              </div>
              <Button
                variant="danger"
                size="sm"
                onClick={() => setConfirmDelete(true)}
                className="shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                Delete All
              </Button>
            </div>
          ) : (
            <div
              role="alert"
              className="p-3.5 rounded-[var(--radius-lg)] bg-red-950/40 border border-red-800/50 space-y-3"
            >
              <div className="flex items-center gap-2 text-red-300 font-semibold text-xs">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <span>Confirm Permanent Deletion</span>
              </div>
              <p className="text-[11px] text-red-200/90 leading-relaxed">
                This will immediately and permanently erase all sessions, sets, replays, and coaching reports associated with this device. This cannot be undone.
              </p>
              <div className="flex items-center justify-end gap-2 pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDelete(false)}
                  disabled={isDeleting}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleDelete}
                  isLoading={isDeleting}
                >
                  Confirm Delete
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
};
