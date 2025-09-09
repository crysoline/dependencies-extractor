const fs = require("fs");
const path = require("path");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const generate = require("@babel/generator").default;

/**
 * @typedef {Object} DeclarationInfo
 * @property {Object} node - The AST node
 * @property {'function'|'variable'|'class'|'import'|'nested-function'|'arrow-function'|'method'|'default-export'|'named-export'} type - Type of declaration
 * @property {Object} path - The Babel path object
 * @property {string} [source] - For imports, track the source file path
 * @property {string} [parentFunction] - For nested functions, track the parent function name
 * @property {number} [depth] - Nesting depth for nested functions
 * @property {string} [className] - For methods, track the parent class name
 * @property {string} originalCode - The original code snippet for regex matching
 */

/**
 * @typedef {Object} ExtractionResult
 * @property {boolean} success - Whether extraction was successful
 * @property {string} message - Result message
 * @property {string} finalCode - The extracted code
 * @property {Object} metadata - Additional metadata about the extraction
 * @property {string[]} metadata.resolvedImports - Successfully resolved import paths
 * @property {string[]} metadata.unresolvedImports - Import paths that couldn't be resolved
 * @property {string[]} metadata.matchedPatterns - Found patterns matching the regex
 * @property {Object[]} metadata.matchDetails - Detailed info about each match
 */

/**
 * Creates a professional logger with different log levels
 * @returns {Object} Logger object with different log methods
 */
function createLogger() {
  const LOG_LEVELS = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3,
    SUCCESS: 4,
  };

  const currentLogLevel = LOG_LEVELS.DEBUG;

  return {
    error: (message, ...args) => {
      if (currentLogLevel >= LOG_LEVELS.ERROR) {
        console.error(`🚨 [ERROR] ${message}`, ...args);
      }
    },
    warn: (message, ...args) => {
      if (currentLogLevel >= LOG_LEVELS.WARN) {
        console.warn(`⚠️ [WARN] ${message}`, ...args);
      }
    },
    info: (message, ...args) => {
      if (currentLogLevel >= LOG_LEVELS.INFO) {
        console.info(`ℹ️ [INFO] ${message}`, ...args);
      }
    },
    debug: (message, ...args) => {
      if (currentLogLevel >= LOG_LEVELS.DEBUG) {
        console.debug(`🔍 [DEBUG] ${message}`, ...args);
      }
    },
    success: (message, ...args) => {
      if (currentLogLevel >= LOG_LEVELS.SUCCESS) {
        console.log(`✅ [SUCCESS] ${message}`, ...args);
      }
    },
  };
}

const logger = createLogger();

/**
 * Attempts to resolve an import path to an actual file 🔍
 * @param {string} importPath - The import path to resolve
 * @param {string} currentFilePath - The current file's path for relative resolution
 * @returns {string|null} Resolved file path or null if not found
 */
function resolveImportPath(importPath, currentFilePath) {
  const baseDir = path.dirname(currentFilePath);

  const extensions = [".js", ".ts", ".jsx", ".tsx", ".mjs"];

  if (importPath.startsWith("./") || importPath.startsWith("../")) {
    const basePath = path.resolve(baseDir, importPath);

    if (fs.existsSync(basePath) && fs.statSync(basePath).isFile()) {
      return basePath;
    }

    for (const ext of extensions) {
      const fullPath = basePath + ext;
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }

    const indexPath = path.join(basePath, "index");
    for (const ext of extensions) {
      const fullIndexPath = indexPath + ext;
      if (fs.existsSync(fullIndexPath)) {
        return fullIndexPath;
      }
    }
  }

  try {
    const resolved = require.resolve(importPath, { paths: [baseDir] });
    return resolved;
  } catch (error) {
    logger.debug(`Could not resolve node_modules import: ${importPath}`);
  }

  return null;
}

/**
 * Reads and parses a JavaScript file, returning its AST and declarations
 * @param {string} filePath - Path to the file to read
 * @returns {Object|null} Object containing AST and declarations map, or null if failed
 */
