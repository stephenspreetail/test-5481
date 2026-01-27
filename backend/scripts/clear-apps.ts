#!/usr/bin/env bun
/**
 * Clear Apps Script
 *
 * Clears all apps from the APPS_BASE_PATH directory.
 * This removes all app directories that are mounted to docker containers.
 */

// Note: Bun automatically loads .env files - no dotenv needed
import { execSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

// Get APPS_BASE_PATH from env or use default
const APPS_BASE_PATH = process.env.APPS_BASE_PATH || '/data/kova-apps';

// Resolve to absolute path (if relative, resolve from backend directory)
function resolveAppsBasePath(): string {
  const basePath = APPS_BASE_PATH;
  // If it's already absolute, use it
  if (resolve(basePath) === basePath) {
    return basePath;
  }
  // Resolve relative to current working directory (backend directory)
  return resolve(process.cwd(), basePath);
}

const appsPath = resolveAppsBasePath();

async function clearApps() {
  console.log(`🧹 Clearing apps from: ${appsPath}`);

  if (!existsSync(appsPath)) {
    console.log('✅ Apps directory does not exist, nothing to clear');
    return;
  }

  try {
    const entries = readdirSync(appsPath, { withFileTypes: true });
    
    if (entries.length === 0) {
      console.log('✅ Apps directory is already empty');
      return;
    }

    let clearedCount = 0;
    let totalAppsCount = 0;
    const itemsToRemove: string[] = [];
    
    // First, count apps in nested structure (userId/app-*)
    for (const entry of entries) {
      // Skip hidden files/directories like .gitkeep
      if (entry.name.startsWith('.')) {
        continue;
      }
      
      const userDirPath = resolve(appsPath, entry.name);
      if (entry.isDirectory()) {
        // Count app directories inside user directories
        try {
          const userDirEntries = readdirSync(userDirPath, { withFileTypes: true });
          const appDirs = userDirEntries.filter(e => 
            e.isDirectory() && (e.name.startsWith('app-') || /^\d+-\d+$/.test(e.name))
          );
          totalAppsCount += appDirs.length;
        } catch (error) {
          // If we can't read it, just count it as one item
          totalAppsCount += 1;
        }
      }
      
      itemsToRemove.push(entry.name);
    }

    if (itemsToRemove.length === 0) {
      console.log('✅ Apps directory is already empty');
      return;
    }

    if (totalAppsCount > 0) {
      console.log(`Found ${itemsToRemove.length} user directory(ies) containing ${totalAppsCount} app(s) to remove...`);
    } else {
      console.log(`Found ${itemsToRemove.length} item(s) to remove...`);
    }
    
    // Use rm -rf for faster deletion
    for (const item of itemsToRemove) {
      const itemPath = resolve(appsPath, item);
      console.log(`  🗑️  Removing: ${item}...`);
      try {
        execSync(`rm -rf "${itemPath}"`, { stdio: 'pipe' });
        clearedCount++;
        console.log(`  ✅ Removed: ${item}`);
      } catch (error) {
        console.error(`  ❌ Failed to remove: ${item}`, error);
        // Continue with other items
      }
    }

    if (totalAppsCount > 0) {
      console.log(`✅ Cleared ${totalAppsCount} app(s) from ${clearedCount} user directory(ies) in ${appsPath}`);
    } else {
      console.log(`✅ Cleared ${clearedCount} item(s) from ${appsPath}`);
    }
  } catch (error) {
    console.error('❌ Error clearing apps:', error);
    process.exit(1);
  }
}

clearApps();
