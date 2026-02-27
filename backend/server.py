from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import uuid
import datetime

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- In-Memory Database Simulation ---
# In a production app, this would be a real database (SQLite, PostgreSQL, etc.)
DB = {
    "proctor_accounts": {
        "admin": "admin123" # Simple hardcoded proctor account
    },
    "active_codes": {}, # e.g., "NEX-1234": {"created_at": "...", "status": "active"}
    "exam_reports": []  # List of submitted exam report dictionaries
}

# --- Pydantic Models for Input Validation ---
class LoginRequest(BaseModel):
    username: str
    password: str

class VerifyCodeRequest(BaseModel):
    code: str
    student_id: str

class ExamReportSubmit(BaseModel):
    student_id: str
    code: str
    suspicion_score: float
    violations: List[Dict[str, Any]]
    photos: List[Dict[str, Any]]
    closed_reason: Optional[str] = None
    time_remaining: int
    duration: int

# --- API Endpoints ---

@app.get("/")
def read_root():
    return {"status": "NexProctor AI Backend is running!"}

# 1. Proctor Authentication
@app.post("/api/proctor/login")
def proctor_login(req: LoginRequest):
    if req.username in DB["proctor_accounts"] and DB["proctor_accounts"][req.username] == req.password:
        # In a real app, generate and return a JWT token here
        return {"success": True, "token": "fake-jwt-token-for-demo", "role": "proctor"}
    raise HTTPException(status_code=401, detail="Invalid proctor credentials")

# 2. Generate Unique Exam Code (Proctor Only)
@app.post("/api/proctor/generate_code")
def generate_code():
    # Simple code generation logic (e.g., NEX-A1B2)
    new_code = f"NEX-{str(uuid.uuid4())[:4].upper()}"
    DB["active_codes"][new_code] = {
        "created_at": datetime.datetime.now().isoformat(),
        "status": "active",
        "used_by": None
    }
    return {"success": True, "code": new_code}

# 3. Get Active Codes (Proctor Only)
@app.get("/api/proctor/codes")
def get_codes():
    return {"success": True, "codes": DB["active_codes"]}

# 4. Verify Exam Code (Student Face)
@app.post("/api/exam/verify_code")
def verify_code(req: VerifyCodeRequest):
    code = req.code.upper()
    if code in DB["active_codes"] and DB["active_codes"][code]["status"] == "active":
        # Optional: Mark code as 'in-use' so it can't be shared simultaneously, 
        # but for this demo, we'll just validate it exists and is active.
        return {"success": True, "message": "Code verified. Access granted."}
    
    raise HTTPException(status_code=403, detail="Invalid or expired Unique Test Code.")

# 5. Submit Exam Report (Student End)
@app.post("/api/exam/submit")
def submit_exam(report: ExamReportSubmit):
    # Validate the code used for submission
    code = report.code.upper()
    if code not in DB["active_codes"]:
        raise HTTPException(status_code=400, detail="Cannot submit report for invalid code.")
    
    # Create the report record
    record = {
        "report_id": str(uuid.uuid4()),
        "student_id": report.student_id,
        "code": code,
        "submitted_at": datetime.datetime.now().isoformat(),
        "suspicion_score": report.suspicion_score,
        "violations": report.violations,
        "photos": report.photos,
        "closed_reason": report.closed_reason,
        "completion_time_seconds": report.duration - report.time_remaining
    }
    
    DB["exam_reports"].append(record)
    
    # Optionally invalidate the code so it can't be used again
    # DB["active_codes"][code]["status"] = "completed"
    
    return {"success": True, "message": "Exam report secured successfully.", "report_id": record["report_id"]}

# 6. Get Exam Reports (Proctor Only)
@app.get("/api/proctor/reports")
def get_reports():
    # Returns all reports. In a real app, this should be paginated and filtered.
    # We omit the heavy base64 photos from the main list view for performance, 
    # and only send summary data. The frontend can request full details if needed.
    summaries = []
    for r in DB["exam_reports"]:
        summary = {
            "report_id": r["report_id"],
            "student_id": r["student_id"],
            "code": r["code"],
            "submitted_at": r["submitted_at"],
            "suspicion_score": r["suspicion_score"],
            "violation_count": len(r["violations"]),
            "closed_reason": r["closed_reason"]
        }
        summaries.append(summary)
        
    return {"success": True, "reports": summaries}

# 7. Get Specific Report Details (Proctor Only)
@app.get("/api/proctor/reports/{report_id}")
def get_report_details(report_id: str):
    for r in DB["exam_reports"]:
        if r["report_id"] == report_id:
            return {"success": True, "report": r}
    raise HTTPException(status_code=404, detail="Report not found")