function parseFile(filePath) {
  try {
    const fileContent = fs.readFileSync(filePath, "utf8");
    logger.debug(`Reading file: ${filePath}`);

    const ast = parser.parse(fileContent, {
      sourceType: "module",
      allowImportExportEverywhere: true,
      allowReturnOutsideFunction: true,
      plugins: [
        "asyncGenerators",
        "bigInt",
        "classProperties",
        "decorators-legacy",
        "doExpressions",
        "dynamicImport",
        "exportDefaultFrom",
        "exportNamespaceFrom",
        "functionBind",
        "functionSent",
        "importMeta",
        "nullishCoalescingOperator",
        "numericSeparator",
        "objectRestSpread",
        "optionalCatchBinding",
        "optionalChaining",
        "throwExpressions",
        "topLevelAwait",
        "trailingFunctionCommas",
      ],
    });

    const declarations = new Map();

    findAllDeclarations(ast, declarations, filePath, fileContent);

    return { ast, declarations };
  } catch (error) {
    logger.warn(`Failed to parse file ${filePath}: ${error.message}`);
    return null;
  }
}

/**
 * Finds all code patterns including nested ones! So cute~ 🐱
 * @param {Object} ast - The AST to traverse
 * @param {Map<string, DeclarationInfo>} declarations - Map to store found declarations
 * @param {string} filePath - Current file path
 * @param {string} sourceCode - Original source code for regex matching
 * @param {string} [parentFunction] - Parent function name for nested functions
 * @param {number} [depth=0] - Current nesting depth
 * @param {string} [className] - Current class name for methods
 */
