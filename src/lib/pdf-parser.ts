import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs`;

// Grade classification
const PASS_GRADES = new Set(["O", "A+", "A", "B+", "B", "C+", "C"]);
const ARREAR_GRADES = new Set(["U", "UA"]);
const HOLD_GRADES = new Set(["-"]);

// Anna University grade points
const GRADE_POINTS: Record<string, number> = {
  "O": 10, "A+": 9, "A": 8, "B+": 7, "B": 6, "C+": 5, "C": 4,
};

export type GradeStatus = "Pass" | "Arrear" | "Hold" | "Absent" | "Withheld";

export interface SubjectGrade {
  code: string;
  grade: string;
  status: GradeStatus;
  credits?: number;
}

export interface SemesterData {
  semester: number;
  subjects: SubjectGrade[];
  gpa?: number;
}

export interface StudentResult {
  regNo: string;
  name: string;
  semesters: SemesterData[];
  totalArrears: number;
  arrearSubjects: { code: string; semester: number; grade: string }[];
  cgpa?: number;
}

export interface ParsedResults {
  students: StudentResult[];
  institution: string;
  branch: string;
  examination: string;
  semesters: number[];
  totalClassArrears: number;
  semesterSubjects: Record<number, string[]>;
}

interface TextItem {
  text: string;
  x: number;
  y: number;
  width: number;
}

interface PageData {
  semester: number;
  subjectCodes: string[];
  subjectXPositions: number[];
  rows: { regNo: string; name: string; grades: (string | null)[] }[];
  hasHeader: boolean;
}

function classifyGrade(grade: string): GradeStatus {
  const g = grade.trim().toUpperCase();
  if (PASS_GRADES.has(g)) return "Pass";
  if (ARREAR_GRADES.has(g)) return "Arrear";
  if (HOLD_GRADES.has(g)) return "Hold";
  if (g === "W" || g === "I") return "Withheld";
  if (g === "WH1" || g.startsWith("WH")) return "Withheld";
  return "Pass";
}

export function getGradePoint(grade: string): number | null {
  return GRADE_POINTS[grade.trim().toUpperCase()] ?? null;
}

export async function extractTextFromPdf(file: File): Promise<TextItem[][]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const allPages: TextItem[][] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const items: TextItem[] = [];

    for (const item of textContent.items) {
      if ("str" in item && item.str.trim()) {
        const transform = (item as any).transform;
        items.push({
          text: item.str.trim(),
          x: Math.round(transform[4]),
          y: Math.round(transform[5]),
          width: (item as any).width || 0,
        });
      }
    }
    allPages.push(items);
  }
  return allPages;
}

function groupByRows(items: TextItem[], tolerance = 4): TextItem[][] {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: TextItem[][] = [];
  let currentRow: TextItem[] = [sorted[0]];
  let currentY = sorted[0].y;

  for (let i = 1; i < sorted.length; i++) {
    if (Math.abs(sorted[i].y - currentY) <= tolerance) {
      currentRow.push(sorted[i]);
    } else {
      rows.push(currentRow.sort((a, b) => a.x - b.x));
      currentRow = [sorted[i]];
      currentY = sorted[i].y;
    }
  }
  rows.push(currentRow.sort((a, b) => a.x - b.x));
  return rows;
}

function findSemester(items: TextItem[]): number {
  for (const item of items) {
    const match = item.text.match(/Semester\s*No\.?\s*:?\s*(\d+)/i);
    if (match) return parseInt(match[1]);
  }
  const rows = groupByRows(items);
  for (const row of rows) {
    const text = row.map(i => i.text).join(" ");
    const match = text.match(/Semester\s*No\.?\s*:?\s*(\d+)/i);
    if (match) return parseInt(match[1]);
  }
  return 0;
}

function findInstitution(items: TextItem[]): string {
  for (const item of items) {
    const match = item.text.match(/Inst\.?Code\/Name\s*:?\s*\d+\s*-\s*(.*)/i);
    if (match) return match[1].trim();
  }
  const rows = groupByRows(items);
  for (const row of rows) {
    const text = row.map(i => i.text).join(" ");
    const match = text.match(/Inst\.?Code\/Name\s*:?\s*\d+\s*-\s*(.*)/i);
    if (match) return match[1].trim();
  }
  return "";
}

function findBranch(items: TextItem[]): string {
  for (const item of items) {
    const match = item.text.match(/Branch\s*:?\s*\d+-?(.*)/i);
    if (match) return match[1].trim();
  }
  const rows = groupByRows(items);
  for (const row of rows) {
    const text = row.map(i => i.text).join(" ");
    const match = text.match(/Branch\s*:?\s*\d+-?(.*)/i);
    if (match) return match[1].trim();
  }
  return "";
}

function findExamination(items: TextItem[]): string {
  for (const item of items) {
    const match = item.text.match(/Provisional Results of (.*)/i);
    if (match) return match[1].replace(/\.\s*$/, "").replace(/Page\s*\d+\/\d+/i, "").trim();
  }
  return "";
}

function isGrade(text: string): boolean {
  const g = text.trim().toUpperCase();
  return PASS_GRADES.has(g) || ARREAR_GRADES.has(g) || HOLD_GRADES.has(g);
}

const REG_NO_PATTERN = /^7\d{11}$/;

function parsePage(items: TextItem[]): PageData {
  const semester = findSemester(items);
  const rows = groupByRows(items);

  // Find subject code header rows
  let subjectCodeRowIdx = -1;
  let subjectCodeRow2Idx = -1;

  for (let i = 0; i < rows.length; i++) {
    const rowText = rows[i].map(t => t.text).join(" ");
    if (/Subject\s*Code/i.test(rowText)) {
      subjectCodeRowIdx = i;
      if (i + 1 < rows.length) {
        const nextRowText = rows[i + 1].map(t => t.text).join(" ");
        if (/^[A-Z0-9]{2,6}(\s+[A-Z0-9]{2,6})*$/i.test(nextRowText) && !/Reg|Stud|Name/i.test(nextRowText)) {
          subjectCodeRow2Idx = i + 1;
        }
      }
      break;
    }
  }

  // Find header row (Reg. Number / Stud. Name / Grade)
  let headerRowIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const rowText = rows[i].map(t => t.text).join(" ");
    if (/Reg\.?\s*Number/i.test(rowText) && /Stud\.?\s*Name|Name/i.test(rowText)) {
      headerRowIdx = i;
      break;
    }
  }

  const hasHeader = subjectCodeRowIdx >= 0 || headerRowIdx >= 0;

  if (!hasHeader) {
    // Continuation page — parse data rows directly
    return parseContinuationPage(items, rows, semester);
  }

  // Extract subject codes
  const subjectCodes: string[] = [];
  const subjectXPositions: number[] = [];

  if (subjectCodeRowIdx >= 0) {
    const codeRow = rows[subjectCodeRowIdx];
    const codeRow2 = subjectCodeRow2Idx >= 0 ? rows[subjectCodeRow2Idx] : null;

    const codeItems = codeRow.filter(item => !/Subject|Code|->|-\s*>/i.test(item.text));

    if (codeRow2) {
      const row2Items = codeRow2.filter(item => !/Grade|Grad/i.test(item.text));
      // Match by closest X position
      for (const topItem of codeItems) {
        // Find the closest row2 item
        let bestMatch: TextItem | null = null;
        let bestDist = Infinity;
        for (const botItem of row2Items) {
          const dist = Math.abs(topItem.x - botItem.x);
          if (dist < bestDist && dist < 40) {
            bestDist = dist;
            bestMatch = botItem;
          }
        }
        const fullCode = bestMatch ? topItem.text + bestMatch.text : topItem.text;
        subjectCodes.push(fullCode);
        subjectXPositions.push(topItem.x);
      }
    } else {
      for (const item of codeItems) {
        subjectCodes.push(item.text);
        subjectXPositions.push(item.x);
      }
    }
  }

  // Find "Grade" row to refine column positions
  let gradeRowIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const gradeItems = rows[i].filter(t => /^Grad[e]?$/i.test(t.text));
    if (gradeItems.length >= 3) {
      gradeRowIdx = i;
      // If we have subject codes but want to refine positions using grade columns
      if (subjectXPositions.length === 0) {
        gradeItems.forEach(g => subjectXPositions.push(g.x));
      }
      break;
    }
  }

  // Parse data rows
  const dataStartIdx = Math.max(headerRowIdx, gradeRowIdx, subjectCodeRow2Idx >= 0 ? subjectCodeRow2Idx : subjectCodeRowIdx) + 1;
  let actualStart = dataStartIdx;
  for (let i = dataStartIdx; i < rows.length; i++) {
    const rowText = rows[i].map(t => t.text).join("");
    if (/^e+$/.test(rowText.replace(/\s/g, ""))) {
      actualStart = i + 1;
      continue;
    }
    break;
  }

  const dataRows = parseDataRows(rows, actualStart, subjectXPositions, subjectCodes.length);

  return { semester, subjectCodes, subjectXPositions, rows: dataRows, hasHeader: true };
}

function parseContinuationPage(items: TextItem[], rows: TextItem[][], semester: number): PageData {
  const dataRows: PageData["rows"] = [];
  const gradeXPositions: number[] = [];

  // First pass: collect all grade X positions
  for (const row of rows) {
    const regItem = row.find(item => REG_NO_PATTERN.test(item.text));
    if (!regItem) continue;

    for (const item of row) {
      if (item.x > regItem.x + 100 && isGrade(item.text)) {
        if (!gradeXPositions.some(x => Math.abs(x - item.x) < 15)) {
          gradeXPositions.push(item.x);
        }
      }
    }
  }

  gradeXPositions.sort((a, b) => a - b);

  // Second pass: parse rows
  for (const row of rows) {
    const rowText = row.map(t => t.text).join(" ");
    if (/W\s*-\s*Withdrawal|WH1|Withheld|Anna University|Inadequate/i.test(rowText)) continue;
    if (/Page\s*\d/i.test(rowText)) continue;

    const regItem = row.find(item => REG_NO_PATTERN.test(item.text));
    if (!regItem) continue;

    // Name: non-grade items after reg number but before grade columns
    const firstGradeX = gradeXPositions.length > 0 ? gradeXPositions[0] - 10 : Infinity;
    const nameItems = row.filter(item =>
      item !== regItem &&
      item.x > regItem.x &&
      item.x < firstGradeX &&
      !isGrade(item.text) &&
      !/^\d+$/.test(item.text) &&
      item.text.length > 1
    );
    const name = nameItems.map(n => n.text).join(" ") || "Unknown";

    const grades: (string | null)[] = new Array(gradeXPositions.length).fill(null);
    for (const item of row) {
      if (isGrade(item.text) && item.x > regItem.x + 100) {
        const colIdx = gradeXPositions.findIndex(x => Math.abs(x - item.x) < 20);
        if (colIdx >= 0) grades[colIdx] = item.text;
      }
    }

    dataRows.push({ regNo: regItem.text, name, grades });
  }

  return {
    semester,
    // Will be replaced by inherited codes from previous header page
    subjectCodes: gradeXPositions.map((_, i) => `Sub${i + 1}`),
    subjectXPositions: gradeXPositions,
    rows: dataRows,
    hasHeader: false,
  };
}

function parseDataRows(
  rows: TextItem[][],
  startIdx: number,
  xPositions: number[],
  numSubjects: number
): PageData["rows"] {
  const dataRows: PageData["rows"] = [];

  for (let i = startIdx; i < rows.length; i++) {
    const row = rows[i];
    const rowText = row.map(t => t.text).join(" ");

    if (/W\s*-\s*Withdrawal|WH1|Withheld|Anna University|Inadequate/i.test(rowText)) break;
    if (/Page\s*\d/i.test(rowText)) continue;

    const regItem = row.find(item => REG_NO_PATTERN.test(item.text));
    if (!regItem) continue;

    // Name items: between reg number and first subject column
    const nameEndX = xPositions.length > 0 ? xPositions[0] - 10 : Infinity;
    const nameItems = row.filter(item => {
      if (item === regItem) return false;
      return item.x > regItem.x && item.x < nameEndX && !isGrade(item.text) && !/^(Grade|Grad|e)$/i.test(item.text);
    });
    const name = nameItems.map(n => n.text).join(" ") || "Unknown";

    const grades: (string | null)[] = new Array(numSubjects || xPositions.length).fill(null);
    const gradeItems = row.filter(item => isGrade(item.text) && item !== regItem);

    for (const gi of gradeItems) {
      let bestCol = -1;
      let bestDist = Infinity;
      for (let c = 0; c < xPositions.length; c++) {
        const dist = Math.abs(gi.x - xPositions[c]);
        if (dist < bestDist && dist < 30) {
          bestDist = dist;
          bestCol = c;
        }
      }
      if (bestCol >= 0 && bestCol < grades.length) {
        grades[bestCol] = gi.text;
      }
    }

    dataRows.push({ regNo: regItem.text, name, grades });
  }

  return dataRows;
}

export function parseStudentResults(pages: TextItem[][]): ParsedResults {
  let institution = "";
  let branch = "";
  let examination = "";

  const pageDataList: PageData[] = [];
  let lastKnownSemester = 0;

  for (const pageItems of pages) {
    if (!institution) institution = findInstitution(pageItems);
    if (!branch) branch = findBranch(pageItems);
    if (!examination) examination = findExamination(pageItems);

    const sem = findSemester(pageItems);
    if (sem > 0) lastKnownSemester = sem;

    const pageData = parsePage(pageItems);
    if (pageData.semester === 0) pageData.semester = lastKnownSemester;
    if (pageData.rows.length > 0) {
      pageDataList.push(pageData);
    }
  }

  // Fix continuation pages: inherit subject codes from previous header page of same semester
  for (let i = 0; i < pageDataList.length; i++) {
    const pd = pageDataList[i];
    if (!pd.hasHeader) {
      // Find the most recent header page for the same semester
      for (let j = i - 1; j >= 0; j--) {
        if (pageDataList[j].semester === pd.semester && pageDataList[j].hasHeader && pageDataList[j].subjectCodes.length > 0) {
          const headerCodes = pageDataList[j].subjectCodes;
          // Map continuation columns to header codes by count
          // The continuation page should have the same number of columns
          if (pd.subjectCodes.length <= headerCodes.length) {
            pd.subjectCodes = headerCodes.slice(0, pd.subjectCodes.length);
          } else {
            pd.subjectCodes = [...headerCodes];
          }
          break;
        }
      }
    }
  }

  // Merge students across pages
  const studentMap = new Map<string, StudentResult>();
  const semesterSubjects: Record<number, string[]> = {};
  const semesterSet = new Set<number>();

  for (const pd of pageDataList) {
    if (pd.semester > 0) {
      semesterSet.add(pd.semester);
      if (!semesterSubjects[pd.semester] || pd.hasHeader) {
        if (!semesterSubjects[pd.semester] || pd.subjectCodes.length > semesterSubjects[pd.semester].length) {
          semesterSubjects[pd.semester] = pd.subjectCodes;
        }
      }
    }

    for (const row of pd.rows) {
      if (!studentMap.has(row.regNo)) {
        studentMap.set(row.regNo, {
          regNo: row.regNo,
          name: row.name,
          semesters: [],
          totalArrears: 0,
          arrearSubjects: [],
        });
      }

      const student = studentMap.get(row.regNo)!;
      if (row.name !== "Unknown" && student.name === "Unknown") {
        student.name = row.name;
      }

      let existingSem = student.semesters.find(s => s.semester === pd.semester);
      if (!existingSem) {
        existingSem = { semester: pd.semester, subjects: [] };
        student.semesters.push(existingSem);
      }

      for (let j = 0; j < row.grades.length; j++) {
        const grade = row.grades[j];
        if (grade === null) continue;
        const code = j < pd.subjectCodes.length ? pd.subjectCodes[j] : `Sub${j + 1}`;
        const status = classifyGrade(grade);

        const existingSubj = existingSem.subjects.find(s => s.code === code);
        if (!existingSubj) {
          existingSem.subjects.push({ code, grade, status });
        }
      }
    }
  }

  // Calculate arrears and GPA/CGPA
  for (const student of studentMap.values()) {
    student.semesters.sort((a, b) => a.semester - b.semester);
    student.arrearSubjects = [];
    student.totalArrears = 0;

    let totalGradePoints = 0;
    let totalSubjects = 0;

    for (const sem of student.semesters) {
      for (const subj of sem.subjects) {
        if (subj.status === "Arrear") {
          student.totalArrears++;
          student.arrearSubjects.push({
            code: subj.code,
            semester: sem.semester,
            grade: subj.grade,
          });
        }
      }

      // Calculate GPA for this semester (only if all subjects are pass)
      const semPassSubjects = sem.subjects.filter(s => s.status === "Pass");
      if (semPassSubjects.length === sem.subjects.length && sem.subjects.length > 0) {
        let semPoints = 0;
        let semCount = 0;
        for (const subj of sem.subjects) {
          const gp = getGradePoint(subj.grade);
          if (gp !== null) {
            semPoints += gp;
            semCount++;
          }
        }
        if (semCount > 0) {
          sem.gpa = parseFloat((semPoints / semCount).toFixed(2));
          totalGradePoints += semPoints;
          totalSubjects += semCount;
        }
      }
    }

    // CGPA only for all-clear students
    if (student.totalArrears === 0 && totalSubjects > 0) {
      student.cgpa = parseFloat((totalGradePoints / totalSubjects).toFixed(2));
    }
  }

  const students = Array.from(studentMap.values()).sort((a, b) => a.regNo.localeCompare(b.regNo));
  const totalClassArrears = students.reduce((sum, s) => sum + s.totalArrears, 0);
  const semesters = Array.from(semesterSet).sort((a, b) => a - b);

  return {
    students,
    institution,
    branch,
    examination,
    semesters,
    totalClassArrears,
    semesterSubjects,
  };
}
