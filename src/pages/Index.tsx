import { useState, useCallback } from "react";
import { Download, GraduationCap, Loader2, LogOut, User } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { FileUploadZone } from "@/components/FileUploadZone";
import { StatsCards } from "@/components/StatsCards";
import { ResultsTable } from "@/components/ResultsTable";
import { extractTextFromPdf, parseStudentResults, type ParsedResults } from "@/lib/pdf-parser";
import { exportToExcel } from "@/lib/excel-export";
import { toast } from "sonner";

const Index = () => {
  const [file, setFile] = useState<File | null>(null);
  const [results, setResults] = useState<ParsedResults | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleFileSelect = useCallback(async (f: File) => {
    setFile(f);
    setIsProcessing(true);
    try {
      const pages = await extractTextFromPdf(f);
      const parsed = parseStudentResults(pages);
      if (parsed.students.length === 0) {
        toast.error("No student data found. Try a different PDF format.");
        setResults(null);
      } else {
        setResults(parsed);
        toast.success(`Extracted ${parsed.students.length} students across ${parsed.semesters.length} semesters`);
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to process PDF. Please check the file format.");
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const handleClear = () => {
    setFile(null);
    setResults(null);
  };

  const handleDownload = () => {
    if (results) {
      exportToExcel(results);
      toast.success("Excel file downloaded!");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 bg-card/60 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="font-bold text-lg text-foreground tracking-tight leading-none">Arrears Analyzer</h1>
              {results && (
                <p className="text-[11px] text-muted-foreground mt-0.5">{results.institution}</p>
              )}
            </div>
          </div>
          {results && (
            <button
              onClick={handleDownload}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors active:scale-[0.97]"
            >
              <Download className="w-4 h-4" />
              Download Excel
            </button>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {!results && (
          <div className="max-w-xl mx-auto pt-12">
            <div className="text-center mb-8 animate-fade-up">
              <h2 className="text-3xl font-bold text-foreground tracking-tight" style={{ lineHeight: "1.1" }}>
                Analyze Student Arrears
              </h2>
              <p className="text-muted-foreground mt-3 text-balance">
                Upload an Anna University results PDF to extract semester-wise grades, calculate arrears, and download a detailed Excel report.
              </p>
            </div>
            <FileUploadZone
              onFileSelect={handleFileSelect}
              file={file}
              onClear={handleClear}
              isProcessing={isProcessing}
            />
            {isProcessing && (
              <div className="flex items-center justify-center gap-3 mt-6 text-muted-foreground animate-fade-up">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm font-medium">Processing PDF…</span>
              </div>
            )}
          </div>
        )}

        {results && (
          <>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-foreground tracking-tight">Analysis Results</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {results.branch} · {results.examination}
                </p>
              </div>
              <button
                onClick={handleClear}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4"
              >
                Upload new file
              </button>
            </div>
            <StatsCards data={results} />
            <ResultsTable data={results} />
          </>
        )}
      </main>
    </div>
  );
};

export default Index;