function findAllDeclarations(
  ast,
  declarations,
  filePath,
  sourceCode,
  parentFunction,
  depth = 0,
  className
) {
  traverse(ast, {
    FunctionDeclaration(path) {
      const name = path.node.id?.name;
      if (name) {
        const originalCode = generate(path.node, { compact: false }).code;
        const declarationInfo = {
          node: path.node,
          type: parentFunction ? "nested-function" : "function",
          path: path,
          source: filePath,
          originalCode: originalCode,
        };

        if (parentFunction) {
          declarationInfo.parentFunction = parentFunction;
          declarationInfo.depth = depth;
          logger.debug(
            `🪆 Found nested function: ${name} inside ${parentFunction} (depth: ${depth})`
          );
        }

        if (className) {
          declarationInfo.className = className;
        }

        declarations.set(name, declarationInfo);

        findNestedPatternsInScope(
          path,
          declarations,
          filePath,
          sourceCode,
          name,
          depth + 1,
          className
        );
      }
    },

    VariableDeclarator(path) {
      const name = path.node.id?.name;
      if (name) {
        const originalCode = generate(path.parent, { compact: false }).code;
        const declarationInfo = {
          node: path.parent,
          type:
            path.node.init?.type === "ArrowFunctionExpression"
              ? "arrow-function"
              : "variable",
          path: path.parentPath,
          source: filePath,
          originalCode: originalCode,
        };

        if (parentFunction) {
          declarationInfo.parentFunction = parentFunction;
          declarationInfo.depth = depth;
        }

        if (className) {
          declarationInfo.className = className;
        }

        declarations.set(name, declarationInfo);

        if (
          path.node.init &&
          (path.node.init.type === "FunctionExpression" ||
            path.node.init.type === "ArrowFunctionExpression")
        ) {
          logger.debug(
            `🎯 Found ${path.node.init.type}: ${name}${
              parentFunction ? ` inside ${parentFunction}` : ""
            }`
          );

          if (path.node.init.type === "FunctionExpression") {
            findNestedPatternsInExpression(
              path.get("init"),
              declarations,
              filePath,
              sourceCode,
              name,
              depth + 1,
              className
            );
          }
        }
      }
    },

    ClassDeclaration(path) {
      const name = path.node.id?.name;
      if (name) {
        const originalCode = generate(path.node, { compact: false }).code;
        const declarationInfo = {
          node: path.node,
          type: "class",
          path: path,
          source: filePath,
          originalCode: originalCode,
        };

        if (parentFunction) {
          declarationInfo.parentFunction = parentFunction;
          declarationInfo.depth = depth;
        }

        declarations.set(name, declarationInfo);

        findClassMethods(path, declarations, filePath, sourceCode, name, depth);
      }
    },

    ClassMethod(path) {
      if (className) {
        const name =
          path.node.key?.name ||
          (path.node.key?.type === "Identifier" ? path.node.key.name : null);
        if (name) {
          const originalCode = generate(path.node, { compact: false }).code;
          const declarationInfo = {
            node: path.node,
            type: "method",
            path: path,
            source: filePath,
            className: className,
            originalCode: originalCode,
          };

          if (parentFunction) {
            declarationInfo.parentFunction = parentFunction;
            declarationInfo.depth = depth;
          }

          const fullName = `${className}.${name}`;
          declarations.set(fullName, declarationInfo);
          declarations.set(name, declarationInfo);

          findNestedPatternsInScope(
            path,
            declarations,
            filePath,
            sourceCode,
            name,
            depth + 1,
            className
          );
        }
      }
    },

    ExportNamedDeclaration(path) {
      if (path.node.declaration) {
        const declaration = path.node.declaration;
        let name = null;
        let type = "named-export";

        if (
          declaration.type === "FunctionDeclaration" ||
          declaration.type === "ClassDeclaration"
        ) {
          name = declaration.id?.name || null;
          type = declaration.type.toLowerCase().replace("declaration", "");
        } else if (declaration.type === "VariableDeclaration") {
          name = declaration.declarations[0]?.id?.name || null;
          type =
            declaration.declarations[0]?.init?.type ===
            "ArrowFunctionExpression"
              ? "arrow-function"
              : "variable";
        }

        if (name) {
          const originalCode = generate(path.node, { compact: false }).code;
          const declarationInfo = {
            node: declaration,
            type: type,
            path: path,
            source: filePath,
            originalCode: originalCode,
          };

          if (parentFunction) {
            declarationInfo.parentFunction = parentFunction;
            declarationInfo.depth = depth;
          }

          if (className) {
            declarationInfo.className = className;
          }

          declarations.set(name, declarationInfo);
        }
      }

      if (path.node.specifiers && path.node.specifiers.length > 0) {
        path.node.specifiers.forEach((spec) => {
          if (spec.type === "ExportSpecifier") {
            const name = spec.local.name;
            const originalCode = generate(path.node, { compact: false }).code;
            declarations.set(name, {
              node: path.node,
              type: "named-export",
              path: path,
              source: filePath,
              originalCode: originalCode,
            });
          }
        });
      }
    },

    ExportDefaultDeclaration(path) {
      const originalCode = generate(path.node, { compact: false }).code;
      let name = "default";
      let type = "default-export";

      if (path.node.declaration.type === "FunctionDeclaration") {
        name = path.node.declaration.id?.name || "default";
        type = "function";
      } else if (path.node.declaration.type === "ClassDeclaration") {
        name = path.node.declaration.id?.name || "default";
        type = "class";
      } else if (path.node.declaration.type === "Identifier") {
        name = path.node.declaration.name;
      }

      const declarationInfo = {
        node: path.node,
        type: type,
        path: path,
        source: filePath,
        originalCode: originalCode,
      };

      declarations.set(name, declarationInfo);
      declarations.set("default", declarationInfo); // Always add 'default' key
    },
  });
}

/**
 * Finds class methods within a class declaration 🏛️✨
 * @param {Object} classPath - The class path to search within
 * @param {Map<string, DeclarationInfo>} declarations - Map to store found declarations
 * @param {string} filePath - Current file path
 * @param {string} sourceCode - Original source code
 * @param {string} className - Class name
 * @param {number} depth - Current nesting depth
 */
