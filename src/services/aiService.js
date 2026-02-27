// AI Service using Global CDN Libraries for performance
// We access tf, faceDetection, and cocoSsd from the window object

class AIService {
    constructor() {
        this.faceDetector = null;
        this.objectDetector = null;
        this.handDetector = null;
        this.isInitialized = false;
        this.lastFrameData = {
            noseX: null,
            noseY: null,
            timestamp: 0
        };
        this.activeSignature = null;
    }

    async initialize() {
        if (this.isInitialized) return;

        // If already loading, wait for it to finish
        if (this.isLoading) {
            return new Promise(resolve => {
                const check = setInterval(() => {
                    if (this.isInitialized) {
                        clearInterval(check);
                        resolve();
                    }
                }, 100);
            });
        }

        this.isLoading = true;
        console.log('Initializing AI Core (Optimized)...');

        try {
            // Wait for all CDN libraries to be available
            if (!window.tf || !window.faceDetection || !window.cocoSsd || !window.handPoseDetection) {
                await new Promise(resolve => {
                    const check = setInterval(() => {
                        if (window.tf && window.faceDetection && window.cocoSsd && window.handPoseDetection) {
                            clearInterval(check);
                            resolve();
                        }
                    }, 50);
                });
            }

            await window.tf.ready();

            // Load detectors in parallel to save time
            const [faceMod, cocoMod, handMod] = await Promise.all([
                window.faceDetection.createDetector(
                    window.faceDetection.SupportedModels.MediaPipeFaceDetector,
                    { runtime: 'tfjs', maxFaces: 1 }
                ),
                window.cocoSsd.load(),
                window.handPoseDetection.createDetector(
                    window.handPoseDetection.SupportedModels.MediaPipeHands,
                    { runtime: 'tfjs', modelType: 'lite' }
                )
            ]);

            this.faceDetector = faceMod;
            this.objectDetector = cocoMod;
            this.handDetector = handMod;

            this.isInitialized = true;
            console.log('AI Logic Activated.');
        } catch (err) {
            console.error('AI Init Failure:', err);
        } finally {
            this.isLoading = false;
        }
    }

    async getFaceSignature(video) {
        if (!video || video.readyState < 2) return null;
        if (!this.isInitialized) await this.initialize();

        const faces = await this.faceDetector.estimateFaces(video);
        if (faces.length !== 1) return null;

        const face = faces[0];
        const kp = face.keypoints;

        // Keypoint helper (supports different naming conventions)
        const getKp = (name) => kp.find(k => k.name === name) || kp[this._getKpIndex(name)];

        const nose = getKp('nose');
        const leftEye = getKp('leftEye');
        const rightEye = getKp('rightEye');
        const mouth = getKp('mouth') || getKp('mouth_center');

        if (!nose || !leftEye || !rightEye || !mouth) return null;

        // Calculate geometric ratios (scale-invariant)
        const eyeDist = Math.sqrt(Math.pow(rightEye.x - leftEye.x, 2) + Math.pow(rightEye.y - leftEye.y, 2)) || 0.001;
        const midEyeX = (leftEye.x + rightEye.x) / 2;
        const midEyeY = (leftEye.y + rightEye.y) / 2;

        const noseToEyeLine = Math.sqrt(Math.pow(nose.x - midEyeX, 2) + Math.pow(nose.y - midEyeY, 2));
        const mouthToNose = Math.sqrt(Math.pow(mouth.x - nose.x, 2) + Math.pow(mouth.y - nose.y, 2));

        return {
            ratio1: noseToEyeLine / eyeDist, // Nose length relative to eyes
            ratio2: mouthToNose / eyeDist,  // Mouth position relative to eyes
            id: Math.random().toString(36).substr(2, 9)
        };
    }

    compareSignatures(reg, live) {
        if (!reg || !live) return false;

        // Difference must be within a tolerance 
        const diff1 = Math.abs(reg.ratio1 - live.ratio1);
        const diff2 = Math.abs(reg.ratio2 - live.ratio2);

        // Security threshold 0.45 
        const threshold = 0.45;
        return (diff1 < threshold && diff2 < threshold);
    }

    _getKpIndex(name) {
        const map = { 'nose': 0, 'leftEye': 1, 'rightEye': 2, 'left_eye': 1, 'right_eye': 2, 'mouth': 5, 'mouth_center': 5 };
        return map[name] || 0;
    }

