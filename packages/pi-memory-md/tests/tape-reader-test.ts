import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { getSessionFilePath, parseSessionFile } from "../tape/tape-reader.js";

function encodeSessionPath(cwd: string): string {
	return `--${cwd.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`;
}

function sessionHeader(id: string, cwd: string): string {
	return JSON.stringify({
		type: "session",
		version: 3,
		id,
		timestamp: "2026-01-01T00:00:00.000Z",
		cwd,
	});
}

function messageEntry(index: number, timestamp: string): string {
	return JSON.stringify({
		type: "message",
		id: `entry-${index}`,
		parentId: index === 0 ? null : `entry-${index - 1}`,
		timestamp,
		message: {
			role: "user",
			content: `message ${index}`,
			timestamp: Date.parse(timestamp),
		},
	});
}

function messageEntryWithContent(content: string): string {
	return JSON.stringify({
		type: "message",
		id: "entry-utf8",
		parentId: null,
		timestamp: "2026-01-01T00:00:00.000Z",
		message: {
			role: "user",
			content,
			timestamp: Date.parse("2026-01-01T00:00:00.000Z"),
		},
	});
}

function contentWithEmojiSplitAt(targetByteIndex: number): string {
	const emoji = "🙂";
	let fillerLength = targetByteIndex;

	while (true) {
		const content = `${"a".repeat(fillerLength)}${emoji}`;
		const line = messageEntryWithContent(content);
		const emojiIndex = Buffer.from(line).indexOf(Buffer.from(emoji));
		if (emojiIndex === targetByteIndex) return content;
		fillerLength += targetByteIndex - emojiIndex;
	}
}

test("parseSessionFile streams and keeps only the requested newest entries", async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "pi-memory-tape-reader-"));
	try {
		const cwd = path.join(root, "project");
		const sessionPath = path.join(root, "session.jsonl");
		const lines = [sessionHeader("session-1", cwd)];
		for (let index = 0; index < 10; index++) {
			lines.push(messageEntry(index, `2026-01-01T00:00:0${index}.000Z`));
		}
		lines.splice(5, 0, "not valid json");
		await writeFile(sessionPath, `${lines.join("\n")}\n`);

		const parsed = parseSessionFile(sessionPath, { maxEntries: 3 });

		assert.equal(parsed?.header.id, "session-1");
		assert.deepEqual(
			parsed?.entries.map((entry) => entry.id),
			["entry-7", "entry-8", "entry-9"],
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("parseSessionFile can filter entries while streaming", async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "pi-memory-tape-reader-"));
	try {
		const cwd = path.join(root, "project");
		const sessionPath = path.join(root, "session.jsonl");
		const lines = [sessionHeader("session-1", cwd)];
		for (let index = 0; index < 10; index++) {
			lines.push(messageEntry(index, `2026-01-01T00:00:0${index}.000Z`));
		}
		await writeFile(sessionPath, `${lines.join("\n")}\n`);

		const parsed = parseSessionFile(sessionPath, {
			since: "2026-01-01T00:00:06.000Z",
		});

		assert.deepEqual(
			parsed?.entries.map((entry) => entry.id),
			["entry-7", "entry-8", "entry-9"],
		);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("parseSessionFile preserves multibyte UTF-8 split across chunks", async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "pi-memory-tape-reader-"));
	try {
		const cwd = path.join(root, "project");
		const sessionPath = path.join(root, "session.jsonl");
		const content = contentWithEmojiSplitAt(1024 * 1024 - 1);
		await writeFile(
			sessionPath,
			`${sessionHeader("session-1", cwd)}\n${messageEntryWithContent(content)}\n`,
		);

		const parsed = parseSessionFile(sessionPath);
		const [entry] = parsed?.entries ?? [];

		assert.equal(entry?.type, "message");
		assert.equal(entry?.message.role, "user");
		assert.equal(entry?.message.content, content);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("getSessionFilePath reads session headers without parsing body lines", async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "pi-memory-tape-reader-"));
	const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
	try {
		const agentDir = path.join(root, "agent");
		const cwd = path.join(root, "project");
		const sessionDir = path.join(agentDir, "sessions", encodeSessionPath(cwd));
		await mkdir(sessionDir, { recursive: true });
		process.env.PI_CODING_AGENT_DIR = agentDir;

		const targetPath = path.join(sessionDir, "target.jsonl");
		await writeFile(
			targetPath,
			`${sessionHeader("target-session", cwd)}\n${"x".repeat(1024 * 1024)}\n`,
		);

		assert.equal(getSessionFilePath(cwd, "target-session"), targetPath);
	} finally {
		if (previousAgentDir === undefined) {
			delete process.env.PI_CODING_AGENT_DIR;
		} else {
			process.env.PI_CODING_AGENT_DIR = previousAgentDir;
		}
		await rm(root, { recursive: true, force: true });
	}
});
