import React, { useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { UploadCloud, X } from 'lucide-react'
import { cn, formatBytes, truncate } from '../../utils/format'

interface FileDropzoneProps {
  accept: Record<string, string[]>
  maxSize: number
  label: string
  hint: string
  file: File | null
  onFileAccepted: (file: File) => void
  onClear: () => void
  disabled?: boolean
}

export function FileDropzone({
  accept,
  maxSize,
  label,
  hint,
  file,
  onFileAccepted,
  onClear,
  disabled = false,
}: FileDropzoneProps) {
  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted.length > 0) onFileAccepted(accepted[0])
    },
    [onFileAccepted],
  )

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop,
    accept,
    maxSize,
    multiple: false,
    disabled: disabled || file != null,
  })

  const rejection = fileRejections[0]?.errors[0]

  return (
    <div>
      {file ? (
        <div className="card-sm flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-200 truncate">{file.name}</p>
            <p className="text-xs text-gray-500 mt-0.5">{formatBytes(file.size)}</p>
          </div>
          <button
            onClick={onClear}
            className="shrink-0 p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
            aria-label="Remove file"
            disabled={disabled}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div
          {...getRootProps()}
          className={cn(
            'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors duration-200',
            isDragActive
              ? 'border-brand-500 bg-brand-950/20 drop-zone-active'
              : 'border-gray-700 hover:border-gray-600 bg-gray-900/50',
            disabled && 'opacity-50 cursor-not-allowed',
          )}
        >
          <input {...getInputProps()} />
          <UploadCloud className="mx-auto w-10 h-10 text-gray-600 mb-3" />
          <p className="text-sm font-medium text-gray-300">{label}</p>
          <p className="text-xs text-gray-500 mt-1">{hint}</p>
          <p className="text-xs text-gray-600 mt-2">Max {formatBytes(maxSize)}</p>
        </div>
      )}

      {rejection && (
        <p className="text-xs text-red-400 mt-2">
          {rejection.code === 'file-too-large'
            ? `File exceeds ${formatBytes(maxSize)} limit`
            : rejection.message}
        </p>
      )}
    </div>
  )
}
