import {
  module1LessonSections,
  module1Questions,
  module1QAReview,
} from "./module1-content";
import type { Module, Phase, Question } from "./course-types";

export type { Module, Phase, Question } from "./course-types";

const concepts: Record<number, [string, string, string]> = {
  1: ['bearing capacity', 'compaction lifts', 'settlement risk'],
  2: ['soil classification', 'Atterberg limits', 'geotechnical reports'],
  3: ['temporary shoring', 'groundwater control', 'excavation safety'],
  4: ['spread footings', 'punching shear', 'slab-on-grade design'],
  5: ['pile load transfer', 'drilled caissons', 'integrity testing'],
  6: ['mix proportions', 'hydration and curing', 'placement sequencing'],
  7: ['rebar development', 'formwork pressure', 'cover and tolerances'],
  8: ['load paths in wood', 'shear walls', 'moisture protection'],
  9: ['erection stability', 'temporary bracing', 'steel tolerances'],
  10: ['connection design', 'load path continuity', 'field inspection'],
  11: ['mortar compatibility', 'reinforced masonry', 'grouting sequence'],
  12: ['roof drainage', 'flashing continuity', 'membrane selection'],
  13: ['water planes', 'air leakage control', 'substrate preparation'],
  14: ['rough openings', 'air barriers', 'flashing transitions'],
  15: ['thermal bridges', 'vapor control', 'continuous insulation'],
  16: ['service sizing', 'rough-in coordination', 'grounding and bonding'],
  17: ['DWV slope', 'venting', 'pressure testing'],
  18: ['load calculations', 'duct distribution', 'commissioning'],
  19: ['hazard classification', 'sprinkler spacing', 'system testing'],
  20: ['board layout', 'finish levels', 'trim tolerances'],
  21: ['substrate moisture', 'movement joints', 'floor transitions'],
  22: ['punch list control', 'systems commissioning', 'handover records'],
};

const titles = [
  'Site Preparation & Earthwork',
  'Soil Mechanics & Geotechnical Investigation',
  'Excavation, Shoring & Dewatering',
  'Foundations — Shallow (Footings, Slabs)',
  'Foundations — Deep (Piles, Caissons)',
  'Concrete — Mix Design & Placement',
  'Concrete — Reinforcement & Formwork',
  'Wood Framing Systems',
  'Structural Steel Erection',
  'Structural Connections & Load Paths',
  'Masonry & Structural Block',
  'Roofing Systems',
  'Waterproofing & Building Envelope',
  'Windows, Doors & Air Barriers',
  'Insulation & Thermal Design',
  'Electrical Rough-in & Service',
  'Plumbing Rough-in & DWV',
  'HVAC Systems',
  'Fire Protection Systems',
  'Drywall, Framing Finishes & Trim',
  'Flooring Systems',
  'Punch List, Commissioning & Handover',
];

const summaries = [
  'Control the ground before the ground controls your schedule.',
  'Read the soil profile like a set of structural drawings.',
  'Make a safe hole: support the cut, manage water, protect the edge.',
  'Turn vertical loads into a foundation that the soil can actually carry.',
  'Follow the load below the zone of influence and into competent strata.',
  'Concrete is a timed chemical process, not a bag of grey material.',
  'Keep the cage in position and the formwork honest under pressure.',
  'Build a continuous load path from roof diaphragm to foundation.',
  'Steel frames are most vulnerable before they become a frame.',
  'A structure is only as reliable as the details that connect it.',
  'Let units, mortar, reinforcement and water work as one assembly.',
  'Keep weather out with slope, laps and an unbroken drainage plane.',
  'Manage water twice: once at the surface, once in the assembly.',
  'Every opening is a deliberate interruption in the wall’s defense.',
  'Move heat where you want it; stop it where you do not.',
  'Coordinate power, pathways and protection before the walls close.',
  'Water should drain by gravity, and air should move only by design.',
  'Size the system for the load, then prove it works in the building.',
  'Protect people with a system that is classified, tested and maintained.',
  'The last ten percent of finish work is where quality becomes visible.',
  'A floor is an assembly: substrate, movement, wear layer and edge.',
  'Close the loop from installed work to evidence that the building performs.',
];

