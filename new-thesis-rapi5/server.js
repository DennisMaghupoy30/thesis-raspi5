import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { spawn, exec } from 'child_process';
import { readdir, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const API_MAIN = "https://vertiapp.xyz";
const API_PREDICT_ENDPOINT = "/predict";
const API_MODEL_LIST_ENDPOINT = "/list-models";

const STORE_IMAGES_TO_TMP = false;

const isWindows = os.platform() === 'win32';
const isLinux = os.platform() === 'linux';

// Setup crontab for autostart on Linux
if (isLinux) {
    setupCrontab();
}

const app = express();
const PORT = 9003;

app.use(cors());
app.use(express.json());

let cameras = [];
let currentModels = [
    'lettuce-diseases',
    'malabar-spinach-training'
];
let currentModelIndex = 0;
let predictions = [];
let systemErrors = [];
let imageBase = '';

function setupCrontab() {
    exec('crontab -l', (error, stdout, stderr) => {
        let currentCrontab = stdout || '';

        // Remove old vertiplant entry if exists
        const lines = currentCrontab.split('\n').filter(line => !line.includes('vertiplant'));
        currentCrontab = lines.join('\n');

        // Create new crontab entry with PATH and absolute paths
        const pathEnv = 'PATH=/root/.nvm/versions/node/v22.20.0/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
        const cronCommand = `@reboot ${pathEnv} cd ${__dirname} && /root/.nvm/versions/node/v22.20.0/bin/npm run start-with-mjpeg`;

        // Add new crontab entry
        const newCrontab = currentCrontab.trim() + '\n' + cronCommand + '\n';

        exec(`echo "${newCrontab}" | crontab -`, (error, stdout, stderr) => {
            if (error) {
                console.error('❌ Failed to setup crontab:', error.message);
            } else {
                console.log('✅ Crontab configured for autostart on reboot');
                console.log(`   Command: ${cronCommand}`);
            }
        });
    });
}

function addSystemError(cameraId, error) {
    const errorEntry = {
        cameraId,
        error: error.toString(),
        timestamp: new Date().toISOString()
    };
    systemErrors.unshift(errorEntry);
    if (systemErrors.length > 50) {
        systemErrors = systemErrors.slice(0, 50);
    }
}

async function detectCameras() {
    const detectedCameras = [];

    try {
        if (isLinux) {
            // Linux/Raspberry Pi camera detection using v4l2-ctl
            console.log('Linux detected - detecting cameras using v4l2-ctl');

            const v4l2Process = spawn('v4l2-ctl', ['--list-devices'], { stdio: 'pipe' });

            return new Promise(async (resolve) => {
                let output = '';

                v4l2Process.stdout.on('data', (data) => {
                    output += data.toString();
                });

                v4l2Process.on('close', async () => {
                    const lines = output.split('\n');
                    const cameras = [];
                    let currentCamera = null;

                    for (const line of lines) {
                        const trimmedLine = line.trim();

                        // Skip internal Pi devices
                        if (trimmedLine.includes('pispbe') ||
                            trimmedLine.includes('rpivid') ||
                            trimmedLine.includes('/dev/media')) {
                            continue;
                        }

                        // Look for camera names (lines that don't start with /dev/ and end with ):
                        if (trimmedLine.length > 0 && !trimmedLine.startsWith('/dev/') && trimmedLine.endsWith('):')) {
                            currentCamera = {
                                name: trimmedLine.replace(':', '').trim(),
                                devices: []
                            };
                        }
                        // Look for video device paths
                        else if (trimmedLine.startsWith('/dev/video') && currentCamera) {
                            // Only take the first video device (main stream, not metadata)
                            if (currentCamera.devices.length === 0) {
                                currentCamera.devices.push(trimmedLine);
                                cameras.push(currentCamera);
                            }
                            currentCamera = null; // Reset for next camera
                        }
                    }

                    console.log(`Found ${cameras.length} cameras via v4l2-ctl:`);
                    cameras.forEach((camera, index) => {
                        console.log(`  ${camera.name} -> ${camera.devices[0]}`);
                    });

                    // Create camera objects for server
                    for (let i = 0; i < cameras.length; i++) {
                        const camera = cameras[i];
                        const device = camera.devices[0];

                        detectedCameras.push({
                            id: i,
                            name: camera.name,
                            device: device,
                            streamPort: 20000 + i,
                            streamUrl: `http://localhost:${20000 + i}/stream`
                        });
                    }

                    resolve(detectedCameras);
                });

                v4l2Process.on('error', (err) => {
                    console.error('v4l2-ctl not found, falling back to basic detection:', err);
                    // Fallback to basic detection if v4l2-ctl is not available
                    resolve([]);
                });
            });
        } else if (isWindows) {
            console.log('Windows detected - detecting cameras using dshow');

            const ffmpeg = spawn('ffmpeg', ['-list_devices', 'true', '-f', 'dshow', '-i', 'dummy'], { stdio: 'pipe' });

            return new Promise((resolve) => {
                let output = '';
                let cameraIndex = 0;

                ffmpeg.stderr.on('data', (data) => {
                    output += data.toString();
                });

                ffmpeg.on('close', () => {
                    const lines = output.split('\n');
                    const detectedDeviceNames = [];

                    for (const line of lines) {
                        if (line.includes('] "') && line.includes('" (video)')) {
                            const match = line.match(/\] "([^"]+)" \(video\)/);
                            if (match) {
                                const deviceName = match[1];
                                detectedDeviceNames.push(deviceName);
                                detectedCameras.push({
                                    id: cameraIndex,
                                    device: deviceName,
                                    streamPort: 20000 + cameraIndex,
                                    streamUrl: `http://localhost:${20000 + cameraIndex}/stream`
                                });
                                cameraIndex++;
                            }
                        }
                    }

                    console.log('Detected Windows cameras:', detectedDeviceNames);
                    console.log(`Detected ${detectedCameras.length} cameras:`, detectedCameras);
                    resolve(detectedCameras);
                });
            });
        }
    } catch (error) {
        console.error('Error detecting cameras:', error);
    }

    return detectedCameras;
}

