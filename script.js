// E++ Studio script engine // Use this file with index.html by replacing the inline <script> with: // <script src="script.js"></script>

const editor = document.getElementById('editor'); const output = document.getElementById('output'); const explainBody = document.getElementById('explainBody'); const stepInfo = document.getElementById('stepInfo'); const lineNumbers = document.getElementById('lineNumbers'); const app = document.getElementById('app');

const STORAGE_KEY = 'eplus_studio_code_v1'; const THEME_KEY = 'eplus_theme_v1';

const examples = { hello: show "Hello, world!"\nshow "Welcome to E++", calc: set a = 12\nset b = 8\nset sum = a + b\nshow sum\nshow "Done", ifelse: set score = 10\nif score >= 10\n  show "Level unlocked"\nelse\n  show "Keep going"\nend, repeat: repeat 3\n  show "E++"\nend };

function setTheme(theme) { if (theme === 'dark') app.setAttribute('data-theme', 'dark'); else app.removeAttribute('data-theme'); localStorage.setItem(THEME_KEY, theme); }

function toggleTheme() { const dark = app.getAttribute('data-theme') === 'dark'; setTheme(dark ? 'light' : 'dark'); }

function updateLineNumbers() { const lines = editor.value.split('\n').length || 1; lineNumbers.textContent = Array.from({ length: lines }, (_, i) => i + 1).join('\n'); syncScroll(); }

function syncScroll() { lineNumbers.scrollTop = editor.scrollTop; lineNumbers.scrollLeft = editor.scrollLeft; }

function resetConsole() { output.textContent = ''; }

function isQuoted(text) { return (/^"."$/s).test(text.trim()) || (/^'.'$/s).test(text.trim()); }

function stripQuotes(text) { const t = text.trim(); return t.slice(1, -1); }

