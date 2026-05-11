from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from paddleocr import PaddleOCR
import os

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

class OcrResult(BaseModel):
    text: str
    confidence: float
    bbox: list[list[float]]

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
        # Run OCR
        result = ocr.ocr(image_path, cls=True)
        
        # Parse results
        parsed_results = []
        if result and result[0]:
            for line in result[0]:
                bbox = line[0]
                text = line[1][0]
                confidence = float(line[1][1])
                
                parsed_results.append(OcrResult(
                    text=text,
                    confidence=confidence,
                    bbox=bbox
                ))
                
        return AnalyzeResponse(status="success", results=parsed_results)
    except Exception as e:
        return AnalyzeResponse(status="error", results=[], error=str(e))
