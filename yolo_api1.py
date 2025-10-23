from flask import Flask, request, jsonify
import os
from pathlib import Path
import cv2
import numpy as np
from ultralytics import YOLO
from PIL import Image
import io
import tempfile

app = Flask(__name__)

# Models directory
MODELS_DIR = Path("models")

# Load all available models
models = {}

def load_models():
    """Load all YOLO models from the models directory"""
    global models
    models.clear()

    if not MODELS_DIR.exists():
        print(f"❌ Models directory '{MODELS_DIR}' not found")
        return

    for model_dir in MODELS_DIR.iterdir():
        if model_dir.is_dir():
            best_pt_path = model_dir / "best.pt"
            if best_pt_path.exists():
                try:
                    model = YOLO(str(best_pt_path))
                    models[model_dir.name] = model
                    print(f"✅ Loaded model: {model_dir.name}")
                except Exception as e:
                    print(f"❌ Failed to load model {model_dir.name}: {e}")
            else:
                print(f"⚠️ No best.pt found in {model_dir.name}")

    print(f"📊 Total models loaded: {len(models)}")

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy",
        "available_models": list(models.keys()),
        "total_models": len(models)
    })

@app.route('/predict', methods=['POST'])
def predict():
    """Predict using YOLO model"""
    try:
        # Check if image file is provided
        if 'image' not in request.files:
            return jsonify({"error": "No image file provided"})

        # Check if model is specified
        if 'model' not in request.form:
            return jsonify({"error": "No model specified"})

        image_file = request.files['image']
        model_name = request.form['model']
        threshold = float(request.form.get('threshold', 0.5))

        # Validate model exists
        if model_name not in models:
            return jsonify({
                "error": f"Model '{model_name}' not found",
                "available_models": list(models.keys())
            })

        # Validate threshold
        if not (0.0 <= threshold <= 1.0):
            return jsonify({"error": "Threshold must be between 0.0 and 1.0"})

        # Validate image file
        if image_file.filename == '' or image_file.filename is None:
            return jsonify({"error": "No image file selected"})

        # Check file extension
        allowed_extensions = {'.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.webp'}
        file_ext = Path(image_file.filename).suffix.lower()
        if file_ext not in allowed_extensions:
            return jsonify({
                "error": f"Unsupported file format: {file_ext}",
                "supported_formats": list(allowed_extensions)
            })

        # Load and process image
        image_bytes = image_file.read()

        # Create temporary file for the image
        with tempfile.NamedTemporaryFile(delete=False, suffix=file_ext) as temp_file:
            temp_file.write(image_bytes)
            temp_file_path = temp_file.name

        try:
            # Get the model
            model = models[model_name]

            # Run inference
            results = model(
                temp_file_path,
                conf=threshold,
                imgsz=1024
            )

            # Process results
            detections = []

            for result in results:
                if hasattr(result, 'boxes') and result.boxes is not None:
                    boxes = result.boxes

                    for i, (box, conf, cls) in enumerate(zip(boxes.xyxy, boxes.conf, boxes.cls)):
                        x1, y1, x2, y2 = box.tolist()
                        confidence = float(conf)
                        class_id = int(cls)
                        class_name = model.names[class_id]

                        detection = {
                            "id": i,
                            "class_id": class_id,
                            "class_name": class_name,
                            "confidence": round(confidence, 4),
                            "bbox": {
                                "x1": round(x1, 2),
                                "y1": round(y1, 2),
                                "x2": round(x2, 2),
                                "y2": round(y2, 2),
                                "width": round(x2 - x1, 2),
                                "height": round(y2 - y1, 2)
                            }
                        }
                        detections.append(detection)

            # Prepare response
            response = {
                "success": True,
                "model_used": model_name,
                "threshold": threshold,
                "image_filename": image_file.filename,
                "detections_count": len(detections),
                "detections": detections
            }

            return jsonify(response)

        finally:
            # Clean up temporary file
            try:
                os.unlink(temp_file_path)
            except:
                pass

    except Exception as e:
        print("❌ Prediction error:", e)
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

@app.route('/models', methods=['GET'])
def list_models():
    """List all available models"""
    model_info = {}

    for model_name, model in models.items():
        model_info[model_name] = {
            "classes": list(model.names.values()),
            "class_count": len(model.names)
        }

    return jsonify({
        "available_models": model_info,
        "total_models": len(models)
    })

@app.route('/reload-models', methods=['POST'])
def reload_models():
    """Reload all models from the models directory"""
    try:
        load_models()
        return jsonify({
            "success": True,
            "message": "Models reloaded successfully",
            "loaded_models": list(models.keys()),
            "total_models": len(models)
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

if __name__ == '__main__':
    print("🚀 Starting YOLO API Server...")
    print("📂 Loading models...")
    load_models()

    if not models:
        print("⚠️ No models loaded. Server will start but predictions won't work.")

    print(f"🌐 Server starting on port 8081...")
    app.run(host='0.0.0.0', port=8081, debug=True)