function findClassMethods(
  classPath,
  declarations,
  filePath,
  sourceCode,
  className,
  depth
) {
  classPath.traverse({
    ClassMethod(path) {
      const name =
        path.node.key?.name ||
        (path.node.key?.type === "Identifier" ? path.node.key.name : null);
      if (name) {
        const originalCode = generate(path.node, { compact: false }).code;
        logger.debug(`🎭 Found class method: ${className}.${name}`);

        const declarationInfo = {
          node: path.node,
          type: "method",
          path: path,
          source: filePath,
          className: className,
          originalCode: originalCode,
        };

        const fullName = `${className}.${name}`;
        declarations.set(fullName, declarationInfo);
        declarations.set(name, declarationInfo);

        findNestedPatternsInScope(
          path,
          declarations,
          filePath,
          sourceCode,
          name,
          depth + 1,
          className
        );
      }
      path.skip();
    },
  });
}

/**
 * Finds nested patterns within a scope 🔍✨
 * @param {Object} scopePath - The scope path to search within
 * @param {Map<string, DeclarationInfo>} declarations - Map to store found declarations
 * @param {string} filePath - Current file path
 * @param {string} sourceCode - Original source code
 * @param {string} parentName - Parent scope name
 * @param {number} depth - Current nesting depth
 * @param {string} [className] - Current class name
 */
function findNestedPatternsInScope(
  scopePath,
  declarations,
  filePath,
  sourceCode,
  parentName,
  depth,
  className
) {
  scopePath.traverse({
    FunctionDeclaration(path) {
      if (path === scopePath) return;

      const name = path.node.id?.name;
      if (name) {
        const originalCode = generate(path.node, { compact: false }).code;
        logger.debug(
          `🪆 Found nested function declaration: ${name} inside ${parentName} (depth: ${depth})`
        );

        declarations.set(name, {
          node: path.node,
          type: "nested-function",
          path: path,
          source: filePath,
          parentFunction: parentName,
          depth: depth,
          className: className,
          originalCode: originalCode,
        });

        findNestedPatternsInScope(
          path,
          declarations,
          filePath,
          sourceCode,
          name,
          depth + 1,
          className
        );
      }

      path.skip();
    },

    VariableDeclarator(path) {
      const name = path.node.id?.name;
      if (name && path.node.init) {
        const originalCode = generate(path.parent, { compact: false }).code;
        const isFunction =
          path.node.init.type === "FunctionExpression" ||
          path.node.init.type === "ArrowFunctionExpression";

        if (isFunction) {
          logger.debug(
            `🏹 Found nested ${path.node.init.type}: ${name} inside ${parentName} (depth: ${depth})`
          );
        }

        declarations.set(name, {
          node: path.parent,
          type: isFunction ? "nested-function" : "variable",
          path: path.parentPath,
          source: filePath,
          parentFunction: parentName,
          depth: depth,
          className: className,
          originalCode: originalCode,
        });

        if (path.node.init.type === "FunctionExpression") {
          findNestedPatternsInExpression(
            path.get("init"),
            declarations,
            filePath,
            sourceCode,
            name,
            depth + 1,
            className
          );
        }
      }
    },

    ClassDeclaration(path) {
      const name = path.node.id?.name;
      if (name) {
        const originalCode = generate(path.node, { compact: false }).code;
        logger.debug(
          `🏛️ Found nested class: ${name} inside ${parentName} (depth: ${depth})`
        );

        declarations.set(name, {
          node: path.node,
          type: "class",
          path: path,
          source: filePath,
          parentFunction: parentName,
          depth: depth,
          originalCode: originalCode,
        });

        findClassMethods(
          path,
          declarations,
          filePath,
          sourceCode,
          name,
          depth + 1
        );
      }
      path.skip();
    },
  });
}

/**
 * Finds nested patterns within a function expression 💝
 * @param {Object} expressionPath - The expression path to search within
 * @param {Map<string, DeclarationInfo>} declarations - Map to store found declarations
 * @param {string} filePath - Current file path
 * @param {string} sourceCode - Original source code
 * @param {string} parentName - Parent function name
 * @param {number} depth - Current nesting depth
 * @param {string} [className] - Current class name
 */
