/**
 * TODO Scanner for pi-local.
 *
 * Scans codebase for TODO, FIXME, HACK, XXX, and BUG annotations.
 * Helps understand what's already flagged as problematic or incomplete.
 *
 * No dependencies required — uses regex scanning.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { collectSourceFiles } from "./source-filter.js";
// --- Scanner ---
export class TodoScanner {
    /**
     * Pattern matches actionable annotations only.
     * Excludes NOTE and DEPRECATED — these are documentation, not work items.
     * Case-sensitive to avoid matching "Note:" in prose.
     */
    pattern = /\b(TODO|FIXME|HACK|XXX|BUG)\b\s*[(:]?\s*(.+)/g;
    /**
     * Check if a match position is inside a comment context.
     * Handles: // line comments, star-slash block comments, * JSDoc lines, # Python comments
     */
    isInComment(line, matchIndex) {
        const trimmed = line.trimStart();
        // Line starts with comment markers — entire line is a comment
        if (/^\/\/|^\/\*|^\*|^#/.test(trimmed))
            return true;
        // Check if there's a // before the match position (not inside a string)
        const beforeMatch = line.slice(0, matchIndex);
        const lineCommentPos = beforeMatch.lastIndexOf("//");
        if (lineCommentPos !== -1) {
            // Count quotes before // to see if it's inside a string
            const beforeComment = beforeMatch.slice(0, lineCommentPos);
            const singleQuotes = (beforeComment.match(/'/g) || []).length;
            const doubleQuotes = (beforeComment.match(/"/g) || []).length;
            const backticks = (beforeComment.match(/`/g) || []).length;
            if (singleQuotes % 2 === 0 &&
                doubleQuotes % 2 === 0 &&
                backticks % 2 === 0) {
                return true;
            }
        }
        // Check for /* ... */ block comment before match
        const blockOpen = beforeMatch.lastIndexOf("/*");
        const blockClose = beforeMatch.lastIndexOf("*/");
        if (blockOpen !== -1 && blockClose < blockOpen)
            return true;
        // Check for # comment (Python)
        const hashPos = beforeMatch.lastIndexOf("#");
        if (hashPos !== -1) {
            const beforeHash = beforeMatch.slice(0, hashPos);
            const singleQuotes = (beforeHash.match(/'/g) || []).length;
            const doubleQuotes = (beforeHash.match(/"/g) || []).length;
            if (singleQuotes % 2 === 0 && doubleQuotes % 2 === 0) {
                return true;
            }
        }
        return false;
    }
    /**
     * Scan a single file for TODOs.
     */
    scanFile(filePath) {
        const absolutePath = path.resolve(filePath);
        if (!fs.existsSync(absolutePath))
            return [];
        let content;
        try {
            content = fs.readFileSync(absolutePath, "utf-8");
        }
        catch {
            return [];
        }
        const lines = content.split("\n");
        const items = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const matches = line.matchAll(this.pattern);
            for (const match of matches) {
                // Skip matches that aren't inside comments
                if (!this.isInComment(line, match.index ?? 0))
                    continue;
                const type = match[1];
                const message = (match[2] || "").trim().replace(/\s*\*\/\s*$/, ""); // Strip closing comment
                items.push({
                    type,
                    message: message.slice(0, 200), // Limit message length
                    file: path.relative(process.cwd(), absolutePath),
                    line: i + 1,
                    column: match.index || 0,
                });
            }
        }
        return items;
    }
    /**
     * Scan a list of pre-filtered files (recommended — uses source-filter module).
     * Callers should use collectSourceFiles() to get deduplicated source files.
     */
    scanFiles(filePaths) {
        const items = [];
        for (const filePath of filePaths) {
            // Skip this scanner file — its own type literals and regex cause false positives
            if (filePath.endsWith("todo-scanner.ts") ||
                filePath.endsWith("todo-scanner.js"))
                continue;
            // Skip test files — intentional annotations are test fixtures, not work items
            if (/\.(test|spec)\.[jt]sx?$/.test(filePath))
                continue;
            items.push(...this.scanFile(filePath));
        }
        return this.groupResults(items);
    }
    /**
     * Scan a directory recursively using the source-filter module to exclude build artifacts.
     * This is the preferred entry point for new callers.
     */
    scanDirectory(dirPath) {
        // Use source-filter to collect only source files (no build artifacts)
        const sourceFiles = collectSourceFiles(dirPath);
        return this.scanFiles(sourceFiles);
    }
    /**
     * Group scan results by type and file.
     */
    groupResults(items) {
        // Group by type
        const byType = new Map();
        for (const item of items) {
            const existing = byType.get(item.type) || [];
            existing.push(item);
            byType.set(item.type, existing);
        }
        // Group by file
        const byFile = new Map();
        for (const item of items) {
            const existing = byFile.get(item.file) || [];
            existing.push(item);
            byFile.set(item.file, existing);
        }
        return { items, byType, byFile };
    }
    /**
     * Format scan results for LLM consumption.
     */
    formatResult(result, maxItems = 30) {
        if (result.items.length === 0)
            return "";
        let output = `[TODOs] ${result.items.length} annotation(s) found`;
        // Summary by type
        const typeCounts = [];
        for (const [type, items] of result.byType) {
            typeCounts.push(`${items.length} ${type}`);
        }
        if (typeCounts.length > 0) {
            output += ` (${typeCounts.join(", ")})`;
        }
        output += ":\n";
        // Show by priority: FIXME/HACK first, then TODO
        const priorityOrder = [
            "FIXME",
            "HACK",
            "BUG",
            "TODO",
            "XXX",
        ];
        const sorted = [...result.items].sort((a, b) => {
            const aIdx = priorityOrder.indexOf(a.type);
            const bIdx = priorityOrder.indexOf(b.type);
            return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
        });
        for (const item of sorted.slice(0, maxItems)) {
            const icon = this.getIcon(item.type);
            output += `  ${icon} ${item.file}:${item.line} — ${item.type}: ${item.message}\n`;
        }
        if (result.items.length > maxItems) {
            output += `  ... and ${result.items.length - maxItems} more\n`;
        }
        return output;
    }
    getIcon(type) {
        switch (type) {
            case "FIXME":
                return "🔴";
            case "HACK":
                return "🟠";
            case "BUG":
                return "🐛";
            case "TODO":
                return "📝";
            case "XXX":
                return "❌";
            default:
                return "•";
        }
    }
}