const phaseFor = (num: number): Phase => num <= 7 ? 'Site & Substructure' : num <= 11 ? 'Structure' : num <= 15 ? 'Envelope' : num <= 19 ? 'MEP' : 'Finish & Closeout';
const phaseNumFor = (num: number) => num <= 7 ? 'PHASE 01' : num <= 11 ? 'PHASE 02' : num <= 15 ? 'PHASE 03' : num <= 19 ? 'PHASE 04' : 'PHASE 05';

function makeQuestions(num: number): Question[] {
  const [a, b, c] = concepts[num];
  return [
    {
      prompt: `Which principle is the first checkpoint when evaluating ${a}?`,
      options: [
        `Verify the controlling condition with project-specific information before selecting a detail.`,
        'Use the fastest installation method regardless of the surrounding assembly.',
        'Assume the most favorable field condition until an inspector asks for more.',
        'Wait until closeout to document the decision so the record stays concise.',
      ],
      correct: 0,
      rationale: `The field decision should start with the controlling condition: design intent, site data and the required standard.`,
    },
    {
      prompt: `Why does ${b} deserve a dedicated inspection hold point?`,
      options: [
        'It is mostly cosmetic and is easy to correct after finishes are installed.',
        'It changes the performance of the complete assembly and becomes difficult to see later.',
        'It removes the need for coordination with adjacent trades.',
        'It allows the schedule to proceed without approved submittals.',
      ],
      correct: 1,
      rationale: `Hidden work needs a deliberate hold point because the assembly cannot be verified once it is covered.`,
    },
    {
      prompt: `What is the best project-management response to a field condition involving ${c}?`,
      options: [
        'Record the condition, identify the affected scope, and route it to the responsible designer or authority.',
        'Change the detail in the field and omit the change from the record set.',
        'Keep installing and resolve the discrepancy in the next project meeting.',
        'Accept the subcontractor’s verbal assurance without a marked-up record.',
      ],
      correct: 0,
      rationale: `A traceable decision protects the work, the schedule and everyone who relies on the final record.`,
    },
    {
      prompt: `Which statement best describes professional construction control in this module?`,
      options: [
        'Speed is the only reliable measure of a successful installation.',
        'A code minimum is always the same as a project requirement.',
        'Quality is repeatable when requirements, sequence and evidence are explicit.',
        'A finished surface can hide any issue in the underlying assembly.',
      ],
      correct: 2,
      rationale: `Good builders make the intended result repeatable through clear requirements, sequencing and evidence.`,
    },
  ];
}

export const modules: Module[] = titles.map((title, index) => {
  const num = index + 1;
  const [a, b, c] = concepts[num];
  return {
    num,
    title,
    phase: phaseFor(num),
    phaseNum: phaseNumFor(num),
    summary: summaries[index],
    duration: `${38 + (num % 5) * 7} min`,
    sections: num === 1
      ? module1LessonSections.map((section) => section.title)
      : [
          `Core principles & field theory: ${a}`,
          `Planning, preparation & site coordination: ${a}`,
          `Specifications, tolerances & sequencing: ${b}`,
          `Inspection, documentation & failure modes: ${c}`,
          `Field application, handoff & closeout: ${c}`,
        ],
    questions: num === 1 ? module1Questions : makeQuestions(num),
    ...(num === 1
      ? {
          lessonSections: module1LessonSections,
          qaReview: module1QAReview,
          quizPassCount: 8,
        }
      : {}),
  };
});

