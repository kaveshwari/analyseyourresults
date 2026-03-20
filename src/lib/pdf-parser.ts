import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs`;

// Grade classification
const PASS_GRADES = new Set(["O", "A+", "A", "B+", "B", "C+", "C"]);
const ARREAR_GRADES = new Set(["U", "UA"]);
const HOLD_GRADES = new Set(["-"]);

export type GradeStatus = "Pass" | "Arrear" | "Hold" | "Absent" | "Withheld";

export interface SubjectGrade {
  code: string;
  grade: string;
  status: GradeStatus;
}

export interface SemesterData {
  semester: number;
  subjects: SubjectGrade[];
}

export interface StudentResult {
  regNo: string;
  name: string;
  semesters: SemesterData[];
  totalArrears: number;
  arrearSubjects: { code: string; semester: number; grade: string }[];
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
  items: TextItem[];
  semester: number;
  subjectCodes: string[];
  subjectXPositions: number[];
  rows: { regNo: string; name: string; grades: (string | null)[] }[];
}

function classifyGrade(grade: string): GradeStatus {
  const g = grade.trim().toUpperCase();
  if (PASS_GRADES.has(g)) return "Pass";
  if (ARREAR_GRADES.has(g)) return "Arrear";
  if (HOLD_GRADES.has(g)) return "Hold";
  if (g === "W" || g === "I") return "Withheld";
  if (g === "WH1" || g.startsWith("WH")) return "Withheld";
  return "Pass"; // fallback for unknown grades
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
  // Check across adjacent items
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
    if (match) return match[1].replace(/\.\s*$/, "").trim();
  }
  return "";
}

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
      // Check if next row is a continuation (partial codes like C01, C03)
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

  if (subjectCodeRowIdx === -1 && headerRowIdx === -1) {
    // This might be a continuation page (page 2, 6) without headers
    // Try to detect data rows directly
    return parseContinuationPage(items, rows, semester);
  }

  // Extract subject codes
  const subjectCodes: string[] = [];
  const subjectXPositions: number[] = [];

  if (subjectCodeRowIdx >= 0) {
    const codeRow = rows[subjectCodeRowIdx];
    const codeRow2 = subjectCodeRow2Idx >= 0 ? rows[subjectCodeRow2Idx] : null;

    // Skip "Subject Code ->" label items
    const codeItems = codeRow.filter(item => !/Subject|Code|->|-\s*>/i.test(item.text));

    if (codeRow2) {
      // Two-row subject codes: merge by X position
      const row2Items = codeRow2.filter(item => !/Grade|Grad/i.test(item.text));
      for (let ci = 0; ci < codeItems.length && ci < row2Items.length; ci++) {
        const fullCode = codeItems[ci].text + row2Items[ci].text;
        subjectCodes.push(fullCode);
        subjectXPositions.push(codeItems[ci].x);
      }
    } else {
      for (const item of codeItems) {
        subjectCodes.push(item.text);
        subjectXPositions.push(item.x);
      }
    }
  }

  // Find "Grade" row to get column positions if subject positions aren't clear
  let gradeRowIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const gradeItems = rows[i].filter(t => /^Grade?$/i.test(t.text));
    if (gradeItems.length >= 3) {
      gradeRowIdx = i;
      if (subjectXPositions.length === 0) {
        // Use grade positions as column positions
        gradeItems.forEach(g => subjectXPositions.push(g.x));
      }
      break;
    }
  }

  // Parse data rows (rows after header containing reg numbers)
  const dataStartIdx = Math.max(headerRowIdx, gradeRowIdx, subjectCodeRow2Idx >= 0 ? subjectCodeRow2Idx : subjectCodeRowIdx) + 1;
  // Skip any "e" row (the dots row in page 1)
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

  return { items, semester, subjectCodes, subjectXPositions, rows: dataRows };
}

function parseContinuationPage(items: TextItem[], rows: TextItem[][], semester: number): PageData {
  // Continuation page - no header, just data rows
  // Need to detect column positions from the data itself
  const dataRows: PageData["rows"] = [];
  const regNoPattern = /^7\d{11}$/;

  // Collect all items from data rows to detect column positions
  const gradeXPositions: number[] = [];

  for (const row of rows) {
    const regItem = row.find(item => regNoPattern.test(item.text));
    if (!regItem) continue;

    // Find name (text item right after reg number, non-grade)
    const nameItems = row.filter(item =>
      item.x > regItem.x &&
      !PASS_GRADES.has(item.text.toUpperCase()) &&
      !ARREAR_GRADES.has(item.text.toUpperCase()) &&
      !HOLD_GRADES.has(item.text) &&
      !/^\d+$/.test(item.text) &&
      item.text.length > 1
    );
    const name = nameItems.length > 0 ? nameItems[0].text : "Unknown";

    // Grade items: everything after name that is a valid grade
    const gradeItems = row.filter(item => {
      const g = item.text.toUpperCase();
      return item.x > (nameItems[0]?.x || regItem.x + 100) &&
        (PASS_GRADES.has(g) || ARREAR_GRADES.has(g) || HOLD_GRADES.has(g));
    });

    gradeItems.forEach(g => {
      if (!gradeXPositions.some(x => Math.abs(x - g.x) < 15)) {
        gradeXPositions.push(g.x);
      }
    });
  }

  gradeXPositions.sort((a, b) => a - b);

  // Now parse rows with these positions
  for (const row of rows) {
    const regItem = row.find(item => regNoPattern.test(item.text));
    if (!regItem) continue;

    const nameItems = row.filter(item =>
      item.x > regItem.x &&
      !PASS_GRADES.has(item.text.toUpperCase()) &&
      !ARREAR_GRADES.has(item.text.toUpperCase()) &&
      !HOLD_GRADES.has(item.text) &&
      !/^\d+$/.test(item.text) &&
      item.text.length > 1
    );
    const name = nameItems.length > 0 ? nameItems[0].text : "Unknown";

    const grades: (string | null)[] = new Array(gradeXPositions.length).fill(null);
    const gradeItems = row.filter(item => {
      const g = item.text.toUpperCase();
      return item.x > (nameItems[0]?.x || regItem.x + 100) + 20 &&
        (PASS_GRADES.has(g) || ARREAR_GRADES.has(g) || HOLD_GRADES.has(g));
    });

    for (const gi of gradeItems) {
      const colIdx = gradeXPositions.findIndex(x => Math.abs(x - gi.x) < 20);
      if (colIdx >= 0) grades[colIdx] = gi.text;
    }

    dataRows.push({ regNo: regItem.text, name, grades });
  }

  return {
    items,
    semester,
    subjectCodes: gradeXPositions.map((_, i) => `Sub${i + 1}`),
    subjectXPositions: gradeXPositions,
    rows: dataRows,
  };
}

function parseDataRows(
  rows: TextItem[][],
  startIdx: number,
  xPositions: number[],
  numSubjects: number
): PageData["rows"] {
  const dataRows: PageData["rows"] = [];
  const regNoPattern = /^7\d{11}$/;

  for (let i = startIdx; i < rows.length; i++) {
    const row = rows[i];
    const rowText = row.map(t => t.text).join(" ");

    // Skip footer lines
    if (/W\s*-\s*Withdrawal|WH1|Withheld|Anna University|Inadequate/i.test(rowText)) break;
    if (/Page\s*\d/i.test(rowText)) continue;

    const regItem = row.find(item => regNoPattern.test(item.text));
    if (!regItem) continue;

    // Find name - items after reg number that aren't grades
    const nameItems = row.filter(item => {
      if (item === regItem) return false;
      const g = item.text.toUpperCase();
      return item.x > regItem.x &&
        !PASS_GRADES.has(g) && !ARREAR_GRADES.has(g) && !HOLD_GRADES.has(g) &&
        !/^(Grade|e)$/i.test(item.text);
    });

    // Name is typically the first non-grade item(s) after reg number
    let name = "";
    const nameEndX = xPositions.length > 0 ? xPositions[0] - 10 : Infinity;
    for (const ni of nameItems) {
      if (ni.x < nameEndX || xPositions.length === 0) {
        name += (name ? " " : "") + ni.text;
      }
    }
    if (!name) name = "Unknown";

    // Extract grades by matching to column positions
    const grades: (string | null)[] = new Array(numSubjects || xPositions.length).fill(null);
    const gradeItems = row.filter(item => {
      const g = item.text.toUpperCase();
      return (PASS_GRADES.has(g) || ARREAR_GRADES.has(g) || HOLD_GRADES.has(g)) &&
        item !== regItem;
    });

    for (const gi of gradeItems) {
      // Find closest column
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

  // Parse each page
  const pageDataList: PageData[] = [];
  let lastKnownSemester = 0;

  for (const pageItems of pages) {
    // Extract metadata from first page that has it
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

  // Merge students across pages
  const studentMap = new Map<string, StudentResult>();
  const semesterSubjects: Record<number, string[]> = {};
  const semesterSet = new Set<number>();

  for (const pd of pageDataList) {
    if (pd.semester > 0) {
      semesterSet.add(pd.semester);
      if (!semesterSubjects[pd.semester]) {
        semesterSubjects[pd.semester] = pd.subjectCodes;
      } else if (pd.subjectCodes.length > semesterSubjects[pd.semester].length) {
        semesterSubjects[pd.semester] = pd.subjectCodes;
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
      // Update name if we have a better one
      if (row.name !== "Unknown" && student.name === "Unknown") {
        student.name = row.name;
      }

      // Check if we already have this semester for this student
      let existingSem = student.semesters.find(s => s.semester === pd.semester);
      if (!existingSem) {
        existingSem = { semester: pd.semester, subjects: [] };
        student.semesters.push(existingSem);
      }

      // Add subject grades
      for (let j = 0; j < row.grades.length; j++) {
        const grade = row.grades[j];
        if (grade === null) continue;
        const code = j < pd.subjectCodes.length ? pd.subjectCodes[j] : `Sub${j + 1}`;
        const status = classifyGrade(grade);

        // Check if subject already exists
        const existingSubj = existingSem.subjects.find(s => s.code === code);
        if (!existingSubj) {
          existingSem.subjects.push({ code, grade, status });
        }
      }
    }
  }

  // Calculate arrears for each student
  for (const student of studentMap.values()) {
    student.semesters.sort((a, b) => a.semester - b.semester);
    student.arrearSubjects = [];
    student.totalArrears = 0;

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
