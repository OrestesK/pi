import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { readdir } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { z } from 'zod';

const execFile = promisify(execFileCb);

// ---------------------------------------------------------------------------
// Data structures
// ---------------------------------------------------------------------------

const SYMBOL_KINDS = {
  javascript: {
    function: ['function_declaration'],
    class: ['class_declaration'],
    variable: ['lexical_declaration', 'variable_declaration'],
    method: ['method_definition'],
  },
  typescript: {
    function: ['function_declaration'],
    class: ['class_declaration'],
    interface: ['interface_declaration'],
    type_alias: ['type_alias_declaration'],
    enum: ['enum_declaration'],
    variable: ['lexical_declaration', 'variable_declaration'],
    method: ['method_definition'],
  },
  python: {
    function: ['function_definition'],
    class: ['class_definition'],
  },
  lua: {
    function: ['function_declaration'],
    variable: ['variable_declaration', 'assignment_statement'],
  },
  rust: {
    function: ['function_item'],
    struct: ['struct_item'],
    enum: ['enum_item'],
    trait: ['trait_item'],
    impl: ['impl_item'],
    type_alias: ['type_item'],
  },
  go: {
    function: ['function_declaration'],
    method: ['method_declaration'],
    type: ['type_declaration'],
  },
  java: {
    class: ['class_declaration'],
    interface: ['interface_declaration'],
    method: ['method_declaration'],
    enum: ['enum_declaration'],
  },
  c: {
    function: ['function_definition'],
    struct: ['struct_specifier'],
    enum: ['enum_specifier'],
  },
  cpp: {
    function: ['function_definition'],
    class: ['class_specifier'],
    struct: ['struct_specifier'],
    enum: ['enum_specifier'],
  },
  ruby: {
    function: ['method'],
    class: ['class'],
    module: ['module'],
  },
  kotlin: {
    function: ['function_declaration'],
    class: ['class_declaration'],
    interface: ['interface_declaration'],
  },
  swift: {
    function: ['function_declaration'],
    class: ['class_declaration'],
    struct: ['struct_declaration'],
    enum: ['enum_declaration'],
    protocol: ['protocol_declaration'],
  },
};

const EXT_TO_LANG = {
  '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
  '.ts': 'typescript', '.tsx': 'typescript', '.mts': 'typescript', '.cts': 'typescript',
  '.py': 'python', '.pyi': 'python',
  '.lua': 'lua',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.c': 'c', '.h': 'c',
  '.cpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp', '.hpp': 'cpp',
  '.rb': 'ruby',
  '.kt': 'kotlin', '.kts': 'kotlin',
  '.swift': 'swift',
};