function findNestedPatternsInExpression(
  expressionPath,
  declarations,
  filePath,
  sourceCode,
  parentName,
  depth,
  className
) {
  expressionPath.traverse({
    FunctionDeclaration(path) {
      const name = path.node.id?.name;
      if (name) {
        const originalCode = generate(path.node, { compact: false }).code;
        logger.debug(
          `🎭 Found function declaration in expression: ${name} inside ${parentName} (depth: ${depth})`
        );

        declarations.set(name, {
          node: path.node,
          type: "nested-function",
          path: path,
          source: filePath,
          parentFunction: parentName,
          depth: depth,
          className: className,
          originalCode: originalCode,
        });

        findNestedPatternsInScope(
          path,
          declarations,
          filePath,
          sourceCode,
          name,
          depth + 1,
          className
        );
      }
      path.skip();
    },

    VariableDeclarator(path) {
      const name = path.node.id?.name;
      if (name && path.node.init) {
        const originalCode = generate(path.parent, { compact: false }).code;
        const isFunction =
          path.node.init.type === "FunctionExpression" ||
          path.node.init.type === "ArrowFunctionExpression";

        if (isFunction) {
          logger.debug(
            `🌟 Found nested function expression in expression: ${name} inside ${parentName} (depth: ${depth})`
          );
        }

        declarations.set(name, {
          node: path.parent,
          type: isFunction ? "nested-function" : "variable",
          path: path.parentPath,
          source: filePath,
          parentFunction: parentName,
          depth: depth,
          className: className,
          originalCode: originalCode,
        });
      }
    },
  });
}

/**
 * Enhanced pattern extractor that works with any regex pattern! ✨
 * Searches through original code using regex, not just identifiers! 🥰
 * @param {string} sourceCode - The source code to parse
 * @param {RegExp} patternRegex - Regex to match against the original code
 * @param {string} [currentFilePath] - Current file path for import resolution
 * @returns {ExtractionResult} The extraction result
 */