    async runInference(video) {
        if (!video) return null;
        if (!this.isInitialized) await this.initialize();

        // Ensure video is playing and has dimensions
        if (video.readyState < 2 || video.videoWidth === 0) {
            console.warn('Video not ready for inference');
            return null;
        }

        const results = {
            faces: [],
            objects: [],
            violations: [],
            isCriticalMismatch: false,
            gazeOffsets: { h: 0, v: 0 }
        };

        try {
            // Parallel Detection
            const [faces, objects, hands] = await Promise.all([
                this.faceDetector.estimateFaces(video),
                this.objectDetector.detect(video),
                this.handDetector.estimateHands(video)
            ]);

            results.faces = faces;
            results.objects = objects;
            results.hands = hands;

            if (hands.length > 0) {
                results.violations.push('Hand Detected');
            }

            // Logic checks
            if (faces.length === 0) {
                results.violations.push('Face Missing');
                results.matchConfidence = 0;
            } else if (faces.length > 1) {
                results.violations.push('Multi-Face Detected');
            } else if (faces.length === 1) {
                const face = faces[0];

                // --- POSE & EXPRESSION VALIDATION (NEW) ---
                const pose = this._validatePose(face, video);
                if (pose.violations.length > 0) {
                    results.violations.push(...pose.violations);
                }

                // MediaPipe Keypoint Fallbacks
                const nose = face.keypoints.find(kp => kp.name === 'nose') || face.keypoints[0];
                const leftEye = face.keypoints.find(kp => kp.name === 'leftEye' || kp.name === 'left_eye') || face.keypoints[1];
                const rightEye = face.keypoints.find(kp => kp.name === 'rightEye' || kp.name === 'right_eye') || face.keypoints[2];

                if (nose && leftEye && rightEye) {
                    // LIGHTING & QUALITY CHECK (Improved)
                    const minKpScore = Math.min(nose.score || 1, leftEye.score || 1, rightEye.score || 1);
                    const isConfident = (face.score > 0.9 && minKpScore > 0.8);

                    const midX = (leftEye.x + rightEye.x) / 2;
                    const midY = (leftEye.y + rightEye.y) / 2;
                    const eyeDist = Math.sqrt(Math.pow(rightEye.x - leftEye.x, 2) + Math.pow(rightEye.y - leftEye.y, 2)) || 0.001;

                    if (!isConfident) {
                        results.violations.push('Lighting Warning: Environment Too Dark');
                    }

                    // Refined Sensitivity Thresholds
                    const horizontalOffset = (nose.x - midX) / eyeDist;
                    const verticalOffset = (nose.y - midY) / eyeDist;
                    results.gazeOffsets = { h: horizontalOffset, v: verticalOffset };

                    let horizontalViolation = null;
                    if (horizontalOffset < -0.14) {
                        horizontalViolation = 'Looking Right';
                    } else if (horizontalOffset > 0.14) {
                        horizontalViolation = 'Looking Left';
                    }

                    let verticalViolation = null;
                    if (verticalOffset > 0.45) { // Threshold for looking down at desk/hands
                        verticalViolation = 'Looking Down';
                    } else if (verticalOffset < 0.28) { // Lower threshold for looking up
                        verticalViolation = 'Looking Up';
                    }

                    if (horizontalViolation) results.violations.push(horizontalViolation);
                    if (verticalViolation) results.violations.push(verticalViolation);

                    // Head Tilt Detection (Roll)
                    const angle = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x);
                    if (Math.abs(angle) > 0.78) { // 45+ degrees
                        results.violations.push('Critical Head Movement');
                    } else if (Math.abs(angle) > 0.45) { // ~25 degrees
                        results.violations.push('Head Tilted');
                    }

                    // Head Turn Detection (Yaw)
                    if (Math.abs(horizontalOffset) > 0.55) { // ~45+ degrees yaw
                        if (!results.violations.includes('Critical Head Movement')) {
                            results.violations.push('Critical Head Movement');
                        }
                    }

                    // Rapid Head Movement
                    const now = Date.now();
                    if (this.lastFrameData.noseX !== null && (now - this.lastFrameData.timestamp) < 500) {
                        const moveDist = Math.sqrt(
                            Math.pow(nose.x - this.lastFrameData.noseX, 2) +
                            Math.pow(nose.y - this.lastFrameData.noseY, 2)
                        );
                        if (moveDist / eyeDist > 0.45) {
                            results.violations.push('Sudden Head Movement');
                        }
                    }

                    this.lastFrameData = { noseX: nose.x, noseY: nose.y, timestamp: now };

                    // Attention Score
                    const hFocus = Math.max(0, 1 - Math.abs(horizontalOffset) * 4.5);
                    const vFocus = Math.max(0, 1 - Math.abs(verticalOffset - 0.4) * 6);
                    results.attentionScore = hFocus * vFocus;

                    // Identity Verification
                    if (this.activeSignature) {
                        // Apply normalization for comparison logic
                        // (In a real scenario, we'd process the pixels, here we improve the geometric logic)
                        const mouth = face.keypoints.find(kp => kp.name === 'mouth' || kp.name === 'mouth_center') || face.keypoints[5];
                        const noseToEyeLine = Math.sqrt(Math.pow(nose.x - midX, 2) + Math.pow(nose.y - midY, 2));
                        const mouthToNose = mouth ? Math.sqrt(Math.pow(mouth.x - nose.x, 2) + Math.pow(mouth.y - nose.y, 2)) : (0.4 * eyeDist);

                        const liveSig = {
                            ratio1: noseToEyeLine / eyeDist,
                            ratio2: mouthToNose / eyeDist
                        };

                        const isMatch = this.compareSignatures(this.activeSignature, liveSig);
                        const maxDiff = Math.max(Math.abs(this.activeSignature.ratio1 - liveSig.ratio1), Math.abs(this.activeSignature.ratio2 - liveSig.ratio2));

                        const rawConfidence = Math.round(100 - (maxDiff * 140));
                        results.matchConfidence = isNaN(rawConfidence) ? 0 : Math.max(0, Math.min(100, rawConfidence));

                        if (results.matchConfidence < 25) {
                            results.isCriticalMismatch = true;
                        }

                        if (!isMatch || results.isCriticalMismatch) {
                            if (!isConfident && !results.isCriticalMismatch && results.matchConfidence > 25) {
                                results.identityMatch = true;
                                if (results.matchConfidence < 60) results.matchConfidence = 65;
                            } else {
                                results.identityMatch = false;
                                results.violations.push('Identity Mismatch');
                            }
                        } else {
                            results.identityMatch = true;
                        }
                    }
                } else {
                    results.violations.push('Security Alert: Corrupted Frame');
                }
            }

            const phone = results.objects.find(obj => obj.class === 'cell phone');
            if (phone && phone.score > 0.55) {
                results.violations.push('Device Violation: Cell Phone');
            }

        } catch (e) {
            console.warn('Inference stutter detected:', e);
        }