const NAME_REGEX = {
  javascript: /(?:function\s+|class\s+|const\s+|let\s+|var\s+)(\w+)/,
  typescript: /(?:function\s+|class\s+|interface\s+|type\s+|enum\s+|const\s+|let\s+|var\s+|export\s+(?:default\s+)?(?:function\s+|class\s+|interface\s+|type\s+|enum\s+|const\s+|let\s+|var\s+))(\w+)/,
  python: /(?:def|class)\s+(\w+)/,
  lua: /(?:local\s+)?(?:function\s+)?(\w+(?:[.:]\w+)*)\s*[=(]/,
  rust: /(?:fn|struct|enum|trait|impl|type|const|static|pub\s+(?:fn|struct|enum|trait|type|const|static))\s+(\w+)/,
  go: /(?:func\s+(?:\([^)]+\)\s+)?|type\s+)(\w+)/,
  java: /(?:class|interface|enum|(?:public|private|protected|static)\s+\w+\s+)(\w+)/,
  c: /(\w+)\s*\(/,
  cpp: /(?:class\s+|struct\s+|enum\s+)?(\w+)(?:\s*\(|(?:\s*\{))/,
  ruby: /(?:def\s+|class\s+|module\s+)(\w+)/,
  kotlin: /(?:fun\s+|class\s+|interface\s+|object\s+)(\w+)/,
  swift: /(?:func\s+|class\s+|struct\s+|enum\s+|protocol\s+)(\w+)/,
};

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'vendor', 'dist', 'build',
  '__pycache__', '.venv', 'target', '.next', '.nuxt',
  'venv', 'env', '.tox', '.mypy_cache', '.ruff_cache',
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function runAstGrep(args, options = {}) {
  try {
    const { stdout } = await execFile('ast-grep', args, {
      timeout: options.timeout || 15000,
      maxBuffer: 10 * 1024 * 1024,
    });
    if (args.includes('--json') || args.includes('--json=compact')) {
      try {
        return JSON.parse(stdout || '[]');
      } catch {
        return [];
      }
    }
    return stdout;
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error('ast-grep not installed. Install with: pacman -S ast-grep / brew install ast-grep / cargo install ast-grep');
    }
    // ast-grep exits non-zero when no matches found — that's ok
    if (err.stdout) {
      if (args.includes('--json') || args.includes('--json=compact')) {
        try {
          return JSON.parse(err.stdout || '[]');
        } catch {
          return [];
        }
      }
      return err.stdout;
    }
    throw err;
  }
}

function buildInlineRules(language, kindFilter = null) {
  const kinds = SYMBOL_KINDS[language];
  if (!kinds) return null;

  const rules = [];
  for (const [category, nodeKinds] of Object.entries(kinds)) {
    for (const kind of nodeKinds) {
      if (kindFilter && !kindFilter.includes(kind)) continue;
      rules.push(`id: ${category}\nlanguage: ${language}\nrule:\n  kind: ${kind}`);
    }
  }
  return rules.join('\n---\n');
}

function extractName(text, language) {
  if (!text) return null;
  const firstLine = text.split('\n')[0];
  const regex = NAME_REGEX[language];
  if (!regex) return null;
  const match = firstLine.match(regex);
  return match ? match[1] : null;
}

function inferLanguage(filePath) {
  const ext = extname(filePath).toLowerCase();
  return EXT_TO_LANG[ext] || null;
}

function fuzzyMatch(name, query) {
  if (!name || !query) return 0;
  const lower = name.toLowerCase();
  const q = query.toLowerCase();
  if (lower === q) return 3;
  if (lower.startsWith(q)) return 2;
  if (lower.includes(q)) return 1;
  return 0;
}

async function detectLanguages(dirPath) {
  const fileCounts = {};
  const languages = new Set();

  async function walk(dir, depth = 0) {
    if (depth > 10) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await walk(join(dir, entry.name), depth + 1);
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase();
        const lang = EXT_TO_LANG[ext];
        if (lang) {
          languages.add(lang);
          fileCounts[lang] = (fileCounts[lang] || 0) + 1;
        }
      }
    }
  }

  await walk(dirPath);
  return { languages: [...languages], fileCounts };
}

function formatSignature(text) {
  if (!text) return '';
  const firstLine = text.split('\n')[0].trim();
  if (firstLine.length > 120) return firstLine.slice(0, 117) + '...';
  return firstLine;
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'tree-sitter',
  version: '0.1.0',
});