export const finalExamQuestions: Question[] = [
  {
    prompt: 'Module 1 — A proof roll reveals pumping soil in the planned driveway. What should happen first?',
    options: ['Add the finish gravel immediately', 'Remove or stabilize the weak material before placing structural fill', 'Compact a thicker lift over it', 'Redirect roof runoff after paving'],
    correct: 1,
    rationale: 'Pumping indicates unstable or wet subgrade. The weak condition must be corrected before additional fill can perform reliably.',
  },
  {
    prompt: 'Module 2 — Which investigation best confirms whether highly plastic clay may shrink and swell?',
    options: ['Atterberg-limit testing', 'Concrete slump testing', 'A roof uplift calculation', 'A plumbing pressure test'],
    correct: 0,
    rationale: 'Atterberg limits describe soil plasticity and help identify clay with significant volume-change potential.',
  },
  {
    prompt: 'Module 3 — Water is entering an excavation and carrying soil particles with it. What is the safest response?',
    options: ['Send workers in to place stone by hand', 'Increase excavation depth to create a sump', 'Stop work and have the dewatering and shoring approach reassessed', 'Cover the inflow with concrete'],
    correct: 2,
    rationale: 'Soil migration can undermine the excavation and support system. Work should stop until the condition is safely controlled.',
  },
  {
    prompt: 'Module 4 — A column load is concentrated near the center of a thin footing. Which failure requires particular attention?',
    options: ['Roof membrane blistering', 'Window-frame racking', 'Duct condensation', 'Punching shear through the footing'],
    correct: 3,
    rationale: 'A concentrated column reaction can punch through an inadequately thick or reinforced footing.',
  },
  {
    prompt: 'Module 5 — What field record most directly verifies that a driven pile reached its intended resistance?',
    options: ['Paint thickness readings', 'Driving logs showing depth and blow counts', 'A drywall finish schedule', 'Concrete-cylinder curing temperature'],
    correct: 1,
    rationale: 'Pile driving records document penetration and resistance data used to assess whether the installation meets its criteria.',
  },
  {
    prompt: 'Module 6 — Fresh concrete arrives with a slump below specification. What should the crew do?',
    options: ['Add water until placement becomes easy', 'Reject every load without testing', 'Follow the approved adjustment and testing procedure before placement', 'Place it and increase curing time later'],
    correct: 2,
    rationale: 'Field adjustment must follow the approved mix and testing procedure; uncontrolled water can reduce strength and durability.',
  },
  {
    prompt: 'Module 7 — Why are rebar chairs and spacers important before a concrete pour?',
    options: ['They maintain specified reinforcement position and concrete cover', 'They eliminate the need for bar laps', 'They increase concrete slump', 'They prevent all formwork movement'],
    correct: 0,
    rationale: 'Supports keep reinforcement at the designed elevation and preserve the cover needed for structural performance and durability.',
  },
  {
    prompt: 'Module 8 — What provides the most reliable continuous lateral load path in a wood-framed building?',
    options: ['Finish flooring connected to baseboards', 'Cabinets fastened to interior partitions', 'Insulation fitted tightly between studs', 'Properly connected diaphragms, shear walls, hold-downs, and foundations'],
    correct: 3,
    rationale: 'Lateral loads must pass through designed structural elements and their connections all the way to the foundation.',
  },
  {
    prompt: 'Module 9 — When is a partially erected steel frame typically most vulnerable?',
    options: ['After all permanent bracing and decks are complete', 'During erection before the permanent stability system is complete', 'After interior painting', 'During final cleaning'],
    correct: 1,
    rationale: 'Temporary erection stages may lack the stiffness and restraint of the completed structural system.',
  },
  {
    prompt: 'Module 10 — A bolted connection has slotted holes. What must the inspector verify?',
    options: ['Only the color of the bolts', 'That every slot is filled with sealant', 'Bolt type, orientation, washers, installation method, and approved slot use', 'That the connection is hidden by finishes'],
    correct: 2,
    rationale: 'Slotted-hole connections depend on the specified bolt assembly, washer placement, orientation, and design intent.',
  },
  {
    prompt: 'Module 11 — Why must reinforced masonry grout lifts follow the specified sequence and height limits?',
    options: ['To achieve consolidation without displacing units or reinforcement', 'To make mortar joints dry faster', 'To eliminate cleanouts in every condition', 'To avoid inspecting reinforcement'],
    correct: 0,
    rationale: 'Controlled grout placement and consolidation help fill cells fully while protecting wall alignment and reinforcement position.',
  },
  {
    prompt: 'Module 12 — Which roof detail best follows drainage-plane principles?',
    options: ['Lower flashing lapped over upper underlayment', 'Fasteners placed in every valley', 'A level cricket behind a wide chimney', 'Upper materials lapped over lower materials so water sheds outward'],
    correct: 3,
    rationale: 'Weather-resistive layers should be integrated shingle-fashion so gravity directs water to the exterior.',
  },
  {
    prompt: 'Module 13 — A below-grade wall will receive waterproofing. What condition is essential before application?',
    options: ['The backfill must already be complete', 'The substrate must be sound, prepared, and within the product’s moisture limits', 'Interior paint must be finished', 'The drainage mat must be omitted'],
    correct: 1,
    rationale: 'Waterproofing adhesion and continuity depend on proper substrate condition and manufacturer-approved application limits.',
  },
  {
    prompt: 'Module 14 — What is the best way to manage water at the sill of a window opening?',
    options: ['Rely only on perimeter sealant', 'Slope the sill toward the interior', 'Install a drained sill pan integrated with the wall’s water-resistive barrier', 'Block drainage paths with expanding foam'],
    correct: 2,
    rationale: 'A sloped, drained sill pan provides a second line of defense and directs incidental water back outside.',
  },
  {
    prompt: 'Module 15 — Why is continuous exterior insulation useful at wall framing?',
    options: ['It reduces thermal bridging through studs and framing members', 'It replaces every required water-control layer', 'It guarantees the absence of condensation in all climates', 'It increases air leakage for drying'],
    correct: 0,
    rationale: 'Continuous insulation covers conductive framing paths and improves the wall assembly’s effective thermal performance.',
  },
  {
    prompt: 'Module 16 — Before walls close, what coordination check has the greatest value for electrical rough-in?',
    options: ['Confirming finish-paint sheen', 'Counting only visible receptacle boxes', 'Installing devices before conductor testing', 'Verifying routes, clearances, box locations, panel capacity, and grounding continuity'],
    correct: 3,
    rationale: 'A coordinated rough-in review catches conflicts and safety issues while systems remain visible and correctable.',
  },
  {
    prompt: 'Module 17 — What is the primary purpose of venting a drainage system?',
    options: ['To increase water pressure at fixtures', 'To protect trap seals and allow drainage air movement', 'To replace cleanouts', 'To heat the waste piping'],
    correct: 1,
    rationale: 'Venting balances pressure in the drainage system so fixture traps retain their protective water seals.',
  },
  {
    prompt: 'Module 18 — Several rooms are uncomfortable even though the HVAC equipment meets its rated capacity. What should be checked next?',
    options: ['The building address', 'Only the thermostat color', 'Airflow distribution, balancing, controls, and the actual room loads', 'The plumbing vent size'],
    correct: 2,
    rationale: 'Comfort depends on delivering the required airflow to each space, not merely installing equipment with adequate total capacity.',
  },
  {
    prompt: 'Module 19 — When may a sprinkler head location be moved in the field?',
    options: ['After confirming the revised location meets the approved design and required coverage', 'Whenever it conflicts with a light fixture', 'Only after the ceiling is closed', 'If the owner verbally approves it'],
    correct: 0,
    rationale: 'Changes must preserve listed spacing, obstruction, and coverage requirements and follow the approved design process.',
  },
  {
    prompt: 'Module 20 — Under critical lighting, which drywall decision most affects the visibility of joints?',
    options: ['The framing species alone', 'The number of electrical circuits', 'The door hardware finish', 'Board orientation, joint placement, finish level, and surface preparation'],
    correct: 3,
    rationale: 'Joint layout and the specified finish level are central to producing a uniform surface under demanding lighting.',
  },
  {
    prompt: 'Module 21 — A moisture-sensitive floor covering is scheduled over a concrete slab. What must occur before installation?',
    options: ['Wax the slab', 'Test slab moisture using the flooring manufacturer’s accepted method and limits', 'Open additional movement joints at random', 'Increase adhesive thickness to absorb moisture'],
    correct: 1,
    rationale: 'Concrete moisture must be measured and compared with the flooring and adhesive requirements before installation.',
  },
  {
    prompt: 'Module 22 — What turns commissioning from a verbal claim into a reliable handover record?',
    options: ['A list of subcontractor phone numbers only', 'Photographs of finished paint', 'Documented functional tests, resolved deficiencies, training, and complete operating records', 'An unsigned punch list'],
    correct: 2,
    rationale: 'Commissioning is demonstrated through recorded tests, corrections, owner training, and usable closeout documentation.',
  },
];

export const phaseGroups: { phase: Phase; label: string; range: string; modules: Module[] }[] = [
  { phase: 'Site & Substructure', label: 'Build the ground truth', range: '01—07', modules: modules.slice(0, 7) },
  { phase: 'Structure', label: 'Make the frame stand', range: '08—11', modules: modules.slice(7, 11) },
  { phase: 'Envelope', label: 'Hold the weather line', range: '12—15', modules: modules.slice(11, 15) },
  { phase: 'MEP', label: 'Make the building work', range: '16—19', modules: modules.slice(15, 19) },
  { phase: 'Finish & Closeout', label: 'Prove the work', range: '20—22', modules: modules.slice(19, 22) },
];