function safeExpr(expr, vars) { const trimmed = expr.trim(); if (!trimmed) return ''; if (isQuoted(trimmed)) return stripQuotes(trimmed);

const allowed = /^[\w\s+-*/%().,<>=!&|:'"?]+$/; if (!allowed.test(trimmed)) { throw new Error('Unsupported characters in expression'); }

const keys = Object.keys(vars).sort((a, b) => b.length - a.length); let js = trimmed;

for (const key of keys) { js = js.replace( new RegExp('\b' + key.replace(/[.*+?^${}()|[]\]/g, '\$&') + '\b', 'g'), vars[${JSON.stringify(key)}] ); }

try { // eslint-disable-next-line no-new-func return Function('vars', 'return (' + js + ');')(vars); } catch (e) { throw new Error('Bad expression: ' + expr); } }

function explain(text) { explainBody.innerHTML = text; }

function runEPP(source) { const lines = source.replace(/\r/g, '').split('\n'); const vars = {}; let pc = 0; const out = []; const steps = [];

function skipToElseOrEnd(start) { let depth = 0; for (let i = start + 1; i < lines.length; i++) { const t = lines[i].trim(); if (/^if\b/.test(t) || /^repeat\b/.test(t)) depth++; else if (t === 'end') { if (depth === 0) return { index: i, kind: 'end' }; depth--; } else if (t === 'else' && depth === 0) { return { index: i, kind: 'else' }; } } return { index: lines.length, kind: 'end' }; }

while (pc < lines.length) { const raw = lines[pc]; const line = raw.trim();

if (!line || line.startsWith('//') || line.startsWith('#')) {
  pc++;
  continue;
}

if (/^show\b/.test(line)) {
  const expr = line.slice(4).trim();
  const value = safeExpr(expr, vars);
  out.push(String(value));
  steps.push({ line: pc + 1, text: `show prints: ${String(value)}` });
  pc++;
  continue;
}

if (/^set\b/.test(line)) {
  const m = line.match(/^set\s+([A-Za-z_][\w]*)\s*=\s*(.+)$/);
  if (!m) throw new Error(`Line ${pc + 1}: bad set command`);
  const [, name, expr] = m;
  const value = safeExpr(expr, vars);
  vars[name] = value;
  steps.push({ line: pc + 1, text: `set stores <b>${name}</b> = ${JSON.stringify(value)}` });
  pc++;
  continue;
}

if (/^ask\b/.test(line)) {
  const m = line.match(/^ask\s+(.+?)\s+into\s+([A-Za-z_][\w]*)$/);
  if (!m) throw new Error(`Line ${pc + 1}: bad ask command`);
  const promptText = String(safeExpr(m[1], vars));
  const target = m[2];
  const answer = window.prompt(promptText, '') ?? '';
  vars[target] = answer;
  steps.push({ line: pc + 1, text: `ask stores the answer in <b>${target}</b>` });
  pc++;
  continue;
}

if (/^if\b/.test(line)) {
  const condition = line.slice(2).trim();
  const result = Boolean(safeExpr(condition, vars));
  steps.push({ line: pc + 1, text: `if checks: <b>${condition}</b> → ${result ? 'true' : 'false'}` });
  if (!result) {
    const jump = skipToElseOrEnd(pc);
    pc = jump.index + 1;
  } else {
    pc++;
  }
  continue;
}

if (line === 'else' || line === 'end') {
  steps.push({ line: pc + 1, text: line === 'else' ? 'else switches to the alternate block.' : 'end closes a block.' });
  pc++;
  continue;
}

if (/^repeat\b/.test(line)) {
  const m = line.match(/^repeat\s+(.+)$/);
  if (!m) throw new Error(`Line ${pc + 1}: bad repeat command`);
  const count = Number(safeExpr(m[1], vars));
  if (!Number.isFinite(count) || count < 0) throw new Error(`Line ${pc + 1}: repeat needs a positive number`);

  let depth = 0;
  let endIndex = -1;
  for (let i = pc + 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (/^repeat\b/.test(t) || /^if\b/.test(t)) depth++;
    else if (t === 'end') {
      if (depth === 0) {
        endIndex = i;
        break;
      }
      depth--;
    }
  }

  if (endIndex === -1) throw new Error(`Line ${pc + 1}: repeat block is missing end`);

  const block = lines.slice(pc + 1, endIndex).join('\n');
  steps.push({ line: pc + 1, text: `repeat runs the block ${count} times.` });

  for (let i = 0; i < count; i++) {
    const nested = runEPP(block);
    nested.output.forEach(v => out.push(v));
    nested.steps.forEach(s => steps.push({ line: s.line, text: `Loop ${i + 1}: ${s.text}` }));
  }

  pc = endIndex + 1;
  continue;
}

throw new Error(`Line ${pc + 1}: unknown command → ${line}`);

}

return { output: out, steps, vars }; }

function renderExplanation(steps) { if (!steps.length) { stepInfo.textContent = 'Done.'; explain('The program finished successfully.'); return; }

const parts = steps.map(s => <div><b>Line ${s.line}</b>: ${s.text}</div>).join(''); explain(parts); const last = steps[steps.length - 1]; stepInfo.textContent = Last step: line ${last.line}; }

function run() { resetConsole(); try { const result = runEPP(editor.value || ''); output.textContent = result.output.length ? result.output.join('\n') : '(no output)'; renderExplanation(result.steps); } catch (err) { output.textContent = 'Error: ' + err.message; explain(<div><b>Stopped</b>: ${err.message}</div>); stepInfo.textContent = 'An error happened.'; } }

function loadExample(name) { editor.value = examples[name]; updateLineNumbers(); save(); explain(Loaded the <b>${name}</b> example. Press <b>Run E++</b> to test it.); stepInfo.textContent = 'Example loaded.'; }

function save() { localStorage.setItem(STORAGE_KEY, editor.value); }

function init() { const saved = localStorage.getItem(STORAGE_KEY); editor.value = saved || examples.hello; updateLineNumbers();

const theme = localStorage.getItem(THEME_KEY) || 'light'; setTheme(theme);

explain('Type E++ code on the left. Press <b>Run E++</b> to see output and line-by-line explanation.'); output.textContent = 'Ready.'; }

editor.addEventListener('input', () => { updateLineNumbers(); save(); });

editor.addEventListener('scroll', syncScroll);

editor.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(); }

if (e.key === 'Tab') { e.preventDefault(); const start = editor.selectionStart; const end = editor.selectionEnd; const value = editor.value; editor.value = value.slice(0, start) + '  ' + value.slice(end); editor.selectionStart = editor.selectionEnd = start + 2; updateLineNumbers(); save(); } });

document.getElementById('runBtn').addEventListener('click', run); document.getElementById('clearOutBtn').addEventListener('click', () => { output.textContent = ''; stepInfo.textContent = 'Output cleared.'; }); document.getElementById('themeBtn').addEventListener('click', toggleTheme); document.getElementById('newBtn').addEventListener('click', () => { editor.value = 'show "Hello, world!"\nset score = 10\nif score >= 10\n  show "Level unlocked"\nelse\n  show "Keep going"\nend'; updateLineNumbers(); save(); explain('Started a fresh project template.'); stepInfo.textContent = 'New project created.'; }); document.getElementById('exampleBtn').addEventListener('click', () => loadExample('ifelse')); document.querySelectorAll('[data-example]').forEach(btn => { btn.addEventListener('click', () => loadExample(btn.dataset.example)); });
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js");
}
init();