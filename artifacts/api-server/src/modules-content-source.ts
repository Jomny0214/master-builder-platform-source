import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  LessonSection,
  Module,
  QAReviewItem,
  Question,
} from "../../master-builder-platform/src/data/course-types";

const modules1To11SourceFilename =
  "modules1-11_full_content_1789134103536.txt";
const modules12To22SourceFilename =
  "modules12-22_full_content_1789135599140.txt";

function readSource(sourceFilename: string, packagedFilename: string) {
  const runtimeDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(runtimeDir, packagedFilename),
    path.resolve(process.cwd(), "attached_assets", sourceFilename),
    path.resolve(process.cwd(), "..", "attached_assets", sourceFilename),
    path.resolve(process.cwd(), "..", "..", "attached_assets", sourceFilename),
  ];
  const sourcePath = candidates.find((candidate) => existsSync(candidate));
  if (!sourcePath) {
    throw new Error(
      `Unable to find the uploaded course content source: ${sourceFilename}`,
    );
  }
  return readFileSync(sourcePath, "utf8");
}

function sectionContent(
  moduleSource: string,
  sectionNumber: number,
  nextSectionNumber: number | null,
  endMarker?: string,
) {
  const header = new RegExp(
    `^SECTION ${sectionNumber}: (.+)$`,
    "m",
  ).exec(moduleSource);
  if (!header || header.index === undefined) {
    throw new Error(
      `Missing section ${sectionNumber} in the uploaded course content`,
    );
  }
  const start = header.index + header[0].length;
  const nextHeader = nextSectionNumber
    ? new RegExp(`^SECTION ${nextSectionNumber}:`, "m").exec(
        moduleSource.slice(start),
      )
    : null;
  const end = nextHeader?.index !== undefined
    ? start + nextHeader.index
    : endMarker
      ? moduleSource.indexOf(endMarker, start)
      : moduleSource.length;
  return moduleSource
    .slice(start, end)
    .replace(/^\s*-{6,}\s*$/gm, "")
    .replace(/\n---\s*$/s, "")
    .trim();
}

function parseQuestions(moduleSource: string, moduleNumber: number) {
  const quizStart = moduleSource.indexOf(
    `MODULE ${moduleNumber} QUIZ`,
  );
  const reviewStart = moduleSource.indexOf(
    `MODULE ${moduleNumber} Q&A REVIEW`,
  );
  if (quizStart < 0 || reviewStart < 0) {
    throw new Error(
      `Missing quiz or Q&A review for Module ${moduleNumber}`,
    );
  }

  const quizSource = moduleSource.slice(quizStart, reviewStart);
  const firstQuestion = quizSource.search(/^Q\d+:/m);
  if (firstQuestion < 0) {
    throw new Error(`Missing quiz questions for Module ${moduleNumber}`);
  }
  const blocks = quizSource
    .slice(firstQuestion)
    .split(/\n\n(?=Q\d+:)/)
    .filter((block) => /^Q\d+:/.test(block.trim()));

  const questions: Question[] = blocks.map((block) => {
    const lines = block.trim().split("\n");
    const prompt = lines[0].replace(/^Q\d+:\s*/, "");
    const options = lines
      .slice(1)
      .map((line) => line.replace(/^\s+[A-D]\)\s*/, ""));
    const correct = options.findIndex((option) =>
      option.endsWith(" [CORRECT ANSWER]"),
    );
    if (correct < 0) {
      throw new Error(
        `Missing correct answer marker for ${prompt} in Module ${moduleNumber}`,
      );
    }
    return {
      prompt,
      options: options.map((option) =>
        option.replace(/ \[CORRECT ANSWER\]$/, ""),
      ),
      correct,
    };
  });

  const qaSource = moduleSource.slice(reviewStart);
  const qaReview: QAReviewItem[] = [];
  const qaPattern = /^Q\d+: (.+)\nA\d+: (.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = qaPattern.exec(qaSource))) {
    qaReview.push({ question: match[1], answer: match[2] });
  }

  return { questions, qaReview };
}

function parseModule(source: string, moduleNumber: number): {
  lessonSections: LessonSection[];
  questions: Question[];
  qaReview: QAReviewItem[];
  quizPassCount: number;
} {
  const moduleHeader = new RegExp(
    `^MODULE ${moduleNumber}: .+$`,
    "m",
  ).exec(source);
  const nextModuleHeader = new RegExp(
    `^MODULE ${moduleNumber + 1}: .+$`,
    "m",
  ).exec(source);
  if (!moduleHeader || moduleHeader.index === undefined) {
    throw new Error(`Missing Module ${moduleNumber} in uploaded course content`);
  }

  const moduleEnd = nextModuleHeader?.index ?? source.length;
  const moduleSource = source.slice(moduleHeader.index, moduleEnd);
  const lessonSections: LessonSection[] = [];
  for (let sectionNumber = 1; sectionNumber <= 5; sectionNumber += 1) {
    const header = new RegExp(
      `^SECTION ${sectionNumber}: (.+)$`,
      "m",
    ).exec(moduleSource);
    if (!header) {
      throw new Error(
        `Missing section ${sectionNumber} in Module ${moduleNumber}`,
      );
    }
    lessonSections.push({
      title: header[1],
      content: sectionContent(
        moduleSource,
        sectionNumber,
        sectionNumber < 5 ? sectionNumber + 1 : null,
        sectionNumber === 5 ? `MODULE ${moduleNumber} QUIZ` : undefined,
      ),
    });
  }

  const { questions, qaReview } = parseQuestions(
    moduleSource,
    moduleNumber,
  );
  return {
    lessonSections,
    questions,
    qaReview,
    quizPassCount: Math.ceil(questions.length * 0.75),
  };
}

export function applyUploadedModuleContent(modules: Module[]) {
  const sourceRanges = [
    {
      source: readSource(
        modules1To11SourceFilename,
        "course-content-source.txt",
      ),
      firstModule: 2,
      lastModule: 11,
    },
    {
      source: readSource(
        modules12To22SourceFilename,
        "course-content-source-12-22.txt",
      ),
      firstModule: 12,
      lastModule: 22,
    },
  ];
  const parsed = new Map(
    sourceRanges.flatMap(({ source, firstModule, lastModule }) =>
      Array.from({ length: lastModule - firstModule + 1 }, (_, index) => {
        const moduleNumber = firstModule + index;
        return [moduleNumber, parseModule(source, moduleNumber)] as const;
      }),
    ),
  );
  return modules.map((module) => {
    const content = parsed.get(module.num);
    return content ? { ...module, ...content } : module;
  });
}