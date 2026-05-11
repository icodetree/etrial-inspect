import cv2
import numpy as np
from paddleocr import PaddleOCR

img = np.ones((200, 600, 3), dtype=np.uint8) * 255
cv2.putText(img, "Fuzzy Match Testing!", (20, 100), cv2.FONT_HERSHEY_SIMPLEX, 1.5, (0, 0, 0), 2)
cv2.imwrite('test_direct.jpg', img)

ocr = PaddleOCR(use_angle_cls=True, lang='en')
res = ocr.ocr('test_direct.jpg')
print("Direct OCR result:", res)