function extractPatternWithDependencies(
  sourceCode,
  patternRegex,
  currentFilePath = process.cwd() + "/main.js"
) {
  logger.info(
    "🚀 Starting enhanced pattern extraction with regex search support!"
  );

  let ast;
  try {
    ast = parser.parse(sourceCode, {
      sourceType: "module",
      allowImportExportEverywhere: true,
      allowReturnOutsideFunction: true,
      plugins: [
        "asyncGenerators",
        "bigInt",
        "classProperties",
        "decorators-legacy",
        "doExpressions",
        "dynamicImport",
        "exportDefaultFrom",
        "exportNamespaceFrom",
        "functionBind",
        "functionSent",
        "importMeta",
        "nullishCoalescingOperator",
        "numericSeparator",
        "objectRestSpread",
        "optionalCatchBinding",
        "optionalChaining",
        "throwExpressions",
        "topLevelAwait",
        "trailingFunctionCommas",
      ],
    });
    logger.success("Main source code parsed successfully");
  } catch (error) {
    logger.error(`Failed to parse source code: ${error.message}`);
    throw new Error(`Parse error: ${error.message}`);
  }

  const matchedPatterns = new Set();
  const matchDetails = [];
  const dependencies = new Set();
  const nodesToInclude = new Set();
  const resolvedImports = [];
  const unresolvedImports = [];

  const globalDeclarations = new Map();

  findAllDeclarations(ast, globalDeclarations, currentFilePath, sourceCode);

  traverse(ast, {
    ImportDeclaration(path) {
      const importPath = path.node.source.value;
      const resolvedPath = resolveImportPath(importPath, currentFilePath);

      if (resolvedPath && resolvedPath !== currentFilePath) {
        logger.success(`✨ Resolved import: ${importPath} -> ${resolvedPath}`);
        resolvedImports.push(importPath);

        const parsedFile = parseFile(resolvedPath);
        if (parsedFile) {
          parsedFile.declarations.forEach((declaration, name) => {
            globalDeclarations.set(name, declaration);
            logger.debug(
              `Added imported declaration: ${name} from ${resolvedPath}`
            );
          });
        }
      } else {
        logger.warn(`❌ Could not resolve import: ${importPath}`);
        unresolvedImports.push(importPath);

        path.node.specifiers.forEach((spec) => {
          const name = spec.local.name;
          const originalCode = generate(path.node, { compact: false }).code;
          globalDeclarations.set(name, {
            node: path.node,
            type: "import",
            path: path,
            source: currentFilePath,
            originalCode: originalCode,
          });
        });
      }
    },
  });

  logger.info(`Global declarations built: ${globalDeclarations.size} total`);
  logger.info(
    `Resolved imports: ${resolvedImports.length}, Unresolved: ${unresolvedImports.length}`
  );

  globalDeclarations.forEach((declaration, name) => {
    const originalCode = declaration.originalCode || "";

    if (patternRegex.test(originalCode)) {
      logger.success(
        `🎯 Found matching pattern in: ${name}${
          declaration.parentFunction
            ? ` (nested in ${declaration.parentFunction})`
            : ""
        }${declaration.className ? ` (in class ${declaration.className})` : ""}`
      );
      matchedPatterns.add(name);

      matchDetails.push({
        name: name,
        type: declaration.type,
        parentFunction: declaration.parentFunction || null,
        className: declaration.className || null,
        depth: declaration.depth || 0,
        codeSnippet:
          originalCode.substring(0, 200) +
          (originalCode.length > 200 ? "..." : ""),
      });

      if (
        declaration.type === "nested-function" &&
        declaration.parentFunction
      ) {
        const parentDeclaration = globalDeclarations.get(
          declaration.parentFunction
        );
        if (parentDeclaration) {
          nodesToInclude.add(parentDeclaration.node);
          logger.debug(
            `🔗 Including parent function: ${declaration.parentFunction}`
          );
        }
      }

      if (declaration.className) {
        const classDeclaration = globalDeclarations.get(declaration.className);
        if (classDeclaration) {
          nodesToInclude.add(classDeclaration.node);
          logger.debug(`🔗 Including parent class: ${declaration.className}`);
        }
      }

      nodesToInclude.add(declaration.node);

      if (declaration.path) {
        findDependenciesInNode(
          declaration.path,
          dependencies,
          globalDeclarations
        );
      }
    }
  });

  if (matchedPatterns.size === 0) {
    return {
      success: false,
      message: `No patterns found matching regex: ${patternRegex.source}`,
      finalCode: "",
      metadata: {
        matchedPatterns: [],
        dependencies: [],
        totalNodesIncluded: 0,
        resolvedImports,
        unresolvedImports,
        matchDetails: [],
        originalCodeLength: sourceCode.length,
        extractedCodeLength: 0,
      },
    };
  }

  let previousDepsCount = 0;
  let currentDepsCount = dependencies.size;
  let iterations = 0;

  while (currentDepsCount > previousDepsCount) {
    iterations++;
    previousDepsCount = currentDepsCount;
    const currentDeps = Array.from(dependencies);

    currentDeps.forEach((depName) => {
      const declaration = globalDeclarations.get(depName);
      if (declaration && declaration.type !== "import") {
        nodesToInclude.add(declaration.node);

        if (
          declaration.type === "nested-function" &&
          declaration.parentFunction
        ) {
          const parentDeclaration = globalDeclarations.get(
            declaration.parentFunction
          );
          if (parentDeclaration) {
            nodesToInclude.add(parentDeclaration.node);
            logger.debug(
              `🔗 Including parent for dependency: ${declaration.parentFunction}`
            );
          }
        }

        if (declaration.path) {
          findDependenciesInNode(
            declaration.path,
            dependencies,
            globalDeclarations
          );
        }
      }
    });

    currentDepsCount = dependencies.size;
  }

  unresolvedImports.forEach((importPath) => {
    traverse(ast, {
      ImportDeclaration(path) {
        if (path.node.source.value === importPath) {
          const usedImports = path.node.specifiers.filter((spec) =>
            dependencies.has(spec.local.name)
          );

          if (usedImports.length > 0) {
            nodesToInclude.add(path.node);
            logger.info(`📦 Including unresolved import: ${importPath}`);
          }
        }
      },
    });
  });

  const finalNodes = Array.from(nodesToInclude);
  const finalAst = {
    type: "Program",
    body: finalNodes,
    sourceType: "module",
  };

  const finalCode = generate(finalAst, {
    compact: false,
    comments: true,
    retainLines: false,
  }).code;

  logger.success(
    `🎉 Pattern extraction completed! Generated ${finalCode.length} characters`
  );
  logger.success(
    `Found ${matchedPatterns.size} matching patterns! So exciting~ 🥰`
  );

  return {
    success: true,
    message: `Successfully extracted ${matchedPatterns.size} pattern(s) with ${dependencies.size} dependencies`,
    finalCode: finalCode,
    metadata: {
      matchedPatterns: Array.from(matchedPatterns),
      dependencies: Array.from(dependencies),
      totalNodesIncluded: finalNodes.length,
      resolvedImports,
      unresolvedImports,
      matchDetails,
      iterationsRequired: iterations,
      originalCodeLength: sourceCode.length,
      extractedCodeLength: finalCode.length,
    },
  };
}

