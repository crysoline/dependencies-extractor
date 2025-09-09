const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;

/**
 * @typedef {Object} DeclarationInfo
 * @property {Object} node - The AST node
 * @property {'function'|'variable'|'class'|'import'|'nested-function'} type - Type of declaration
 * @property {Object} path - The Babel path object
 * @property {string} [source] - For imports, track the source file path
 * @property {string} [parentFunction] - For nested functions, track the parent function name
 * @property {number} [depth] - Nesting depth for nested functions
 */

/**
 * @typedef {Object} ExtractionResult
 * @property {boolean} success - Whether extraction was successful
 * @property {string} message - Result message
 * @property {string} finalCode - The extracted code
 * @property {Object} metadata - Additional metadata about the extraction
 * @property {string[]} metadata.resolvedImports - Successfully resolved import paths
 * @property {string[]} metadata.unresolvedImports - Import paths that couldn't be resolved
 * @property {string[]} metadata.nestedFunctions - Found nested functions
 */

/**
 * Creates a professional logger with different log levels
 */
function createLogger() {
  const LOG_LEVELS = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3,
    SUCCESS: 4
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
    }
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
  
  const extensions = ['.js', '.ts', '.jsx', '.tsx', '.mjs'];
  
  if (importPath.startsWith('./') || importPath.startsWith('../')) {
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
    
    const indexPath = path.join(basePath, 'index');
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
    const fileContent = fs.readFileSync(filePath, 'utf8');
    logger.debug(`Reading file: ${filePath}`);
    
    const ast = parser.parse(fileContent, {
      sourceType: 'module',
      allowImportExportEverywhere: true,
      allowReturnOutsideFunction: true,
      plugins: [
        'asyncGenerators',
        'bigInt',
        'classProperties',
        'decorators-legacy',
        'doExpressions',
        'dynamicImport',
        'exportDefaultFrom',
        'exportNamespaceFrom',
        'functionBind',
        'functionSent',
        'importMeta',
        'nullishCoalescingOperator',
        'numericSeparator',
        'objectRestSpread',
        'optionalCatchBinding',
        'optionalChaining',
        'throwExpressions',
        'topLevelAwait',
        'trailingFunctionCommas'
      ]
    });
    
    const declarations = new Map();
    
    findAllDeclarations(ast, declarations, filePath);
    
    return { ast, declarations };
  } catch (error) {
    logger.warn(`Failed to parse file ${filePath}: ${error.message}`);
    return null;
  }
}

/**
 * Finds all declarations including nested functions! So cute~ 🐱
 * @param {Object} ast - The AST to traverse
 * @param {Map<string, DeclarationInfo>} declarations - Map to store found declarations
 * @param {string} filePath - Current file path
 * @param {string} [parentFunction] - Parent function name for nested functions
 * @param {number} [depth=0] - Current nesting depth
 */
