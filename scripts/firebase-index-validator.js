#!/usr/bin/env node

/**
 * Firebase Index Validator
 * 
 * This script analyzes JavaScript files to detect potential Firestore queries
 * that might require composite indexes, and verifies them against the current index configuration.
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');
const chalk = require('chalk');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const { parse } = require('@babel/parser');
const traverse = require('@babel/traverse').default;

// Parse command line arguments
const argv = yargs(hideBin(process.argv))
  .option('src', {
    alias: 's',
    describe: 'Source directory to scan',
    default: './src'
  })
  .option('pattern', {
    alias: 'p',
    describe: 'File pattern to match',
    default: '**/*.{js,jsx,ts,tsx}'
  })
  .option('indexPath', {
    alias: 'i',
    describe: 'Path to firestore.indexes.json',
    default: './firestore.indexes.json'
  })
  .option('outputPath', {
    alias: 'o',
    describe: 'Path to output missing indexes',
    default: './missing-indexes.json'
  })
  .help()
  .argv;

/**
 * Load existing index configuration
 */
function loadIndexConfig(indexPath) {
  try {
    if (fs.existsSync(indexPath)) {
      return JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    }
    return { indexes: [], fieldOverrides: [] };
  } catch (error) {
    console.error(chalk.red(`Error loading index config: ${error.message}`));
    return { indexes: [], fieldOverrides: [] };
  }
}

/**
 * Scan source files for potential Firestore queries
 */
function scanSourceFiles(srcDir, pattern) {
  const files = glob.sync(path.join(srcDir, pattern));
  console.log(chalk.cyan(`Scanning ${files.length} files for Firestore queries...`));
  
  const potentialQueries = [];
  
  files.forEach(file => {
    try {
      const content = fs.readFileSync(file, 'utf8');
      const ast = parse(content, {
        sourceType: 'module',
        plugins: [
          'jsx',
          'typescript',
          'classProperties',
          'objectRestSpread'
        ]
      });
      
      // Track potential queries in this file
      const fileQueries = [];
      
      // Traverse the AST to find Firestore queries
      traverse(ast, {
        CallExpression(path) {
          try {
            // Look for common Firestore query patterns
            const { callee, arguments: args } = path.node;
            
            // Check for where() method calls
            if (callee.type === 'MemberExpression' && 
                callee.property.name === 'where') {
              
              const query = {
                file,
                line: path.node.loc ? path.node.loc.start.line : 'unknown',
                type: 'where',
                fieldPath: null,
                operator: null,
                collection: null
              };
              
              // Try to extract field path and operator
              if (args.length >= 2) {
                if (args[0].type === 'StringLiteral') {
                  query.fieldPath = args[0].value;
                }
                if (args[1].type === 'StringLiteral') {
                  query.operator = args[1].value;
                }
              }
              
              // Try to find collection
              let parent = path.parentPath;
              while (parent) {
                if (parent.node.type === 'CallExpression' && 
                    parent.node.callee.type === 'MemberExpression' && 
                    parent.node.callee.property.name === 'collection') {
                  
                  if (parent.node.arguments.length > 0 && 
                      parent.node.arguments[0].type === 'StringLiteral') {
                    query.collection = parent.node.arguments[0].value;
                    break;
                  }
                }
                parent = parent.parentPath;
              }
              
              fileQueries.push(query);
            }
            
            // Check for orderBy() method calls
            if (callee.type === 'MemberExpression' && 
                callee.property.name === 'orderBy') {
              
              const query = {
                file,
                line: path.node.loc ? path.node.loc.start.line : 'unknown',
                type: 'orderBy',
                fieldPath: null,
                direction: null,
                collection: null
              };
              
              // Try to extract field path and direction
              if (args.length >= 1) {
                if (args[0].type === 'StringLiteral') {
                  query.fieldPath = args[0].value;
                }
                if (args.length >= 2 && args[1].type === 'StringLiteral') {
                  query.direction = args[1].value;
                }
              }
              
              // Try to find collection
              let parent = path.parentPath;
              while (parent) {
                if (parent.node.type === 'CallExpression' && 
                    parent.node.callee.type === 'MemberExpression' && 
                    parent.node.callee.property.name === 'collection') {
                  
                  if (parent.node.arguments.length > 0 && 
                      parent.node.arguments[0].type === 'StringLiteral') {
                    query.collection = parent.node.arguments[0].value;
                    break;
                  }
                }
                parent = parent.parentPath;
              }
              
              fileQueries.push(query);
            }
          } catch (err) {
            // Ignore errors within individual nodes
          }
        }
      });
      
      // Find query chains
      const queryChains = findQueryChains(fileQueries);
      queryChains.forEach(chain => potentialQueries.push(chain));
      
    } catch (error) {
      console.warn(chalk.yellow(`Error parsing ${file}: ${error.message}`));
    }
  });
  
  return potentialQueries;
}

/**
 * Group individual query operations into chains
 */
