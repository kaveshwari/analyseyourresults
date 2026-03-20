import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs`;

export interface StudentResult {
  name: string;
  rollNo: string;
  subjects: { name: string; marks: number | string; status: "Pass" | "Fail" | "Absent" }[];
  totalMarks: number;
  arrearCount: number;
}

export interface ParsedResults {
  students: StudentResult[];
  totalClassArrears: number;
  subjectNames: string[];
}

export async function extractTextFromPdf(file: File): Promise<string[][]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages: string[][] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const lines: string[] = [];
    let currentLine = "";
    let lastY: number | null = null;

    for (const item of textContent.items) {
      if ("str" in item) {
        const y = (item as any).transform[5];
        if (lastY !== null && Math.abs(y - lastY) > 5) {
          if (currentLine.trim()) lines.push(currentLine.trim());
          currentLine = "";
        }
        currentLine += item.str + " ";
        lastY = y;
      }
    }
    if (currentLine.trim()) lines.push(currentLine.trim());
    pages.push(lines);
  }
  return pages;
}

export function parseStudentResults(pages: string[][]): ParsedResults {
  const students: StudentResult[] = [];
  const subjectSet = new Set<string>();
  const allLines = pages.flat();

  // Try to detect table structure
  // Common patterns: Roll No, Name, Subject1, Subject2, ... or similar tabular data
  // We'll try multiple parsing strategies

  let headerLine = -1;
  let headers: string[] = [];

  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i].toLowerCase();
    if (
      (line.includes("roll") || line.includes("reg") || line.includes("s.no") || line.includes("sl.no")) &&
      (line.includes("name") || line.includes("student"))
    ) {
      headerLine = i;
      headers = allLines[i].split(/\s{2,}|\t/).map(h => h.trim()).filter(Boolean);
      break;
    }
  }

  if (headerLine === -1) {
    // Fallback: treat each line as potential data
    return parseFreeformResults(allLines);
  }

  // Find subject columns (columns that aren't roll/name/total/result)
  const nameColIdx = headers.findIndex(h => /name|student/i.test(h));
  const rollColIdx = headers.findIndex(h => /roll|reg|s\.?no|sl\.?no/i.test(h));
  const subjectIndices: { idx: number; name: string }[] = [];

  headers.forEach((h, idx) => {
    if (
      idx !== nameColIdx &&
      idx !== rollColIdx &&
      !/total|result|grade|gpa|cgpa|percentage|%|status|remark/i.test(h)
    ) {
      subjectIndices.push({ idx, name: h });
      subjectSet.add(h);
    }
  });

  // Parse data rows
  for (let i = headerLine + 1; i < allLines.length; i++) {
    const line = allLines[i].trim();
    if (!line || line.length < 3) continue;

    const parts = line.split(/\s{2,}|\t/).map(p => p.trim()).filter(Boolean);
    if (parts.length < 2) continue;

    // Skip if it looks like a header or footer
    if (/page|total|class|semester|department|university|examination/i.test(line) && !/^\d/.test(line)) continue;

    const rollNo = rollColIdx >= 0 && rollColIdx < parts.length ? parts[rollColIdx] : parts[0];
    const name = nameColIdx >= 0 && nameColIdx < parts.length ? parts[nameColIdx] : parts[1] || "Unknown";

    const subjects: StudentResult["subjects"] = [];
    let totalMarks = 0;
    let arrearCount = 0;

    subjectIndices.forEach(({ idx, name: subName }) => {
      if (idx < parts.length) {
        const val = parts[idx];
        const numVal = parseInt(val);
        const isAbsent = /ab|absent|aa/i.test(val);
        const isFail = isAbsent || (!isNaN(numVal) && numVal < 40) || /f|fail/i.test(val);

        subjects.push({
          name: subName,
          marks: isAbsent ? "AB" : isNaN(numVal) ? val : numVal,
          status: isAbsent ? "Absent" : isFail ? "Fail" : "Pass",
        });

        if (!isAbsent && !isNaN(numVal)) totalMarks += numVal;
        if (isFail || isAbsent) arrearCount++;
      }
    });

    if (subjects.length > 0 || /^\d/.test(rollNo)) {
      students.push({ name, rollNo, subjects, totalMarks, arrearCount });
    }
  }

  const totalClassArrears = students.reduce((sum, s) => sum + s.arrearCount, 0);
  return { students, totalClassArrears, subjectNames: Array.from(subjectSet) };
}

function parseFreeformResults(lines: string[]): ParsedResults {
  const students: StudentResult[] = [];
  const subjectSet = new Set<string>();

  // Try to extract any tabular-looking data with numbers
  for (const line of lines) {
    const parts = line.split(/\s{2,}|\t|,/).map(p => p.trim()).filter(Boolean);
    if (parts.length >= 3) {
      const hasNumbers = parts.some(p => /^\d+$/.test(p));
      const hasName = parts.some(p => /^[A-Za-z\s.]+$/.test(p) && p.length > 2);

      if (hasNumbers && hasName) {
        const namePart = parts.find(p => /^[A-Za-z\s.]+$/.test(p) && p.length > 2) || "Unknown";
        const rollPart = parts.find(p => /^\d{2,}[A-Z]*\d*$/i.test(p)) || parts[0];
        const numberParts = parts.filter(p => /^\d+$/.test(p));

        const subjects: StudentResult["subjects"] = [];
        let total = 0;
        let arrears = 0;

        numberParts.forEach((n, idx) => {
          const num = parseInt(n);
          if (num <= 100) {
            const subName = `Subject ${idx + 1}`;
            subjectSet.add(subName);
            const fail = num < 40;
            subjects.push({ name: subName, marks: num, status: fail ? "Fail" : "Pass" });
            total += num;
            if (fail) arrears++;
          }
        });

        if (subjects.length > 0) {
          students.push({ name: namePart, rollNo: rollPart, subjects, totalMarks: total, arrearCount: arrears });
        }
      }
    }
  }

  const totalClassArrears = students.reduce((sum, s) => sum + s.arrearCount, 0);
  return { students, totalClassArrears, subjectNames: Array.from(subjectSet) };
}