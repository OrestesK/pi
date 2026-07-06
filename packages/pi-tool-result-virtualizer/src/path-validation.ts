import { isAbsolute, normalize, sep } from "node:path";

const FILE_PATH_BYTE_LIMIT = 1024;

function byteLength(text: string): number {
	return Buffer.byteLength(text, "utf8");
}

export function validateManagedExportRelativePath(filePath: string): string {
	const normalized = normalize(filePath);
	const hasParentTraversal = normalized === ".." || normalized.startsWith(`..${sep}`) || normalized.split(sep).includes("..");
	if (normalized === "." || byteLength(filePath) > FILE_PATH_BYTE_LIMIT || filePath.includes("\0") || isAbsolute(filePath) || hasParentTraversal) {
		throw new Error(`Invalid filePath: expected relative path under ${FILE_PATH_BYTE_LIMIT} bytes inside the managed exports directory, without NUL bytes or parent traversal`);
	}
	return normalized;
}
