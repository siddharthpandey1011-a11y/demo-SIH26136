import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface FileViewerModalProps {
  fileUrl: string | null;
  onClose: () => void;
  title?: string;
}

export const FileViewerModal: React.FC<FileViewerModalProps> = ({ fileUrl, onClose, title = "View Document" }) => {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  if (!fileUrl) return null;

  const API_BASE = import.meta.env.VITE_API_URL || '';
  const fullUrl = API_BASE + fileUrl;
  const isPdf = fileUrl.toLowerCase().endsWith('.pdf');

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '90%',
          maxWidth: '1200px',
          height: '90vh',
          maxHeight: '95vh',
          backgroundColor: '#fff',
          borderRadius: '8px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', borderBottom: '1px solid #e2e8f0' }}>
          <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>{title}</h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
          >
            <X size={24} />
          </button>
        </div>
        {isPdf ? (
          <div style={{ flex: 1, overflow: 'hidden', backgroundColor: '#f8fafc' }}>
            <iframe
              src={fullUrl}
              style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
              title={title}
            />
          </div>
        ) : (
          <div style={{ padding: '16px', backgroundColor: '#f8fafc', flex: 1, overflow: 'auto', textAlign: 'center' }}>
            <img
              src={fullUrl}
              style={{ display: 'inline-block', maxWidth: 'none', height: 'auto' }}
              alt="Document"
            />
          </div>
        )}
      </div>
    </div>
  );
};
