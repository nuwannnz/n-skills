// The agent skills a project has, named by the role that runs them.

export const SKILL_LABELS: Record<string, string> = {
  'scrumo-kickoff': 'Product strategist · Kickoff',
  'scrumo-prd': 'Business analyst · PRD',
  'scrumo-change': 'BA / architect · Change request',
  'scrumo-architecture': 'Architect · Architecture',
  'scrumo-standards': 'Tech lead · Coding standards',
  'scrumo-epics': 'Product owner · Epics',
  'scrumo-stories': 'Product owner · Stories',
  'scrumo-refine': 'Product owner · Refine backlog',
  'scrumo-sprint': 'Scrum master · Sprint',
  'scrumo-bug': 'QA · Report a bug',
  'scrumo-qa': 'QA · Verify a story',
  'scrumo-dev': 'Developer · Build a story',
  'scrumo-validate': 'Gatekeeper · Validate',
};
const BA_FIRST = ['scrumo-change', 'scrumo-prd', 'scrumo-architecture', 'scrumo-standards', 'scrumo-epics', 'scrumo-stories', 'scrumo-refine', 'scrumo-sprint', 'scrumo-kickoff', 'scrumo-bug', 'scrumo-validate', 'scrumo-qa', 'scrumo-dev'];

export const skillRole = (s: string) => (SKILL_LABELS[s] ?? 'Agent').split(' · ')[0]!;

/** Skills grouped by agent (role), in the order BA_FIRST puts their first skill. */
export function skillGroups(skills: string[]) {
  const sorted = skills.slice().sort((a, b) => BA_FIRST.indexOf(a) - BA_FIRST.indexOf(b));
  const groups = new Map<string, { value: string; label: string }[]>();
  for (const s of sorted) {
    const [role, action] = (SKILL_LABELS[s] ?? `Other · ${s}`).split(' · ') as [string, string | undefined];
    if (!groups.has(role)) groups.set(role, []);
    groups.get(role)!.push({ value: s, label: action ?? s });
  }
  return [...groups].map(([role, options]) => ({ role, options }));
}