/**
 * Recursively finds all dependencies within a given AST node
 * @param {Object} path - The AST path to traverse
 * @param {Set<string>} dependencies - Set to store found dependencies
 * @param {Map<string, DeclarationInfo>} allDeclarations - All available declarations
 */
function findDependenciesInNode(path, dependencies, allDeclarations) {
  path.traverse({
    Identifier(identPath) {
      const name = identPath.node.name;

      if (
        identPath.isReferencedIdentifier() &&
        !identPath.isBindingIdentifier() &&
        allDeclarations.has(name) &&
        !dependencies.has(name)
      ) {
        dependencies.add(name);
      }
    },

    MemberExpression(memberPath) {
      if (memberPath.node.object.type === "Identifier") {
        const objectName = memberPath.node.object.name;
        if (allDeclarations.has(objectName) && !dependencies.has(objectName)) {
          dependencies.add(objectName);
        }
      }
    },
  });
}

/**
 * Convenience function with import resolution and pattern matching! 💫
 * @param {string} code - The source code to parse
 * @param {string} regexPattern - Regular expression pattern to match against code
 * @param {string} [currentFilePath] - Current file path for import resolution
 * @returns {ExtractionResult} The extraction result
 */
function findAndExtract(code, regexPattern, currentFilePath) {
  const regex = new RegExp(regexPattern);
  return extractPatternWithDependencies(code, regex, currentFilePath);
}

/**
 * Helper function to create regex patterns for common code patterns 🎨
 * @param {string} patternType - Type of pattern ('function', 'class', 'variable', 'arrow', 'method', 'export')
 * @param {string} namePattern - Pattern to match names (can be regex string)
 * @returns {RegExp} Compiled regex pattern
 */
function createPattern(patternType, namePattern = "\\w+") {
  const patterns = {
    function: `function\\s+${namePattern}\\s*\\([^)]*\\)\\s*\\{`,
    class: `class\\s+${namePattern}\\s*(?:extends\\s+\\w+\\s*)?\\{`,
    variable: `(?:const|let|var)\\s+${namePattern}\\s*=`,
    arrow: `(?:const|let|var)\\s+${namePattern}\\s*=\\s*(?:async\\s+)?\\([^)]*\\)\\s*=>`,
    method: `(?:async\\s+)?${namePattern}\\s*\\([^)]*\\)\\s*\\{`,
    export: `export\\s+(?:default\\s+|\\{[^}]*${namePattern}[^}]*\\}|${namePattern})`,
    import: `import\\s+(?:\\{[^}]*${namePattern}[^}]*\\}|${namePattern}|\\*\\s+as\\s+${namePattern})\\s+from`,
    any: `(?:function|class|const|let|var|export|import).*${namePattern}`,
  };

  const pattern = patterns[patternType] || patterns["any"];
  return new RegExp(pattern, "i");
}