function findAllDeclarations(ast, declarations, filePath, parentFunction, depth = 0) {
  traverse(ast, {
    FunctionDeclaration(path) {
      const name = path.node.id?.name;
      if (name) {
        const declarationInfo = {
          node: path.node,
          type: parentFunction ? 'nested-function' : 'function',
          path: path,
          source: filePath
        };
        
        if (parentFunction) {
          declarationInfo.parentFunction = parentFunction;
          declarationInfo.depth = depth;
          logger.debug(`🪆 Found nested function: ${name} inside ${parentFunction} (depth: ${depth})`);
        }
        
        declarations.set(name, declarationInfo);
        
        findNestedFunctionsInScope(path, declarations, filePath, name, depth + 1);
      }
    },
    
    VariableDeclarator(path) {
      const name = path.node.id?.name;
      if (name) {
        const declarationInfo = {
          node: path.parent,
          type: 'variable',
          path: path.parentPath,
          source: filePath
        };
        
        if (parentFunction) {
          declarationInfo.parentFunction = parentFunction;
          declarationInfo.depth = depth;
        }
        
        declarations.set(name, declarationInfo);
        
        if (path.node.init && 
            (path.node.init.type === 'FunctionExpression' || 
             path.node.init.type === 'ArrowFunctionExpression')) {
          logger.debug(`🎯 Found function expression: ${name}${parentFunction ? ` inside ${parentFunction}` : ''}`);
          
          if (path.node.init.type === 'FunctionExpression') {
            findNestedFunctionsInExpression(path.get('init'), declarations, filePath, name, depth + 1);
          }
        }
      }
    },
    
    ClassDeclaration(path) {
      const name = path.node.id?.name;
      if (name) {
        const declarationInfo = {
          node: path.node,
          type: 'class',
          path: path,
          source: filePath
        };
        
        if (parentFunction) {
          declarationInfo.parentFunction = parentFunction;
          declarationInfo.depth = depth;
        }
        
        declarations.set(name, declarationInfo);
      }
    },
    
    ExportNamedDeclaration(path) {
      if (path.node.declaration) {
        const declaration = path.node.declaration;
        let name = null;
        
        if (declaration.type === 'FunctionDeclaration' || declaration.type === 'ClassDeclaration') {
          name = declaration.id?.name || null;
        } else if (declaration.type === 'VariableDeclaration') {
          name = declaration.declarations[0]?.id?.name || null;
        }
        
        if (name) {
          const declarationInfo = {
            node: declaration,
            type: declaration.type.toLowerCase().replace('declaration', ''),
            path: path,
            source: filePath
          };
          
          if (parentFunction) {
            declarationInfo.parentFunction = parentFunction;
            declarationInfo.depth = depth;
          }
          
          declarations.set(name, declarationInfo);
        }
      }
    }
  });
}

/**
 * Finds nested functions within a function scope 🔍✨
 * @param {Object} functionPath - The function path to search within
 * @param {Map<string, DeclarationInfo>} declarations - Map to store found declarations
 * @param {string} filePath - Current file path
 * @param {string} parentName - Parent function name
 * @param {number} depth - Current nesting depth
 */
function findNestedFunctionsInScope(functionPath, declarations, filePath, parentName, depth) {
  functionPath.traverse({
    FunctionDeclaration(path) {
      if (path === functionPath) return;
      
      const name = path.node.id?.name;
      if (name) {
        logger.debug(`🪆 Found nested function declaration: ${name} inside ${parentName} (depth: ${depth})`);
        
        declarations.set(name, {
          node: path.node,
          type: 'nested-function',
          path: path,
          source: filePath,
          parentFunction: parentName,
          depth: depth
        });
        
        findNestedFunctionsInScope(path, declarations, filePath, name, depth + 1);
      }
      
      path.skip();
    },
    
    VariableDeclarator(path) {
      const name = path.node.id?.name;
      if (name && path.node.init && 
          (path.node.init.type === 'FunctionExpression' || 
           path.node.init.type === 'ArrowFunctionExpression')) {
        
        logger.debug(`🏹 Found nested function expression: ${name} inside ${parentName} (depth: ${depth})`);
        
        declarations.set(name, {
          node: path.parent,
          type: 'nested-function',
          path: path.parentPath,
          source: filePath,
          parentFunction: parentName,
          depth: depth
        });
        
        if (path.node.init.type === 'FunctionExpression') {
          findNestedFunctionsInExpression(path.get('init'), declarations, filePath, name, depth + 1);
        }
      }
    }
  });
}

/**
 * Finds nested functions within a function expression 💝
 * @param {Object} expressionPath - The expression path to search within
 * @param {Map<string, DeclarationInfo>} declarations - Map to store found declarations
 * @param {string} filePath - Current file path
 * @param {string} parentName - Parent function name
 * @param {number} depth - Current nesting depth
 */
