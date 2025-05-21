#!/usr/bin/env node

/**
 * Firebase Index Synchronization Tool
 * 
 * This script automates the synchronization of Firestore indexes between local and remote environments.
 * It supports bidirectional sync, diff visualization, and validation of index configurations.
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const chalk = require('chalk');
const inquirer = require('inquirer');
const ora = require('ora');
const diff = require('diff');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

// Configuration
const DEFAULT_CONFIG = {
  projectRoot: process.cwd(),
  localIndexPath: 'firestore.indexes.json',
  remoteIndexTempPath: '.firestore.remote.indexes.json',
  environments: ['default', 'staging', 'production'],
  backupDir: 'backup/indexes',
  criticalIndexes: [], // Indexes that should never be removed
  maxBackups: 10
};

// Parse command line arguments
const argv = yargs(hideBin(process.argv))
  .option('direction', {
    alias: 'd',
    describe: 'Sync direction',
    choices: ['pull', 'push', 'diff'],
    default: 'diff'
  })
  .option('env', {
    alias: 'e',
    describe: 'Firebase environment',
    default: 'default'
  })
  .option('force', {
    alias: 'f',
    describe: 'Force synchronization without confirmation',
    type: 'boolean',
    default: false
  })
  .option('configPath', {
    alias: 'c',
    describe: 'Path to configuration file',
    default: '.index-sync-config.json'
  })
  .help()
  .argv;

/**
 * Load configuration from file, with defaults
 */
function loadConfig(configPath) {
  try {
    if (fs.existsSync(configPath)) {
      const userConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      return { ...DEFAULT_CONFIG, ...userConfig };
    }
  } catch (error) {
    console.error(chalk.red(`Error loading config: ${error.message}`));
  }
  return DEFAULT_CONFIG;
}

/**
 * Save configuration to file
 */
function saveConfig(config, configPath) {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log(chalk.green(`Configuration saved to ${configPath}`));
  } catch (error) {
    console.error(chalk.red(`Error saving config: ${error.message}`));
  }
}

/**
 * Fetch remote indexes from Firebase
 */
async function fetchRemoteIndexes(config, environment) {
  const spinner = ora('Fetching remote indexes...').start();
  
  try {
    // Execute Firebase CLI command to get indexes
    const projectParam = environment !== 'default' ? `--project ${environment}` : '';
    const result = execSync(`npx firebase firestore:indexes ${projectParam}`, {
      cwd: config.projectRoot,
      encoding: 'utf8'
    });
    
    // Parse the command output to get the indexes
    const indexData = JSON.parse(result.trim());
    
    // Save to temp file
    fs.writeFileSync(
      path.join(config.projectRoot, config.remoteIndexTempPath),
      JSON.stringify(indexData, null, 2)
    );
    
    spinner.succeed('Remote indexes fetched successfully');
    return indexData;
  } catch (error) {
    spinner.fail(`Failed to fetch remote indexes: ${error.message}`);
    throw error;
  }
}

/**
 * Load local indexes from file
 */
function loadLocalIndexes(config) {
  try {
    const indexPath = path.join(config.projectRoot, config.localIndexPath);
    if (!fs.existsSync(indexPath)) {
      console.warn(chalk.yellow(`Local index file not found at ${indexPath}. Creating empty index file.`));
      const emptyIndexes = { indexes: [], fieldOverrides: [] };
      fs.writeFileSync(indexPath, JSON.stringify(emptyIndexes, null, 2));
      return emptyIndexes;
    }
    
    return JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  } catch (error) {
    console.error(chalk.red(`Error loading local indexes: ${error.message}`));
    throw error;
  }
}

/**
 * Compare local and remote indexes
 */
