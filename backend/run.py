"""Convenient launcher for the Mad-Eye Moody Lens Live Deepfake Detection Backend."""

import argparse
import uvicorn

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Start Moody Lens Backend Server")
    parser.add_argument("--host", default="0.0.0.0", help="Host interface (default: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=8000, help="Port to listen on (default: 8000)")
    parser.add_argument("--reload", action="store_true", help="Enable auto-reload on code change")
    args = parser.parse_args()

    print(f"\n🚀 Starting Mad-Eye Moody Lens Deepfake Detection API on http://{args.host}:{args.port}")
    print(f"📖 Interactive API Docs available at http://localhost:{args.port}/docs\n")
    uvicorn.run("app.main:app", host=args.host, port=args.port, reload=args.reload)
