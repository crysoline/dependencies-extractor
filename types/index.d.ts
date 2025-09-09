export type DeclarationInfo = {
    /**
     * - The AST node
     */
    node: Object;
    /**
     * - Type of declaration
     */
    type: "function" | "variable" | "class" | "import" | "nested-function" | "arrow-function" | "method" | "default-export" | "named-export";
    /**
     * - The Babel path object
     */
    path: Object;
    /**
     * - For imports, track the source file path
     */
    source?: string | undefined;
    /**
     * - For nested functions, track the parent function name
     */
    parentFunction?: string | undefined;
    /**
     * - Nesting depth for nested functions
     */
    depth?: number | undefined;
    /**
     * - For methods, track the parent class name
     */
    className?: string | undefined;
    /**
     * - The original code snippet for regex matching
     */
    originalCode: string;
};
export type ExtractionResult = {
    /**
     * - Whether extraction was successful
     */
    success: boolean;
    /**
     * - Result message
     */
    message: string;
    /**
     * - The extracted code
     */
    finalCode: string;
    /**
     * - Additional metadata about the extraction
     */
    metadata: {
        resolvedImports: string[];
        unresolvedImports: string[];
        matchedPatterns: string[];
        matchDetails: Object[];
    };
};
/**
 * Enhanced pattern extractor that works with any regex pattern! ✨
 * Searches through original code using regex, not just identifiers! 🥰
 * @param {string} sourceCode - The source code to parse
 * @param {RegExp} patternRegex - Regex to match against the original code
 * @param {string} [currentFilePath] - Current file path for import resolution
 * @returns {ExtractionResult} The extraction result
 */
export function extractPatternWithDependencies(sourceCode: string, patternRegex: RegExp, currentFilePath?: string): ExtractionResult;
/**
 * Convenience function with import resolution and pattern matching! 💫
 * @param {string} code - The source code to parse
 * @param {string} regexPattern - Regular expression pattern to match against code
 * @param {string} [currentFilePath] - Current file path for import resolution
 * @returns {ExtractionResult} The extraction result
 */
export function findAndExtract(code: string, regexPattern: string, currentFilePath?: string): ExtractionResult;
/**
 * Super cute helper to extract multiple patterns at once! 🌈
 * @param {string} code - The source code to parse
 * @param {Array<string>} regexPatterns - Array of regex pattern strings
 * @param {string} [currentFilePath] - Current file path for import resolution
 * @returns {ExtractionResult} Combined extraction result
 */
export function extractMultiplePatterns(code: string, regexPatterns: Array<string>, currentFilePath?: string): ExtractionResult;
/**
 * Extract by exact name matches (for backwards compatibility) 💝
 * @param {string} code - The source code to parse
 * @param {Array<string>} names - Array of exact names to match
 * @param {string} [currentFilePath] - Current file path for import resolution
 * @returns {ExtractionResult} The extraction result
 */
export function extractByNames(code: string, names: Array<string>, currentFilePath?: string): ExtractionResult;
/**
 * Helper function to create regex patterns for common code patterns 🎨
 * @param {string} patternType - Type of pattern ('function', 'class', 'variable', 'arrow', 'method', 'export')
 * @param {string} namePattern - Pattern to match names (can be regex string)
 * @returns {RegExp} Compiled regex pattern
 */
export function createPattern(patternType: string, namePattern?: string): RegExp;
/**
 * Simple regex-based code extraction that finds containers and extracts with dependencies 🎯
 * Finds ANY code pattern with regex, locates its container (function/class/method),
 * then extracts that container with all dependencies!
 * @param {string} code - Source code to search in
 * @param {string|RegExp} pattern - Regex pattern to match ANY piece of code
 * @param {boolean} [extractFull=true] - Whether to extract full declarations with dependencies
 * @returns {Object} Extraction results with container and dependencies
 */
export function simpleRegexExtract(code: string, pattern: string | RegExp, extractFull?: boolean): Object;
/**
 * Just match stuff in code, no fancy parsing! 🌟
 * @param {string} code - Source code to search
 * @param {string|RegExp} pattern - Regex pattern to match
 * @param {boolean} [extractFull=false] - Extract full declarations or just matches
 * @returns {Object} Simple results
 */
export function justMatch(code: string, pattern: string | RegExp, extractFull?: boolean): Object;
/**
 * Find and extract with BOTH methods! Best of both worlds~ 🎭
 * @param {string} code - The source code
 * @param {string} pattern - Regex pattern
 * @param {string} [method='simple'] - 'simple' for regex.match() or 'complex' for AST parsing
 * @param {string} [currentFilePath] - File path for complex method
 * @returns {Object} Results based on chosen method
 */
export function flexibleExtract(code: string, pattern: string, method?: string, currentFilePath?: string): Object;
/**
 * Pretty print extraction results! 🎨
 * @param {ExtractionResult} result - The extraction result to print
 */
export function printResults(result: ExtractionResult): void;
