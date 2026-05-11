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

class AnalyzeResponse(BaseModel):
    status: str
    results: list[OcrResult]
    error: str | None = None

@app.get("/health")
def health_check():
    return {"status": "ok", "ocr_initialized": ocr is not None}

@app.post("/api/v1/ocr/analyze", response_model=AnalyzeResponse)
def analyze_image(request: AnalyzeRequest):
    if not ocr:
        raise HTTPException(status_code=500, detail="OCR engine not initialized")

    image_path = request.image_path
    
    if not os.path.exists(image_path):
        raise HTTPException(status_code=404, detail=f"Image file not found at path: {image_path}")

    try:
        process_path = image_path
        if request.preprocess:
            process_path = preprocess_image(image_path)
            
        # Run OCR
        result = ocr.ocr(process_path)
        
        # Parse results
        parsed_results = []
        if result and result[0]:
            for line in result[0]:
                bbox = line[0]
                text = line[1][0]
                confidence = float(line[1][1])
                
                matched_target = None
                match_rate = None
                
                if request.target_texts:
                    # Find best match
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
                
        # Cleanup temporary file if created
        if request.preprocess and process_path != image_path and os.path.exists(process_path):
            os.remove(process_path)
                
        return AnalyzeResponse(status="success", results=parsed_results)
    except Exception as e:
        return AnalyzeResponse(status="error", results=[], error=str(e))