        return results;
    }

    _validatePose(face, video) {
        const violations = [];
        const kp = face.keypoints;
        const nose = kp.find(k => k.name === 'nose') || kp[0];
        const leftEye = kp.find(k => k.name === 'leftEye' || k.name === 'left_eye') || kp[1];
        const rightEye = kp.find(k => k.name === 'rightEye' || k.name === 'right_eye') || kp[2];

        if (!nose || !leftEye || !rightEye) return { violations };

        // 1. Face Centering
        const videoWidth = video.videoWidth || 640;
        const videoHeight = video.videoHeight || 480;
        const faceCenterX = (face.box.xMin + face.box.xMax) / 2;
        const faceCenterY = (face.box.yMin + face.box.yMax) / 2;

        const xTarget = videoWidth / 2;
        const yTarget = videoHeight / 2;

        const distFromCenter = Math.sqrt(Math.pow(faceCenterX - xTarget, 2) + Math.pow(faceCenterY - yTarget, 2));
        if (distFromCenter > videoWidth * 0.4) {
            violations.push('Face Not Centered');
        }

        // 2. Head Tilt (Relaxed to 30 degrees for registration flexibility)
        const angle = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x) * 180 / Math.PI;
        if (Math.abs(angle) > 30) {
            violations.push('Excessive Head Tilt');
        }

        // 3. Eyes Closed (Simple vertical check)
        // Note: Generic Face Detector doesn't give upper/lower lid landmarks.
        // We'd need Mesh detector for this. As a workaround, we check score or rely on focus.
        // But the user specifically asked for "Eyes closed" rejection.
        // If score is high but eye landmarks are missing/low-confidence, it might be closed.
        if (leftEye.score < 0.7 || rightEye.score < 0.7) {
            violations.push('Eyes Unverifiable (Possible Blink/Closed)');
        }

        return { violations };
    }

    /**
     * Normalizes image brightness using Histogram Equalization
     * Used for Registration Phase to ensure high quality reference
     */
    async normalizeImage(video) {
        if (!video || video.readyState < 2 || video.videoWidth === 0) return null;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Histogram Equalization on Grayscale version
        const hist = new Array(256).fill(0);
        for (let i = 0; i < data.length; i += 4) {
            const avg = Math.round((data[i] + data[i + 1] + data[i + 2]) / 3);
            hist[avg]++;
        }

        // Compute CDF
        const cdf = new Array(256).fill(0);
        cdf[0] = hist[0];
        for (let i = 1; i < 256; i++) {
            cdf[i] = cdf[i - 1] + hist[i];
        }

        // Normalize CDF
        const cdfMin = cdf.find(v => v > 0);
        const total = canvas.width * canvas.height;
        const equalizationMap = new Array(256);
        for (let i = 0; i < 256; i++) {
            equalizationMap[i] = Math.round(((cdf[i] - cdfMin) / (total - cdfMin)) * 255);
        }

        // Apply to Image Data (Simple channel-wise equalization for brightness normalization)
        for (let i = 0; i < data.length; i += 4) {
            data[i] = equalizationMap[data[i]];
            data[i + 1] = equalizationMap[data[i + 1]];
            data[i + 2] = equalizationMap[data[i + 2]];
        }

        ctx.putImageData(imageData, 0, 0);
        return canvas.toDataURL('image/jpeg', 0.9);
    }
}

export const aiService = new AIService();