function findNestedFunctionsInExpression(expressionPath, declarations, filePath, parentName, depth) {
  expressionPath.traverse({
    FunctionDeclaration(path) {
      const name = path.node.id?.name;
      if (name) {
        logger.debug(`🎭 Found function declaration in expression: ${name} inside ${parentName} (depth: ${depth})`);
        
        declarations.set(name, {
          node: path.node,
          type: 'nested-function',
          path: path,
          source: filePath,
          parentFunction: parentName,
          depth: depth
        });
        
        findNestedFunctionsInScope(path, declarations, filePath, name, depth + 1);
      }
      path.skip();
    },
    
    VariableDeclarator(path) {
      const name = path.node.id?.name;
      if (name && path.node.init && 
          (path.node.init.type === 'FunctionExpression' || 
           path.node.init.type === 'ArrowFunctionExpression')) {
        
        logger.debug(`🌟 Found nested function expression in expression: ${name} inside ${parentName} (depth: ${depth})`);
        
        declarations.set(name, {
          node: path.parent,
          type: 'nested-function',
          path: path.parentPath,
          source: filePath,
          parentFunction: parentName,
          depth: depth
        });
      }
    }
  });
}

/**
 * Enhanced version that resolves imports and extracts their dependencies too! ✨
 * Now with super cute nested function support! 🥰
 * @param {string} sourceCode - The source code to parse
 * @param {RegExp} functionRegex - Regex to match function names
 * @param {string} [currentFilePath] - Current file path for import resolution
 * @returns {ExtractionResult} The extraction result
 */
