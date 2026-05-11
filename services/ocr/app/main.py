from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from paddleocr import PaddleOCR
import os
import cv2
import numpy as np
from thefuzz import fuzz

app = FastAPI(title="OCR Microservice", version="1.0.0")

# Initialize PaddleOCR globally so it's loaded once at startup
# lang='korean' handles Korean and English
try:
    # use_angle_cls=True helps detect text rotation
    ocr = PaddleOCR(use_angle_cls=True, lang='korean')
except Exception as e:
    print(f"Error initializing PaddleOCR: {e}")
    ocr = None

class AnalyzeRequest(BaseModel):
    image_path: str
    target_texts: list[str] | None = None
    preprocess: bool = False

class OcrResult(BaseModel):
    text: str
    confidence: float
    bbox: list[list[float]]
    matched_target: str | None = None
    match_rate: float | None = None

def preprocess_image(image_path: str) -> str:
    img = cv2.imread(image_path)
    if img is None:
        return image_path
        
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    denoised = cv2.fastNlMeansDenoising(gray, h=30)
    
    # Apply Otsu's thresholding
    _, thresh = cv2.threshold(denoised, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    
    preprocessed_path = image_path + ".preprocessed.png"
    cv2.imwrite(preprocessed_path, thresh)
    return preprocessed_path

from fastapi import BackgroundTasks
import uuid
from typing import Dict, Any

jobs: Dict[str, dict] = {}

class AnalyzeResponse(BaseModel):
    status: str
    job_id: str | None = None
    results: list[OcrResult] = []
    error: str | None = None
    full_text: str | None = None
    global_match_rate: float | None = None
    global_matched_target: str | None = None

def process_image_job(job_id: str, request: AnalyzeRequest):
    try:
        jobs[job_id]["status"] = "processing"
        image_path = request.image_path
        
        if not os.path.exists(image_path):
            jobs[job_id]["status"] = "error"
            jobs[job_id]["error"] = f"Image file not found at path: {image_path}"
            return

        process_path = image_path
        if request.preprocess:
            process_path = preprocess_image(image_path)
            
        result = ocr.ocr(process_path)
        
        parsed_results = []
        if result and result[0]:
            # Determine result format (PaddleOCR 2.8 vs 2.9+)
            is_new_format = hasattr(result[0], 'keys') and 'rec_texts' in result[0]
            
            items_to_process = []
            
            if is_new_format:
                for res_obj in result:
                    texts = res_obj.get('rec_texts', [])
                    scores = res_obj.get('rec_scores', [])
                    polys = res_obj.get('dt_polys', [])
                    
                    for i in range(len(texts)):
                        bbox = polys[i].tolist() if hasattr(polys[i], 'tolist') else polys[i]
                        items_to_process.append((bbox, texts[i], float(scores[i])))
            else:
                # Assuming old format: list of pages, where page is list of [bbox, [text, score]]
                # Flatten across all pages
                for page in result:
                    if page:
                        for line in page:
                            items_to_process.append((line[0], line[1][0], float(line[1][1])))

            for bbox, text, confidence in items_to_process:
                matched_target = None
                match_rate = None
                
                if request.target_texts:
                    best_match = None
                    best_score = 0
                    for target in request.target_texts:
                        score = fuzz.ratio(text, target)
                        if score > best_score:
                            best_score = score
                            best_match = target
                    if best_score > 0:
                        matched_target = best_match
                        match_rate = float(best_score)
                
                parsed_results.append(OcrResult(
                    text=text,
                    confidence=confidence,
                    bbox=bbox,
                    matched_target=matched_target,
                    match_rate=match_rate
                ))
                
        full_text = " ".join([r.text for r in parsed_results])
        global_match_rate = None
        global_matched_target = None
        
        if request.target_texts and full_text:
            best_score = 0
            best_match = None
            for target in request.target_texts:
                score = fuzz.ratio(full_text, target)
                if score > best_score:
                    best_score = score
                    best_match = target
            if best_score > 0:
                global_match_rate = float(best_score)
                global_matched_target = best_match

        jobs[job_id]["status"] = "success"
        jobs[job_id]["results"] = parsed_results
        jobs[job_id]["full_text"] = full_text
        jobs[job_id]["global_match_rate"] = global_match_rate
        jobs[job_id]["global_matched_target"] = global_matched_target
        
    except Exception as e:
        jobs[job_id]["status"] = "error"
        jobs[job_id]["error"] = str(e)


@app.post("/api/v1/ocr/analyze", response_model=AnalyzeResponse)
def analyze_image(request: AnalyzeRequest, background_tasks: BackgroundTasks):
    if not ocr:
        raise HTTPException(status_code=500, detail="OCR engine not initialized")

    job_id = str(uuid.uuid4())
    jobs[job_id] = {"status": "pending"}
    
    background_tasks.add_task(process_image_job, job_id, request)
    return AnalyzeResponse(status="pending", job_id=job_id)

@app.get("/api/v1/ocr/status/{job_id}", response_model=AnalyzeResponse)
def get_status(job_id: str):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    job = jobs[job_id]
    return AnalyzeResponse(
        status=job["status"],
        job_id=job_id,
        results=job.get("results", []),
        error=job.get("error"),
        full_text=job.get("full_text"),
        global_match_rate=job.get("global_match_rate"),
        global_matched_target=job.get("global_matched_target")
    )


class SyncOcrResult(BaseModel):
    status: str
    results: list[OcrResult] = []
    error: str | None = None
    full_text: str | None = None
    global_match_rate: float | None = None
    global_matched_target: str | None = None


MIN_OCR_CONFIDENCE = 0.3  # 저신뢰도 결과 필터링 임계값


@app.post("/api/v1/ocr/analyze-sync", response_model=SyncOcrResult)
def analyze_image_sync(request: AnalyzeRequest):
    """동기 OCR 분석 — 폴링 없이 결과를 즉시 반환."""
    if not ocr:
        raise HTTPException(status_code=500, detail="OCR engine not initialized")

    image_path = request.image_path

    if not os.path.exists(image_path):
        return SyncOcrResult(status="error", error=f"Image file not found: {image_path}")

    try:
        process_path = image_path
        if request.preprocess:
            process_path = preprocess_image(image_path)

        result = ocr.ocr(process_path)

        parsed_results = []
        if result and result[0]:
            is_new_format = hasattr(result[0], 'keys') and 'rec_texts' in result[0]

            items_to_process = []

            if is_new_format:
                for res_obj in result:
                    texts = res_obj.get('rec_texts', [])
                    scores = res_obj.get('rec_scores', [])
                    polys = res_obj.get('dt_polys', [])
                    for i in range(len(texts)):
                        bbox = polys[i].tolist() if hasattr(polys[i], 'tolist') else polys[i]
                        items_to_process.append((bbox, texts[i], float(scores[i])))
            else:
                for page in result:
                    if page:
                        for line in page:
                            items_to_process.append((line[0], line[1][0], float(line[1][1])))

            for bbox, text, confidence in items_to_process:
                # 저신뢰도 결과 필터링
                if confidence < MIN_OCR_CONFIDENCE:
                    continue

                matched_target = None
                match_rate = None

                if request.target_texts:
                    best_match = None
                    best_score = 0
                    for target in request.target_texts:
                        score = fuzz.ratio(text, target)
                        if score > best_score:
                            best_score = score
                            best_match = target
                    if best_score > 0:
                        matched_target = best_match
                        match_rate = float(best_score)

                parsed_results.append(OcrResult(
                    text=text,
                    confidence=confidence,
                    bbox=bbox,
                    matched_target=matched_target,
                    match_rate=match_rate,
                ))

        full_text = " ".join([r.text for r in parsed_results])
        global_match_rate = None
        global_matched_target = None

        if request.target_texts and full_text:
            best_score = 0
            best_match = None
            for target in request.target_texts:
                score = fuzz.ratio(full_text, target)
                if score > best_score:
                    best_score = score
                    best_match = target
            if best_score > 0:
                global_match_rate = float(best_score)
                global_matched_target = best_match

        # 전처리된 임시 파일 정리
        if request.preprocess and process_path != image_path:
            try:
                os.remove(process_path)
            except OSError:
                pass

        return SyncOcrResult(
            status="success",
            results=parsed_results,
            full_text=full_text,
            global_match_rate=global_match_rate,
            global_matched_target=global_matched_target,
        )

    except Exception as e:
        return SyncOcrResult(status="error", error=str(e))