function compareIndexes(localIndexes, remoteIndexes) {
  // Helper function to normalize and sort indexes for comparison
  const normalizeIndexes = (indexesObj) => {
    const normalized = { 
      indexes: [...(indexesObj.indexes || [])],
      fieldOverrides: [...(indexesObj.fieldOverrides || [])]
    };
    
    // Sort indexes for consistent comparison
    normalized.indexes.sort((a, b) => {
      const aCollection = a.collectionGroup || '';
      const bCollection = b.collectionGroup || '';
      return aCollection.localeCompare(bCollection);
    });
    
    return normalized;
  };
  
  const normalizedLocal = normalizeIndexes(localIndexes);
  const normalizedRemote = normalizeIndexes(remoteIndexes);
  
  // Compare as strings after normalization and formatting
  const localStr = JSON.stringify(normalizedLocal, null, 2);
  const remoteStr = JSON.stringify(normalizedRemote, null, 2);
  
  if (localStr === remoteStr) {
    return { 
      identical: true,
      differences: null
    };
  }
  
  // Calculate differences
  const differences = {
    identical: false,
    added: {
      indexes: [],
      fieldOverrides: []
    },
    removed: {
      indexes: [],
      fieldOverrides: []
    },
    textDiff: diff.createPatch('firestore.indexes.json', remoteStr, localStr, 'remote', 'local')
  };
  
  // Find added/removed indexes (only simple detection for now)
  const findIndexInArray = (needle, haystack) => {
    return haystack.some(item => 
      JSON.stringify(item) === JSON.stringify(needle)
    );
  };
  
  // Check for added indexes (in local but not in remote)
  normalizedLocal.indexes.forEach(localIndex => {
    if (!findIndexInArray(localIndex, normalizedRemote.indexes)) {
      differences.added.indexes.push(localIndex);
    }
  });
  
  // Check for removed indexes (in remote but not in local)
  normalizedRemote.indexes.forEach(remoteIndex => {
    if (!findIndexInArray(remoteIndex, normalizedLocal.indexes)) {
      differences.removed.indexes.push(remoteIndex);
    }
  });
  
  // Check for added field overrides
  normalizedLocal.fieldOverrides.forEach(localOverride => {
    if (!findIndexInArray(localOverride, normalizedRemote.fieldOverrides)) {
      differences.added.fieldOverrides.push(localOverride);
    }
  });
  
  // Check for removed field overrides
  normalizedRemote.fieldOverrides.forEach(remoteOverride => {
    if (!findIndexInArray(remoteOverride, normalizedLocal.fieldOverrides)) {
      differences.removed.fieldOverrides.push(remoteOverride);
    }
  });
  
  return differences;
}

/**
 * Display index differences in a user-friendly way
 */
function displayDifferences(differences) {
  if (differences.identical) {
    console.log(chalk.green('Local and remote indexes are identical. No synchronization needed.'));
    return;
  }
  
  console.log(chalk.yellow('Differences found between local and remote indexes:'));
  
  // Show added indexes
  if (differences.added.indexes.length > 0) {
    console.log(chalk.green('\nIndexes that will be added to remote:'));
    differences.added.indexes.forEach(index => {
      console.log(chalk.green(`• ${index.collectionGroup} - Fields: ${index.fields.map(f => f.fieldPath).join(', ')}`));
    });
  }
  
  // Show removed indexes
  if (differences.removed.indexes.length > 0) {
    console.log(chalk.red('\nIndexes that will be removed from remote:'));
    differences.removed.indexes.forEach(index => {
      console.log(chalk.red(`• ${index.collectionGroup} - Fields: ${index.fields.map(f => f.fieldPath).join(', ')}`));
    });
  }
  
  // Show added field overrides
  if (differences.added.fieldOverrides.length > 0) {
    console.log(chalk.green('\nField overrides that will be added to remote:'));
    differences.added.fieldOverrides.forEach(override => {
      console.log(chalk.green(`• ${override.collectionGroup}.${override.fieldPath}`));
    });
  }
  
  // Show removed field overrides
  if (differences.removed.fieldOverrides.length > 0) {
    console.log(chalk.red('\nField overrides that will be removed from remote:'));
    differences.removed.fieldOverrides.forEach(override => {
      console.log(chalk.red(`• ${override.collectionGroup}.${override.fieldPath}`));
    });
  }
  
  // Show detailed diff for those who want to see it
  console.log(chalk.yellow('\nDetailed diff:'));
  const diffLines = differences.textDiff.split('\n');
  diffLines.forEach(line => {
    if (line.startsWith('+') && !line.startsWith('+++')) {
      console.log(chalk.green(line));
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      console.log(chalk.red(line));
    } else if (line.startsWith('@')) {
      console.log(chalk.cyan(line));
    } else {
      console.log(line);
    }
  });
}

/**
 * Check for critical index removal
 */
function checkCriticalIndexes(config, differences) {
  if (!differences.removed.indexes.length || !config.criticalIndexes.length) {
    return true;
  }
  
  const criticalRemoved = [];
  
  differences.removed.indexes.forEach(index => {
    config.criticalIndexes.forEach(criticalIndex => {
      // Simple matching - in real implementation, this would be more sophisticated
      if (index.collectionGroup === criticalIndex.collectionGroup) {
        // Check if fields match
        const fieldsMatch = index.fields.every((field, idx) => {
          return criticalIndex.fields[idx] &&
                 field.fieldPath === criticalIndex.fields[idx].fieldPath &&
                 field.order === criticalIndex.fields[idx].order;
        });
        
        if (fieldsMatch) {
          criticalRemoved.push(index);
        }
      }
    });
  });
  
  if (criticalRemoved.length) {
    console.error(chalk.red('\n⚠️ WARNING: Critical indexes will be removed!'));
    criticalRemoved.forEach(index => {
      console.error(chalk.red(`• ${index.collectionGroup} - Fields: ${index.fields.map(f => f.fieldPath).join(', ')}`));
    });
    console.error(chalk.red('\nRemoving these indexes may cause production queries to fail.'));
    return false;
  }
  
  return true;
}

/**
 * Create a backup of the current index file
 */