function extractFunctionWithDependencies(sourceCode, functionRegex, currentFilePath = process.cwd() + '/main.js') {
  logger.info('🚀 Starting enhanced function extraction with nested function support!');
  
  let ast;
  try {
    ast = parser.parse(sourceCode, {
      sourceType: 'module',
      allowImportExportEverywhere: true,
      allowReturnOutsideFunction: true,
      plugins: [
        'asyncGenerators', 'bigInt', 'classProperties', 'decorators-legacy',
        'doExpressions', 'dynamicImport', 'exportDefaultFrom', 'exportNamespaceFrom',
        'functionBind', 'functionSent', 'importMeta', 'nullishCoalescingOperator',
        'numericSeparator', 'objectRestSpread', 'optionalCatchBinding',
        'optionalChaining', 'throwExpressions', 'topLevelAwait', 'trailingFunctionCommas'
      ]
    });
    logger.success('Main source code parsed successfully');
  } catch (error) {
    logger.error(`Failed to parse source code: ${error.message}`);
    throw new Error(`Parse error: ${error.message}`);
  }

  const foundFunctions = new Set();
  const nestedFunctions = new Set();
  const dependencies = new Set();
  const nodesToInclude = new Set();
  const resolvedImports = [];
  const unresolvedImports = [];
  
  const globalDeclarations = new Map();
  
  findAllDeclarations(ast, globalDeclarations, currentFilePath);
  
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
            logger.debug(`Added imported declaration: ${name} from ${resolvedPath}`);
          });
        }
      } else {
        logger.warn(`❌ Could not resolve import: ${importPath}`);
        unresolvedImports.push(importPath);
        
        path.node.specifiers.forEach(spec => {
          const name = spec.local.name;
          globalDeclarations.set(name, {
            node: path.node,
            type: 'import',
            path: path,
            source: currentFilePath
          });
        });
      }
    }
  });

  logger.info(`Global declarations built: ${globalDeclarations.size} total (including nested functions!)`);
  logger.info(`Resolved imports: ${resolvedImports.length}, Unresolved: ${unresolvedImports.length}`);

  globalDeclarations.forEach((declaration, name) => {
    if (functionRegex.test(name)) {
      logger.success(`🎯 Found matching function: ${name}${declaration.parentFunction ? ` (nested in ${declaration.parentFunction})` : ''}`);
      foundFunctions.add(name);
      
      if (declaration.type === 'nested-function') {
        nestedFunctions.add(name);
        const parentDeclaration = globalDeclarations.get(declaration.parentFunction);
        if (parentDeclaration) {
          nodesToInclude.add(parentDeclaration.node);
          logger.debug(`🔗 Including parent function: ${declaration.parentFunction}`);
        }
      }
      
      nodesToInclude.add(declaration.node);
      
      if (declaration.path) {
        findDependenciesInNode(declaration.path, dependencies, globalDeclarations);
      }
    }
  });

  if (foundFunctions.size === 0) {
    return {
      success: false,
      message: `No functions found matching pattern: ${functionRegex.source}`,
      finalCode: '',
      metadata: {
        foundFunctions: [],
        dependencies: [],
        totalNodesIncluded: 0,
        resolvedImports,
        unresolvedImports,
        nestedFunctions: [],
        originalCodeLength: sourceCode.length,
        extractedCodeLength: 0
      }
    };
  }

  let previousDepsCount = 0;
  let currentDepsCount = dependencies.size;
  let iterations = 0;
  
  while (currentDepsCount > previousDepsCount) {
    iterations++;
    previousDepsCount = currentDepsCount;
    const currentDeps = Array.from(dependencies);
    
    currentDeps.forEach(depName => {
      const declaration = globalDeclarations.get(depName);
      if (declaration && declaration.type !== 'import') {
        nodesToInclude.add(declaration.node);
        
        if (declaration.type === 'nested-function' && declaration.parentFunction) {
          const parentDeclaration = globalDeclarations.get(declaration.parentFunction);
          if (parentDeclaration) {
            nodesToInclude.add(parentDeclaration.node);
            logger.debug(`🔗 Including parent for dependency: ${declaration.parentFunction}`);
          }
        }
        
        if (declaration.path) {
          findDependenciesInNode(declaration.path, dependencies, globalDeclarations);
        }
      }
    });
    
    currentDepsCount = dependencies.size;
  }

  unresolvedImports.forEach(importPath => {
    traverse(ast, {
      ImportDeclaration(path) {
        if (path.node.source.value === importPath) {
          const usedImports = path.node.specifiers.filter(spec => 
            dependencies.has(spec.local.name)
          );
          
          if (usedImports.length > 0) {
            nodesToInclude.add(path.node);
            logger.info(`📦 Including unresolved import: ${importPath}`);
          }
        }
      }
    });
  });

  const finalNodes = Array.from(nodesToInclude);
  const finalAst = {
    type: 'Program',
    body: finalNodes,
    sourceType: 'module'
  };

  const finalCode = generate(finalAst, {
    compact: false,
    comments: true,
    retainLines: false
  }).code;

  logger.success(`🎉 Extraction completed! Generated ${finalCode.length} characters`);
  logger.success(`Found ${nestedFunctions.size} nested functions! So cute~ 🥰`);

  return {
    success: true,
    message: `Successfully extracted ${foundFunctions.size} function(s) (including ${nestedFunctions.size} nested) with ${dependencies.size} dependencies`,
    finalCode: finalCode,
    metadata: {
      foundFunctions: Array.from(foundFunctions),
      dependencies: Array.from(dependencies),
      totalNodesIncluded: finalNodes.length,
      resolvedImports,
      unresolvedImports,
      nestedFunctions: Array.from(nestedFunctions),
      iterationsRequired: iterations,
      originalCodeLength: sourceCode.length,
      extractedCodeLength: finalCode.length
    }
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
      
      if (identPath.isReferencedIdentifier() && 
          !identPath.isBindingIdentifier() && 
          allDeclarations.has(name) && 
          !dependencies.has(name)) {
        
        dependencies.add(name);
      }
    },
    
    MemberExpression(memberPath) {
      if (memberPath.node.object.type === 'Identifier') {
        const objectName = memberPath.node.object.name;
        if (allDeclarations.has(objectName) && !dependencies.has(objectName)) {
          dependencies.add(objectName);
        }
      }
    }
  });
}

/**
 * Convenience function with import resolution and nested function support! 💫
 * @param {string} code - The source code to parse
 * @param {string} regexPattern - Regular expression pattern to match function names
 * @param {string} [currentFilePath] - Current file path for import resolution
 * @returns {ExtractionResult} The extraction result
 */
function findAndExtract(code, regexPattern, currentFilePath) {
  const regex = new RegExp(regexPattern);
  return extractFunctionWithDependencies(code, regex, currentFilePath);
}

module.exports = {
  extractFunctionWithDependencies,
  findAndExtract
};