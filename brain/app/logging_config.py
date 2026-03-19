"""
logging_config.py

Concept: Structured (JSON) Logging
-----------------------------------
Every log line is a JSON object, not a plain string. This means every field
(latency_ms, agent, tokens, request_id) is individually queryable in any log
platform — Railway, Datadog, Logtail, etc.

Plain string (bad for production):
    "[RestockAgent] Added Milk in 1240ms"  ← can't query by latency

Structured JSON (good):
    {"ts":"...","level":"INFO","event":"agent.complete","agent":"restock",
     "items_added":1,"latency_ms":1240,"request_id":"a1b2c3"}  ← fully queryable

Log levels (in ascending severity):
    DEBUG   → fine-grained detail: each Claude tool call, loop iteration
    INFO    → normal milestones: request in, agent decision, cache hit
    WARNING → unexpected but recoverable: slow response, retrying
    ERROR   → failure: API error, unhandled exception
"""

import logging
import os
import sys

from pythonjsonlogger import jsonlogger


def setup_logging() -> None:
    """
    Configure the root logger to emit JSON to stdout.

    Called once at application startup (brain/main.py).
    All modules then call logging.getLogger(__name__) and inherit this config.
    """
    log_level = os.getenv("LOG_LEVEL", "INFO").upper()

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        jsonlogger.JsonFormatter(
            # Fields included in every log line
            fmt="%(asctime)s %(levelname)s %(name)s %(message)s",
            datefmt="%Y-%m-%dT%H:%M:%SZ",
            # Rename stdlib keys to shorter production-friendly names
            rename_fields={
                "asctime": "ts",
                "levelname": "level",
                "name": "logger",
            },
        )
    )

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(getattr(logging, log_level, logging.INFO))

    # Quiet down noisy third-party loggers
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
