/**
 * Tree-sitter AST Navigator
 *
 * Provides tree traversal utilities for context-aware analysis:
 * - Parent/sibling navigation
 * - Scope detection (test vs production)
 * - Variable shadowing detection
 * - Context-aware filtering
 */
export class TreeSitterNavigator {
    /**
     * Find parent node of a specific type
     */
    findParent(node, type) {
        let current = node.parent;
        const types = Array.isArray(type) ? type : [type];
        while (current) {
            if (types.includes(current.type)) {
                return current;
            }
            current = current.parent;
        }
        return null;
    }
    /**
     * Check if node is inside a specific type of parent
     */
    isInside(node, type) {
        return this.findParent(node, type) !== null;
    }
    /**
     * Get all ancestors of a node
     */
    getAncestors(node) {
        const ancestors = [];
        let current = node.parent;
        while (current) {
            ancestors.push(current);
            current = current.parent;
        }
        return ancestors;
    }
    /**
     * Detect if we're in a test block (it, describe, test, etc.)
     */
    isInTestBlock(node) {
        const testPatterns = [
            "call_expression", // it(), describe(), test()
        ];
        let current = node.parent;
        while (current) {
            if (testPatterns.includes(current.type)) {
                // Check if the call is a test function
                const callName = this.getCallName(current);
                if (callName &&
                    /^\b(it|describe|test|before|after|beforeEach|afterEach)\b/.test(callName)) {
                    return true;
                }
            }
            current = current.parent;
        }
        return false;
    }
    /**
     * Get the name of a call expression (e.g., "it" from it("test", ...))
     */
    getCallName(node) {
        if (node.type !== "call_expression")
            return null;
        const func = node.children[0];
        if (!func)
            return null;
        if (func.type === "identifier") {
            return func.text;
        }
        if (func.type === "member_expression") {
            // Handle cases like describe.skip, it.only, etc.
            const parts = [];
            for (const child of func.children) {
                if (child.type === "identifier" ||
                    child.type === "property_identifier") {
                    parts.push(child.text);
                }
            }
            return parts.join(".");
        }
        return null;
    }
    /**
     * Detect if we're inside a try/catch block
     * Use as post_filter: not_in_try_catch to enforce "must be wrapped"
     */
    isInTryCatch(node) {
        // try_statement: TypeScript, JavaScript, Python
        // begin:         Ruby (begin/rescue/ensure)
        // rescue:        Ruby inline rescue modifier
        return this.isInside(node, ["try_statement", "begin", "rescue"]);
    }
    /**
     * Detect if we're inside a loop (for, while, forEach)
     */
    isInLoop(node) {
        return this.isInside(node, [
            "for_statement",
            "while_statement",
            "do_statement",
            "for_in_statement",
            "for_of_statement",
        ]);
    }
    /**
     * Detect if we're in an async context (async function or contains await)
     */
    isInAsyncContext(node) {
        // Check parent function for async keyword
        const functionTypes = [
            "function_declaration",
            "function_expression",
            "arrow_function",
            "method_definition",
        ];
        let current = node.parent;
        while (current) {
            if (functionTypes.includes(current.type)) {
                // Check for async keyword
                if (current.children?.some((c) => c.text === "async")) {
                    return true;
                }
            }
            current = current.parent;
        }
        return false;
    }
    /**
     * Get scope chain (list of function/block scopes enclosing this node)
     */
    getScopeChain(node) {
        const chain = [];
        let current = node.parent;
        while (current) {
            if ([
                "function_declaration",
                "function_expression",
                "arrow_function",
                "method_definition",
                "block",
                "statement_block",
            ].includes(current.type)) {
                const name = this.getNodeName(current);
                if (name) {
                    chain.push(name);
                }
                else {
                    chain.push(`<${current.type}>`);
                }
            }
            current = current.parent;
        }
        return chain;
    }
    /**
     * Get name of a function/class node
     */
    getNodeName(node) {
        // Try to find name identifier
        for (const child of node.children || []) {
            if (child.type === "identifier" && child.isNamed) {
                return child.text;
            }
        }
        // For member definitions, check name field
        if (node.type === "method_definition") {
            const nameNode = node.children?.find((c) => c.type === "property_identifier");
            return nameNode?.text || null;
        }
        return null;
    }
    /**
     * Check if a variable is shadowed in current scope
     */
    isShadowed(node, varName) {
        // Navigate up to find if this variable name is redeclared
        let current = node.parent;
        while (current) {
            // Check for variable declarations
            if (["variable_declaration", "lexical_declaration"].includes(current.type)) {
                // Check if this declaration shadows our variable
                const declarator = current.children?.find((c) => c.type === "variable_declarator");
                if (declarator) {
                    const idNode = declarator.children?.find((c) => c.type === "identifier");
                    if (idNode?.text === varName) {
                        return true;
                    }
                }
            }
            // Check function parameters
            if ([
                "function_declaration",
                "function_expression",
                "arrow_function",
                "method_definition",
            ].includes(current.type)) {
                const params = current.children?.find((c) => c.type === "formal_parameters");
                if (params) {
                    for (const param of params.children || []) {
                        if (param.type === "identifier" && param.text === varName) {
                            return true;
                        }
                    }
                }
            }
            current = current.parent;
        }
        return false;
    }
    /**
     * Get comprehensive scope context for a node
     */
    getScopeContext(node) {
        const ancestors = this.getAncestors(node);
        const functionDepth = ancestors.filter((a) => [
            "function_declaration",
            "function_expression",
            "arrow_function",
            "method_definition",
        ].includes(a.type)).length;
        return {
            isTestBlock: this.isInTestBlock(node),
            isLoop: this.isInLoop(node),
            isAsync: this.isInAsyncContext(node),
            functionDepth,
            scopeChain: this.getScopeChain(node),
        };
    }
    /**
     * Find sibling nodes (nodes at the same level)
     */
    getSiblings(node) {
        if (!node.parent)
            return [];
        return node.parent.children?.filter((c) => c !== node) || [];
    }
    /**
     * Get previous sibling
     */
    getPreviousSibling(node) {
        if (!node.parent)
            return null;
        const siblings = node.parent.children || [];
        const index = siblings.indexOf(node);
        if (index > 0) {
            return siblings[index - 1];
        }
        return null;
    }
    /**
     * Get next sibling
     */
    getNextSibling(node) {
        if (!node.parent)
            return null;
        const siblings = node.parent.children || [];
        const index = siblings.indexOf(node);
        if (index >= 0 && index < siblings.length - 1) {
            return siblings[index + 1];
        }
        return null;
    }
}
