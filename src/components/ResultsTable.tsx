import type { ParsedResults } from "@/lib/pdf-parser";

interface ResultsTableProps {
  data: ParsedResults;
}

export function ResultsTable({ data }: ResultsTableProps) {
  return (
    <div className="glass-card rounded-xl overflow-hidden animate-fade-up-delay-2">
      <div className="p-5 border-b border-border">
        <h2 className="font-semibold text-foreground">Student Results</h2>
        <p className="text-sm text-muted-foreground mt-0.5">{data.students.length} students · {data.subjectNames.length} subjects</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">#</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Roll No</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
              {data.subjectNames.map(sub => (
                <th key={sub} className="text-center px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">{sub}</th>
              ))}
              <th className="text-center px-4 py-3 font-medium text-muted-foreground">Total</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground">Arrears</th>
              <th className="text-center px-4 py-3 font-medium text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.students.map((student, i) => (
              <tr key={i} className="border-t border-border/50 hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 text-muted-foreground tabular-nums">{i + 1}</td>
                <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">{student.rollNo}</td>
                <td className="px-4 py-3 text-foreground whitespace-nowrap">{student.name}</td>
                {data.subjectNames.map(subName => {
                  const sub = student.subjects.find(x => x.name === subName);
                  const isFail = sub?.status === "Fail" || sub?.status === "Absent";
                  return (
                    <td key={subName} className={`px-4 py-3 text-center tabular-nums ${isFail ? "text-destructive font-semibold" : "text-foreground"}`}>
                      {sub ? sub.marks : "-"}
                    </td>
                  );
                })}
                <td className="px-4 py-3 text-center font-medium tabular-nums">{student.totalMarks}</td>
                <td className="px-4 py-3 text-center tabular-nums">
                  {student.arrearCount > 0 ? (
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-destructive/10 text-destructive font-semibold text-xs">
                      {student.arrearCount}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  {student.arrearCount > 0 ? (
                    <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-destructive/10 text-destructive">Arrears</span>
                  ) : (
                    <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-success/10 text-success">Clear</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}