function backupIndexes(config, type) {
  const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
  const backupDirPath = path.join(config.projectRoot, config.backupDir);
  const backupFilename = `${type}_${timestamp}.json`;
  const backupPath = path.join(backupDirPath, backupFilename);
  
  // Create backup directory if it doesn't exist
  if (!fs.existsSync(backupDirPath)) {
    fs.mkdirSync(backupDirPath, { recursive: true });
  }
  
  // Copy current indexes to backup
  if (type === 'local') {
    fs.copyFileSync(
      path.join(config.projectRoot, config.localIndexPath),
      backupPath
    );
  } else if (type === 'remote') {
    fs.copyFileSync(
      path.join(config.projectRoot, config.remoteIndexTempPath),
      backupPath
    );
  }
  
  console.log(chalk.green(`Backup created at ${backupPath}`));
  
  // Clean up old backups if needed
  const backups = fs.readdirSync(backupDirPath)
    .filter(file => file.startsWith(type))
    .sort((a, b) => {
      return fs.statSync(path.join(backupDirPath, b)).mtime.getTime() - 
             fs.statSync(path.join(backupDirPath, a)).mtime.getTime();
    });
  
  if (backups.length > config.maxBackups) {
    const toDelete = backups.slice(config.maxBackups);
    toDelete.forEach(file => {
      fs.unlinkSync(path.join(backupDirPath, file));
      console.log(chalk.yellow(`Removed old backup: ${file}`));
    });
  }
  
  return backupPath;
}

/**
 * Push local indexes to Firebase
 */
async function pushToRemote(config, environment) {
  const spinner = ora('Pushing indexes to Firebase...').start();
  
  try {
    // Create a temporary deployment file if needed for project targeting
    const projectParam = environment !== 'default' ? `--project ${environment}` : '';
    
    // Use the Firebase CLI to deploy indexes
    execSync(`npx firebase deploy --only firestore:indexes ${projectParam}`, {
      cwd: config.projectRoot,
      stdio: 'inherit'
    });
    
    spinner.succeed('Indexes successfully pushed to Firebase');
    return true;
  } catch (error) {
    spinner.fail(`Failed to push indexes: ${error.message}`);
    return false;
  }
}

/**
 * Pull remote indexes to local
 */
function pullToLocal(config, remoteIndexes) {
  try {
    fs.writeFileSync(
      path.join(config.projectRoot, config.localIndexPath),
      JSON.stringify(remoteIndexes, null, 2)
    );
    console.log(chalk.green('Remote indexes successfully pulled to local'));
    return true;
  } catch (error) {
    console.error(chalk.red(`Failed to update local indexes: ${error.message}`));
    return false;
  }
}

/**
 * Main function to run the synchronization process
 */
async function main() {
  try {
    // Load configuration
    const config = loadConfig(argv.configPath);
    const { direction, env, force } = argv;
    
    console.log(chalk.cyan(`\n📊 Firebase Index Synchronization Tool`));
    console.log(chalk.cyan(`Mode: ${direction}, Environment: ${env}\n`));
    
    // Fetch remote indexes
    const remoteIndexes = await fetchRemoteIndexes(config, env);
    
    // Load local indexes
    const localIndexes = loadLocalIndexes(config);
    
    // Compare indexes
    const differences = compareIndexes(localIndexes, remoteIndexes);
    
    // Display differences
    displayDifferences(differences);
    
    // If indexes are identical, exit
    if (differences.identical) {
      return;
    }
    
    // Check for critical index removal
    const isSafe = checkCriticalIndexes(config, differences);
    
    if (!isSafe && !force) {
      console.error(chalk.red('Synchronization aborted due to critical index removal.'));
      console.error(chalk.yellow('Use --force to override this check.'));
      process.exit(1);
    }
    
    // If only doing diff, exit now
    if (direction === 'diff') {
      return;
    }
    
    // Confirm synchronization
    let shouldProceed = force;
    
    if (!force) {
      const answer = await inquirer.prompt([{
        type: 'confirm',
        name: 'proceed',
        message: `Do you want to proceed with ${direction === 'push' ? 'pushing local indexes to Firebase' : 'pulling remote indexes to local'}?`,
        default: false
      }]);
      
      shouldProceed = answer.proceed;
    }
    
    if (!shouldProceed) {
      console.log(chalk.yellow('Synchronization cancelled.'));
      return;
    }
    
    // Create backup before proceeding
    if (direction === 'push') {
      backupIndexes(config, 'remote');
    } else if (direction === 'pull') {
      backupIndexes(config, 'local');
    }
    
    // Execute synchronization
    if (direction === 'push') {
      await pushToRemote(config, env);
    } else if (direction === 'pull') {
      pullToLocal(config, remoteIndexes);
    }
    
  } catch (error) {
    console.error(chalk.red(`Error: ${error.message}`));
    process.exit(1);
  }
}

// Run the main function
main();
