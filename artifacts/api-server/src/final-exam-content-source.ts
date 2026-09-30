import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Question } from "../../master-builder-platform/src/data/course-types";

const finalExamSourceFilename =
  "final_exam_66_questions_1789166026607.txt";

function readFinalExamSource() {
  const runtimeDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(runtimeDir, "final-exam-source.txt"),
    path.resolve(process.cwd(), "attached_assets", finalExamSourceFilename),
    path.resolve(process.cwd(), "..", "attached_assets", finalExamSourceFilename),
    path.resolve(
      process.cwd(),
      "..",
      "..",
      "attached_assets",
      finalExamSourceFilename,
    ),
  ];
  const sourcePath = candidates.find((candidate) => existsSync(candidate));
  if (!sourcePath) {
    throw new Error(
      `Unable to find the uploaded final exam source: ${finalExamSourceFilename}`,
    );
  }
  return readFileSync(sourcePath, "utf8");
}

function parseFinalExamQuestions(source: string): Question[] {
  const firstQuestion = source.search(/^Q\d+ /m);
  if (firstQuestion < 0) {
    throw new Error("Missing final exam questions in the uploaded source");
  }

  const blocks = source
    .slice(firstQuestion)
    .trim()
    .split(/\n\n(?=Q\d+ )/)
    .filter(Boolean);

  const questions = blocks.map((block) => {
    const lines = block.trim().split(/\r?\n/);
    const header = lines.shift();
    const questionText = lines.shift();
    if (!header || !questionText) {
      throw new Error("Malformed final exam question block");
    }

    const optionLines = lines.filter((line) => /^\s+[A-D]\)\s/.test(line));
    if (optionLines.length !== 4) {
      throw new Error(`Malformed final exam options for ${header}`);
    }

    const correct = optionLines.findIndex((option) =>
      option.endsWith(" [CORRECT ANSWER]"),
    );
    if (correct < 0) {
      throw new Error(`Missing correct answer marker for ${header}`);
    }

    return {
      prompt: `${header.replace(/^Q\d+\s*/, "")} ${questionText}`.trim(),
      options: optionLines.map((option) =>
        option
          .replace(/^\s+[A-D]\)\s*/, "")
          .replace(/ \[CORRECT ANSWER\]$/, ""),
      ),
      correct,
    };
  });

  if (questions.length !== 66) {
    throw new Error(
      `Expected 66 final exam questions, found ${questions.length}`,
    );
  }

  return questions;
}

export const finalExamQuestions = parseFinalExamQuestions(
  readFinalExamSource(),
);