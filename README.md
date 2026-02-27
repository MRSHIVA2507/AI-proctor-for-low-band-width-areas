# NexProctor AI Exam Guard
**An Ultra-Low Bandwidth, Client-Side AI Proctoring Platform**

NexProctor is a sophisticated, browser-based assessment monitoring system built specifically for bandwidth-constrained environments (rural areas, developing regions, and congested networks). 

Unlike traditional platforms that force students to stream high-definition webcam footage continuously to a central server (costing hundreds of megabytes per hour and failing on slow connections), **NexProctor performs 100% of its visual and acoustic AI inferencing locally on the student's GPU via WebGL**. The only data transmitted over the network is lightweight JSON telemetry (violation logs, suspicion scores, and highly compressed heartbeat snapshots).

---

## 🚀 Key Features

*   **Zero-Stream Architecture:** No continuous video uploading. Reduces proctoring bandwidth usage by over 95%.
*   **Biometric Identity Lock:** Captures a 3D geometric signature of the candidate's face during registration. If a different person sits down during the exam, an "Identity Mismatch" is instantly flagged.
*   **Single-Head Tracking:** Uses MediaPipe to draw a locked bounding box strictly around the primary candidate, ignoring background noise.
*   **Hardware-Muted Acoustic Guard:** Uses native browser speech-to-text to continuously transcribe environmental audio. Automatically regex-matches speech against specific "Danger Words" (like multiple-choice options or the word "answer"). Audio echo is natively suppressed.
*   **Adaptive Gaze Calibration:** Calculates head-pose geometry (Pitch, Yaw, Roll) and evaluates deviations against the user's *personal baseline reading*, reducing false-positives for students who naturally sit off-center.
*   **Proctor Dashboard & Evidence Vault:** A dedicated administrator console for issuing secure, single-use Exam Codes and reviewing post-exam violation chronologies alongside snapshot evidence.

## 🛠️ Technology Stack

*   **Frontend (AI Intelligence Layer):** Vanilla JavaScript, HTML5/CSS3, Vite.
*   **Machine Learning (Client-Side):** TensorFlow.js, `@tensorflow-models/face-detection` (MediaPipe FaceDetector), `@tensorflow-models/coco-ssd` (Object Detection for phones).
*   **Backend (Security & Logging Layer):** Python 3.10+, FastAPI, Uvicorn.
*   **Storage:** In-Memory dictionary (designed for seamless migration to SQLite/PostgreSQL).

---

## ⚙️ Local Installation & Setup

You will need to run both the Python Backend and the Vite Frontend concurrently.

### 1. Start the Python Security Backend
The backend issues exam codes, authenticates proctors, and safely stores the end-of-exam violation reports.

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Or `.\venv\Scripts\activate` on Windows

pip install -r requirements.txt

# Start the secure API server on port 8000
uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```

### 2. Start the AI Frontend
The frontend loads the TensorFlow models and handles the actual examination UX.

```bash
# In the root 'AI Proctor' directory, install Node dependencies
npm install

# Start the Vite development server
npm run dev
```

The application will by default be accessible at `http://localhost:5173`. Make sure the backend is running at `http://localhost:8000` to ensure successful API connections!

---

## 👮 Usage Guide

### Proctor / Administrator Flow
1. Navigate to the application.
2. Click **"Administrator / Proctor Access"** at the bottom of the login screen.
3. Login using the default admin credentials:
   * **Username**: `admin`
   * **Password**: `admin123`
4. Click **"Generate New Code"** to create a one-time session key (e.g., `NEX-A1B2`). Give this code to your candidate.
5. After exams are submitted, review the submissions in the **Global Session Feed** and click **"Review Evidence"** to see snapshots and chronological anomaly logs.

### Student / Candidate Flow
1. Open the application.
2. Enter your Student ID (Email) and the **Unique Exam Code** provided by the proctor.
3. Complete the hardware verification (Camera/Mic checks).
4. Complete the Biometric Registration (Neutral, Left, Right face scans).
5. Pass the 3-second Baseline Gaze Calibration.
6. Begin the exam. The AI engine will track multiple metrics silently in the background:
    * *Is the candidate looking away persistently?*
    * *Is there a sudden head movement?*
    * *Is a cell phone visible in the frame?*
    * *Is someone else talking or whispering answers?*
    * *Has a different person swapped into the seat?*
7. Submit the exam to securely upload your finalized AI Integrity Report.

---

> Built with ⚡️ using TensorFlow.js and FastAPI.