async function getModelList() {
    try {
        const response = await axios.get(`${API_MAIN}${API_MODEL_LIST_ENDPOINT}`);

        return response.data || [];
    } catch (error) {
        console.error('Error fetching model list:', error);
        return ["bacterial-disease", "early-blight"];
    }
}

async function captureFrame(camera) {
    let filepath = null;

    if (STORE_IMAGES_TO_TMP) {
        const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
        const filename = `camera-${camera.id}-${timestamp}.jpg`;
        filepath = path.join('./tmp', filename);

        console.log("CURRENT PROCESS CWD: ", process.cwd());

        try {
            await mkdir('./tmp', { recursive: true });
        } catch (error) {
            // Directory already exists or other error
        }
    }

    // Use FFmpeg to capture a single frame from MJPEG stream
    const streamUrl = `http://localhost:${camera.streamPort}/stream`;

    return new Promise((resolve, reject) => {
        console.log(`📸 Capturing frame from MJPEG stream: ${streamUrl}`);

        const ffmpegArgs = [
            '-i', streamUrl,
            '-vframes', '1',
            '-f', 'image2',
            '-q:v', '2',
            'pipe:1'
        ];

        const ffmpeg = spawn('ffmpeg', ffmpegArgs, {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        let imageBuffer = Buffer.alloc(0);
        let hasData = false;

        ffmpeg.stdout.on('data', (data) => {
            imageBuffer = Buffer.concat([imageBuffer, data]);
            hasData = true;
        });

        let stderrOutput = '';
        ffmpeg.stderr.on('data', (data) => {
            stderrOutput += data.toString();
        });

        ffmpeg.on('close', async (code) => {
            if (code === 0 && hasData && imageBuffer.length > 0) {
                try {
                    if (STORE_IMAGES_TO_TMP && filepath) {
                        await writeFile(filepath, imageBuffer);
                        console.log(`Frame captured and saved: ${filepath} (${imageBuffer.length} bytes)`);
                    } else {
                        console.log(`Frame captured for camera ${camera.id} (${imageBuffer.length} bytes)`);
                    }
                    resolve(imageBuffer);
                } catch (error) {
                    console.error(`Error saving image for camera ${camera.id}: ${error}`);
                    reject(new Error(`Failed to save captured frame: ${error.message}`));
                }
            } else {
                const errorMsg = `Failed to capture frame from MJPEG stream for camera ${camera.id}. Exit code: ${code}. Stderr: ${stderrOutput.trim()}`;
                console.error(errorMsg);
                addSystemError(camera.id, errorMsg);
                reject(new Error(errorMsg));
            }
        });

        ffmpeg.on('error', (err) => {
            const errorMsg = `FFmpeg error for camera ${camera.id}: ${err.message}`;
            console.error(errorMsg);
            addSystemError(camera.id, errorMsg);
            reject(new Error(errorMsg));
        });

        // Handle timeout
        setTimeout(() => {
            if (!hasData) {
                ffmpeg.kill('SIGTERM');
                const errorMsg = `Timeout capturing frame from camera ${camera.id}`;
                console.error(errorMsg);
                addSystemError(camera.id, errorMsg);
                reject(new Error(errorMsg));
            }
        }, 10000);
    });
}

async function sendPrediction(camera, imageBuffer, model) {
    try {
        const formData = new FormData();
        const blob = new Blob([imageBuffer], { type: 'image/jpeg' });
        formData.append('image', blob, 'image.jpg');
        formData.append('model', model);

        const response = await fetch(`http://127.0.0.1:8081${API_PREDICT_ENDPOINT}`, {
            method: 'POST',
            body: formData,
            headers: {
                'Accept': 'application/json',
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();

        if (result['error']) {
            throw new Error(`Prediction error: ${result['error']}`);
        }

        if (result['detections'] && Array.isArray(result['detections']) && result['detections'].length > 0) {
            console.log(`Detections for camera ${camera.id}:`, result['detections']);
        }

        // Attach a base64 representation of the captured image so frontends can display it
        const imageBase64 = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;

        imageBase = imageBase64;

        const prediction = {
            cameraId: camera.id,
            model: model,
            timestamp: new Date().toISOString(),
            result: result,
            image: imageBase64            
        };

        // predictions.unshift(prediction);
        // if (predictions.length > 100) {
        //     predictions = predictions.slice(0, 100);
        // }

        return prediction;
    } catch (error) {
        console.error(`Error making prediction for camera ${camera.id}:`, error);
        return null;
    }
}

// Returns all the prediction data from yolo_api server for each camera
async function predictionLoop() {
    if (cameras.length === 0 || currentModels.length === 0) {
        return;
    }

    const currentModel = currentModels[currentModelIndex];
    console.log(`Running predictions with model: ${currentModel}`);

    const predictionPromises = cameras.map(async (camera) => {
        try {
            const imageBuffer = await captureFrame(camera);
            return await sendPrediction(camera, imageBuffer, currentModel);
        } catch (error) {
            const errorMsg = `Camera ${camera.id} capture failed: ${error.message}`;
            console.error(errorMsg);
            addSystemError(camera.id, errorMsg);
            return null;
        }
    });

    currentModelIndex = (currentModelIndex + 1) % currentModels.length;

    return Promise.all(predictionPromises).then((p) => {
        predictions.unshift(...p.filter(pred => pred !== null));
        if (predictions.length > 100) {
            predictions = predictions.slice(0, 100);
        }
        return p;
    }).catch((err) => {
        console.error('Error in prediction loop:', err);
    });
}

app.get('/api/image', (req, res) => {
    if (imageBase) {
        res.json({ image: imageBase });
    }
});

app.get('/api/cameras', (req, res) => {
    const camerasWithUrls = cameras.map(camera => ({
        ...camera,
        streamUrl: camera.streamUrl || `http://localhost:${camera.streamPort}/stream`
    }));
    res.json(camerasWithUrls);
});

app.get('/api/predictions', (req, res) => {
    res.json(predictions); 
});

// Return the latest prediction for each camera
app.get('/api/predictions/latest', (req, res) => {
    const latestByCamera = {}; 

    for (const p of predictions) {
        if (!latestByCamera[p.cameraId] || new Date(p.timestamp) > new Date(latestByCamera[p.cameraId].timestamp)) {
            latestByCamera[p.cameraId] = p;
        }
    }

    // Return as array
    res.json(Object.values(latestByCamera));
});

// Return predictions for a specific camera id (query param or path param)
app.get('/api/predictions/camera/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
        return res.status(400).json({ error: 'Invalid camera id' });
    }

    const filtered = predictions.filter(p => p.cameraId === id);
    res.json(filtered);
});

app.get('/api/models', (req, res) => {
    res.json(currentModels);
});

app.get('/api/status', (req, res) => {
    res.json({
        cameras: cameras.length,
        models: currentModels,
        currentModel: currentModels[currentModelIndex] || null,
        totalPredictions: predictions.length,
        uptime: process.uptime()
    });
});

app.get('/api/errors', (req, res) => {
    res.json(systemErrors);
});

async function checkViteAndLaunchFirefox() {
    const checkVite = async () => {
        try {
            const response = await fetch('http://localhost:5173');
            return response.ok;
        } catch (error) {
            return false;
        }
    };

    console.log('🔍 Checking if Vite is ready...');

    const maxAttempts = 30; // Max 30 seconds
    let attempts = 0;

    const checkInterval = setInterval(async () => {
        attempts++;
        const isReady = await checkVite();

        if (isReady) {
            clearInterval(checkInterval);
            console.log('✅ Vite is ready! Launching Firefox in kiosk mode...');

            // Run Firefox as Ashley user with DISPLAY set
            const firefox = spawn('su', ['-', 'Ashley', '-c', 'export DISPLAY=:0 && firefox --kiosk --no-remote http://localhost:5173'], {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            firefox.stdout.on('data', (data) => {
                console.log(`[Firefox stdout]: ${data.toString()}`);
            });

            firefox.stderr.on('data', (data) => {
                console.error(`[Firefox stderr]: ${data.toString()}`);
            });

            firefox.on('close', (code) => {
                console.log(`Firefox process exited with code ${code}`);
            });
        } else if (attempts >= maxAttempts) {
            clearInterval(checkInterval);
            console.error('❌ Vite failed to start after 30 seconds');
        } else {
            console.log(`⏳ Waiting for Vite... (${attempts}/${maxAttempts})`);
        }
    }, 1000);
}

async function initialize() {
    console.log('Initializing API server (FFmpeg streams handled separately)...');

    cameras = await detectCameras();

    if (cameras.length === 0) {
        console.warn('No cameras detected!');
        return;
    }

    console.log('📋 Detected cameras (streams on ports 20000+):');
    cameras.forEach((camera) => {
        const displayName = camera.name || camera.device;
        console.log(`  Camera ${camera.id}: ${displayName} -> ${camera.device} -> Port ${camera.streamPort}`);
    });
    console.log(`Available models: ${currentModels.join(', ')}`);

    console.log('Starting prediction loop...');
    setInterval(predictionLoop, 2000);

    // Launch Firefox in kiosk mode after checking Vite is ready
    if (isLinux) {
        checkViteAndLaunchFirefox();
    }
}

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    initialize();
});

process.on('SIGINT', () => {
    console.log('Shutting down server...');
    process.exit(0);
});