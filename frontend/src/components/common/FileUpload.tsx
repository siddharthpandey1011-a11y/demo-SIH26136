import React, { useState, useRef } from 'react';
import { Upload, X, FileText, Image as ImageIcon, Loader2 } from 'lucide-react';
import { api } from '../../api/client';

interface FileUploadProps {
  label: string;
  onUploadSuccess: (url: string, filename: string) => void;
  accept?: string;
  maxSizeMB?: number;
}

export const FileUpload: React.FC<FileUploadProps> = ({ 
  label, 
  onUploadSuccess, 
  accept = ".pdf,.png,.jpg,.jpeg",
  maxSizeMB = 5 
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      
      // Validate Size
      if (selectedFile.size > 5 * 1024 * 1024) {
        alert("File exceeds 5MB limit");
        e.target.value = '';
        return;
      }

      setFile(selectedFile);
      await uploadFile(selectedFile);
    }
  };

  const uploadFile = async (selectedFile: File) => {
    setUploading(true);
    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const token = api.getToken();
      const res = await fetch(`/api/uploads`, {
        method: 'POST',
        headers: token ? {
          'Authorization': `Bearer ${token}`
        } : {},
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Upload failed');
      }

      const data = await res.json();
      onUploadSuccess(data.file_url, data.filename);
    } catch (err: any) {
      setError(err.message || 'An error occurred during upload.');
      setFile(null);
    } finally {
      setUploading(false);
    }
  };

  const clearFile = () => {
    setFile(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="file-upload-container" style={{ marginBottom: '1rem' }}>
      <label className="auth-label" style={{ display: 'block', marginBottom: '8px', fontWeight: 600, color: '#334155' }}>
        {label}
      </label>
      
      {!file ? (
        <div 
          className="file-upload-dropzone" 
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: '2px dashed #cbd5e1',
            borderRadius: '8px',
            padding: '24px',
            textAlign: 'center',
            cursor: 'pointer',
            backgroundColor: '#f8fafc',
            transition: 'all 0.2s'
          }}
        >
          <Upload size={24} color="#64748b" style={{ margin: '0 auto 8px' }} />
          <p style={{ margin: 0, color: '#475569', fontSize: '0.9rem' }}>Click to select a file</p>
          <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: '0.75rem' }}>
            Accepts {accept} (Max {maxSizeMB}MB)
          </p>
        </div>
      ) : (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', border: '1px solid #e2e8f0', borderRadius: '8px',
          backgroundColor: '#fff'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', overflow: 'hidden' }}>
            {file.type.includes('pdf') ? <FileText size={20} color="#ef4444" /> : <ImageIcon size={20} color="#3b82f6" />}
            <span style={{ fontSize: '0.9rem', color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px' }}>
              {file.name}
            </span>
          </div>
          
          {uploading ? (
            <Loader2 size={16} className="animate-spin" color="#64748b" />
          ) : (
            <button type="button" onClick={clearFile} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}>
              <X size={16} color="#ef4444" />
            </button>
          )}
        </div>
      )}
      
      {error && <p style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '6px', marginBottom: 0 }}>{error}</p>}
      
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept={accept}
        style={{ display: 'none' }}
      />
    </div>
  );
};
