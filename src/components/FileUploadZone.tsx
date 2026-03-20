import { useCallback, useState } from "react";
import { Upload, FileText, X } from "lucide-react";

interface FileUploadZoneProps {
  onFileSelect: (file: File) => void;
  file: File | null;
  onClear: () => void;
  isProcessing: boolean;
}

export function FileUploadZone({ onFileSelect, file, onClear, isProcessing }: FileUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const f = e.dataTransfer.files[0];
      if (f?.type === "application/pdf") onFileSelect(f);
    },
    [onFileSelect]
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onFileSelect(f);
  };

  if (file) {
    return (
      <div className="glass-card rounded-xl p-6 flex items-center justify-between animate-fade-up">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
            <FileText className="w-6 h-6 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-foreground">{file.name}</p>
            <p className="text-sm text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
          </div>
        </div>
        {!isProcessing && (
          <button
            onClick={onClear}
            className="w-9 h-9 rounded-lg hover:bg-destructive/10 flex items-center justify-center transition-colors active:scale-95"
          >
            <X className="w-4 h-4 text-destructive" />
          </button>
        )}
      </div>
    );
  }

  return (
    <label
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={`
        glass-card rounded-xl p-12 flex flex-col items-center justify-center cursor-pointer
        transition-all duration-300 animate-fade-up
        ${isDragging ? "border-primary bg-primary/5 scale-[1.01]" : "hover:border-primary/40 hover:bg-primary/[0.02]"}
      `}
    >
      <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 transition-colors duration-300 ${isDragging ? "bg-primary/15" : "bg-muted"}`}>
        <Upload className={`w-7 h-7 transition-colors ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
      </div>
      <p className="font-semibold text-foreground mb-1">Drop your PDF here</p>
      <p className="text-sm text-muted-foreground mb-4">or click to browse files</p>
      <span className="text-xs text-muted-foreground/70 bg-muted px-3 py-1 rounded-full">PDF files only</span>
      <input type="file" accept=".pdf" onChange={handleChange} className="hidden" />
    </label>
  );
}