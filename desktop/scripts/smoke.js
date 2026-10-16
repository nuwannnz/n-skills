// Headless check of the engine, without Electron: runs one request through the
// local Claude Code and prints which login it used. Read-only by default.
//   node scripts/smoke.js [project]
//   SMOKE_PROMPT="/scrumo-change ..." SMOKE_APPROVE_DOC_EDITS=1 node scripts/smoke.js
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ChatSession, claudeVersion, engineEnv, findClaude, loginShellPath } from '../src/engine.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(process.argv[2] ?? join(here, '../.demo/pawplan'));
const path = loginShellPath();
const claudePath = findClaude(path);
if (!claudePath) { console.error('claude not found on PATH'); process.exit(1); }
const env = engineEnv(path);
console.log(`claude: ${claudePath} (${claudeVersion(claudePath, env)})\nproject: ${root}\n`);

const started = Date.now();
const session = new ChatSession({
  root, claudePath, env,
  autoApproveDocEdits: process.env.SMOKE_APPROVE_DOC_EDITS === '1',
  askPerson: async ({ toolName, input }) => {
    console.log(`  [would ask the person] ${toolName} ${JSON.stringify(input).slice(0, 120)} -> denied by smoke test`);
    return { allow: false, message: 'The person declined this step.' };
  },
  onMessage: msg => {
    if (msg.type === 'system' && msg.subtype === 'init') {
      const skills = msg.slash_commands.filter(c => c.startsWith('scrumo-'));
      console.log(`init: Claude Code ${msg.claude_code_version}, model ${msg.model}, apiKeySource=${msg.apiKeySource}, permissionMode=${msg.permissionMode}`);
      console.log(`      ${skills.length} scrumo skills: ${skills.join(', ')}\n`);
    } else if (msg.type === 'assistant') {
      for (const b of msg.message.content) {
        if (b.type === 'tool_use') console.log(`  tool: ${b.name} ${JSON.stringify(b.input).slice(0, 140)}`);
        if (b.type === 'text' && b.text.trim()) console.log(`\n${b.text.trim()}\n`);
      }
    } else if (msg.type === 'result') {
      console.log(`result: ${msg.subtype}, ${msg.num_turns} turns, ${((Date.now() - started) / 1000).toFixed(1)}s, API-equivalent cost $${(msg.total_cost_usd ?? 0).toFixed(4)}`);
      session.close();
    } else if (msg.type === 'app_error') {
      console.error('error:', msg.message);
      session.close();
    }
  },
}).start();

session.send(process.env.SMOKE_PROMPT ?? 'Using the scrumo CLI, tell me the active sprint goal and what needs attention, in three short bullet points. Do not change any files.');
await session.done;
