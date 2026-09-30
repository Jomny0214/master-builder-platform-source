export type Phase =
  | "Site & Substructure"
  | "Structure"
  | "Envelope"
  | "MEP"
  | "Finish & Closeout";

export type Question = {
  prompt: string;
  options: string[];
  correct: number;
  rationale?: string;
};

export type LessonSection = {
  title: string;
  content: string;
};

export type QAReviewItem = {
  question: string;
  answer: string;
};

export type Module = {
  num: number;
  title: string;
  phase: Phase;
  phaseNum: string;
  summary: string;
  duration: string;
  sections: string[];
  questions: Question[];
  lessonSections?: LessonSection[];
  qaReview?: QAReviewItem[];
  quizPassCount?: number;
};

export type PhaseGroup = {
  phase: Phase;
  label: string;
  range: string;
  modules: Module[];
};

export type CourseContent = {
  modules: Module[];
  finalExamQuestions: Question[];
  phaseGroups: PhaseGroup[];
};