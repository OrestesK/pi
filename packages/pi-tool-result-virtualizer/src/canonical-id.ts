import { createHmac, randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const IDENTITY_KEY_FILE = "receipt-identity.key";
const IDENTITY_KEY_BYTES = 32;

export type CanonicalSourceIdentity = {
	projectId: string;
	toolName: string;
	captureStatus: string;
	sha256: string;
};

function identityPayload(identity: CanonicalSourceIdentity): string {
	return [
		"v1",
		identity.projectId,
		identity.toolName,
		identity.captureStatus,
		identity.sha256,
	].join("\u0000");
}

async function readIdentityKey(path: string): Promise<Buffer | undefined> {
	try {
		const key = await readFile(path);
		return key.byteLength === IDENTITY_KEY_BYTES ? key : undefined;
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT")
			return undefined;
		throw error;
	}
}

async function identityKey(root: string): Promise<Buffer> {
	await mkdir(root, { recursive: true, mode: 0o700 });
	await chmod(root, 0o700);
	const path = join(root, IDENTITY_KEY_FILE);
	const existing = await readIdentityKey(path);
	if (existing !== undefined) return existing;
	const created = randomBytes(IDENTITY_KEY_BYTES);
	try {
		await writeFile(path, created, { flag: "wx", mode: 0o600 });
		return created;
	} catch (error) {
		if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST")
			throw error;
		const raced = await readIdentityKey(path);
		if (raced === undefined)
			throw new Error("tool-result identity key exists but is invalid");
		return raced;
	}
}

export async function canonicalSourceId(
	root: string,
	identity: CanonicalSourceIdentity,
): Promise<string> {
	const key = await identityKey(root);
	return `tr_${createHmac("sha256", key).update(identityPayload(identity)).digest("hex")}`;
}

export const canonicalIdentityKeyPath = (root: string) =>
	join(root, IDENTITY_KEY_FILE);