// Tool 1: search_symbols
server.tool(
  'search_symbols',
  'Fast AST-based symbol search using tree-sitter. Always accurate, never stale. Find functions, classes, methods by name with fuzzy matching.',
  {
    query: z.string().describe('Symbol name to search for'),
    path: z.string().optional().describe('Directory to search (defaults to cwd)'),
    language: z.string().optional().describe('Filter to specific language'),
    max_results: z.number().optional().describe('Max results (default 20)'),
  },
  async ({ query, path: searchPath, language, max_results: maxResults }) => {
    try {
      searchPath = searchPath || process.cwd();
      maxResults = maxResults || 20;

      let langs;
      if (language) {
        if (!SYMBOL_KINDS[language]) {
          return { content: [{ type: 'text', text: `Error: unsupported language '${language}'. Supported: ${Object.keys(SYMBOL_KINDS).join(', ')}` }], isError: true };
        }
        langs = [language];
      } else {
        const detected = await detectLanguages(searchPath);
        langs = detected.languages;
      }

      if (langs.length === 0) {
        return { content: [{ type: 'text', text: 'No supported languages detected in the directory.' }] };
      }

      const allMatches = [];

      for (const lang of langs) {
        const rules = buildInlineRules(lang);
        if (!rules) continue;

        const results = await runAstGrep([
          'scan', '--inline-rules', rules, '--json=compact', searchPath,
        ]);

        if (!Array.isArray(results)) continue;

        for (const match of results) {
          const name = extractName(match.text, lang);
          const score = fuzzyMatch(name, query);
          if (score > 0) {
            allMatches.push({
              name: name || '(anonymous)',
              kind: match.ruleId || 'unknown',
              file: match.file,
              line: match.range?.start?.line != null ? match.range.start.line + 1 : 0,
              signature: formatSignature(match.text),
              language: lang,
              score,
            });
          }
        }
      }

      allMatches.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
      const limited = allMatches.slice(0, maxResults);

      if (limited.length === 0) {
        return { content: [{ type: 'text', text: `No symbols matching '${query}' found.` }] };
      }

      const lines = limited.map(m => {
        const relFile = relative(searchPath, m.file) || m.file;
        return `${m.name} (${m.kind}) — ${relFile}:${m.line}\n  ${m.signature}`;
      });

      const header = `Found ${limited.length} symbol${limited.length === 1 ? '' : 's'} matching '${query}'${allMatches.length > maxResults ? ` (showing ${maxResults} of ${allMatches.length})` : ''}:\n`;
      return { content: [{ type: 'text', text: header + '\n' + lines.join('\n\n') }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  },
);

// Tool 2: document_symbols
server.tool(
  'document_symbols',
  'List all symbols in a file using tree-sitter. Fast and always accurate. Shows functions, classes, methods with their signatures.',
  {
    file_path: z.string().describe('Path to the file'),
  },
  async ({ file_path: filePath }) => {
    try {
      const lang = inferLanguage(filePath);
      if (!lang) {
        return { content: [{ type: 'text', text: `Error: unsupported file type '${extname(filePath)}'. Supported: ${Object.keys(EXT_TO_LANG).join(', ')}` }], isError: true };
      }

      const rules = buildInlineRules(lang);
      if (!rules) {
        return { content: [{ type: 'text', text: `Error: no symbol definitions for language '${lang}'.` }], isError: true };
      }

      const results = await runAstGrep([
        'scan', '--inline-rules', rules, '--json=compact', filePath,
      ]);

      if (!Array.isArray(results) || results.length === 0) {
        return { content: [{ type: 'text', text: `No symbols found in ${filePath}.` }] };
      }

      const symbols = results.map(match => ({
        kind: match.ruleId || 'unknown',
        name: extractName(match.text, lang) || '(anonymous)',
        line: match.range?.start?.line != null ? match.range.start.line + 1 : 0,
        signature: formatSignature(match.text),
      }));

      symbols.sort((a, b) => a.line - b.line);

      const lines = symbols.map(s => `${s.kind}: ${s.name} — line ${s.line}\n  ${s.signature}`);
      const header = `${filePath} — ${symbols.length} symbol${symbols.length === 1 ? '' : 's'}:\n`;
      return { content: [{ type: 'text', text: header + '\n' + lines.join('\n') }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  },
);

// Tool 3: symbol_definition
server.tool(
  'symbol_definition',
  'Get the complete source code of a specific symbol. Uses tree-sitter for exact AST extraction. More efficient than reading the entire file.',
  {
    file_path: z.string().describe('Path to the file'),
    symbol_name: z.string().describe('Name of the symbol to extract'),
  },
  async ({ file_path: filePath, symbol_name: symbolName }) => {
    try {
      const lang = inferLanguage(filePath);
      if (!lang) {
        return { content: [{ type: 'text', text: `Error: unsupported file type '${extname(filePath)}'.` }], isError: true };
      }

      const rules = buildInlineRules(lang);
      if (!rules) {
        return { content: [{ type: 'text', text: `Error: no symbol definitions for language '${lang}'.` }], isError: true };
      }

      const results = await runAstGrep([
        'scan', '--inline-rules', rules, '--json=compact', filePath,
      ]);

      if (!Array.isArray(results)) {
        return { content: [{ type: 'text', text: `No symbols found in ${filePath}.` }] };
      }

      const matches = results.filter(match => {
        const name = extractName(match.text, lang);
        return name === symbolName;
      });

      if (matches.length === 0) {
        return { content: [{ type: 'text', text: `Symbol '${symbolName}' not found in ${filePath}.` }] };
      }

      const parts = matches.map(match => {
        const startLine = match.range?.start?.line != null ? match.range.start.line + 1 : '?';
        const endLine = match.range?.end?.line != null ? match.range.end.line + 1 : '?';
        return `// ${filePath}:${startLine}-${endLine} (${match.ruleId || 'unknown'})\n${match.text}`;
      });

      return { content: [{ type: 'text', text: parts.join('\n\n') }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  },
);

// Tool 4: pattern_search
server.tool(
  'pattern_search',
  'AST-aware structural code search. Matches code by structure, not text. Use $VAR for single nodes, $$$ for multiple. Example: console.log($ARG)',
  {
    pattern: z.string().describe('ast-grep pattern'),
    language: z.string().describe('Language (required)'),
    path: z.string().optional().describe('Directory or file to search'),
    max_results: z.number().optional().describe('Max results (default 50)'),
  },
  async ({ pattern, language, path: searchPath, max_results: maxResults }) => {
    try {
      searchPath = searchPath || process.cwd();
      maxResults = maxResults || 50;

      const results = await runAstGrep([
        'run', '--pattern', pattern, '--lang', language, '--json=compact', searchPath,
      ]);

      if (!Array.isArray(results) || results.length === 0) {
        return { content: [{ type: 'text', text: `No matches for pattern '${pattern}' in ${language}.` }] };
      }

      const limited = results.slice(0, maxResults);
      const lines = limited.map(match => {
        const relFile = relative(searchPath, match.file) || match.file;
        const line = match.range?.start?.line != null ? match.range.start.line + 1 : '?';
        const code = match.text?.split('\n')[0]?.trim() || '';
        return `${relFile}:${line}\n  ${code}`;
      });

      const header = `Found ${results.length} match${results.length === 1 ? '' : 'es'}${results.length > maxResults ? ` (showing ${maxResults})` : ''}:\n`;
      return { content: [{ type: 'text', text: header + '\n' + lines.join('\n\n') }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  },
);

// Tool 5: pattern_replace
server.tool(
  'pattern_replace',
  'AST-aware code transformation. Rewrites code matching a pattern. Use $VAR for single nodes, $$$ for multiple. Dry-run by default.',
  {
    pattern: z.string().describe('ast-grep pattern to match'),
    replacement: z.string().describe('Replacement pattern'),
    language: z.string().describe('Language (required)'),
    path: z.string().optional().describe('Directory or file to transform'),
    dry_run: z.boolean().optional().describe('Preview changes without applying (default true)'),
  },
  async ({ pattern, replacement, language, path: searchPath, dry_run: dryRun }) => {
    try {
      searchPath = searchPath || process.cwd();
      dryRun = dryRun !== false; // default true

      if (dryRun) {
        const results = await runAstGrep([
          'run', '--pattern', pattern, '--rewrite', replacement,
          '--lang', language, '--json=compact', searchPath,
        ]);

        if (!Array.isArray(results) || results.length === 0) {
          return { content: [{ type: 'text', text: `No matches for pattern '${pattern}' in ${language}.` }] };
        }

        const lines = results.map(match => {
          const relFile = relative(searchPath, match.file) || match.file;
          const line = match.range?.start?.line != null ? match.range.start.line + 1 : '?';
          const original = match.text?.split('\n')[0]?.trim() || '';
          const replaced = match.replacement?.split('\n')[0]?.trim() || '';
          return `${relFile}:${line}\n  - ${original}\n  + ${replaced}`;
        });

        return { content: [{ type: 'text', text: `Dry run: ${results.length} replacement${results.length === 1 ? '' : 's'} would be made:\n\n${lines.join('\n\n')}` }] };
      } else {
        // Apply changes
        const applyArgs = ['run', '--pattern', pattern, '--rewrite', replacement, '--lang', language, '--update-all'];
        if (searchPath) applyArgs.push(searchPath);
        const result = await runAstGrep(applyArgs);
        // Strip ANSI escape codes
        const clean = (typeof result === 'string' ? result : '').replace(/\x1b\[[0-9;]*m/g, '');
        return { content: [{ type: 'text', text: clean || 'Applied replacements.' }] };
      }
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  },
);

// Tool 6: codebase_overview
server.tool(
  'codebase_overview',
  'High-level codebase structure overview. Shows languages, file counts, and total symbols. Fast tree-sitter-based analysis.',
  {
    path: z.string().optional().describe('Directory to analyze (defaults to cwd)'),
  },
  async ({ path: searchPath }) => {
    try {
      searchPath = searchPath || process.cwd();
      const { languages, fileCounts } = await detectLanguages(searchPath);

      if (languages.length === 0) {
        return { content: [{ type: 'text', text: `No supported languages found in ${searchPath}.` }] };
      }

      // Sort by file count, take top 8
      const sorted = languages
        .map(lang => ({ lang, count: fileCounts[lang] || 0 }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);

      const langLines = [];
      let totalFiles = 0;
      let totalSymbols = 0;

      for (const { lang, count } of sorted) {
        const rules = buildInlineRules(lang);
        let symbolCount = 0;
        if (rules) {
          try {
            const results = await runAstGrep([
              'scan', '--inline-rules', rules, '--json=compact', searchPath,
            ], { timeout: 30000 });
            if (Array.isArray(results)) {
              symbolCount = results.length;
            }
          } catch {
            // timeout or error — skip symbol count
          }
        }
        totalFiles += count;
        totalSymbols += symbolCount;
        langLines.push(`  ${lang}: ${count} file${count === 1 ? '' : 's'}, ${symbolCount} symbol${symbolCount === 1 ? '' : 's'}`);
      }

      // Count remaining files not in top 8
      const topLangs = new Set(sorted.map(s => s.lang));
      const remaining = languages.filter(l => !topLangs.has(l));
      const remainingLangs = remaining.length;
      const remainingFiles = remaining.reduce((sum, lang) => sum + (fileCounts[lang] || 0), 0);
      if (remainingLangs > 0) {
        totalFiles += remainingFiles;
        langLines.push(`  ... and ${remainingLangs} more language${remainingLangs === 1 ? '' : 's'} (${remainingFiles} files)`);
      }

      const text = `Codebase: ${searchPath}\n\nLanguages:\n${langLines.join('\n')}\n\nTotal: ${totalFiles} files, ${totalSymbols} symbols`;
      return { content: [{ type: 'text', text }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  },
);

// Tool 7: codebase_map
server.tool(
  'codebase_map',
  'Directory tree with symbol counts per file. Shows structural layout of the codebase.',
  {
    path: z.string().optional().describe('Directory to map (defaults to cwd)'),
    depth: z.number().optional().describe('Max directory depth (default 3)'),
  },
  async ({ path: searchPath, depth: maxDepth }) => {
    try {
      searchPath = searchPath || process.cwd();
      maxDepth = maxDepth || 3;

      const { languages } = await detectLanguages(searchPath);

      if (languages.length === 0) {
        return { content: [{ type: 'text', text: `No supported languages found in ${searchPath}.` }] };
      }

      // Collect symbol counts per file across all languages
      const fileSymbolCounts = {};

      for (const lang of languages) {
        const rules = buildInlineRules(lang);
        if (!rules) continue;

        try {
          const results = await runAstGrep([
            'scan', '--inline-rules', rules, '--json=compact', searchPath,
          ], { timeout: 30000 });

          if (Array.isArray(results)) {
            for (const match of results) {
              if (match.file) {
                fileSymbolCounts[match.file] = (fileSymbolCounts[match.file] || 0) + 1;
              }
            }
          }
        } catch {
          // timeout — skip this language
        }
      }

      // Build tree structure
      const tree = {};
      for (const [filePath, count] of Object.entries(fileSymbolCounts)) {
        const rel = relative(searchPath, filePath);
        if (!rel || rel.startsWith('..')) continue;
        const parts = rel.split('/');
        if (parts.length > maxDepth + 1) continue; // skip files deeper than maxDepth

        let node = tree;
        for (let i = 0; i < parts.length - 1; i++) {
          const dir = parts[i];
          if (!node[dir]) node[dir] = {};
          node = node[dir];
        }
        const fileName = parts[parts.length - 1];
        node[fileName] = count;
      }

      // Render tree
      function renderTree(node, prefix = '') {
        const entries = Object.entries(node).sort((a, b) => {
          const aIsDir = typeof a[1] === 'object';
          const bIsDir = typeof b[1] === 'object';
          if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
          return a[0].localeCompare(b[0]);
        });

        const lines = [];
        for (let i = 0; i < entries.length; i++) {
          const [name, value] = entries[i];
          const isLast = i === entries.length - 1;
          const connector = isLast ? '└── ' : '├── ';
          const childPrefix = isLast ? '    ' : '│   ';

          if (typeof value === 'object') {
            // Directory — sum symbols
            function sumSymbols(n) {
              let total = 0;
              for (const v of Object.values(n)) {
                total += typeof v === 'number' ? v : sumSymbols(v);
              }
              return total;
            }
            const dirTotal = sumSymbols(value);
            lines.push(`${prefix}${connector}${name}/ (${dirTotal} symbols)`);
            lines.push(...renderTree(value, prefix + childPrefix));
          } else {
            lines.push(`${prefix}${connector}${name} (${value} symbol${value === 1 ? '' : 's'})`);
          }
        }
        return lines;
      }

      const totalSymbols = Object.values(fileSymbolCounts).reduce((a, b) => a + b, 0);
      const treeLines = renderTree(tree);
      const header = `${searchPath} (${totalSymbols} symbols, depth ${maxDepth})\n`;
      return { content: [{ type: 'text', text: header + '\n' + treeLines.join('\n') }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  },
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