function findQueryChains(fileQueries) {
  // Group by collection and proximity in the file
  const queryChains = [];
  
  // Sort by file and line number
  fileQueries.sort((a, b) => {
    if (a.file !== b.file) return a.file.localeCompare(b.file);
    return a.line - b.line;
  });
  
  // Group queries that likely belong to the same chain
  let currentChain = null;
  
  fileQueries.forEach(query => {
    if (!currentChain || 
        currentChain.file !== query.file || 
        Math.abs(query.line - currentChain.queries[currentChain.queries.length - 1].line) > 5 ||
        currentChain.collection !== query.collection) {
      
      // Start a new chain
      currentChain = {
        file: query.file,
        collection: query.collection,
        queries: [query]
      };
      queryChains.push(currentChain);
    } else {
      // Add to existing chain
      currentChain.queries.push(query);
    }
  });
  
  return queryChains;
}

/**
 * Analyze query chains to detect potential index requirements
 */
function analyzeQueryChains(queryChains) {
  const requiredIndexes = [];
  
  queryChains.forEach(chain => {
    // Skip chains without a collection
    if (!chain.collection) return;
    
    // Find where clauses and orderBy clauses
    const whereClauses = chain.queries.filter(q => q.type === 'where');
    const orderByClauses = chain.queries.filter(q => q.type === 'orderBy');
    
    // Skip simple queries that don't require composite indexes
    if (orderByClauses.length <= 1 && whereClauses.length <= 1) return;
    
    // Check if this query potentially needs a composite index
    if (orderByClauses.length > 0 && 
        (whereClauses.length > 0 || orderByClauses.length > 1)) {
      
      const fields = [];
      
      // Add where clauses first (this is a simplification, in reality the order
      // depends on equality vs. range operators)
      whereClauses.forEach(where => {
        if (where.fieldPath) {
          fields.push({
            fieldPath: where.fieldPath,
            order: 'ASCENDING' // Default for where clauses
          });
        }
      });
      
      // Add orderBy clauses
      orderByClauses.forEach(orderBy => {
        if (orderBy.fieldPath) {
          fields.push({
            fieldPath: orderBy.fieldPath,
            order: orderBy.direction === 'desc' ? 'DESCENDING' : 'ASCENDING'
          });
        }
      });
      
      // Only add if we have actual fields
      if (fields.length > 1) {
        requiredIndexes.push({
          collectionGroup: chain.collection,
          queryScope: 'COLLECTION',
          fields,
          source: `${chain.file}:${chain.queries[0].line}`
        });
      }
    }
  });
  
  return requiredIndexes;
}

/**
 * Check if an index already exists in the configuration
 */
function indexExists(index, existingIndexes) {
  return existingIndexes.some(existing => {
    // Check collection
    if (existing.collectionGroup !== index.collectionGroup) return false;
    
    // Check fields
    if (existing.fields.length !== index.fields.length) return false;
    
    // Check each field
    for (let i = 0; i < existing.fields.length; i++) {
      const existingField = existing.fields[i];
      const indexField = index.fields[i];
      
      if (existingField.fieldPath !== indexField.fieldPath ||
          existingField.order !== indexField.order) {
        return false;
      }
    }
    
    return true;
  });
}

/**
 * Main function to run the index validator
 */
async function main() {
  try {
    console.log(chalk.cyan(`\n🔍 Firebase Index Validator\n`));
    
    // Load existing indexes
    const indexConfig = loadIndexConfig(argv.indexPath);
    console.log(chalk.green(`Loaded ${indexConfig.indexes.length} existing indexes`));
    
    // Scan source files
    const queryChains = scanSourceFiles(argv.src, argv.pattern);
    console.log(chalk.green(`Found ${queryChains.length} potential query chains`));
    
    // Analyze queries
    const requiredIndexes = analyzeQueryChains(queryChains);
    console.log(chalk.green(`Detected ${requiredIndexes.length} potential required indexes`));
    
    // Find missing indexes
    const missingIndexes = requiredIndexes.filter(index => !indexExists(index, indexConfig.indexes));
    console.log(chalk.yellow(`Found ${missingIndexes.length} potentially missing indexes`));
    
    // Output missing indexes
    if (missingIndexes.length > 0) {
      console.log(chalk.yellow('\nPotentially missing indexes:'));
      missingIndexes.forEach(index => {
        console.log(chalk.yellow(`\n• Collection: ${index.collectionGroup}`));
        console.log(chalk.yellow(`  Source: ${index.source}`));
        console.log(chalk.yellow(`  Fields:`));
        index.fields.forEach(field => {
          console.log(chalk.yellow(`    - ${field.fieldPath} (${field.order})`));
        });
      });
      
      // Write missing indexes to file
      fs.writeFileSync(
        argv.outputPath,
        JSON.stringify({ 
          indexes: missingIndexes,
          generatedAt: new Date().toISOString()
        }, null, 2)
      );
      console.log(chalk.green(`\nMissing indexes written to ${argv.outputPath}`));
      
      // Output suggestion to add indexes
      console.log(chalk.cyan('\nTo add missing indexes to your configuration, you can:'));
      console.log('1. Run: node scripts/firebase-index-sync.js --direction=diff');
      console.log('2. Add the missing indexes manually to firestore.indexes.json');
      console.log('3. Run: node scripts/firebase-index-sync.js --direction=push');
    } else {
      console.log(chalk.green('\nAll detected indexes are already configured.'));
    }
    
  } catch (error) {
    console.error(chalk.red(`Error: ${error.message}`));
    process.exit(1);
  }
}

// Run the main function
main();
