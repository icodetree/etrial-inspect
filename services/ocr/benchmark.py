import os
import time
from fastapi.testclient import TestClient
from app.main import app
import cv2
import numpy as np

client = TestClient(app)

def create_dummy_image(path="test_image.jpg"):
    # White background
    img = np.ones((100, 400, 3), dtype=np.uint8) * 255
    # Draw text in black
    cv2.putText(img, "Fuzzy Match Testing!", (20, 60), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 0), 2)
    # Add some light noise
    noise = np.random.randint(0, 20, (100, 400, 3), dtype=np.uint8)
    img = cv2.subtract(img, noise)
    cv2.imwrite(path, img)
    return path

def run_benchmark():
    test_image = "benchmark_test.jpg"
    create_dummy_image(test_image)
    
    targets = ["Fuzzy Match Testing!", "Fuzzy Test", "Testing!"]
    
    print("="*50)
    print("Running Benchmark with preprocessing OFF...")
    start = time.time()
    resp1 = client.post("/api/v1/ocr/analyze", json={
        "image_path": test_image,
        "target_texts": targets,
        "preprocess": False
    })
    time1 = time.time() - start
    print(f"Time: {time1:.3f}s")
    if resp1.status_code == 200:
        for res in resp1.json().get("results", []):
            print(f"OCR: '{res['text']}', Best Match: '{res['matched_target']}' (Score: {res['match_rate']})")
    
    print("="*50)
    print("\nRunning Benchmark with preprocessing ON...")
    start = time.time()
    resp2 = client.post("/api/v1/ocr/analyze", json={
        "image_path": test_image,
        "target_texts": targets,
        "preprocess": True
    })
    time2 = time.time() - start
    print(f"Time: {time2:.3f}s")
    if resp2.status_code == 200:
        for res in resp2.json().get("results", []):
            print(f"OCR: '{res['text']}', Best Match: '{res['matched_target']}' (Score: {res['match_rate']})")
    print("="*50)
    
    if os.path.exists(test_image):
        os.remove(test_image)
        
if __name__ == "__main__":
    run_benchmark()
