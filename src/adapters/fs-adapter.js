const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Filesystem adapter with cross-platform support
 * Handles permissions, atomic writes, and directory operations
 */

const isWindows = os.platform() === 'win32';

/**
 * Ensure directory exists with proper permissions
 * @param {string} dirPath - Directory path
 * @param {number} mode - Permission mode (ignored on Windows)
 */
function ensureDir(dirPath, mode = 0o755) {
  if (fs.existsSync(dirPath)) {
    return;
  }
  
  // Create directory recursively
  fs.mkdirSync(dirPath, { recursive: true, mode });
  
  // Set permissions on Linux/Mac (Windows ignores this)
  if (!isWindows) {
    try {
      fs.chmodSync(dirPath, mode);
    } catch (error) {
      // Ignore permission errors if we can't set them
    }
  }
}

/**
 * Check if path exists
 * @param {string} filePath - File or directory path
 * @returns {boolean}
 */
function exists(filePath) {
  return fs.existsSync(filePath);
}

/**
 * Read JSON file
 * @param {string} filePath - Path to JSON file
 * @returns {object|null} Parsed JSON or null if not exists
 */
function readJson(filePath) {
  if (!exists(filePath)) {
    return null;
  }
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to read JSON from ${filePath}: ${error.message}`);
  }
}

/**
 * Write JSON file atomically
 * @param {string} filePath - Path to JSON file
 * @param {object} data - Data to write
 * @param {number} mode - Permission mode
 */
function writeJson(filePath, data, mode = 0o644) {
  const dir = path.dirname(filePath);
  ensureDir(dir);
  
  const tmpPath = filePath + '.tmp';
  const content = JSON.stringify(data, null, 2);
  
  try {
    // Write to temp file first
    fs.writeFileSync(tmpPath, content, { encoding: 'utf8', mode });
    
    // Atomic rename
    fs.renameSync(tmpPath, filePath);
    
    // Set permissions on Linux/Mac
    if (!isWindows) {
      try {
        fs.chmodSync(filePath, mode);
      } catch (error) {
        // Ignore permission errors
      }
    }
  } catch (error) {
    // Clean up temp file
    if (exists(tmpPath)) {
      fs.unlinkSync(tmpPath);
    }
    throw error;
  }
}

/**
 * Read text file
 * @param {string} filePath - Path to file
 * @returns {string|null} File content or null if not exists
 */
function readText(filePath) {
  if (!exists(filePath)) {
    return null;
  }
  
  return fs.readFileSync(filePath, 'utf8');
}

/**
 * Write text file
 * @param {string} filePath - Path to file
 * @param {string} content - Content to write
 * @param {number} mode - Permission mode
 */
function writeText(filePath, content, mode = 0o644) {
  const dir = path.dirname(filePath);
  ensureDir(dir);
  
  fs.writeFileSync(filePath, content, { encoding: 'utf8', mode });
  
  // Set permissions on Linux/Mac
  if (!isWindows) {
    try {
      fs.chmodSync(filePath, mode);
    } catch (error) {
      // Ignore permission errors
    }
  }
}

/**
 * Delete file if exists
 * @param {string} filePath - Path to file
 */
function deleteFile(filePath) {
  if (exists(filePath)) {
    fs.unlinkSync(filePath);
  }
}

/**
 * Copy file
 * @param {string} source - Source file path
 * @param {string} dest - Destination file path
 */
function copyFile(source, dest) {
  const dir = path.dirname(dest);
  ensureDir(dir);
  
  fs.copyFileSync(source, dest);
  
  // Copy permissions on Linux/Mac
  if (!isWindows) {
    try {
      const stats = fs.statSync(source);
      fs.chmodSync(dest, stats.mode);
    } catch (error) {
      // Ignore permission errors
    }
  }
}

/**
 * List directory contents
 * @param {string} dirPath - Directory path
 * @returns {string[]} Array of filenames
 */
function listDir(dirPath) {
  if (!exists(dirPath)) {
    return [];
  }
  
  return fs.readdirSync(dirPath);
}

/**
 * Get file stats
 * @param {string} filePath - File path
 * @returns {fs.Stats|null} File stats or null if not exists
 */
function getStats(filePath) {
  if (!exists(filePath)) {
    return null;
  }
  
  return fs.statSync(filePath);
}

/**
 * Verify file permissions (Linux/Mac only)
 * @param {string} filePath - File path
 * @param {number} expectedMode - Expected permission mode
 * @returns {{ok: boolean, actualMode: number|null}}
 */
function verifyPermissions(filePath, expectedMode) {
  if (isWindows) {
    return { ok: true, actualMode: null };
  }

  const stats = getStats(filePath);
  if (!stats) {
    return { ok: false, actualMode: null };
  }

  const actualMode = stats.mode & 0o777;
  return { ok: actualMode === expectedMode, actualMode };
}

/**
 * Check if path is directory
 * @param {string} dirPath - Directory path
 * @returns {boolean}
 */
function isDirectory(dirPath) {
  const stats = getStats(dirPath);
  return stats ? stats.isDirectory() : false;
}

/**
 * Make file executable (Linux/Mac only)
 * @param {string} filePath - File path
 */
function makeExecutable(filePath) {
  if (isWindows) {
    return; // Not needed on Windows
  }
  
  try {
    fs.chmodSync(filePath, 0o755);
  } catch (error) {
    // Ignore permission errors
  }
}

module.exports = {
  ensureDir,
  exists,
  readJson,
  writeJson,
  readText,
  writeText,
  deleteFile,
  copyFile,
  listDir,
  getStats,
  isDirectory,
  makeExecutable,
  verifyPermissions,
  isWindows
};
