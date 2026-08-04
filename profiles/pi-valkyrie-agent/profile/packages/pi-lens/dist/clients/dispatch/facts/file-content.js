import * as fs from "node:fs/promises";
export const fileContentProvider = {
    id: "fact.file.content",
    provides: ["file.content"],
    requires: [],
    appliesTo(_ctx) {
        return true;
    },
    async run(ctx, store) {
        let content;
        try {
            content = await fs.readFile(ctx.filePath, "utf-8");
        }
        catch {
            content = null;
        }
        store.setFileFact(ctx.filePath, "file.content", content);
    },
};
