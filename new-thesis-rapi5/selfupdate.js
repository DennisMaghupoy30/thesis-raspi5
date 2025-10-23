import { exec } from 'child_process';
import { promisify } from 'util';
import readline from 'readline';
import https from 'https';

const execAsync = promisify(exec);

async function waitForInternet() {
    console.log('🌐 Checking internet connectivity...');

    const maxAttempts = 60; // 60 seconds max

    for (let i = 1; i <= maxAttempts; i++) {
        try {
            const hasInternet = await new Promise((resolve) => {
                const req = https.get('https://clients3.google.com/', { timeout: 1000 }, (res) => {
                    resolve(true);
                });

                req.on('error', () => resolve(false));
                req.on('timeout', () => {
                    req.destroy();
                    resolve(false);
                });
            });

            if (hasInternet) {
                console.log('✅ Internet connection detected');
                return true;
            }

            process.stdout.write(`\r⏳ Waiting for internet... (${i}/${maxAttempts}s)`);
            await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (error) {
            process.stdout.write(`\r⏳ Waiting for internet... (${i}/${maxAttempts}s)`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    console.log('\n⚠️  No internet connection after 60 seconds, continuing without update...');
    return false;
}

async function checkForLocalChanges() {
    try {
        // Check for uncommitted changes
        const { stdout: statusOutput } = await execAsync('git status --porcelain');

        if (statusOutput.trim().length > 0) {
            console.log('\n⚠️  WARNING: Local changes detected!\n');
            console.log('Modified/untracked files:');
            console.log(statusOutput);
            return true;
        }

        // Get current branch first
        const { stdout: branch } = await execAsync('git rev-parse --abbrev-ref HEAD');
        const currentBranch = branch.trim();

        // Check for unpushed commits 
        const { stdout: unpushedOutput } = await execAsync(`git log origin/${currentBranch}..HEAD --oneline`);

        if (unpushedOutput.trim().length > 0) {
            console.log('\n⚠️  WARNING: Unpushed commits detected!\n');
            console.log('Unpushed commits:');
            console.log(unpushedOutput);
            return true;
        }

        return false;
    } catch (error) {
        console.warn('⚠️  Could not check for local changes:', error.message);
        return false;
    }
}

async function promptUserConfirmation() {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        console.log('\n🚨 UPDATE WILL DESTROY ALL LOCAL CHANGES! 🚨');
        console.log('Type "CONFIRM" to proceed with update, or anything else to cancel:\n');

        rl.question('> ', (answer) => {
            rl.close();
            resolve(answer.trim() === 'CONFIRM');
        });
    });
}

async function selfUpdate() {
    console.log('🔄 Starting self-update process...');

    // Wait for internet connection
    const hasInternet = await waitForInternet();
    if (!hasInternet) {
        console.log('🚀 Starting application without update...\n');
        return;
    }

    try {
        // Fetch latest changes from origin
        console.log('📥 Fetching latest changes from origin...');
        await execAsync('git fetch origin');

        // Get current branch name
        const { stdout: branch } = await execAsync('git rev-parse --abbrev-ref HEAD');
        const currentBranch = branch.trim();
        console.log(`📍 Current branch: ${currentBranch}`);

        // Check for local changes
        const hasLocalChanges = await checkForLocalChanges();

        if (hasLocalChanges) {
            const confirmed = await promptUserConfirmation();

            if (!confirmed) {
                console.log('\n❌ Update cancelled by user');
                console.log('🚀 Starting application with current version...\n');
                return;
            }

            console.log('\n✅ User confirmed update');
        }

        // Hard reset to origin's latest
        console.log(`🔨 Hard resetting to origin/${currentBranch}...`);
        await execAsync(`git reset --hard origin/${currentBranch}`);

        // Clean untracked files
        console.log('🧹 Cleaning untracked files...');
        await execAsync('git clean -fd');

        console.log('✅ Self-update completed successfully!');
        console.log('🚀 Starting application...\n');

    } catch (error) {
        console.error('❌ Self-update failed:', error.message);
        console.error('⚠️  Continuing with current version...\n');
    }
}

// Run self-update
selfUpdate();
