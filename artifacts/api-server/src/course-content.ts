// @ts-ignore The API build intentionally imports the paid-only source from the course artifact.
import {
  modules as generatedModules,
  phaseGroups as generatedPhaseGroups,
} from "../../master-builder-platform/src/data/course-data";
import { finalExamQuestions } from "./final-exam-content-source";
import { applyUploadedModuleContent } from "./modules-content-source";

export { finalExamQuestions };
export const modules = applyUploadedModuleContent(generatedModules);
export const phaseGroups = generatedPhaseGroups.map((group) => ({
  ...group,
  modules: group.modules.map(
    (module) =>
      modules.find((candidate) => candidate.num === module.num) ?? module,
  ),
}));