/**
 * Super cute helper to extract multiple patterns at once! 🌈
 * @param {string} code - The source code to parse
 * @param {Array<string>} regexPatterns - Array of regex pattern strings
 * @param {string} [currentFilePath] - Current file path for import resolution
 * @returns {ExtractionResult} Combined extraction result
 */
function extractMultiplePatterns(code, regexPatterns, currentFilePath) {
  logger.info(
    `🌈 Extracting multiple patterns: ${regexPatterns.length} patterns`
  );

  const combinedPattern = regexPatterns.join("|");
  const regex = new RegExp(`(${combinedPattern})`, "i");

  return extractPatternWithDependencies(code, regex, currentFilePath);
}

/**
 * Extract by exact name matches (for backwards compatibility) 💝
 * @param {string} code - The source code to parse
 * @param {Array<string>} names - Array of exact names to match
 * @param {string} [currentFilePath] - Current file path for import resolution
 * @returns {ExtractionResult} The extraction result
 */
function extractByNames(code, names, currentFilePath) {
  logger.info(`💝 Extracting by exact names: ${names.join(", ")}`);

  // Create a pattern that matches any of the names as complete words
  const namePattern = names.map((name) => `\\b${name}\\b`).join("|");
  const regex = new RegExp(namePattern);

  return extractPatternWithDependencies(code, regex, currentFilePath);
}

/**
 * Pretty print extraction results! 🎨
 * @param {ExtractionResult} result - The extraction result to print
 */
function printResults(result) {
  console.log("\n" + "=".repeat(60));
  console.log("🎨 PATTERN EXTRACTION RESULTS 🎨");
  console.log("=".repeat(60));

  if (result.success) {
    console.log(`✅ ${result.message}`);
    console.log(`\n📊 Statistics:`);
    console.log(
      `   • Matched patterns: ${result.metadata.matchedPatterns.length}`
    );
    console.log(
      `   • Dependencies found: ${result.metadata.dependencies.length}`
    );
    console.log(
      `   • Total nodes included: ${result.metadata.totalNodesIncluded}`
    );
    console.log(
      `   • Code reduction: ${result.metadata.originalCodeLength} → ${result.metadata.extractedCodeLength} chars`
    );

    if (
      result.metadata.matchDetails &&
      result.metadata.matchDetails.length > 0
    ) {
      console.log(`\n🎯 Match Details:`);
      result.metadata.matchDetails.forEach((match, index) => {
        console.log(`   ${index + 1}. ${match.name} (${match.type})`);
        if (match.parentFunction) {
          console.log(
            `      └── Inside: ${match.parentFunction} (depth: ${match.depth})`
          );
        }
        if (match.className) {
          console.log(`      └── Class: ${match.className}`);
        }
      });
    }

    if (
      result.metadata.resolvedImports &&
      result.metadata.resolvedImports.length > 0
    ) {
      console.log(
        `\n📦 Resolved Imports: ${result.metadata.resolvedImports.join(", ")}`
      );
    }

    if (
      result.metadata.unresolvedImports &&
      result.metadata.unresolvedImports.length > 0
    ) {
      console.log(
        `\n⚠️  Unresolved Imports: ${result.metadata.unresolvedImports.join(
          ", "
        )}`
      );
    }
  } else {
    console.log(`❌ ${result.message}`);
  }

  console.log("=".repeat(60) + "\n");
}

module.exports = {
  extractPatternWithDependencies,
  findAndExtract,
  extractMultiplePatterns,
  extractByNames,
  createPattern,
  printResults,
};
